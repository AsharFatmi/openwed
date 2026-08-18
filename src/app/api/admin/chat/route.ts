import { convertToModelMessages, type UIMessage } from 'ai'
import { getServerSession } from 'next-auth'
import { streamAdminChat } from '@/lib/ai-providers'
import { trimMessagesForRequest, MAX_ADMIN_HISTORY_MESSAGES } from '@/lib/chat-history'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  type Side,
  type Guest,
  type RsvpResponse,
  type FamilyMember,
  type FamilyMemberRsvp,
  type Expense,
  type BudgetCategory,
  type Vendor,
  type Payment,
  type Hotel,
  type Room,
  type RoomAssignment,
  type Event,
  type AdminChatMessage,
  type ExpenseStatus,
} from '@prisma/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ─── Payload part type for incoming UIMessages ────────────────────────────────

interface MessagePart {
  type: string
  text?: string
  image?: string
  mimeType?: string
}

// ─── Data snapshot types ──────────────────────────────────────────────────────

type GuestWithRelations = Guest & {
  rsvpResponses: Pick<RsvpResponse, 'attending' | 'dietary_restrictions'>[]
  familyMembers: (Pick<FamilyMember, 'id' | 'name'> & {
    rsvps: Pick<FamilyMemberRsvp, 'dietary_restrictions'>[]
  })[]
}

type ExpenseWithRelations = Expense & {
  category: Pick<BudgetCategory, 'id' | 'name'> | null
  vendor: Pick<Vendor, 'id' | 'name'> | null
}

type VendorWithPayments = Vendor & {
  payments: Pick<Payment, 'status' | 'amount' | 'amount_paid'>[]
}

type RoomWithAssignments = Room & {
  assignments: Pick<RoomAssignment, 'id'>[]
}

type HotelWithRooms = Hotel & {
  rooms: RoomWithAssignments[]
}

// ─── RSVP status helper ───────────────────────────────────────────────────────

function getGuestRsvpStatus(
  responses: Pick<RsvpResponse, 'attending'>[]
): 'confirmed' | 'declined' | 'maybe' | 'no response' {
  if (responses.length === 0) return 'no response'
  const hasConfirmed = responses.some((r) => r.attending === true)
  if (hasConfirmed) return 'confirmed'
  const hasDeclined = responses.some((r) => r.attending === false)
  if (hasDeclined) return 'declined'
  return 'maybe'
}

// ─── System prompt builder ────────────────────────────────────────────────────

