import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import RoomsClient from './RoomsClient'

export const dynamic = 'force-dynamic'

export default async function RoomsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin/login')

  const side = session.user.side!

  const [hotels, confirmedGuests, assignments] = await Promise.all([
    prisma.hotel.findMany({
      where: { side },
      include: {
        rooms: {
          include: {
            assignments: {
              include: {
                guest: { select: { id: true, name: true, household_group: true } },
                familyMember: { select: { id: true, name: true, is_child: true } },
              },
            },
          },
          orderBy: { room_number: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.guest.findMany({
      // A person needs a room if they are a primary guest attending any event,
      // OR they have an attending family member (covers the case where the
      // primary declined but a plus-one is still coming). Keeps the rooms
      // count consistent with the dashboard headcount.
      where: {
        side,
        OR: [
          { rsvpResponses: { some: { attending: true } } },
          { familyMembers: { some: { rsvps: { some: { attending: true } } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        household_group: true,
        // Primary guest's own attending responses — non-empty means the
        // primary themselves need a room (vs. only their family attending).
        rsvpResponses: { where: { attending: true }, select: { id: true } },
        // Attending family members only (each needs their own room/bed).
        familyMembers: {
          where: { rsvps: { some: { attending: true } } },
          select: { id: true, name: true, is_child: true },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.roomAssignment.findMany({
      where: { guest: { side } },
      select: {
        id: true,
        room_id: true,
        guest_id: true,
        family_member_id: true,
        check_in: true,
        check_out: true,
        notes: true,
        assigned_at: true,
        familyMember: { select: { id: true, name: true, is_child: true } },
      },
    }),
  ])

  const serializedHotels = hotels.map((h) => ({
    ...h,
    check_in_date: h.check_in_date?.toISOString() ?? null,
    check_out_date: h.check_out_date?.toISOString() ?? null,
    created_at: h.created_at.toISOString(),
    updated_at: h.updated_at.toISOString(),
    rooms: h.rooms.map((r) => ({
      ...r,
      assignments: r.assignments.map((a) => ({
        ...a,
        check_in: a.check_in?.toISOString() ?? null,
        check_out: a.check_out?.toISOString() ?? null,
        assigned_at: a.assigned_at.toISOString(),
      })),
    })),
  }))

  const serializedAssignments = assignments.map((a) => ({
    ...a,
    check_in: a.check_in?.toISOString() ?? null,
    check_out: a.check_out?.toISOString() ?? null,
    assigned_at: a.assigned_at.toISOString(),
  }))

  return (
    <RoomsClient
      initialHotels={serializedHotels}
      confirmedGuests={confirmedGuests}
      initialAssignments={serializedAssignments}
      side={side}
    />
  )
}
