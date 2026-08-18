'use client'

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
  LineChart,
  Line,
} from 'recharts'
import { useCurrency } from '@/lib/currency'

type CategoryDatum = { id: string; name: string; budgeted: number; spent: number; color: string }
type CashFlowDatum = { month: string; spent: number; cumulative: number }
type SerializedExpense = {
  id: string
  description: string
  category: string
  amount: number
  amount_paid: number
  status: string
  date: string
}
type SerializedPayment = {
  id: string
  vendor: string
  amount: number
  amount_paid: number
  status: string
  date: string
}

type Props = {
  side: 'bride' | 'groom'
  categoryData: CategoryDatum[]
  cashFlowData: CashFlowDatum[]
  monthlyBreakdown: Record<string, string | number>[]
  categoryNames: string[]
  categoryColors: string[]
  totalGuests: number
  perGuestCost: number
  expenses: SerializedExpense[]
  payments: SerializedPayment[]
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--color-highlight)', background: 'white' }}
    >
      <p className="text-xs font-medium uppercase tracking-wide mb-4" style={{ color: 'var(--color-muted)' }}>
        {title}
      </p>
      {children}
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

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[260px] flex items-center justify-center text-sm" style={{ color: 'var(--color-muted)' }}>
      {message}
    </div>
  )
}

export default function ReportsClient({
  side,
  categoryData,
  cashFlowData,
  monthlyBreakdown,
  categoryNames,
  categoryColors,
  totalGuests,
  perGuestCost,
  expenses,
  payments,
}: Props) {
  const accent = side === 'bride' ? '#be185d' : '#1d4ed8'
  const { fmt } = useCurrency()

  const pieData = categoryData.filter((c) => c.spent > 0)
  const barData = categoryData.map((c) => ({ name: c.name, Budgeted: c.budgeted, Spent: c.spent }))

  function exportCSV() {
    const rows: (string | number)[][] = [
      ['Type', 'Description/Vendor', 'Category', 'Amount (INR)', 'Amount Paid (INR)', 'Status', 'Date'],
      ...expenses.map((e) => ['Expense', e.description, e.category, e.amount, e.amount_paid, e.status, e.date]),
      ...payments.map((p) => ['Payment', p.vendor, '', p.amount, p.amount_paid, p.status, p.date]),
    ]
    const csv = rows
      .map((r) => r.map(String).map((v) => `"${v.replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finance-report-${side}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Detailed breakdown of all spending for your side.
        </p>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: accent, color: '#fff' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      </div>

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
            {totalGuests} guest{totalGuests !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Top row: donut + horizontal bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut chart */}
        <SectionCard title="Spending by Category">
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="spent"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={100}
                >
                  {pieData.map((d) => (
                    <Cell key={d.id} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => (
                    <ChartTooltip
                      active={active}
                      payload={payload?.map(p => ({ name: String(p.name), value: Number(p.value), color: String(p.payload.color) }))}
                      fmt={fmt}
                    />
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
            <EmptyChart message="No spending recorded yet" />
          )}
        </SectionCard>

        {/* Horizontal bar: budget vs actual */}
        <SectionCard title="Budget vs Actual">
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart layout="vertical" data={barData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-highlight)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => fmt(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
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
                <Bar dataKey="Budgeted" fill="#E8D5C4" stroke={accent} strokeWidth={1} radius={[0, 3, 3, 0]} />
                <Bar dataKey="Spent" fill={accent} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Add categories to see comparison" />
          )}
        </SectionCard>
      </div>

      {/* Cash flow timeline */}
      <SectionCard title="Cash Flow Timeline">
        {cashFlowData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={cashFlowData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-highlight)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                tickLine={false}
                axisLine={false}
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
                iconType="line"
                iconSize={12}
                formatter={(value) => (
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground)' }}>{value}</span>
                )}
              />
              <Line
                type="monotone"
                dataKey="cumulative"
                name="Cumulative Spend"
                stroke={accent}
                strokeWidth={2}
                dot={{ fill: accent, r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="spent"
                name="Monthly Spend"
                stroke="#A3B18A"
                strokeWidth={2}
                dot={{ fill: '#A3B18A', r: 3 }}
                activeDot={{ r: 5 }}
                strokeDasharray="4 3"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="No spending data with dates yet" />
        )}
      </SectionCard>

      {/* Monthly breakdown (stacked bar) */}
      <SectionCard title="Monthly Breakdown by Category">
        {monthlyBreakdown.length > 0 && categoryNames.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyBreakdown} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-highlight)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                tickLine={false}
                axisLine={false}
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
              {categoryNames.map((name, i) => (
                <Bar
                  key={name}
                  dataKey={name}
                  stackId="a"
                  fill={categoryColors[i] ?? '#B8860B'}
                  radius={i === categoryNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="No monthly category data yet" />
        )}
      </SectionCard>
    </div>
  )
}
