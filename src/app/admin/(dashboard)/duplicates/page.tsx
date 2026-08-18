import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import DuplicatesClient from './DuplicatesClient'

export const dynamic = 'force-dynamic'

export default async function DuplicatesPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin/login')

  const side = session.user.side!

  // Fetch events (for the merge modal's event-name lookup) — side-owned + joint
  const events = await prisma.event.findMany({
    where: { OR: [{ managed_by: side }, { display_group: 'joint' }] },
    select: { id: true, name: true },
    orderBy: [{ sort_order: 'asc' }, { date: 'asc' }],
  })

  return (
    <Suspense>
      <DuplicatesClient side={side} events={events} />
    </Suspense>
  )
}