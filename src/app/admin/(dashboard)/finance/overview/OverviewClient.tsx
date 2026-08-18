'use client'

import Link from 'next/link'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { useCurrency } from '@/lib/currency'

type CategoryDatum = {
  id: string
  name: string
  budgeted: number
  spent: number
  color: string
}

type Totals = {
  totalBudgeted: number
  totalSpent: number
  totalCommitted: number
  totalPending: number
  remaining: number
}

type Props = {
  side: 'bride' | 'groom'
  totals: Totals
  categoryData: CategoryDatum[]
  totalGuests: number
  perGuestCost: number
}

function KpiCard({
  label,
  value,
  sub,
  valueColor,
  action,
}: {
  label: string
  value: string
  sub?: string
  valueColor?: string
  action?: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-1"
      style={{ borderColor: 'var(--color-highlight)', background: 'white' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
          {label}
        </span>
        {action}
      </div>
      <span
        className="text-2xl font-semibold tabular-nums mt-1"
        style={{ fontFamily: 'var(--font-cormorant)', color: valueColor ?? 'var(--color-foreground)' }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
          {sub}
        </span>
      )}
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
  fmt,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  fmt: (n: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{ background: 'var(--color-background)', borderColor: 'var(--color-highlight)' }}
    >
      {label && <p className="font-medium mb-1" style={{ color: 'var(--color-foreground)' }}>{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function OverviewClient({ side, totals, categoryData, totalGuests, perGuestCost }: Props) {
  const accent = side === 'bride' ? '#be185d' : '#1d4ed8'
  const accentBg = side === 'bride' ? '#fdf2f8' : '#eff6ff'
  const { fmt } = useCurrency()

  const { totalBudgeted, totalSpent, totalCommitted, totalPending, remaining } = totals

  const spentPct = totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 100) : 0
  const progressColor = spentPct >= 100 ? '#dc2626' : spentPct >= 80 ? '#d97706' : '#16a34a'

  const pieData = categoryData.filter((c) => c.spent > 0)
  const barData = categoryData.map((c) => ({ name: c.name, Budgeted: c.budgeted, Spent: c.spent }))

  const hasCategories = categoryData.length > 0
  const hasSpend = totalSpent > 0

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Total Budget"
          value={fmt(totalBudgeted)}
          sub="Sum of all categories"
          action={
            <Link
              href="/admin/finance/categories"
              className="text-xs font-medium hover:underline"
              style={{ color: accent }}
            >
              Edit →
            </Link>
          }
        />
        <KpiCard label="Total Spent" value={fmt(totalSpent)} sub="Fully & partially paid" valueColor="#16a34a" />
        <KpiCard label="Committed" value={fmt(totalCommitted)} sub="Balance on partial payments" valueColor="#d97706" />
        <KpiCard label="Pending" value={fmt(totalPending)} sub="Unpaid / upcoming" valueColor="#7c3aed" />
        <KpiCard
          label="Remaining"
          value={fmt(Math.abs(remaining))}
          sub={remaining < 0 ? 'Over budget' : 'Left to spend'}
          valueColor={remaining < 0 ? '#dc2626' : '#16a34a'}
        />
      </div>

      {/* Progress bar */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--color-highlight)', background: 'white' }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
            Budget Progress
          </span>
          <span className="text-sm font-semibold tabular-nums" style={{ color: progressColor }}>
            {spentPct.toFixed(1)}% spent
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--color-highlight)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${spentPct}%`, background: progressColor }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--color-muted)' }}>
          <span>{fmt(totalSpent)} spent</span>
          <span>{fmt(totalBudgeted)} budget</span>
        </div>
      </div>

      {/* Charts */}
      {hasCategories ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie chart */}
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--color-highlight)', background: 'white' }}
          >
            <p className="text-xs font-medium uppercase tracking-wide mb-4" style={{ color: 'var(--color-muted)' }}>
              Spending by Category
            </p>
            {hasSpend ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="spent"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.id} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip active={active} payload={payload?.map(p => ({ name: String(p.name), value: Number(p.value), color: String(p.payload.color) }))} fmt={fmt} />
                    )}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ fontSize: '11px', color: 'var(--color-foreground)' }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-sm" style={{ color: 'var(--color-muted)' }}>
                No spending recorded yet
              </div>
            )}
          </div>

          {/* Bar chart */}
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--color-highlight)', background: 'white' }}
          >
            <p className="text-xs font-medium uppercase tracking-wide mb-4" style={{ color: 'var(--color-muted)' }}>
              Budget vs Actual
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-highlight)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => fmt(v)}
                  width={80}
                />
                <Tooltip
                  content={({ active, payload, label }) => (
                    <ChartTooltip
                      active={active}
                      payload={payload?.map(p => ({ name: String(p.name), value: Number(p.value), color: String(p.color) }))}
                      label={String(label ?? '')}
                      fmt={fmt}
                    />
                  )}
                />
                <Legend
                  iconType="square"
                  iconSize={8}
                  formatter={(value) => (
                    <span style={{ fontSize: '11px', color: 'var(--color-foreground)' }}>{value}</span>
                  )}
                />
                <Bar dataKey="Budgeted" fill={accentBg} stroke={accent} strokeWidth={1} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Spent" fill={accent} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl border p-10 text-center"
          style={{ borderColor: 'var(--color-highlight)', background: 'white' }}
        >
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Add{' '}
            <Link href="/admin/finance/categories" className="underline" style={{ color: accent }}>
              budget categories
            </Link>{' '}
            to see spending charts.
          </p>
        </div>
      )}

      {/* Per-guest cost */}
      <div
        className="rounded-xl border p-5 flex items-center justify-between"
        style={{ borderColor: 'var(--color-highlight)', background: 'white' }}
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--color-muted)' }}>
            Per-Guest Cost
          </p>
          <p
            className="text-2xl font-semibold tabular-nums"
            style={{ fontFamily: 'var(--font-cormorant)', color: 'var(--color-foreground)' }}
          >
            {perGuestCost > 0 ? fmt(perGuestCost) : '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Based on {totalGuests} guest{totalGuests !== 1 ? 's' : ''}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
            {fmt(totalSpent)} total spent
          </p>
        </div>
      </div>
    </div>
  )
}