function buildAdminSystemPrompt({
  adminName,
  side,
  guests,
  expenses,
  categories,
  vendors,
  hotels,
  events,
  history,
}: {
  adminName: string
  side: Side
  guests: GuestWithRelations[]
  expenses: ExpenseWithRelations[]
  categories: (Pick<BudgetCategory, 'id' | 'name' | 'budgeted_amount'> & { side: Side })[]
  vendors: VendorWithPayments[]
  hotels: HotelWithRooms[]
  events: Event[]
  history: AdminChatMessage[]
}): string {
  // ── Guest summary ──────────────────────────────────────────────────────────
  // Cap rendered guests at 80 (with a footer when truncated) to keep the system
  // prompt under Groq's 12k TPM cap. RSVP/budget category rollups are computed
  // from the full set; only the per-guest line list is truncated.
  const MAX_GUESTS_RENDERED = 80
  const renderedGuests = guests.slice(0, MAX_GUESTS_RENDERED)
  const rsvpCounts = { confirmed: 0, declined: 0, maybe: 0, 'no response': 0 }
  const guestLines = renderedGuests.map((g) => {
    const status = getGuestRsvpStatus(g.rsvpResponses)
    rsvpCounts[status]++
    const familyCount = g.familyMembers.length
    return `- ${g.name} (id: ${g.id}) — ${status} | Household: ${g.household_group ?? 'unset'} | Family: ${familyCount} member${familyCount !== 1 ? 's' : ''}`
  })

  const truncatedNote =
    guests.length > MAX_GUESTS_RENDERED
      ? `\n... and ${guests.length - MAX_GUESTS_RENDERED} more guests (ask Chotu to filter by name or household if you need a specific one)`
      : ''

  const guestSection = [
    `### Guests (${guests.length} total, showing ${renderedGuests.length})`,
    `RSVP: Confirmed ${rsvpCounts.confirmed} | Declined ${rsvpCounts.declined} | Pending ${rsvpCounts['no response']} | Maybe ${rsvpCounts.maybe} | No response ${rsvpCounts['no response']}`,
    ...guestLines,
    truncatedNote,
  ]
    .filter(Boolean)
    .join('\n')

  // ── Dietary notes ──────────────────────────────────────────────────────────
  // Only surface guests with at least one non-empty dietary restriction, so
  // the prompt stays small even when most guests have nothing noted.
  const dietaryLines: string[] = []
  for (const g of guests) {
    const householdNotes = g.rsvpResponses
      .map((r) => r.dietary_restrictions)
      .filter((s): s is string => Boolean(s && s.trim()))
    const memberLines = g.familyMembers
      .map((m) => {
        const notes = m.rsvps
          .map((r) => r.dietary_restrictions)
          .filter((s): s is string => Boolean(s && s.trim()))
        if (notes.length === 0) return null
        return `${m.name}: ${notes.join('; ')}`
      })
      .filter((s): s is string => s !== null)
    if (householdNotes.length === 0 && memberLines.length === 0) continue
    const parts: string[] = []
    if (householdNotes.length > 0) parts.push(`household: ${householdNotes.join('; ')}`)
    if (memberLines.length > 0) parts.push(...memberLines.map((s) => `  • ${s}`))
    dietaryLines.push(`- ${g.name} (id: ${g.id}) — ${parts.join(' | ')}`)
  }
  const dietarySection = dietaryLines.length > 0
    ? [`### Dietary Notes (${dietaryLines.length} guest${dietaryLines.length !== 1 ? 's' : ''})`, ...dietaryLines].join('\n')
    : '### Dietary Notes\nNo restrictions recorded.'

  // ── Budget categories ──────────────────────────────────────────────────────
  const paidStatuses: ExpenseStatus[] = ['paid', 'partially_paid']
  const categoryLines = categories.map((cat) => {
    const spent = expenses
      .filter((e) => e.category_id === cat.id && paidStatuses.includes(e.status))
      .reduce((sum, e) => {
        if (e.status === 'partially_paid') return sum + Number(e.amount_paid)
        return sum + Number(e.amount)
      }, 0)
    return `- ${cat.name} (id: ${cat.id}): budgeted ₹${Number(cat.budgeted_amount).toLocaleString('en-IN')}, spent ₹${spent.toLocaleString('en-IN')}`
  })

  const categoriesSection = ['### Budget Categories', ...categoryLines].join('\n')

  // ── Vendors ────────────────────────────────────────────────────────────────
  const vendorLines = vendors.map((v) => {
    const paymentSummary =
      v.payments.length > 0
        ? v.payments
            .map((p) => `${p.status} ₹${Number(p.amount).toLocaleString('en-IN')}`)
            .join(', ')
        : 'no payments'
    const contract = v.contract_amount ? `₹${Number(v.contract_amount).toLocaleString('en-IN')}` : 'unset'
    return `- ${v.name} (id: ${v.id}) | contract: ${contract} | payments: [${paymentSummary}]`
  })

  const vendorsSection = ['### Vendors', ...vendorLines].join('\n')

  // ── Expenses ───────────────────────────────────────────────────────────────
  const expenseLines = expenses.map((e) => {
    const cat = e.category ? e.category.name : 'uncategorized'
    const ven = e.vendor ? e.vendor.name : 'no vendor'
    return `- ${e.description} (id: ${e.id}): ₹${Number(e.amount).toLocaleString('en-IN')} | ${e.status} | ${cat} | ${ven}`
  })

  const expensesSection = ['### Expenses (last 25)', ...expenseLines].join('\n')

  // ── Hotels & rooms ─────────────────────────────────────────────────────────
  const hotelLines = hotels.flatMap((h) => {
    const assignedCount = h.rooms.reduce((s, r) => s + r.assignments.length, 0)
    const lines: string[] = [
      `- ${h.name} (id: ${h.id}): ${h.rooms.length} total rooms, ${assignedCount} assigned`,
    ]
    for (const room of h.rooms) {
      if (room.assignments.length === 0) {
        lines.push(
          `  • Room ${room.room_number} (id: ${room.id}) — ${room.room_type}, capacity ${room.capacity}`
        )
      }
    }
    return lines
  })

  const hotelsSection = ['### Hotels & Rooms', ...hotelLines].join('\n')

  // ── Events ─────────────────────────────────────────────────────────────────
  const eventLines = events.map((e) => {
    const dateStr = e.date.toISOString().split('T')[0]
    return `- ${e.name} (id: ${e.id}) | date: ${dateStr} | managed_by: ${e.managed_by} | display_group: ${e.display_group}`
  })

  const eventsSection = ['### Events', ...eventLines].join('\n')

  // ── Recent conversation ────────────────────────────────────────────────────
  const recentHistory = history.slice(-10)
  const historyLines = recentHistory.map((m) =>
    m.role === 'user' ? `Admin: ${m.content}` : `Chotu: ${m.content}`
  )
  const historySection =
    historyLines.length > 0
      ? ['## Recent Conversation (last 10 turns)', ...historyLines].join('\n')
      : ''

  return `You are Chotu, the admin assistant for the ${side} side of the wedding.
You are speaking with ${adminName}.

## What you can do
- Answer questions about guests, RSVPs, finances, rooms, vendors, events
- Analyze data: totals, breakdowns, non-responders, overdue payments, room availability
- Propose write actions: add guests, add expense, record payment, add vendor, allocate room
- Parse uploaded images (guest lists, receipts, WhatsApp screenshots) and extract structured data — when parsing a guest list image, extract EVERY name visible, do not stop early

## Action Card Protocol
When proposing a write action, first explain what you found/understood, then output EXACTLY:
<!--ACTION_CARD:{"actionType":"<type>","preview":"<one-line summary>","payload":<payload object>}-->

Valid actionTypes and payload shapes:
- add_guests: { "guests": [{ "name": "...", "household_group": "...", "email": "...", "phone": "...", "invitedEventIds": [] }] }
- add_expense: { "description": "...", "amount": 0, "category_id": "...", "vendor_id": "...", "date": "YYYY-MM-DD", "status": "pending" }
- record_payment: { "vendor_id": "...", "amount": 0, "due_date": "YYYY-MM-DD", "status": "upcoming", "method": "..." }
- add_vendor: { "name": "...", "category": "...", "contract_amount": 0 }
- allocate_room: { "room_id": "...", "guest_id": "...", "family_member_id": "optional — a family member of guest_id to assign instead of the primary guest", "check_in": "YYYY-MM-DD", "check_out": "YYYY-MM-DD" }

Rules:
- NEVER output ACTION_CARD without explaining first
- NEVER output more than one ACTION_CARD per response
- ONLY use IDs from the data snapshot below — never invent them
- NEVER write to the database yourself — only propose via ACTION_CARD
- Web search is ONLY for looking up venue or hotel addresses — nothing else
- Keep responses concise and direct — this is an admin tool, not a guest chat

## CRITICAL RULE — ONE round of questions maximum, then act

**Round 1:** If the admin says they want to do something but gives NO details, ask for everything in ONE message.
**Round 2:** If the admin replies with details (even partial), you MUST produce the ACTION_CARD immediately. Do NOT ask any more questions. Use the data snapshot to fill in anything missing:
- Guess category from the description (e.g. "food" → Catering & Bar, "photo" → Photography, "flower" → Florals & Décor)
- Guess vendor by matching name in the vendor list
- Default status to "pending" if not stated
- Default date to today (${new Date().toISOString().split('T')[0]}) if not stated
- Leave optional fields (email, phone) blank if not provided

**You get exactly ONE chance to ask. After that, always produce the ACTION_CARD.**

BAD (never do this — asking twice):
Admin: "I want to record an expense"
Chotu: "Please provide description, amount, category, vendor, date, status."
Admin: "Venue food 9000 today"
Chotu: "Thanks! Could you also provide the category and status?" ← WRONG, never do this

GOOD:
Admin: "I want to record an expense"
Chotu: "Please provide description, amount, category (optional — I'll guess from description), vendor (optional), date, status."
Admin: "Venue food 9000 today"
Chotu: "Recording **Venue food** — ₹9,000 under **Catering & Bar** (guessed), no vendor, status: **pending**, date: **2026-07-04**. Let me know if you want to change anything."
<!--ACTION_CARD:...-->

## ACTION_CARD summary must list every field
Always spell out description, amount, category, vendor, date, status before the card. Never say "Okay I have the details" without listing them.

## Current Data (${side} side only)

${guestSection}

${dietarySection}

${categoriesSection}

${vendorsSection}

${expensesSection}

${hotelsSection}

${eventsSection}

${historySection}

## Data Isolation
You ONLY see ${side} side data. NEVER reference the other side.`.trim()
}

