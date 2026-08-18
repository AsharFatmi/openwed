import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ExpenseStatus, PaymentStatus } from '@prisma/client'

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

function forbidden() {
  return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
}

function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 })
}

function notFound(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 404 })
}

function conflict(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 409 })
}

// ─── add_guests ────────────────────────────────────────────────────────────────

interface GuestInput {
  name: unknown
  household_group: unknown
  email?: unknown
  phone?: unknown
  notes?: unknown
  invitedEventIds?: unknown
}

async function handleAddGuests(
  side: string,
  payload: unknown
): Promise<NextResponse> {
  if (!payload || typeof payload !== 'object') return badRequest('payload must be an object')

  const { guests } = payload as Record<string, unknown>
  if (!Array.isArray(guests) || guests.length === 0) {
    return badRequest('payload.guests must be a non-empty array')
  }

  const inputs = guests as GuestInput[]

  for (let i = 0; i < inputs.length; i++) {
    const g = inputs[i]
    if (!g.name || typeof g.name !== 'string' || !(g.name as string).trim()) {
      return badRequest(`guests[${i}].name is required`)
    }
    if (
      !g.household_group ||
      typeof g.household_group !== 'string' ||
      !(g.household_group as string).trim()
    ) {
      return badRequest(`guests[${i}].household_group is required`)
    }
  }

  // Collect all unique invitedEventIds across all guests
  const allEventIds = Array.from(
    new Set(
      inputs.flatMap((g) =>
        Array.isArray(g.invitedEventIds) ? (g.invitedEventIds as string[]) : []
      )
    )
  )

  let allowedEventIds: Set<string> = new Set()
  if (allEventIds.length > 0) {
    const ownedEvents = await prisma.event.findMany({
      where: {
        id: { in: allEventIds },
        OR: [{ managed_by: side as 'bride' | 'groom' }, { display_group: 'joint' }],
      },
      select: { id: true },
    })
    allowedEventIds = new Set(ownedEvents.map((e) => e.id))
  }

  const createdGuests = await prisma.$transaction(async (tx) => {
    const results = []
    for (const input of inputs) {
      const safeEventIds = Array.isArray(input.invitedEventIds)
        ? (input.invitedEventIds as string[]).filter((id) => allowedEventIds.has(id))
        : []

      const g = await tx.guest.create({
        data: {
          name: (input.name as string).trim(),
          email: typeof input.email === 'string' ? input.email.trim() || null : null,
          phone: typeof input.phone === 'string' ? input.phone.trim() || null : null,
          household_group: (input.household_group as string).trim(),
          notes: typeof input.notes === 'string' ? input.notes.trim() || null : null,
          side: side as 'bride' | 'groom',
          rsvp_token: crypto.randomBytes(32).toString('hex'),
        },
      })

      if (safeEventIds.length > 0) {
        await tx.guestEventInvitation.createMany({
          data: safeEventIds.map((event_id) => ({ guest_id: g.id, event_id })),
          skipDuplicates: true,
        })
      }

      const full = await tx.guest.findUnique({
        where: { id: g.id },
        include: {
          familyMembers: { select: { id: true } },
          rsvpResponses: { select: { attending: true } },
          eventInvitations: { select: { event_id: true } },
        },
      })
      results.push(full)
    }
    return results
  })

  return NextResponse.json({ ok: true, result: { guests: createdGuests } }, { status: 201 })
}

// ─── add_expense ───────────────────────────────────────────────────────────────

