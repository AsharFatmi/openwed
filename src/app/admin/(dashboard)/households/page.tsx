import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import HouseholdsClient from './HouseholdsClient'

export const dynamic = 'force-dynamic'

export default async function HouseholdsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin/login')

  const side = session.user.side!

  const guests = await prisma.guest.findMany({
    where: { side },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      household_group: true,
      familyMembers: {
        select: { id: true, name: true, is_child: true },
        orderBy: { created_at: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  return (
    <Suspense>
      <HouseholdsClient initialGuests={guests} side={side} />
    </Suspense>
  )
}