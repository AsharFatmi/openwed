'use client'

import { useState, useMemo, Fragment } from 'react'
import { useCurrency } from '@/lib/currency'

type PaymentStatus = 'upcoming' | 'paid' | 'partially_paid' | 'overdue'

type PaymentWithVendor = {
  id: string
  vendor_id: string
  amount: number
  due_date: string | null
  paid_date: string | null
  status: PaymentStatus
  amount_paid: number
  exchange_rate: number | null
  method: string | null
  notes: string | null
  created_at: string
  updated_at: string
  vendor: { id: string; name: string }
}

type PaymentForm = {
  vendor_id: string
  amount: string
  due_date: string
  paid_date: string
  status: PaymentStatus
  amount_paid: string
  method: string
  notes: string
}

const BLANK_FORM: PaymentForm = {
  vendor_id: '', amount: '', due_date: '', paid_date: '', status: 'upcoming',
  amount_paid: '', method: '', notes: '',
}

const PAYMENT_METHODS = ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Check', 'Other']

const SIDE_ACCENT: Record<'bride' | 'groom', string> = { bride: '#be185d', groom: '#1d4ed8' }
const SIDE_BG: Record<'bride' | 'groom', string> = { bride: '#fdf2f8', groom: '#eff6ff' }

const STATUS_BADGE: Record<PaymentStatus, { bg: string; color: string; label: string }> = {
  upcoming:       { bg: '#fef3c7', color: '#92400e', label: 'Upcoming' },
  paid:           { bg: '#dcfce7', color: '#166534', label: 'Paid' },
  partially_paid: { bg: '#dbeafe', color: '#1e40af', label: 'Partially Paid' },
  overdue:        { bg: '#fee2e2', color: '#991b1b', label: 'Overdue' },
}

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function toDateKey(iso: string) {
  return iso.substring(0, 10)
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function PaymentsClient({
  initialPayments,
  vendors,
  side,
}: {
  initialPayments: PaymentWithVendor[]
  vendors: { id: string; name: string }[]
  side: 'bride' | 'groom'
}) {
  const accent = SIDE_ACCENT[side]
  const accentBg = SIDE_BG[side]

  const { fmt, usdToInr, currency, currentRate, setCurrency, rateLoading } = useCurrency()

  // Per-modal currency
  const [formCurrency, setFormCurrency] = useState<'INR' | 'USD'>(currency)
  function formToInr(val: number) { return formCurrency === 'USD' ? Math.round(val * usdToInr) : val }
  function formFromInr(inrVal: number, storedRate?: number | null) {
    if (formCurrency === 'USD') return parseFloat((inrVal / (storedRate ?? usdToInr)).toFixed(2))
    return inrVal
  }
  const formSymbol = formCurrency === 'USD' ? '$' : '₹'
  const formExchangeRate = formCurrency === 'USD' ? currentRate : null
  function switchFormCurrency(c: 'INR' | 'USD') {
    if (c === 'USD' && currentRate === null) setCurrency('USD')
    setFormCurrency(c)
  }

  const inputCls = 'px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 transition-colors'
  const modalInputCls = 'w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 transition-colors'
  const inputStyle = {
    borderColor: 'var(--color-highlight)',
    background: 'var(--color-background)',
    color: 'var(--color-foreground)',
  }

  const [payments, setPayments] = useState<PaymentWithVendor[]>(initialPayments)
  const [view, setView] = useState<'list' | 'calendar'>('list')

  // Filters + sort
  const [search, setSearch] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [sortCol, setSortCol] = useState<'vendor' | 'due_date' | 'amount' | 'status'>('due_date')
  const [sortAsc, setSortAsc] = useState(true)

  // Add/edit modal
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PaymentWithVendor | null>(null)
  const [form, setForm] = useState<PaymentForm>(BLANK_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<PaymentWithVendor | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  // Mark partial
  const [partialTarget, setPartialTarget] = useState<PaymentWithVendor | null>(null)
  const [partialAmount, setPartialAmount] = useState('')
  const [partialSubmitting, setPartialSubmitting] = useState(false)

  // Calendar
  const now = new Date()
  const [calMonth, setCalMonth] = useState(now.getMonth())
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calDay, setCalDay] = useState<string | null>(null)

  const hasFilters = search !== '' || filterVendor !== '' || filterStatus !== '' || filterDateFrom !== '' || filterDateTo !== ''

  function clearFilters() {
    setSearch(''); setFilterVendor(''); setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo('')
  }

  function handleSort(col: typeof sortCol) {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(true) }
  }

  const filtered = useMemo(() => {
    let result = payments.filter(p => {
      if (search && !p.vendor.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterVendor && p.vendor_id !== filterVendor) return false
      if (filterStatus && p.status !== filterStatus) return false
      if (filterDateFrom && p.due_date && p.due_date < filterDateFrom) return false
      if (filterDateTo && p.due_date && p.due_date > filterDateTo + 'T99') return false
      return true
    })
    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'vendor') cmp = a.vendor.name.localeCompare(b.vendor.name)
      else if (sortCol === 'due_date') {
        if (!a.due_date) return 1; if (!b.due_date) return -1
        cmp = a.due_date.localeCompare(b.due_date)
      }
      else if (sortCol === 'amount') cmp = a.amount - b.amount
      else if (sortCol === 'status') cmp = a.status.localeCompare(b.status)
      return sortAsc ? cmp : -cmp
    })
    return result
  }, [payments, search, filterVendor, filterStatus, filterDateFrom, filterDateTo, sortCol, sortAsc])

  const totals = useMemo(() => {
    const total = filtered.reduce((s, p) => s + p.amount, 0)
    const paid = filtered.reduce((s, p) => s + (p.status === 'paid' ? p.amount : p.amount_paid), 0)
    return { total, paid, remaining: total - paid }
  }, [filtered])

  // Upcoming summary (unfiltered)
  const summary = useMemo(() => {
    const today = new Date()
    const in7 = new Date(today); in7.setDate(today.getDate() + 7)
    const todayStr = todayKey()
    const in7Str = toDateKey(in7.toISOString())
    const upcoming = payments.filter(p =>
      p.status !== 'paid' && p.due_date && p.due_date.substring(0, 10) >= todayStr && p.due_date.substring(0, 10) <= in7Str
    )
    const overdue = payments.filter(p => p.status === 'overdue')
    return {
      upcomingCount: upcoming.length,
      upcomingAmount: upcoming.reduce((s, p) => s + p.amount - p.amount_paid, 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((s, p) => s + p.amount - p.amount_paid, 0),
    }
  }, [payments])

  // --- Modal CRUD ---
  function openAdd() {
    setEditing(null)
    setForm(BLANK_FORM)
    setFormCurrency(currency)
    setError('')
    setShowModal(true)
  }

  function openEdit(p: PaymentWithVendor) {
    const fc: 'INR' | 'USD' = p.exchange_rate != null ? 'USD' : 'INR'
    setEditing(p)
    setFormCurrency(fc)
    const toFormVal = (inr: number) => fc === 'USD' ? parseFloat((inr / (p.exchange_rate ?? usdToInr)).toFixed(2)) : inr
    setForm({
      vendor_id: p.vendor_id,
      amount: String(toFormVal(p.amount)),
      due_date: p.due_date ? p.due_date.substring(0, 10) : '',
      paid_date: p.paid_date ? p.paid_date.substring(0, 10) : '',
      status: p.status,
      amount_paid: p.amount_paid > 0 ? String(toFormVal(p.amount_paid)) : '',
      method: p.method ?? '',
      notes: p.notes ?? '',
    })
    setError('')
    setShowModal(true)
  }

  function closeModal() { setShowModal(false); setEditing(null); setError('') }

  async function submitPayment() {
    setError('')
    if (!form.vendor_id) { setError('Vendor is required'); return }
    if (!form.amount || Number(form.amount) <= 0) { setError('Amount must be greater than 0'); return }
    if (form.amount_paid && Number(form.amount_paid) > Number(form.amount)) {
      setError('Amount paid cannot exceed total amount'); return
    }
    setSubmitting(true)
    try {
      const body = {
        vendor_id: form.vendor_id,
        amount: formToInr(Number(form.amount)),
        due_date: form.due_date || null,
        paid_date: form.paid_date || null,
        status: form.status,
        amount_paid: form.amount_paid ? formToInr(Number(form.amount_paid)) : 0,
        method: form.method || null,
        notes: form.notes || null,
        exchange_rate: formExchangeRate,
      }
      const url = editing ? `/api/admin/finance/payments/${editing.id}` : '/api/admin/finance/payments'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Something went wrong')
        return
      }
      const data = await res.json()
      const saved = data.payment as PaymentWithVendor
      if (editing) {
        setPayments(prev => prev.map(p => p.id === editing.id ? saved : p))
      } else {
        setPayments(prev => [...prev, saved])
      }
      closeModal()
    } catch {
      setError('Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function markPaid(p: PaymentWithVendor) {
    try {
      const res = await fetch(`/api/admin/finance/payments/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid', amount_paid: p.amount }),
      })
      if (!res.ok) return
      const data = await res.json()
      setPayments(prev => prev.map(q => q.id === p.id ? data.payment : q))
    } catch { /* silent */ }
  }

  async function submitPartial() {
    if (!partialTarget || !partialAmount) return
    const partialInr = formToInr(Number(partialAmount))
    if (partialInr > partialTarget.amount) return
    setPartialSubmitting(true)
    try {
      const res = await fetch(`/api/admin/finance/payments/${partialTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'partially_paid', amount_paid: partialInr }),
      })
      if (!res.ok) return
      const data = await res.json()
      setPayments(prev => prev.map(p => p.id === partialTarget.id ? data.payment : p))
      setPartialTarget(null)
      setPartialAmount('')
    } catch { /* silent */ } finally {
      setPartialSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteSubmitting(true)
    try {
      const res = await fetch(`/api/admin/finance/payments/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) return
      setPayments(prev => prev.filter(p => p.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch { /* silent */ } finally {
      setDeleteSubmitting(false)
    }
  }

  // --- Sort header helper ---
  function SortHeader({ col, label }: { col: typeof sortCol; label: string }) {
    const active = sortCol === col
    return (
      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide cursor-pointer select-none"
        style={{ color: active ? accent : 'var(--color-muted)' }}
        onClick={() => handleSort(col)}>
        {label} {active ? (sortAsc ? '↑' : '↓') : ''}
      </th>
    )
  }

  // --- Calendar helpers ---
  const paymentsByDay = useMemo(() => {
    const map: Record<string, PaymentWithVendor[]> = {}
    payments.forEach(p => {
      if (!p.due_date) return
      const key = toDateKey(p.due_date)
      if (!map[key]) map[key] = []
      map[key].push(p)
    })
    return map
  }, [payments])

  function calendarDays() {
    const firstDay = new Date(calYear, calMonth, 1).getDay()
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const cells: (number | null)[] = Array(firstDay).fill(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }

  function calDayKey(day: number) {
    return `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
    setCalDay(null)
  }

  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
    setCalDay(null)
  }

  const today = todayKey()

  return (
    <div>
      {/* Upcoming summary */}
      {(summary.upcomingCount > 0 || summary.overdueCount > 0) && (
        <div className="flex flex-wrap gap-4 mb-5 p-4 rounded-xl"
          style={{ background: 'var(--color-highlight)' }}>
          {summary.upcomingCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#d97706' }} />
              <span style={{ color: '#92400e' }}>
                <strong>{summary.upcomingCount}</strong> payment{summary.upcomingCount !== 1 ? 's' : ''} due in 7 days
                · {fmt(summary.upcomingAmount)}
              </span>
            </div>
          )}
          {summary.overdueCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#dc2626' }} />
              <span style={{ color: '#991b1b' }}>
                <strong>{summary.overdueCount}</strong> overdue
                · {fmt(summary.overdueAmount)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* View toggle + Add */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--color-highlight)' }}>
          {(['list', 'calendar'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors"
              style={{
                background: view === v ? 'var(--color-background)' : 'transparent',
                color: view === v ? accent : 'var(--color-muted)',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {v}
            </button>
          ))}
        </div>
        <button onClick={openAdd}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: accent, color: '#fff' }}>
          + Add Payment
        </button>
      </div>

      {view === 'list' ? (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[160px]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--color-muted)' }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input type="text" placeholder="Search vendor…" value={search}
                onChange={e => setSearch(e.target.value)}
                className={`${inputCls} w-full pl-8`} style={inputStyle} />
            </div>
            <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
              className={inputCls} style={inputStyle}>
              <option value="">All Vendors</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className={inputCls} style={inputStyle}>
              <option value="">All Statuses</option>
              <option value="upcoming">Upcoming</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
              className={inputCls} style={inputStyle} title="From date" />
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
              className={inputCls} style={inputStyle} title="To date" />
            {hasFilters && (
              <button onClick={clearFilters} className="px-3 py-2 rounded-lg text-sm font-medium"
                style={{ color: accent, background: accentBg }}>Clear ×</button>
            )}
          </div>

          {/* Table */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-highlight)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--color-highlight)' }}>
                  <SortHeader col="vendor" label="Vendor" />
                  <SortHeader col="due_date" label="Due Date" />
                  <SortHeader col="amount" label="Amount" />
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide"
                    style={{ color: 'var(--color-muted)' }}>Paid</th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide"
                    style={{ color: 'var(--color-muted)' }}>Remaining</th>
                  <SortHeader col="status" label="Status" />
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide"
                    style={{ color: 'var(--color-muted)' }}>Paid Date</th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide"
                    style={{ color: 'var(--color-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--color-muted)' }}>
                      {hasFilters ? 'No payments match your filters.' : 'No payments yet. Add vendors and schedule payments.'}
                    </td>
                  </tr>
                ) : filtered.map((p, i) => {
                  const badge = STATUS_BADGE[p.status]
                  const remaining = p.status === 'paid' ? 0 : p.amount - p.amount_paid
                  const isPaidPayment = p.status === 'paid'
                  const isPartialRow = partialTarget?.id === p.id
                  return (
                    <Fragment key={p.id}>
                      <tr style={{
                        background: i % 2 === 0 ? 'var(--color-background)' : 'var(--color-highlight)20',
                        borderTop: '1px solid var(--color-highlight)',
                      }}>
                        <td className="px-4 py-3 font-medium">{p.vendor.name}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--color-muted)' }}>{formatDate(p.due_date)}</td>
                        <td className="px-4 py-3">{fmt(p.amount, p.exchange_rate)}</td>
                        <td className="px-4 py-3">{fmt(p.amount_paid, p.exchange_rate)}</td>
                        <td className="px-4 py-3">{remaining > 0 ? fmt(remaining, p.exchange_rate) : '—'}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded-full text-xs font-medium"
                            style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--color-muted)' }}>{formatDate(p.paid_date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {!isPaidPayment && (
                              <>
                                <button onClick={() => markPaid(p)}
                                  className="text-xs font-medium px-2 py-1 rounded-md"
                                  style={{ background: '#dcfce7', color: '#166534' }}>
                                  Mark Paid
                                </button>
                                <button onClick={() => { setPartialTarget(p); setPartialAmount('') }}
                                  className="text-xs font-medium px-2 py-1 rounded-md"
                                  style={{ background: '#dbeafe', color: '#1e40af' }}>
                                  Partial
                                </button>
                              </>
                            )}
                            <button onClick={() => openEdit(p)}
                              className="text-xs font-medium hover:underline"
                              style={{ color: 'var(--color-muted)' }}>Edit</button>
                            <button onClick={() => setDeleteTarget(p)}
                              className="text-xs font-medium hover:underline"
                              style={{ color: '#dc2626' }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                      {isPartialRow && (
                        <tr key={`${p.id}-partial`} style={{ background: '#eff6ff', borderTop: '1px solid var(--color-highlight)' }}>
                          <td colSpan={8} className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium" style={{ color: '#1e40af' }}>Amount paid so far:</span>
                              <input
                                type="number" min="0" max={p.amount} step="1"
                                value={partialAmount}
                                onChange={e => setPartialAmount(e.target.value)}
                                className="px-3 py-1.5 text-sm rounded-lg border w-36"
                                style={inputStyle}
                                placeholder={`${formSymbol}0`}
                              />
                              {partialAmount && (
                                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                                  Remaining: {formSymbol}{Math.max(0, formFromInr(p.amount, p.exchange_rate) - Number(partialAmount)).toFixed(2)}
                                </span>
                              )}
                              <button onClick={submitPartial} disabled={partialSubmitting || !partialAmount}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
                                style={{ background: '#1e40af', color: '#fff' }}>
                                {partialSubmitting ? 'Saving…' : 'Save'}
                              </button>
                              <button onClick={() => { setPartialTarget(null); setPartialAmount('') }}
                                className="px-3 py-1.5 rounded-lg text-sm"
                                style={{ color: 'var(--color-muted)' }}>Cancel</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer totals */}
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm" style={{ color: 'var(--color-muted)' }}>
            <span>Showing {filtered.length} payment{filtered.length !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span>Total: <strong style={{ color: 'var(--color-foreground)' }}>{fmt(totals.total)}</strong></span>
            <span>·</span>
            <span>Paid: <strong style={{ color: '#166534' }}>{fmt(totals.paid)}</strong></span>
            <span>·</span>
            <span>Remaining: <strong style={{ color: totals.remaining > 0 ? '#dc2626' : '#166534' }}>{fmt(totals.remaining)}</strong></span>
          </div>
        </>
      ) : (
        /* Calendar view */
        <div>
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="px-3 py-1.5 rounded-lg text-sm"
              style={{ color: 'var(--color-muted)', background: 'var(--color-highlight)' }}>‹</button>
            <h3 className="font-semibold text-base" style={{ fontFamily: 'var(--font-cormorant)' }}>
              {MONTH_NAMES[calMonth]} {calYear}
            </h3>
            <button onClick={nextMonth} className="px-3 py-1.5 rounded-lg text-sm"
              style={{ color: 'var(--color-muted)', background: 'var(--color-highlight)' }}>›</button>
          </div>

          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-highlight)' }}>
            <div className="grid grid-cols-7">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-xs font-medium py-2 uppercase tracking-wide"
                  style={{ background: 'var(--color-highlight)', color: 'var(--color-muted)' }}>{d}</div>
              ))}
              {calendarDays().map((day, i) => {
                if (!day) return (
                  <div key={`empty-${i}`} className="min-h-[72px] p-2"
                    style={{ borderTop: '1px solid var(--color-highlight)', background: 'var(--color-highlight)20' }} />
                )
                const key = calDayKey(day)
                const dayPayments = paymentsByDay[key] ?? []
                const isToday = key === today
                const hasOverdue = dayPayments.some(p => p.status === 'overdue' || (p.status !== 'paid' && key < today))
                const isSelected = calDay === key
                return (
                  <div
                    key={key}
                    onClick={() => setCalDay(isSelected ? null : key)}
                    className="min-h-[72px] p-2 cursor-pointer relative"
                    style={{
                      borderTop: '1px solid var(--color-highlight)',
                      borderLeft: i % 7 !== 0 ? '1px solid var(--color-highlight)' : 'none',
                      background: isSelected ? accentBg : hasOverdue && dayPayments.length > 0 ? '#fee2e220' : 'var(--color-background)',
                      outline: isToday ? `2px solid ${accent}` : 'none',
                      outlineOffset: '-2px',
                    }}
                  >
                    <span className="text-xs font-medium" style={{ color: isToday ? accent : 'var(--color-foreground)' }}>
                      {day}
                    </span>
                    {dayPayments.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {dayPayments.slice(0, 3).map(p => (
                          <div key={p.id} className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: STATUS_BADGE[p.status].color }} />
                            <span className="text-xs truncate" style={{ color: 'var(--color-muted)', maxWidth: '80px' }}>
                              {p.vendor.name}
                            </span>
                          </div>
                        ))}
                        {dayPayments.length > 3 && (
                          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>+{dayPayments.length - 3} more</span>
                        )}
                      </div>
                    )}
                    {/* Popover */}
                    {isSelected && dayPayments.length > 0 && (
                      <div
                        className="absolute left-0 top-full mt-1 z-20 rounded-xl shadow-lg p-3 w-64"
                        style={{ background: 'var(--color-background)', border: '1px solid var(--color-highlight)' }}
                        onClick={e => e.stopPropagation()}
                      >
                        {dayPayments.map(p => {
                          const b = STATUS_BADGE[p.status]
                          return (
                            <div key={p.id} className="flex items-center justify-between py-1.5 border-b last:border-0"
                              style={{ borderColor: 'var(--color-highlight)' }}>
                              <div>
                                <p className="text-xs font-medium">{p.vendor.name}</p>
                                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{fmt(p.amount, p.exchange_rate)}</p>
                              </div>
                              <span className="px-1.5 py-0.5 rounded-full text-xs font-medium"
                                style={{ background: b.bg, color: b.color }}>{b.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(45,45,45,0.4)' }}>
          <div className="w-full max-w-md mx-4 rounded-2xl shadow-xl overflow-y-auto max-h-[90vh]"
            style={{ background: 'var(--color-background)' }}>
            <div className="flex items-center justify-between px-6 py-5 border-b"
              style={{ borderColor: 'var(--color-highlight)' }}>
              <h2 className="font-semibold" style={{ fontFamily: 'var(--font-cormorant)', fontSize: '1.25rem' }}>
                {editing ? 'Edit Payment' : 'Add Payment'}
              </h2>
              <button onClick={closeModal} className="text-xl leading-none w-8 h-8 flex items-center justify-center"
                style={{ color: 'var(--color-muted)' }}>×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Vendor *</label>
                <select value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}
                  className={modalInputCls} style={inputStyle} disabled={!!editing}>
                  <option value="">— Select Vendor —</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>Amount *</label>
                    <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ background: 'rgba(0,0,0,0.06)' }}>
                      {(['INR', 'USD'] as const).map(c => (
                        <button key={c} type="button" onClick={() => switchFormCurrency(c)}
                          disabled={c === 'USD' && rateLoading}
                          className="px-2 py-0.5 rounded-full text-xs font-medium transition-colors"
                          style={formCurrency === c ? { background: accent, color: '#fff' } : { color: 'var(--color-muted)' }}>
                          {c === 'USD' && rateLoading ? '…' : c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input type="number" min="0" step="0.01" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className={modalInputCls} style={inputStyle} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Due Date</label>
                  <input type="date" value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className={modalInputCls} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Status</label>
                  <select value={form.status}
                    onChange={e => {
                      const s = e.target.value as PaymentStatus
                      setForm(f => ({
                        ...f,
                        status: s,
                        amount_paid: s !== 'partially_paid' ? '' : f.amount_paid,
                        paid_date: s === 'upcoming' || s === 'overdue' ? '' : f.paid_date,
                      }))
                    }}
                    className={modalInputCls} style={inputStyle}>
                    <option value="upcoming">Upcoming</option>
                    <option value="partially_paid">Partially Paid</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Method</label>
                  <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                    className={modalInputCls} style={inputStyle}>
                    <option value="">— Select —</option>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              {form.status === 'partially_paid' && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Amount Paid ({formSymbol})</label>
                  <input type="number" min="0" step="0.01" value={form.amount_paid}
                    onChange={e => setForm(f => ({ ...f, amount_paid: e.target.value }))}
                    className={modalInputCls} style={inputStyle} placeholder="0" />
                  {form.amount && form.amount_paid && (
                    <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                      Remaining: {formSymbol}{Math.max(0, Number(form.amount) - Number(form.amount_paid)).toFixed(2)}
                    </p>
                  )}
                </div>
              )}
              {(form.status === 'paid' || form.status === 'partially_paid') && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Paid Date</label>
                  <input type="date" value={form.paid_date}
                    onChange={e => setForm(f => ({ ...f, paid_date: e.target.value }))}
                    className={modalInputCls} style={inputStyle} />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className={modalInputCls} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Any notes…" />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t"
              style={{ borderColor: 'var(--color-highlight)' }}>
              <button onClick={closeModal} className="px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--color-muted)' }}>Cancel</button>
              <button onClick={submitPayment} disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: accent, color: '#fff' }}>
                {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(45,45,45,0.4)' }}>
          <div className="w-full max-w-sm mx-4 rounded-2xl shadow-xl p-6"
            style={{ background: 'var(--color-background)' }}>
            <h2 className="font-semibold mb-2" style={{ fontFamily: 'var(--font-cormorant)', fontSize: '1.25rem' }}>
              Delete Payment
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
              Delete the {fmt(deleteTarget.amount, deleteTarget.exchange_rate)} payment for <strong>{deleteTarget.vendor.name}</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--color-muted)' }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleteSubmitting}
                className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: '#dc2626', color: '#fff' }}>
                {deleteSubmitting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