async function handleAddExpense(side: string, payload: unknown): Promise<NextResponse> {
  if (!payload || typeof payload !== 'object') return badRequest('payload must be an object')

  const {
    description,
    amount,
    category_id,
    vendor_id,
    date,
    payment_method,
    status,
    amount_paid,
    notes,
    exchange_rate,
  } = payload as Record<string, unknown>

  if (!description || typeof description !== 'string' || !(description as string).trim()) {
    return badRequest('description is required')
  }
  if (!amount || Number(amount) <= 0) {
    return badRequest('amount must be greater than 0')
  }
  if (status && !Object.values(ExpenseStatus).includes(status as ExpenseStatus)) {
    return badRequest('Invalid status')
  }

  const parsedAmount = Number(amount)
  const parsedAmountPaid = amount_paid !== undefined ? Number(amount_paid) : 0
  if (parsedAmountPaid > parsedAmount) {
    return badRequest('amount_paid cannot exceed total amount')
  }

  if (category_id) {
    const cat = await prisma.budgetCategory.findUnique({ where: { id: category_id as string } })
    if (!cat || cat.side !== side) return badRequest('Invalid category')
  }
  if (vendor_id) {
    const ven = await prisma.vendor.findUnique({ where: { id: vendor_id as string } })
    if (!ven || ven.side !== side) return badRequest('Invalid vendor')
  }

  const expense = await prisma.expense.create({
    data: {
      description: (description as string).trim(),
      amount: parsedAmount,
      amount_paid: parsedAmountPaid,
      category_id: category_id ? (category_id as string) : null,
      vendor_id: vendor_id ? (vendor_id as string) : null,
      date: date ? new Date(`${date}T12:00:00`) : null,
      payment_method:
        typeof payment_method === 'string' ? payment_method.trim() || null : null,
      status: (status as ExpenseStatus) ?? ExpenseStatus.pending,
      notes: typeof notes === 'string' ? notes.trim() || null : null,
      exchange_rate: exchange_rate != null ? Number(exchange_rate) : null,
      side: side as 'bride' | 'groom',
    },
    include: {
      category: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(
    {
      ok: true,
      result: {
        expense: {
          ...expense,
          amount: Number(expense.amount),
          amount_paid: Number(expense.amount_paid),
          exchange_rate: expense.exchange_rate != null ? Number(expense.exchange_rate) : null,
          date: expense.date?.toISOString() ?? null,
          created_at: expense.created_at.toISOString(),
          updated_at: expense.updated_at.toISOString(),
        },
      },
    },
    { status: 201 }
  )
}

// ─── record_payment ────────────────────────────────────────────────────────────

const VALID_PAYMENT_STATUSES: PaymentStatus[] = ['upcoming', 'paid', 'partially_paid', 'overdue']

async function handleRecordPayment(side: string, payload: unknown): Promise<NextResponse> {
  if (!payload || typeof payload !== 'object') return badRequest('payload must be an object')

  const {
    vendor_id,
    amount,
    due_date,
    paid_date,
    status,
    amount_paid,
    method,
    notes,
    exchange_rate,
  } = payload as Record<string, unknown>

  if (!vendor_id) return badRequest('vendor_id is required')
  if (!amount || Number(amount) <= 0) return badRequest('amount must be greater than 0')
  if (status && !VALID_PAYMENT_STATUSES.includes(status as PaymentStatus)) {
    return badRequest('Invalid status')
  }
  if (amount_paid != null && Number(amount_paid) > Number(amount)) {
    return badRequest('amount_paid cannot exceed total amount')
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: vendor_id as string } })
  if (!vendor || vendor.side !== side) return notFound('Vendor not found')

  const payment = await prisma.payment.create({
    data: {
      vendor_id: vendor_id as string,
      amount: Number(amount),
      due_date: due_date ? new Date(`${due_date}T12:00:00`) : null,
      paid_date: paid_date ? new Date(`${paid_date}T12:00:00`) : null,
      status: (status as PaymentStatus) ?? 'upcoming',
      amount_paid: amount_paid != null ? Number(amount_paid) : 0,
      method: typeof method === 'string' ? method.trim() || null : null,
      notes: typeof notes === 'string' ? notes.trim() || null : null,
      exchange_rate: exchange_rate != null ? Number(exchange_rate) : null,
    },
    include: { vendor: { select: { id: true, name: true } } },
  })

  return NextResponse.json(
    {
      ok: true,
      result: {
        payment: {
          ...payment,
          amount: Number(payment.amount),
          amount_paid: Number(payment.amount_paid),
          exchange_rate: payment.exchange_rate != null ? Number(payment.exchange_rate) : null,
          due_date: payment.due_date?.toISOString() ?? null,
          paid_date: payment.paid_date?.toISOString() ?? null,
          created_at: payment.created_at.toISOString(),
          updated_at: payment.updated_at.toISOString(),
        },
      },
    },
    { status: 201 }
  )
}

// ─── add_vendor ────────────────────────────────────────────────────────────────

async function handleAddVendor(side: string, payload: unknown): Promise<NextResponse> {
  if (!payload || typeof payload !== 'object') return badRequest('payload must be an object')

  const { name, category, contact_name, phone, email, website, contract_amount, notes } =
    payload as Record<string, unknown>

  if (!name || typeof name !== 'string' || !(name as string).trim()) {
    return badRequest('name is required')
  }

  const vendor = await prisma.vendor.create({
    data: {
      name: (name as string).trim(),
      category: typeof category === 'string' ? category.trim() || null : null,
      contact_name: typeof contact_name === 'string' ? contact_name.trim() || null : null,
      phone: typeof phone === 'string' ? phone.trim() || null : null,
      email: typeof email === 'string' ? email.trim() || null : null,
      website: typeof website === 'string' ? website.trim() || null : null,
      contract_amount: contract_amount != null ? Number(contract_amount) : null,
      notes: typeof notes === 'string' ? notes.trim() || null : null,
      side: side as 'bride' | 'groom',
    },
    include: { payments: true },
  })

  return NextResponse.json(
    {
      ok: true,
      result: {
        vendor: {
          ...vendor,
          contract_amount: vendor.contract_amount ? Number(vendor.contract_amount) : null,
          created_at: vendor.created_at.toISOString(),
          updated_at: vendor.updated_at.toISOString(),
          payments: vendor.payments.map((p) => ({
            ...p,
            amount: Number(p.amount),
            amount_paid: Number(p.amount_paid),
            exchange_rate: p.exchange_rate != null ? Number(p.exchange_rate) : null,
            due_date: p.due_date?.toISOString() ?? null,
            paid_date: p.paid_date?.toISOString() ?? null,
            created_at: p.created_at.toISOString(),
            updated_at: p.updated_at.toISOString(),
          })),
        },
      },
    },
    { status: 201 }
  )
}

// ─── allocate_room ─────────────────────────────────────────────────────────────

function parseDate(val: unknown): Date | null {
  if (!val) return null
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? null : d
}

async function handleAllocateRoom(side: string, payload: unknown): Promise<NextResponse> {
  if (!payload || typeof payload !== 'object') return badRequest('payload must be an object')

  const { room_id, guest_id, family_member_id, check_in, check_out, notes } = payload as Record<string, unknown>

  if (!room_id || !guest_id) return badRequest('room_id and guest_id are required')
  const familyMemberId = family_member_id ? String(family_member_id) : null

  const guest = await prisma.guest.findUnique({
    where: { id: guest_id as string },
    select: { side: true },
  })
  if (!guest || guest.side !== side) return notFound('Guest not found')

  if (familyMemberId) {
    const familyMember = await prisma.familyMember.findUnique({
      where: { id: familyMemberId },
      select: { guest_id: true },
    })
    if (!familyMember || familyMember.guest_id !== (guest_id as string)) {
      return notFound('Family member not found for this guest')
    }
  }

  const room = await prisma.room.findUnique({
    where: { id: room_id as string },
    include: { hotel: { select: { side: true } } },
  })
  if (!room || room.hotel.side !== side) return notFound('Room not found')

  // One room per person (guest_id + family_member_id pair; null = primary guest)
  const existing = await prisma.roomAssignment.findFirst({
    where: { guest_id: guest_id as string, family_member_id: familyMemberId },
  })
  if (existing) {
    return conflict(familyMemberId ? 'Family member is already assigned to a room' : 'Guest is already assigned to a room')
  }

  const assignment = await prisma.roomAssignment.create({
    data: {
      room_id: room_id as string,
      guest_id: guest_id as string,
      family_member_id: familyMemberId,
      check_in: parseDate(check_in),
      check_out: parseDate(check_out),
      notes: typeof notes === 'string' ? notes.trim() || null : null,
    },
    include: {
      guest: {
        select: {
          id: true,
          name: true,
          household_group: true,
          familyMembers: { select: { id: true } },
        },
      },
      familyMember: { select: { id: true, name: true, is_child: true } },
    },
  })

  return NextResponse.json(
    {
      ok: true,
      result: {
        assignment: {
          ...assignment,
          check_in: assignment.check_in?.toISOString() ?? null,
          check_out: assignment.check_out?.toISOString() ?? null,
          assigned_at: assignment.assigned_at.toISOString(),
        },
      },
    },
    { status: 201 }
  )
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return badRequest('Invalid request body')

  const { actionType, payload } = body as Record<string, unknown>

  if (!actionType || typeof actionType !== 'string') {
    return badRequest('actionType is required')
  }

  switch (actionType) {
    case 'add_guests':
      return handleAddGuests(side, payload)
    case 'add_expense':
      return handleAddExpense(side, payload)
    case 'record_payment':
      return handleRecordPayment(side, payload)
    case 'add_vendor':
      return handleAddVendor(side, payload)
    case 'allocate_room':
      return handleAllocateRoom(side, payload)
    default:
      return badRequest(`Unknown actionType: ${actionType}`)
  }
}
