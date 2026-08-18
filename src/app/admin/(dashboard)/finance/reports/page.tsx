import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import ReportsClient from './ReportsClient'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

const CHART_COLORS = ['#B8860B', '#be185d', '#1d4ed8', '#A3B18A', '#6366f1', '#f59e0b', '#10b981', '#e11d48']

function monthKey(d: Date): string {
  return format(d, 'MMM yyyy')
}

export default async function ReportsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin')
  const side = session.user.side!

  const [categories, expenses, payments, vendors, guestCount, familyCount] = await Promise.all([
    prisma.budgetCategory.findMany({ where: { side }, orderBy: { sort_order: 'asc' } }),
    prisma.expense.findMany({
      where: { side },
      select: {
        id: true,
        description: true,
        amount: true,
        amount_paid: true,
        status: true,
        category_id: true,
        date: true,
        created_at: true,
      },
      orderBy: { date: 'asc' },
    }),
    prisma.payment.findMany({
      where: { vendor: { side } },
      select: {
        id: true,
        vendor_id: true,
        amount: true,
        amount_paid: true,
        status: true,
        paid_date: true,
        due_date: true,
      },
      orderBy: { due_date: 'asc' },
    }),
    prisma.vendor.findMany({
      where: { side },
      select: { id: true, name: true },
    }),
    prisma.guest.count({ where: { side } }),
    prisma.familyMember.count({ where: { guest: { side } } }),
  ])

  const totalSpent = (() => {
    let s = 0
    for (const e of expenses) {
      if (e.status === 'paid' || e.status === 'partially_paid') s += Number(e.amount_paid)
    }
    for (const p of payments) {
      if (p.status === 'paid' || p.status === 'partially_paid') s += Number(p.amount_paid)
    }
    return s
  })()

  const totalGuests = guestCount + familyCount
  const perGuestCost = totalGuests > 0 ? Math.round(totalSpent / totalGuests) : 0

  // Category breakdown
  const spendByCategory = new Map<string, number>()
  for (const e of expenses) {
    if (e.category_id && (e.status === 'paid' || e.status === 'partially_paid')) {
      spendByCategory.set(e.category_id, (spendByCategory.get(e.category_id) ?? 0) + Number(e.amount_paid))
    }
  }
  const categoryData = categories.map((c, i) => ({
    id: c.id,
    name: c.name,
    budgeted: Number(c.budgeted_amount),
    spent: spendByCategory.get(c.id) ?? 0,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }))

  // Cash flow: monthly cumulative spending
  const monthlyMap = new Map<string, number>()
  for (const e of expenses) {
    if ((e.status === 'paid' || e.status === 'partially_paid') && Number(e.amount_paid) > 0) {
      const d = e.date ?? e.created_at
      const key = monthKey(d)
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + Number(e.amount_paid))
    }
  }
  for (const p of payments) {
    if ((p.status === 'paid' || p.status === 'partially_paid') && Number(p.amount_paid) > 0 && p.paid_date) {
      const key = monthKey(p.paid_date)
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + Number(p.amount_paid))
    }
  }
  // Sort months chronologically and build cumulative
  const sortedMonths = [...monthlyMap.entries()].sort(([a], [b]) => {
    const da = new Date(a)
    const db = new Date(b)
    return da.getTime() - db.getTime()
  })
  let running = 0
  const cashFlowData = sortedMonths.map(([month, spent]) => {
    running += spent
    return { month, spent, cumulative: running }
  })

  // Monthly breakdown by category
  type MonthCategoryMap = Record<string, number>
  const monthByCatMap = new Map<string, MonthCategoryMap>()
  for (const e of expenses) {
    if ((e.status === 'paid' || e.status === 'partially_paid') && Number(e.amount_paid) > 0 && e.category_id) {
      const d = e.date ?? e.created_at
      const key = monthKey(d)
      const entry = monthByCatMap.get(key) ?? {}
      entry[e.category_id] = (entry[e.category_id] ?? 0) + Number(e.amount_paid)
      monthByCatMap.set(key, entry)
    }
  }
  const monthlyBreakdown = [...monthByCatMap.entries()]
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([month, byCat]) => {
      const row: Record<string, string | number> = { month }
      for (const c of categories) {
        row[c.name] = byCat[c.id] ?? 0
      }
      return row
    })

  // Serialized expenses + payments for CSV
  const vendorMap = new Map(vendors.map((v) => [v.id, v.name]))
  const catMap = new Map(categories.map((c) => [c.id, c.name]))

  const serializedExpenses = expenses.map((e) => ({
    id: e.id,
    description: e.description,
    category: catMap.get(e.category_id ?? '') ?? '',
    amount: Number(e.amount),
    amount_paid: Number(e.amount_paid),
    status: e.status,
    date: e.date?.toISOString() ?? e.created_at.toISOString(),
  }))

  const serializedPayments = payments.map((p) => ({
    id: p.id,
    vendor: vendorMap.get(p.vendor_id) ?? '',
    amount: Number(p.amount),
    amount_paid: Number(p.amount_paid),
    status: p.status,
    date: p.paid_date?.toISOString() ?? p.due_date?.toISOString() ?? '',
  }))

  return (
    <ReportsClient
      side={side as 'bride' | 'groom'}
      categoryData={categoryData}
      cashFlowData={cashFlowData}
      monthlyBreakdown={monthlyBreakdown}
      categoryNames={categories.map((c) => c.name)}
      categoryColors={categories.map((_, i) => CHART_COLORS[i % CHART_COLORS.length])}
      totalGuests={totalGuests}
      perGuestCost={perGuestCost}
      expenses={serializedExpenses}
      payments={serializedPayments}
    />
  )
}
