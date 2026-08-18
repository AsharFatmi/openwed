import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!

  const body = await req.json()
  const swaps: { id: string; sort_order: number }[] = body.swaps ?? []

  if (!Array.isArray(swaps) || swaps.length === 0) {
    return NextResponse.json({ error: 'No swaps provided' }, { status: 400 })
  }

  const ids = swaps.map((s) => s.id)
  const owned = await prisma.budgetCategory.findMany({
    where: { id: { in: ids }, side },
    select: { id: true },
  })

  if (owned.length !== ids.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.$transaction(
    swaps.map((s) =>
      prisma.budgetCategory.update({ where: { id: s.id }, data: { sort_order: s.sort_order } })
    )
  )

  return NextResponse.json({ success: true })
}
