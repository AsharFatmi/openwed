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

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const { searchParams } = new URL(request.url)
  const eventId = searchParams.get('eventId')

  if (!eventId) {
    return NextResponse.json({ error: 'eventId is required.' }, { status: 400 })
  }

  const side = session.user.side!

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, date: true },
  })
  if (!event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  }

  // Fetch responses for this event, side-filtered via guest relation
  const rawResponses = await prisma.rsvpResponse.findMany({
    where: {
      event_id: eventId,
      guest: { side },
    },
    select: {
      id: true,
      attending: true,
      dietary_restrictions: true,
      submitted_at: true,
      guest: {
        select: { id: true, name: true, email: true, phone: true, household_group: true },
      },
    },
  })

  // Collect guest IDs to fetch family member RSVPs
  const guestIds = rawResponses.map((r) => r.guest.id)

  const familyMemberRsvps = guestIds.length
    ? await prisma.familyMemberRsvp.findMany({
        where: {
          event_id: eventId,
          familyMember: { guest_id: { in: guestIds } },
        },
        select: {
          id: true,
          attending: true,
          dietary_restrictions: true,
          familyMember: {
            select: { id: true, name: true, is_child: true, guest_id: true },
          },
        },
      })
    : []

  // Group family member RSVPs by guest_id
  const fmByGuest = new Map<string, typeof familyMemberRsvps>()
  for (const fmr of familyMemberRsvps) {
    const guestId = fmr.familyMember.guest_id
    if (!fmByGuest.has(guestId)) fmByGuest.set(guestId, [])
    fmByGuest.get(guestId)!.push(fmr)
  }

  const responses = rawResponses.map((r) => ({
    id: r.id,
    attending: r.attending,
    dietary_restrictions: r.dietary_restrictions,
    submitted_at: r.submitted_at.toISOString(),
    guest: r.guest,
    familyMemberRsvps: fmByGuest.get(r.guest.id) ?? [],
  }))

  // Non-responders: guests of this side with no response for this event
  const nonResponders = await prisma.guest.findMany({
    where: {
      side,
      rsvpResponses: { none: { event_id: eventId } },
    },
    select: { id: true, name: true, email: true, household_group: true },
    orderBy: { name: 'asc' },
  })

  // Totals
  const confirmedResponses = responses.filter((r) => r.attending === true)
  const guestsConfirmed = confirmedResponses.length
  const guestsDeclined = responses.filter((r) => r.attending === false).length
  const guestsPending = responses.filter((r) => r.attending === null).length

  // Distinct households among confirmed guests
  const householdsAttending = new Set(
    confirmedResponses.map((r) => r.guest.household_group).filter(Boolean)
  ).size

  // Children attending via FamilyMemberRsvp (is_child lives on FamilyMember)
  const childrenAttending = familyMemberRsvps.filter(
    (fmr) => fmr.attending === true && fmr.familyMember.is_child
  ).length

  return NextResponse.json({
    event: { ...event, date: event.date.toISOString() },
    responses,
    nonResponders,
    totals: { guestsConfirmed, guestsDeclined, guestsPending, householdsAttending, childrenAttending },
  })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!
  const body = await request.json().catch(() => null)
  const { guestId, eventId, attending, dietary_restrictions } = body ?? {}

  if (!guestId || !eventId || typeof attending !== 'boolean') {
    return NextResponse.json({ error: 'guestId, eventId, and attending are required.' }, { status: 400 })
  }

  const guest = await prisma.guest.findUnique({ where: { id: guestId }, select: { id: true, side: true } })
  if (!guest || guest.side !== side) {
    return NextResponse.json({ error: 'Guest not found.' }, { status: 404 })
  }

  const rsvp = await prisma.rsvpResponse.upsert({
    where: { guest_id_event_id: { guest_id: guestId, event_id: eventId } },
    create: { guest_id: guestId, event_id: eventId, attending, dietary_restrictions: dietary_restrictions ?? null },
    update: { attending, dietary_restrictions: dietary_restrictions ?? null },
  })

  return NextResponse.json({ rsvp })
}
