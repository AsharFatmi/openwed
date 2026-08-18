// One-shot measurement of buildAdminSystemPrompt's section sizes.
// Run with: npx tsx scripts/measure-admin-system-prompt.mts
//
// Replicates the section-building logic from
// src/app/api/admin/chat/route.ts against a realistic dataset (groom-side numbers
// are roughly what the user has in their DB). Prints per-section character count
// and an approximate token count (chars / 4).

// Mirror the small set of types we need from @prisma/client
type Side = 'bride' | 'groom'
type ExpenseStatus = 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled' | 'upcoming'

// Realistic-ish counts that mirror what a single-side DB likely contains:
const COUNTS = {
  guests: 180,
  guestsWithDietary: 12,
  familyMembersPerGuest: 2.5,
  categories: 8,
  vendors: 14,
  expenses: 25,
  hotels: 6,
  roomsPerHotel: 12,
  events: 7,
  history: 10,
}

function getGuestRsvpStatus(
  responses: { attending: boolean | null }[]
): 'confirmed' | 'declined' | 'maybe' | 'no response' {
  if (responses.length === 0) return 'no response'
  const hasConfirmed = responses.some((r) => r.attending === true)
  if (hasConfirmed) return 'confirmed'
  const hasDeclined = responses.some((r) => r.attending === false)
  if (hasDeclined) return 'declined'
  return 'maybe'
}

