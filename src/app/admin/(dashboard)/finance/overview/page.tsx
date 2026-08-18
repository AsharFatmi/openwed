import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import OverviewClient from './OverviewClient'

export const dynamic = 'force-dynamic'

const CHART_COLORS = ['#B8860B', '#be185d', '#1d4ed8', '#A3B18A', '#6366f1', '#f59e0b', '#10b981', '#e11d48']

export default async function OverviewPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin')
  const side = session.user.side!

  const [categories, expenses, payments, guestCount, familyCount] = await Promise.all([
    prisma.budgetCategory.findMany({ where: { side }, orderBy: { sort_order: 'asc' } }),
    prisma.expense.findMany({
      where: { side },
      select: { amount: true, amount_paid: true, status: true, category_id: true },
    }),
    prisma.payment.findMany({
      where: { vendor: { side } },
      select: { amount: true, amount_paid: true, status: true },
    }),
    prisma.guest.count({ where: { side } }),
    prisma.familyMember.count({ where: { guest: { side } } }),
  ])

  const totalBudgeted = categories.reduce((s, c) => s + Number(c.budgeted_amount), 0)

  let totalSpent = 0
  let totalCommitted = 0
  let totalPending = 0

  for (const e of expenses) {
    const amt = Number(e.amount)
    const paid = Number(e.amount_paid)
    if (e.status === 'paid') totalSpent += paid
    else if (e.status === 'partially_paid') { totalSpent += paid; totalCommitted += amt - paid }
    else totalPending += amt
  }

  for (const p of payments) {
    const amt = Number(p.amount)
    const paid = Number(p.amount_paid)
    if (p.status === 'paid') totalSpent += paid
    else if (p.status === 'partially_paid') { totalSpent += paid; totalCommitted += amt - paid }
    else totalPending += amt
  }

  const remaining = totalBudgeted - totalSpent
  const totalGuests = guestCount + familyCount
  const perGuestCost = totalGuests > 0 ? Math.round(totalSpent / totalGuests) : 0

  // Category breakdown for charts
  const spendByCategory = new Map<string, number>()
  for (const e of expenses) {
    if (e.category_id) {
      const paid = e.status === 'paid' ? Number(e.amount_paid)
        : e.status === 'partially_paid' ? Number(e.amount_paid)
        : 0
      spendByCategory.set(e.category_id, (spendByCategory.get(e.category_id) ?? 0) + paid)
    }
  }

  const categoryData = categories.map((c, i) => ({
    id: c.id,
    name: c.name,
    budgeted: Number(c.budgeted_amount),
    spent: spendByCategory.get(c.id) ?? 0,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }))

  return (
    <OverviewClient
      side={side as 'bride' | 'groom'}
      totals={{ totalBudgeted, totalSpent, totalCommitted, totalPending, remaining }}
      categoryData={categoryData}
      totalGuests={totalGuests}
      perGuestCost={perGuestCost}
    />
  )
}
