import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const side = session.user.side!

  const nonResponders = await prisma.guest.findMany({
    where: { side, rsvpResponses: { none: {} } },
    select: { id: true, name: true, email: true, household_group: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ nonResponders })
}
