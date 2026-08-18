import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { type RecordDetail } from '@/lib/duplicate-match'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// Returns EVERY guest + family member on the admin's side as RecordDetail[],
// for the manual map-and-merge tool. Unlike GET /api/admin/duplicates (which
// only returns fuzzy-match candidates), this lists all records so the admin can
// manually pair any family member with any guest they deem relevant.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!

  const [guests, familyMembers] = await Promise.all([
    prisma.guest.findMany({
      where: { side },
      select: {
        id: true,
        name: true,
        household_group: true,
        email: true,
        phone: true,
        address: true,
        rsvpResponses: {
          select: { event_id: true, attending: true, dietary_restrictions: true },
        },
        eventInvitations: { select: { event_id: true } },
        roomAssignments: { select: { id: true, room_id: true } },
      },
    }),
    prisma.familyMember.findMany({
      where: { guest: { side } },
      select: {
        id: true,
        name: true,
        is_child: true,
        guest: { select: { id: true, household_group: true, name: true } },
        rsvps: {
          select: { event_id: true, attending: true, dietary_restrictions: true },
        },
        roomAssignments: { select: { id: true, room_id: true } },
      },
    }),
  ])

  const records: RecordDetail[] = []

  for (const g of guests) {
    records.push({
      ref: { type: 'guest', id: g.id },
      name: g.name,
      type: 'guest',
      parentGuestName: null,
      householdGroup: g.household_group,
      email: g.email,
      phone: g.phone,
      address: g.address,
      isChild: false,
      rsvps: g.rsvpResponses.map((r) => ({
        event_id: r.event_id,
        attending: r.attending,
        dietary: r.dietary_restrictions,
      })),
      invitedEventIds: g.eventInvitations.map((e) => e.event_id),
      roomId: g.roomAssignments.length > 0 ? g.roomAssignments[0].room_id : null,
      linkState: 'valid',
    })
  }

  for (const fm of familyMembers) {
    records.push({
      ref: { type: 'family_member', id: fm.id },
      name: fm.name,
      type: 'family_member',
      parentGuestName: fm.guest.name,
      householdGroup: fm.guest.household_group,
      email: null,
      phone: null,
      address: null,
      isChild: fm.is_child,
      rsvps: fm.rsvps.map((r) => ({
        event_id: r.event_id,
        attending: r.attending,
        dietary: r.dietary_restrictions,
      })),
      invitedEventIds: [],
      roomId: fm.roomAssignments.length > 0 ? fm.roomAssignments[0].room_id : null,
      linkState: 'dead',
    })
  }

  return NextResponse.json({ records })
}