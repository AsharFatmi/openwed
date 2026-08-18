import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

type ImportRow = {
  name: string
  email?: string
  phone?: string
  address?: string
  household_group?: string
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const body = await request.json()
  const { rows } = body ?? {}

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided.' }, { status: 400 })
  }

  const validRows: ImportRow[] = []
  for (const row of rows) {
    if (!row.name || !String(row.name).trim()) continue
    validRows.push({
      name: String(row.name).trim(),
      email: row.email ? String(row.email).trim() || undefined : undefined,
      phone: row.phone ? String(row.phone).trim() || undefined : undefined,
      address: row.address ? String(row.address).trim() || undefined : undefined,
      household_group: row.household_group ? String(row.household_group).trim() || undefined : undefined,
    })
  }

  if (validRows.length === 0) {
    return NextResponse.json({ error: 'No valid rows found. Each row must have a name.' }, { status: 400 })
  }

  const countBefore = await prisma.guest.count({ where: { side: session.user.side! } })

  await prisma.guest.createMany({
    data: validRows.map((r) => ({
      name: r.name,
      email: r.email ?? null,
      phone: r.phone ?? null,
      address: r.address ?? null,
      household_group: r.household_group ?? null,
      side: session.user.side!,
      rsvp_token: crypto.randomBytes(32).toString('hex'),
    })),
  })

  // Auto-invite all imported guests to every event
  const [newGuests, allEvents] = await Promise.all([
    prisma.guest.findMany({
      where: { side: session.user.side! },
      orderBy: { created_at: 'desc' },
      take: validRows.length,
      skip: 0,
      select: { id: true },
    }),
    prisma.event.findMany({
      where: { OR: [{ managed_by: session.user.side! }, { display_group: 'joint' }] },
      select: { id: true },
    }),
  ])

  if (newGuests.length > 0 && allEvents.length > 0) {
    await prisma.guestEventInvitation.createMany({
      data: newGuests.flatMap((g) => allEvents.map((e) => ({ guest_id: g.id, event_id: e.id }))),
      skipDuplicates: true,
    })
  }

  // Return the newly created guests with full includes so client can append to state
  const newGuestsFull = await prisma.guest.findMany({
    where: { side: session.user.side! },
    include: {
      familyMembers: { select: { id: true } },
      rsvpResponses: { select: { attending: true, dietary_restrictions: true } },
      eventInvitations: { select: { event_id: true } },
    },
    orderBy: { created_at: 'desc' },
    take: validRows.length,
  })

  // suppress unused variable warning
  void countBefore

  return NextResponse.json({ imported: validRows.length, guests: newGuestsFull })
}
