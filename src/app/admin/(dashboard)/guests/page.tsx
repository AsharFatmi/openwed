import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import GuestsClient from './GuestsClient'

export default async function GuestsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin/login')

  const side = session.user.side!
  const adminUserId = session.user.id

  const [guests, events, contacts, oauthToken] = await Promise.all([
    prisma.guest.findMany({
      where: { side },
      include: {
        familyMembers: { select: { id: true } },
        rsvpResponses: { select: { attending: true, dietary_restrictions: true } },
        eventInvitations: { select: { event_id: true } },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.event.findMany({
      where: { OR: [{ managed_by: side }, { display_group: 'joint' }] },
      orderBy: [{ sort_order: 'asc' }, { date: 'asc' }],
      select: { id: true, name: true, display_group: true },
    }),
    prisma.googleContact.findMany({
      where: { side },
      select: { name: true, phone: true, email: true },
      orderBy: { name: 'asc' },
    }),
    prisma.googleOAuthToken.findUnique({
      where: { admin_user_id: adminUserId },
      select: { id: true },
    }),
  ])

  return (
    <Suspense>
      <GuestsClient
        initialGuests={guests}
        side={side}
        events={events}
        contacts={contacts}
        isGoogleConnected={!!oauthToken}
      />
    </Suspense>
  )
}
