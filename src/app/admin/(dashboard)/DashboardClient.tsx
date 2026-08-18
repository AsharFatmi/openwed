'use client'

import { format, formatDistanceToNow } from 'date-fns'
import { type Side } from '@prisma/client'
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
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentStatus = 'upcoming' | 'paid' | 'partially_paid' | 'overdue'

type Props = {
  side: Side
  rsvp: {
    totalInvited: number
    guestsConfirmed: number
    guestsDeclined: number
    guestsPending: number
    responseRate: number
  }
  perEvent: { name: string; confirmed: number; declined: number; pending: number }[]
  headcount: { total: number; guests: number; family: number; children: number }
  dietarySummary: { note: string; count: number }[]
  recentActivity: { guestName: string; eventName: string; attending: boolean | null; updatedAt: string }[]
  rooms: { totalRooms: number; assigned: number; unassigned: number; totalCapacity: number }
  budget: { totalBudgeted: number; totalSpent: number; totalRemaining: number }
  upcomingPayments: {
    id: string
    vendorName: string
    amount: number
    amountPaid: number
    dueDate: string | null
    status: PaymentStatus
  }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDE_ACCENT: Record<Side, string> = { bride: '#be185d', groom: '#1d4ed8' }
const SIDE_LABEL: Record<Side, string> = { bride: 'Bride Side', groom: 'Groom Side' }
const SIDE_BG: Record<Side, string> = { bride: '#fdf2f8', groom: '#eff6ff' }

const PAYMENT_STATUS_STYLE: Record<PaymentStatus, { bg: string; color: string; label: string }> = {
  upcoming:      { bg: '#fef3c7', color: '#92400e', label: 'Upcoming' },
  overdue:       { bg: '#fee2e2', color: '#991b1b', label: 'Overdue' },
  partially_paid:{ bg: '#dbeafe', color: '#1e40af', label: 'Partial' },
  paid:          { bg: '#dcfce7', color: '#166534', label: 'Paid' },
}

function fmt(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="border rounded-sm p-6" style={{ borderColor: 'var(--color-highlight)', background: 'white' }}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xs tracking-[0.15em] uppercase font-medium" style={{ color: 'var(--color-muted)' }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  accent,
  sub,
}: {
  label: string
  value: string | number
  color: string
  accent: string
  sub?: string
}) {
  return (
    <div
      className="rounded-sm p-5 border"
      style={{
        borderColor: 'var(--color-highlight)',
        borderLeft: `3px solid ${accent}`,
        background: 'white',
      }}
    >
      <p className="text-3xl font-light" style={{ color }}>
        {value}
      </p>
      <p className="text-xs mt-1 font-medium tracking-wide uppercase" style={{ color: 'var(--color-muted)' }}>
        {label}
      </p>
      {sub && (
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
          {sub}
        </p>
      )}
    </div>
  )
}

// ─── DashboardClient ──────────────────────────────────────────────────────────

