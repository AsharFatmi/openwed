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

const guestIncludes = {
  familyMembers: { select: { id: true } },
  rsvpResponses: { select: { attending: true, dietary_restrictions: true } },
  eventInvitations: { select: { event_id: true } },
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const guests = await prisma.guest.findMany({
    where: { side: session.user.side! },
    include: guestIncludes,
    orderBy: { created_at: 'desc' },
  })

  return NextResponse.json({ guests })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const body = await request.json()
  const { name, email, phone, address, household_group, notes, invitedEventIds } = body ?? {}

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  }

  if (!household_group || typeof household_group !== 'string' || !household_group.trim()) {
    return NextResponse.json({ error: 'Household group is required.' }, { status: 400 })
  }

  // Validate invitedEventIds belong to this admin's side
  let safeEventIds: string[] = []
  if (Array.isArray(invitedEventIds) && invitedEventIds.length > 0) {
    const ownedEvents = await prisma.event.findMany({
      where: {
        id: { in: invitedEventIds as string[] },
        OR: [{ managed_by: session.user.side! }, { display_group: 'joint' }],
      },
      select: { id: true },
    })
    safeEventIds = ownedEvents.map((e) => e.id)
  }

  const guest = await prisma.$transaction(async (tx) => {
    const g = await tx.guest.create({
      data: {
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        household_group: household_group?.trim() || null,
        notes: notes?.trim() || null,
        side: session.user.side!,
        rsvp_token: crypto.randomBytes(32).toString('hex'),
      },
    })
    if (safeEventIds.length > 0) {
      await tx.guestEventInvitation.createMany({
        data: safeEventIds.map((event_id) => ({ guest_id: g.id, event_id })),
        skipDuplicates: true,
      })
    }
    return tx.guest.findUnique({ where: { id: g.id }, include: guestIncludes })
  })

  return NextResponse.json({ guest }, { status: 201 })
}
