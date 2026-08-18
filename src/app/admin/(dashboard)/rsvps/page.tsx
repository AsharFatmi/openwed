import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import RsvpsClient from './RsvpsClient'

export const dynamic = 'force-dynamic'

export default async function RsvpsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin/login')

  const side = session.user.side!

  const [events, guests, nonResponders, allRsvps, allFmRsvps] = await Promise.all([
    prisma.event.findMany({
      where: { OR: [{ managed_by: side }, { display_group: 'joint' }] },
      select: { id: true, name: true, date: true, sort_order: true },
      orderBy: [{ sort_order: 'asc' }, { date: 'asc' }],
    }),
    prisma.guest.findMany({
      where: { side },
      select: {
        id: true,
        name: true,
        email: true,
        household_group: true,
        created_at: true,
        arrival_date: true,
        departure_date: true,
        familyMembers: { select: { id: true, name: true, is_child: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.guest.findMany({
      where: { side, rsvpResponses: { none: {} } },
      select: { id: true, name: true, email: true, household_group: true, created_at: true },
      orderBy: { name: 'asc' },
    }),
    prisma.rsvpResponse.findMany({
      where: { guest: { side } },
      select: { guest_id: true, event_id: true, attending: true },
    }),
    prisma.familyMemberRsvp.findMany({
      where: { familyMember: { guest: { side } } },
      select: { family_member_id: true, event_id: true, attending: true },
    }),
  ])

  const serializedEvents = events.map((e) => ({
    ...e,
    date: e.date.toISOString(),
  }))

  const serializedGuests = guests.map((g) => ({
    ...g,
    created_at: g.created_at.toISOString(),
  }))

  const serializedNonResponders = nonResponders.map((g) => ({
    ...g,
    created_at: g.created_at.toISOString(),
  }))

  return (
    <RsvpsClient
      events={serializedEvents}
      guests={serializedGuests}
      initialNonResponders={serializedNonResponders}
      allRsvps={allRsvps}
      allFmRsvps={allFmRsvps}
      side={side}
    />
  )
}