export default function DashboardClient({
  side,
  rsvp,
  perEvent,
  headcount,
  dietarySummary,
  recentActivity,
  rooms,
  budget,
  upcomingPayments,
}: Props) {
  const accent = SIDE_ACCENT[side]
  const today = format(new Date(), 'EEEE, MMMM d, yyyy')

  // Pie data for response rate
  const ratePieData = [
    { name: 'Responded', value: rsvp.totalInvited - rsvp.guestsPending },
    { name: 'Pending', value: rsvp.guestsPending },
  ]

  // Family-inclusive totals — family members (Plus-N) aren't primary invitees,
  // so the cards stay guest-only, but we surface the headcount-inclusive number
  // as subtext so the family layer isn't hidden.
  const hasFamily = headcount.family > 0
  const invitedWithFamily = rsvp.totalInvited + headcount.family
  const confirmedWithFamily = rsvp.guestsConfirmed + headcount.family

  // Bar data for budget
  const budgetBarData = budget.totalBudgeted > 0
    ? [{ name: 'Budget', Spent: budget.totalSpent, Remaining: budget.totalRemaining }]
    : []

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-3"
            style={{ background: SIDE_BG[side], color: accent }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
            {SIDE_LABEL[side]}
          </div>
          <h1
            className="text-3xl font-light"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
          >
            Dashboard
          </h1>
        </div>
        <p className="text-xs mt-1 shrink-0" style={{ color: 'var(--color-muted)' }}>
          {today}
        </p>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Invited"
          value={rsvp.totalInvited}
          color="var(--color-foreground)"
          accent={accent}
          sub={hasFamily ? `${invitedWithFamily} incl. family` : undefined}
        />
        <StatCard
          label="Confirmed"
          value={rsvp.guestsConfirmed}
          color="#16a34a"
          accent="#16a34a"
          sub={hasFamily ? `${confirmedWithFamily} incl. family` : undefined}
        />
        <StatCard label="Declined" value={rsvp.guestsDeclined} color="#dc2626" accent="#dc2626" />
        <StatCard label="Pending" value={rsvp.guestsPending} color="#6b7280" accent="#6b7280" />
        {/* Response rate card with mini donut */}
        <div
          className="rounded-sm p-5 border"
          style={{ borderColor: 'var(--color-highlight)', borderLeft: `3px solid ${accent}`, background: 'white' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-light" style={{ color: accent }}>
                {rsvp.responseRate}%
              </p>
              <p className="text-xs mt-1 font-medium tracking-wide uppercase" style={{ color: 'var(--color-muted)' }}>
                Response Rate
              </p>
            </div>
            {rsvp.totalInvited > 0 && (
              <div style={{ width: 52, height: 52 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={ratePieData} dataKey="value" innerRadius={14} outerRadius={24} strokeWidth={0} startAngle={90} endAngle={-270}>
                      <Cell fill={accent} />
                      <Cell fill="#e5e7eb" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Per-event breakdown + Headcount / Dietary ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Per-event table */}
        <Section title="Per-Event Breakdown">
          {perEvent.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No events created yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--color-highlight)' }}>
                  {['Event', 'Yes', 'No', 'TBD'].map((h) => (
                    <th key={h} className={`pb-2 text-xs font-medium tracking-wide ${h === 'Event' ? 'text-left' : 'text-center'}`} style={{ color: 'var(--color-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-highlight)' }}>
                {perEvent.map((ev) => (
                  <tr key={ev.name}>
                    <td className="py-2.5 pr-3 font-medium text-sm" style={{ color: 'var(--color-foreground)' }}>
                      {ev.name}
                    </td>
                    <td className="py-2.5 text-center font-medium" style={{ color: '#16a34a' }}>{ev.confirmed}</td>
                    <td className="py-2.5 text-center font-medium" style={{ color: '#dc2626' }}>{ev.declined}</td>
                    <td className="py-2.5 text-center font-medium" style={{ color: '#6b7280' }}>{ev.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Headcount */}
        <Section title="Headcount">
          <div className="space-y-4">
            <div className="text-center py-2">
              <p className="text-5xl font-light" style={{ color: accent }}>{headcount.total}</p>
              <p className="text-xs mt-1 tracking-wide uppercase" style={{ color: 'var(--color-muted)' }}>Total attending</p>
            </div>
            <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--color-highlight)' }}>
              {[
                { label: 'Direct guests', value: headcount.guests },
                { label: 'Family members', value: headcount.family },
                { label: 'Children', value: headcount.children },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--color-muted)' }}>{row.label}</span>
                  <span className="font-medium" style={{ color: 'var(--color-foreground)' }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Dietary summary */}
        <Section title="Dietary Notes">
          {dietarySummary.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No dietary restrictions noted.</p>
          ) : (
            <ul className="space-y-2">
              {dietarySummary.map(({ note, count }) => (
                <li key={note} className="flex items-start justify-between gap-3 text-sm">
                  <span className="capitalize" style={{ color: 'var(--color-foreground)' }}>{note}</span>
                  <span
                    className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: SIDE_BG[side], color: accent }}
                  >
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* ── Room Assignments ── */}
      <Section
        title="Room Assignments"
        action={
          <a href="/admin/rooms" className="text-xs" style={{ color: accent }}>
            Manage rooms →
          </a>
        }
      >
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Rooms', value: rooms.totalRooms, color: 'var(--color-foreground)' },
            { label: 'People Assigned', value: rooms.assigned, color: '#16a34a' },
            { label: 'Unassigned', value: rooms.unassigned, color: rooms.unassigned > 0 ? '#f59e0b' : '#6b7280' },
          ].map((s) => (
            <div key={s.label} className="text-center py-2">
              <p className="text-3xl font-light" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs mt-1 font-medium tracking-wide uppercase" style={{ color: 'var(--color-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>
        {rooms.totalRooms > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1" style={{ color: 'var(--color-muted)' }}>
              <span>Bed occupancy</span>
              <span>{rooms.totalCapacity > 0 ? Math.round((rooms.assigned / rooms.totalCapacity) * 100) : 0}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: '#e5e7eb' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${rooms.totalCapacity > 0 ? Math.round((rooms.assigned / rooms.totalCapacity) * 100) : 0}%`,
                  background: accent,
                }}
              />
            </div>
          </div>
        )}
        {rooms.totalRooms === 0 && (
          <p className="text-sm mt-2" style={{ color: 'var(--color-muted)' }}>
            No rooms set up yet.{' '}
            <a href="/admin/rooms" style={{ color: accent }}>Set up rooms →</a>
          </p>
        )}
      </Section>

      {/* ── Recent RSVP activity ── */}
      <Section title="Recent RSVP Activity">
        {recentActivity.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No RSVP activity yet.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-highlight)' }}>
            {recentActivity.map((item, i) => (
              <li key={i} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--color-foreground)' }}>
                    {item.guestName}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>
                    {item.eventName}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={
                      item.attending === true
                        ? { background: '#dcfce7', color: '#166534' }
                        : item.attending === false
                        ? { background: '#fee2e2', color: '#991b1b' }
                        : { background: '#f3f4f6', color: '#6b7280' }
                    }
                  >
                    {item.attending === true ? 'Attending' : item.attending === false ? 'Declined' : 'Pending'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                    {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Budget + Upcoming payments ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Budget snapshot */}
        <Section
          title="Budget Snapshot"
          action={
            <a href="/admin/finance" className="text-xs" style={{ color: accent }}>
              View Finance →
            </a>
          }
        >
          {budget.totalBudgeted === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              No budget set up yet.{' '}
              <a href="/admin/finance" style={{ color: accent }}>Set up budget →</a>
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Budget', value: fmt(budget.totalBudgeted), color: 'var(--color-foreground)' },
                  { label: 'Spent', value: fmt(budget.totalSpent), color: '#dc2626' },
                  { label: 'Remaining', value: fmt(budget.totalRemaining), color: budget.totalRemaining >= 0 ? '#16a34a' : '#dc2626' },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-lg font-light" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
              <div style={{ height: 80 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={budgetBarData} barCategoryGap="40%" layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="name" hide />
                    <YAxis hide />
                    <Tooltip
                      formatter={(value) => fmt(Number(value))}
                      contentStyle={{ fontSize: 12, border: '1px solid var(--color-highlight)' }}
                    />
                    <Bar dataKey="Spent" fill={accent} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Remaining" fill="#e5e7eb" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </Section>

        {/* Upcoming payments */}
        <Section
          title="Upcoming Payments"
          action={
            <a href="/admin/finance" className="text-xs" style={{ color: accent }}>
              View all →
            </a>
          }
        >
          {upcomingPayments.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No upcoming payments.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--color-highlight)' }}>
              {upcomingPayments.map((p) => {
                const style = PAYMENT_STATUS_STYLE[p.status]
                const remaining = p.amount - p.amountPaid
                return (
                  <li key={p.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--color-foreground)' }}>
                        {p.vendorName}
                      </p>
                      {p.dueDate && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                          Due {format(new Date(p.dueDate), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                        {fmt(remaining)}
                      </p>
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: style.bg, color: style.color }}
                      >
                        {style.label}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}
