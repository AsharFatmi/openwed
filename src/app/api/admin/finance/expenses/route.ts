import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ExpenseStatus, type Expense, type BudgetCategory, type Vendor } from '@prisma/client'

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

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!

  const [expenses, categories, vendors] = await Promise.all([
    prisma.expense.findMany({
      where: { side },
      include: {
        category: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.budgetCategory.findMany({
      where: { side },
      orderBy: { sort_order: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.vendor.findMany({
      where: { side },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  return NextResponse.json({
    expenses: expenses.map(serializeExpense),
    categories,
    vendors,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!

  const body = await req.json()
  const { description, amount, category_id, vendor_id, date, payment_method, status, amount_paid, notes, exchange_rate } = body

  if (!description?.trim()) return NextResponse.json({ error: 'Description is required' }, { status: 400 })
  if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  if (status && !Object.values(ExpenseStatus).includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  const parsedAmount = Number(amount)
  const parsedAmountPaid = amount_paid !== undefined ? Number(amount_paid) : 0
  if (parsedAmountPaid > parsedAmount) {
    return NextResponse.json({ error: 'Amount paid cannot exceed total amount' }, { status: 400 })
  }

  if (category_id) {
    const cat = await prisma.budgetCategory.findUnique({ where: { id: category_id } })
    if (!cat || cat.side !== side) return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }
  if (vendor_id) {
    const ven = await prisma.vendor.findUnique({ where: { id: vendor_id } })
    if (!ven || ven.side !== side) return NextResponse.json({ error: 'Invalid vendor' }, { status: 400 })
  }

  const expense = await prisma.expense.create({
    data: {
      description: description.trim(),
      amount: parsedAmount,
      amount_paid: parsedAmountPaid,
      category_id: category_id || null,
      vendor_id: vendor_id || null,
      date: date ? new Date(`${date}T12:00:00`) : null,
      payment_method: payment_method?.trim() || null,
      status: (status as ExpenseStatus) ?? ExpenseStatus.pending,
      notes: notes?.trim() || null,
      exchange_rate: exchange_rate != null ? Number(exchange_rate) : null,
      side,
    },
    include: {
      category: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({ expense: serializeExpense(expense) }, { status: 201 })
}
