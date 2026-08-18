import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { type BudgetCategory } from '@prisma/client'

const PRESET_NAMES = [
  'Venue',
  'Catering & Bar',
  'Photography',
  'Music & Entertainment',
  'Florals & Décor',
  'Attire & Beauty',
  'Gifts & Favors',
  'Stationery & Invitations',
  'Transportation',
  'Honeymoon',
  'Miscellaneous',
]

function serialize(c: BudgetCategory) {
  return {
    ...c,
    budgeted_amount: Number(c.budgeted_amount),
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString(),
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!

  const count = await prisma.budgetCategory.count({ where: { side } })
  if (count === 0) {
    await prisma.budgetCategory.createMany({
      data: PRESET_NAMES.map((name, i) => ({ name, sort_order: i, budgeted_amount: 0, side })),
    })
  }

  const categories = await prisma.budgetCategory.findMany({
    where: { side },
    orderBy: { sort_order: 'asc' },
  })

  return NextResponse.json({ categories: categories.map(serialize) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!

  const body = await req.json()
  const { name, budgeted_amount } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (budgeted_amount === undefined || Number(budgeted_amount) < 0) {
    return NextResponse.json({ error: 'Budgeted amount must be 0 or greater' }, { status: 400 })
  }

  const last = await prisma.budgetCategory.findFirst({
    where: { side },
    orderBy: { sort_order: 'desc' },
    select: { sort_order: true },
  })
  const sort_order = last ? last.sort_order + 1 : 0

  const category = await prisma.budgetCategory.create({
    data: { name: name.trim(), budgeted_amount: Number(budgeted_amount), sort_order, side },
  })

  return NextResponse.json({ category: serialize(category) }, { status: 201 })
}
