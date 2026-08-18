import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import InvitationsClient from './InvitationsClient'

export default async function InvitationsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin/login')

  const side = session.user.side!

  const [guests, events] = await Promise.all([
    prisma.guest.findMany({
      where: { side },
      select: {
        id: true,
        name: true,
        household_group: true,
        created_at: true,
        eventInvitations: { select: { event_id: true } },
      },
      orderBy: { created_at: 'asc' },
    }),
    prisma.event.findMany({
      where: { OR: [{ managed_by: side }, { display_group: 'joint' }] },
      select: { id: true, name: true, date: true, sort_order: true },
      orderBy: [{ sort_order: 'asc' }, { date: 'asc' }],
    }),
  ])

  return <InvitationsClient guests={guests} events={events} />
}
