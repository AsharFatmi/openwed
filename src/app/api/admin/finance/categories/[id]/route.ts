import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { type BudgetCategory } from '@prisma/client'

type Context = { params: Promise<{ id: string }> }

function serialize(c: BudgetCategory) {
  return {
    ...c,
    budgeted_amount: Number(c.budgeted_amount),
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString(),
  }
}

export async function PUT(req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!
  const { id } = await context.params

  const existing = await prisma.budgetCategory.findUnique({ where: { id } })
  if (!existing || existing.side !== side) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.name !== undefined) {
    if (!body.name?.trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    data.name = body.name.trim()
  }
  if (body.budgeted_amount !== undefined) {
    if (Number(body.budgeted_amount) < 0) return NextResponse.json({ error: 'Amount must be 0 or greater' }, { status: 400 })
    data.budgeted_amount = Number(body.budgeted_amount)
  }

  const category = await prisma.budgetCategory.update({ where: { id }, data })
  return NextResponse.json({ category: serialize(category) })
}

export async function DELETE(_req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!
  const { id } = await context.params

  const existing = await prisma.budgetCategory.findUnique({ where: { id } })
  if (!existing || existing.side !== side) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.budgetCategory.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