function buildAndMeasure() {
  // ── Guests section ───────────────────────────────────────────────────────
  const guests = Array.from({ length: COUNTS.guests }, (_, i) => {
    const rsvpResponses = Array.from({ length: Math.random() > 0.3 ? 1 : 0 }, () => ({
      attending: Math.random() > 0.4 ? true : false,
      dietary_restrictions: Math.random() > 0.7 ? 'No onion no garlic' : '',
    }))
    const familyMembers = Array.from({ length: Math.floor(Math.random() * 4) }, (_, j) => ({
      id: `fm${i}-${j}`,
      name: `Family Member ${i}-${j}`,
      rsvps: [{ dietary_restrictions: '' }],
    }))
    return {
      id: `g${i}`,
      name: `Guest Name Number ${i}`,
      household_group: i % 3 === 0 ? 'Family A' : 'Family B',
      rsvpResponses,
      familyMembers,
    }
  })

  // NEW: cap at 80 — mirrors the new buildAdminSystemPrompt behavior
  const MAX_GUESTS_RENDERED = 80
  const renderedGuests = guests.slice(0, MAX_GUESTS_RENDERED)
  const rsvpCounts = { confirmed: 0, declined: 0, maybe: 0, 'no response': 0 }
  const guestLines = renderedGuests.map((g) => {
    const status = getGuestRsvpStatus(g.rsvpResponses)
    rsvpCounts[status]++
    const familyCount = g.familyMembers.length
    return `- ${g.name} (id: ${g.id}) — ${status} | Household: ${g.household_group} | Family: ${familyCount} member${familyCount !== 1 ? 's' : ''}`
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

  // ── Dietary section ──────────────────────────────────────────────────────
  const dietaryLines: string[] = []
  for (const g of guests) {
    const householdNotes = g.rsvpResponses
      .map((r) => r.dietary_restrictions)
      .filter((s) => Boolean(s && s.trim()))
    const memberLines = g.familyMembers
      .map((m) => {
        const notes = m.rsvps.map((r) => r.dietary_restrictions).filter((s) => Boolean(s && s.trim()))
        if (notes.length === 0) return null
        return `${m.name}: ${notes.join('; ')}`
      })
      .filter((s) => s !== null) as string[]
    if (householdNotes.length === 0 && memberLines.length === 0) continue
    const parts: string[] = []
    if (householdNotes.length > 0) parts.push(`household: ${householdNotes.join('; ')}`)
    if (memberLines.length > 0) parts.push(...memberLines.map((s) => `  • ${s}`))
    dietaryLines.push(`- ${g.name} (id: ${g.id}) — ${parts.join(' | ')}`)
  }
  const dietarySection =
    dietaryLines.length > 0
      ? [`### Dietary Notes (${dietaryLines.length} guest${dietaryLines.length !== 1 ? 's' : ''})`, ...dietaryLines].join('\n')
      : '### Dietary Notes\nNo restrictions recorded.'

  // ── Categories ───────────────────────────────────────────────────────────
  const categories = Array.from({ length: COUNTS.categories }, (_, i) => ({
    id: `c${i}`,
    name: `Category ${i}`,
    budgeted_amount: 50000,
    side: 'groom' as Side,
  }))
  const expenses = Array.from({ length: COUNTS.expenses }, (_, i) => ({
    id: `e${i}`,
    description: `Expense description ${i} that is reasonably long to mirror real data`,
    amount: 5000,
    amount_paid: 2500,
    status: (i % 2 === 0 ? 'paid' : 'pending') as ExpenseStatus,
    category_id: `c${i % COUNTS.categories}`,
    category: { id: `c${i % COUNTS.categories}`, name: `Category ${i % COUNTS.categories}` },
    vendor: { id: `v${i % 4}`, name: `Vendor ${i % 4}` },
  }))
  const paidStatuses: ExpenseStatus[] = ['paid', 'partially_paid']
  const categoryLines = categories.map((cat) => {
    const spent = expenses
      .filter((e) => e.category_id === cat.id && paidStatuses.includes(e.status))
      .reduce((sum, e) => (e.status === 'partially_paid' ? sum + Number(e.amount_paid) : sum + Number(e.amount)), 0)
    return `- ${cat.name} (id: ${cat.id}): budgeted ₹${Number(cat.budgeted_amount).toLocaleString('en-IN')}, spent ₹${spent.toLocaleString('en-IN')}`
  })
  const categoriesSection = ['### Budget Categories', ...categoryLines].join('\n')

  // ── Vendors ──────────────────────────────────────────────────────────────
  const vendors = Array.from({ length: COUNTS.vendors }, (_, i) => ({
    id: `v${i}`,
    name: `Vendor ${i}`,
    contract_amount: 100000,
    payments: Array.from({ length: 3 }, (_, j) => ({
      status: ['paid', 'upcoming', 'partially_paid'][j % 3] as 'paid' | 'upcoming' | 'partially_paid',
      amount: 10000,
      amount_paid: 5000,
    })),
  }))
  const vendorLines = vendors.map((v) => {
    const paymentSummary =
      v.payments.length > 0
        ? v.payments.map((p) => `${p.status} ₹${Number(p.amount).toLocaleString('en-IN')}`).join(', ')
        : 'no payments'
    const contract = v.contract_amount ? `₹${Number(v.contract_amount).toLocaleString('en-IN')}` : 'unset'
    return `- ${v.name} (id: ${v.id}) | contract: ${contract} | payments: [${paymentSummary}]`
  })
  const vendorsSection = ['### Vendors', ...vendorLines].join('\n')

  // ── Expenses ─────────────────────────────────────────────────────────────
  const expenseLines = expenses.map((e) => {
    const cat = e.category ? e.category.name : 'uncategorized'
    const ven = e.vendor ? e.vendor.name : 'no vendor'
    return `- ${e.description} (id: ${e.id}): ₹${Number(e.amount).toLocaleString('en-IN')} | ${e.status} | ${cat} | ${ven}`
  })
  const expensesSection = ['### Expenses (last 50)', ...expenseLines].join('\n')

  // ── Hotels ───────────────────────────────────────────────────────────────
  const hotels = Array.from({ length: COUNTS.hotels }, (_, i) => ({
    id: `h${i}`,
    name: `Hotel ${i}`,
    rooms: Array.from({ length: COUNTS.roomsPerHotel }, (_, j) => ({
      id: `r${i}-${j}`,
      room_number: `${i}${j}`,
      room_type: j % 2 === 0 ? 'Deluxe' : 'Suite',
      capacity: 2,
      assignments: Array.from({ length: Math.random() > 0.5 ? 1 : 0 }, (_, k) => ({ id: `a${k}` })),
    })),
  }))
  const hotelLines = hotels.flatMap((h) => {
    const assignedCount = h.rooms.reduce((s, r) => s + r.assignments.length, 0)
    const lines: string[] = [`- ${h.name} (id: ${h.id}): ${h.rooms.length} total rooms, ${assignedCount} assigned`]
    for (const room of h.rooms) {
      if (room.assignments.length === 0) {
        lines.push(`  • Room ${room.room_number} (id: ${room.id}) — ${room.room_type}, capacity ${room.capacity}`)
      }
    }
    return lines
  })
  const hotelsSection = ['### Hotels & Rooms', ...hotelLines].join('\n')

  // ── Events ───────────────────────────────────────────────────────────────
  const events = Array.from({ length: COUNTS.events }, (_, i) => ({
    id: `e${i}`,
    name: `Wedding Event ${i}`,
    date: new Date(`2026-07-${i + 1}`),
    managed_by: 'groom' as Side,
    display_group: 'groom' as 'bride' | 'groom' | 'joint',
  }))
  const eventLines = events.map((e) => {
    const dateStr = e.date.toISOString().split('T')[0]
    return `- ${e.name} (id: ${e.id}) | date: ${dateStr} | managed_by: ${e.managed_by} | display_group: ${e.display_group}`
  })
  const eventsSection = ['### Events', ...eventLines].join('\n')

  // ── History ──────────────────────────────────────────────────────────────
  const history = Array.from({ length: COUNTS.history }, (_, i) => ({
    side: 'groom' as Side,
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: 'A reasonably long past conversation message that mirrors real Chotu output length here.',
    created_at: new Date(),
  }))
  const recentHistory = history.slice(-10)
  const historyLines = recentHistory.map((m) =>
    m.role === 'user' ? `Admin: ${m.content}` : `Chotu: ${m.content}`
  )
  const historySection =
    historyLines.length > 0 ? ['## Recent Conversation (last 10 turns)', ...historyLines].join('\n') : ''

  const fixedIntroAndRules = `You are Chotu, the admin assistant for the groom side of the wedding.
You are speaking with Test Admin.

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
- allocate_room: { "room_id": "...", "guest_id": "...", "check_in": "YYYY-MM-DD", "check_out": "YYYY-MM-DD" }

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
- Default date to today (2026-07-31) if not stated
- Leave optional fields (email, phone) blank if not provided

**You get exactly ONE chance to ask. After that, always produce the ACTION_CARD.**

BAD (never do this — asking twice):
Admin: "I want to record an expense"
Chotu: "Please provide description, amount, category, vendor, date, status."
Admin: "Venue food 9000 today"
Chotu: "Thanks! Could you also provide the category and status?" ← WRONG, never do this

GOOD:
Admin: "I want to record an expense"
Chotu: "Please provide description, amount, category (optional — I'll guess from description if not given), vendor (optional — choose from your vendor list), date (optional — defaults to today), status (optional — pending/paid/partially_paid, defaults to pending)"
Admin: "Venue food 9000 today"
Chotu: "Recording **Venue food** — ₹9,000 under **Catering & Bar** (guessed), no vendor, status: **pending**, date: **2026-07-04**. Let me know if you want to change anything."
<!--ACTION_CARD:...-->

## ACTION_CARD summary must list every field
Always spell out description, amount, category, vendor, date, status before the card. Never say "Okay I have the details" without listing them.

## Current Data (groom side only)

${guestSection}

${dietarySection}

${categoriesSection}

${vendorsSection}

${expensesSection}

${hotelsSection}

${eventsSection}

${historySection}

## Data Isolation
You ONLY see groom side data. NEVER reference the other side.`

  const sections: { name: string; text: string }[] = [
    { name: 'fixed-intro-and-rules', text: fixedIntroAndRules.split('${guestSection}')[0] ?? '' },
    { name: 'guests', text: guestSection },
    { name: 'dietary', text: dietarySection },
    { name: 'categories', text: categoriesSection },
    { name: 'vendors', text: vendorsSection },
    { name: 'expenses', text: expensesSection },
    { name: 'hotels', text: hotelsSection },
    { name: 'events', text: eventsSection },
    { name: 'history', text: historySection },
  ]

  const total = fixedIntroAndRules.length
  console.log(`\n=== System Prompt Section Sizes (${total.toLocaleString()} chars total, ~${Math.round(total / 4).toLocaleString()} tokens) ===\n`)
  for (const s of sections) {
    const tokens = Math.round(s.text.length / 4)
    const pct = ((s.text.length / total) * 100).toFixed(1)
    console.log(`  ${s.name.padEnd(22)} ${s.text.length.toString().padStart(7)} chars  ~${tokens.toString().padStart(5)} tokens  ${pct.padStart(5)}%`)
  }
}

buildAndMeasure()