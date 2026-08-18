import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import CategoriesClient from './CategoriesClient'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin/login')
  const side = session.user.side!

  const count = await prisma.budgetCategory.count({ where: { side } })
  if (count === 0) {
    const PRESET_NAMES = [
      'Venue', 'Catering & Bar', 'Photography', 'Music & Entertainment',
      'Florals & Décor', 'Attire & Beauty', 'Gifts & Favors',
      'Stationery & Invitations', 'Transportation', 'Honeymoon', 'Miscellaneous',
    ]
    await prisma.budgetCategory.createMany({
      data: PRESET_NAMES.map((name, i) => ({ name, sort_order: i, budgeted_amount: 0, side })),
    })
  }

  const [categories, expenses] = await Promise.all([
    prisma.budgetCategory.findMany({ where: { side }, orderBy: { sort_order: 'asc' } }),
    prisma.expense.findMany({
      where: { side },
      select: { category_id: true, amount: true, amount_paid: true },
    }),
  ])

  const serializedCategories = categories.map((c) => ({
    ...c,
    budgeted_amount: Number(c.budgeted_amount),
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString(),
  }))

  const serializedExpenses = expenses.map((e) => ({
    category_id: e.category_id,
    amount: Number(e.amount),
    amount_paid: Number(e.amount_paid),
  }))

  return (
    <CategoriesClient
      initialCategories={serializedCategories}
      initialExpenses={serializedExpenses}
      side={side}
    />
  )
}