// ─── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (session.user.role !== 'side_admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const side = session.user.side as Side
  const adminName = session.user.name ?? 'Admin'

  if (!process.env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Chat assistant is not configured yet.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const body = await request.json().catch(() => null)
  const messages = body?.messages as UIMessage[] | undefined

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Bad request.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [history, guests, expenses, categories, vendors, hotels, events] = await Promise.all([
    prisma.adminChatMessage.findMany({
      where: { side, created_at: { gte: sevenDaysAgo } },
      orderBy: { created_at: 'asc' },
    }),
    prisma.guest.findMany({
      where: { side },
      include: {
        rsvpResponses: { select: { attending: true, dietary_restrictions: true } },
        familyMembers: {
          select: {
            id: true,
            name: true,
            rsvps: { select: { dietary_restrictions: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.expense.findMany({
      where: { side },
      include: {
        category: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'desc' },
      // Capped at 25 — the system prompt already lists expenses for the model's
      // context, and adding more pushes us past Groq's 12k TPM cap.
      take: 25,
    }),
    prisma.budgetCategory.findMany({
      where: { side },
      select: { id: true, name: true, budgeted_amount: true, side: true },
      orderBy: { sort_order: 'asc' },
    }),
    prisma.vendor.findMany({
      where: { side },
      include: {
        payments: { select: { status: true, amount: true, amount_paid: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.hotel.findMany({
      where: { side },
      include: {
        rooms: {
          include: {
            assignments: { select: { id: true } },
          },
        },
      },
    }),
    prisma.event.findMany({
      where: { OR: [{ managed_by: side }, { display_group: 'joint' }] },
      orderBy: { sort_order: 'asc' },
    }),
  ])

  const systemPrompt = buildAdminSystemPrompt({
    adminName,
    side,
    guests,
    expenses,
    categories,
    vendors,
    hotels,
    events,
    history,
  })

  const today = new Date().toISOString().split('T')[0]
  const firstCategoryName = categories[0]?.name ?? 'Catering & Bar'
  const firstCategoryId = categories[0]?.id ?? ''

  // One short few-shot pair anchors the model to the ACTION_CARD format.
  // The "ONE round" rule already lives in the system prompt, so we don't need
  // multiple demonstrations — they're costly (~3k tokens) and only the action
  // shape matters. Kept pair covers add_expense (the most common write).
  const fewShotMessages: { role: 'user' | 'assistant'; content: string }[] = [
    {
      role: 'user',
      content: `food expense 5000 today paid`,
    },
    {
      role: 'assistant',
      content: `Recording **food expense** — ₹5,000 under **${firstCategoryName}** (guessed from description), vendor: none, status: **paid**, date: **${today}**.\n\n<!--ACTION_CARD:{"actionType":"add_expense","preview":"food expense ₹5,000 paid","payload":{"description":"food expense","amount":5000,"category_id":"${firstCategoryId}","vendor_id":null,"date":"${today}","status":"paid"}}>`,
    },
  ]

  // Defense-in-depth: cap user history length server-side too. The client also
  // trims via `prepareSendMessagesRequest`, but this guarantees the cap holds
  // even if a stale browser bundle sends the full history. Admin uses a tight
  // cap (3) — the system prompt already contains full DB state, so carrying
  // prior turns is wasteful.
  const trimmedUserMessages = trimMessagesForRequest(
    messages as Parameters<typeof trimMessagesForRequest>[0],
    MAX_ADMIN_HISTORY_MESSAGES
  )
  const modelMessages = await convertToModelMessages(trimmedUserMessages)

  // Prepend few-shot examples (they teach the model to act after one round, never ask twice)
  modelMessages.unshift(...fewShotMessages)

  // Extract last user message text for persistence
  const lastUIMsg = messages[messages.length - 1]
  const lastUserText =
    (lastUIMsg?.parts as MessagePart[] | undefined)
      ?.filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('') ?? ''

  const result = await streamAdminChat((_provider, _isGemini) => ({
    system: systemPrompt,
    messages: modelMessages,
    maxOutputTokens: 4096,
    onFinish: async ({ text }: { text: string }) => {
      await prisma.adminChatMessage.createMany({
        data: [
          { side, role: 'user', content: lastUserText || '[image upload]' },
          { side, role: 'assistant', content: text },
        ],
      })
    },
  }), false)

  return result.toUIMessageStreamResponse()
}
