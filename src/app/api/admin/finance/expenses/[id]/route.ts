import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ExpenseStatus, type Expense, type BudgetCategory, type Vendor } from '@prisma/client'

type Context = { params: Promise<{ id: string }> }

type ExpenseWithRelations = Expense & {
  category: Pick<BudgetCategory, 'id' | 'name'> | null
  vendor: Pick<Vendor, 'id' | 'name'> | null
}

function serializeExpense(e: ExpenseWithRelations) {
  return {
    ...e,
    amount: Number(e.amount),
    amount_paid: Number(e.amount_paid),
    exchange_rate: e.exchange_rate != null ? Number(e.exchange_rate) : null,
    date: e.date?.toISOString() ?? null,
    created_at: e.created_at.toISOString(),
    updated_at: e.updated_at.toISOString(),
  }
}

export async function PUT(req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!
  const { id } = await context.params

  const existing = await prisma.expense.findUnique({ where: { id } })
  if (!existing || existing.side !== side) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.description !== undefined) {
    if (!body.description?.trim()) return NextResponse.json({ error: 'Description cannot be empty' }, { status: 400 })
    data.description = body.description.trim()
  }

  const newAmount = body.amount !== undefined ? Number(body.amount) : Number(existing.amount)
  if (body.amount !== undefined) {
    if (newAmount <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    data.amount = newAmount
  }

  if (body.amount_paid !== undefined) {
    const newPaid = Number(body.amount_paid)
    if (newPaid > newAmount) return NextResponse.json({ error: 'Amount paid cannot exceed total amount' }, { status: 400 })
    data.amount_paid = newPaid
  }

  if (body.status !== undefined) {
    if (!Object.values(ExpenseStatus).includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    data.status = body.status
  }

  if (body.category_id !== undefined) {
    if (body.category_id) {
      const cat = await prisma.budgetCategory.findUnique({ where: { id: body.category_id } })
      if (!cat || cat.side !== side) return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }
    data.category_id = body.category_id || null
  }

  if (body.vendor_id !== undefined) {
    if (body.vendor_id) {
      const ven = await prisma.vendor.findUnique({ where: { id: body.vendor_id } })
      if (!ven || ven.side !== side) return NextResponse.json({ error: 'Invalid vendor' }, { status: 400 })
    }
    data.vendor_id = body.vendor_id || null
  }

  if (body.date !== undefined) data.date = body.date ? new Date(`${body.date}T12:00:00`) : null
  if (body.payment_method !== undefined) data.payment_method = body.payment_method?.trim() || null
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null
  if (body.exchange_rate !== undefined) data.exchange_rate = body.exchange_rate != null ? Number(body.exchange_rate) : null

  const expense = await prisma.expense.update({
    where: { id },
    data,
    include: {
      category: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({ expense: serializeExpense(expense) })
}

export async function DELETE(_req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!
  const { id } = await context.params

  const existing = await prisma.expense.findUnique({ where: { id } })
  if (!existing || existing.side !== side) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.expense.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
