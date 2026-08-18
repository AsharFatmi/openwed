import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import ExpensesClient from './ExpensesClient'

export const dynamic = 'force-dynamic'

export default async function ExpensesPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin/login')
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

  const serializedExpenses = expenses.map((e) => ({
    ...e,
    amount: Number(e.amount),
    amount_paid: Number(e.amount_paid),
    exchange_rate: e.exchange_rate != null ? Number(e.exchange_rate) : null,
    date: e.date?.toISOString() ?? null,
    created_at: e.created_at.toISOString(),
    updated_at: e.updated_at.toISOString(),
  }))

  return (
    <ExpensesClient
      initialExpenses={serializedExpenses}
      categories={categories}
      vendors={vendors}
      side={side}
    />
  )
}
