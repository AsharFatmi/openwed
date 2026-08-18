'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { type Side, type ExpenseStatus } from '@prisma/client'
import { useCurrency } from '@/lib/currency'

type ExpenseRow = {
  id: string
  category_id: string | null
  vendor_id: string | null
  description: string
  amount: number
  date: string | null
  payment_method: string | null
  status: ExpenseStatus
  amount_paid: number
  exchange_rate: number | null
  side: Side
  notes: string | null
  receipt_url: string | null
  created_at: string
  updated_at: string
  category: { id: string; name: string } | null
  vendor: { id: string; name: string } | null
}

type DropdownItem = { id: string; name: string }

type ExpenseFormState = {
  description: string
  amount: string
  category_id: string
  vendor_id: string
  date: string
  payment_method: string
  status: ExpenseStatus
  amount_paid: string
  notes: string
}

type NewVendorFormState = {
  name: string
  category: string
  contact_name: string
}

const BLANK_FORM: ExpenseFormState = {
  description: '',
  amount: '',
  category_id: '',
  vendor_id: '',
  date: '',
  payment_method: '',
  status: 'pending',
  amount_paid: '',
  notes: '',
}

const BLANK_NEW_VENDOR: NewVendorFormState = { name: '', category: '', contact_name: '' }

function expenseStatusToPaymentStatus(s: ExpenseStatus): 'upcoming' | 'paid' | 'partially_paid' | 'overdue' {
  if (s === 'paid') return 'paid'
  if (s === 'partially_paid') return 'partially_paid'
  if (s === 'overdue') return 'overdue'
  return 'upcoming'
}

const STATUS_STYLES: Record<ExpenseStatus, { bg: string; color: string; label: string }> = {
  paid:           { bg: '#dcfce7', color: '#166534', label: 'Paid' },
  pending:        { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
  partially_paid: { bg: '#dbeafe', color: '#1e40af', label: 'Partially Paid' },
  overdue:        { bg: '#fee2e2', color: '#991b1b', label: 'Overdue' },
}

const PAYMENT_METHODS = ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Check', 'Other']

type SortCol = 'date' | 'description' | 'amount' | 'status'

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className="inline ml-1 opacity-60"
    >
      {active ? (
        asc ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />
      ) : (
        <>
          <polyline points="18 11 12 5 6 11" />
          <polyline points="6 13 12 19 18 13" />
        </>
      )}
    </svg>
  )
}

function makeExpenseToForm(fromInr: (n: number, r?: number | null) => number) {
  return function expenseToForm(e: ExpenseRow): ExpenseFormState {
    return {
      description: e.description,
      amount: String(fromInr(e.amount, e.exchange_rate)),
      category_id: e.category_id ?? '',
      vendor_id: e.vendor_id ?? '',
      date: e.date ? e.date.slice(0, 10) : '',
      payment_method: e.payment_method ?? '',
      status: e.status,
      amount_paid: e.status === 'partially_paid' ? String(fromInr(e.amount_paid, e.exchange_rate)) : '',
      notes: e.notes ?? '',
    }
  }
}

export default function ExpensesClient({
  initialExpenses,
  categories,
  vendors,
  side,
}: {
  initialExpenses: ExpenseRow[]
  categories: DropdownItem[]
  vendors: DropdownItem[]
  side: Side
}) {
  const accent = side === 'bride' ? '#be185d' : '#1d4ed8'
  const accentBg = side === 'bride' ? '#fdf2f8' : '#eff6ff'

  const { fmt, usdToInr, fromInr, currency, currentRate, setCurrency, rateLoading } = useCurrency()
  const expenseToForm = makeExpenseToForm(fromInr)

  // Per-modal currency override
  const [formCurrency, setFormCurrency] = useState<'INR' | 'USD'>(currency)

  function formToInr(val: number) {
    return formCurrency === 'USD' ? Math.round(val * usdToInr) : val
  }
  const formSymbol = formCurrency === 'USD' ? '$' : '₹'
  const formExchangeRate = formCurrency === 'USD' ? currentRate : null

  function switchFormCurrency(c: 'INR' | 'USD') {
    if (c === 'USD' && currentRate === null) setCurrency('USD')
    setFormCurrency(c)
  }

  const [expenses, setExpenses] = useState<ExpenseRow[]>(initialExpenses)
  const [vendorList, setVendorList] = useState<DropdownItem[]>(vendors)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ExpenseRow | null>(null)
  const [form, setForm] = useState<ExpenseFormState>(BLANK_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Inline new-vendor mini-form (inside expense modal)
  const [showNewVendor, setShowNewVendor] = useState(false)
  const [newVendorForm, setNewVendorForm] = useState<NewVendorFormState>(BLANK_NEW_VENDOR)
  const [newVendorSubmitting, setNewVendorSubmitting] = useState(false)
  const [newVendorError, setNewVendorError] = useState('')

  // Auto-payment creation
  const [createPayment, setCreatePayment] = useState(false)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Filters
  const [filterCategory, setFilterCategory] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [search, setSearch] = useState('')

  // Sort
  const [sortCol, setSortCol] = useState<SortCol>('date')
  const [sortAsc, setSortAsc] = useState(false)

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortAsc((a) => !a)
    } else {
      setSortCol(col)
      setSortAsc(col === 'description')
    }
  }

  // ── Modal helpers ──────────────────────────────────────────────
  function openAdd() {
    setEditing(null)
    setForm(BLANK_FORM)
    setFormCurrency(currency)
    setError('')
    setShowNewVendor(false)
    setNewVendorForm(BLANK_NEW_VENDOR)
    setNewVendorError('')
    setCreatePayment(false)
    setShowModal(true)
  }

  function openEdit(e: ExpenseRow) {
    const fc: 'INR' | 'USD' = e.exchange_rate != null ? 'USD' : 'INR'
    setEditing(e)
    setFormCurrency(fc)
    const toFormVal = (inr: number) => fc === 'USD' ? parseFloat((inr / (e.exchange_rate ?? usdToInr)).toFixed(2)) : inr
    setForm({
      description: e.description,
      amount: String(toFormVal(e.amount)),
      category_id: e.category_id ?? '',
      vendor_id: e.vendor_id ?? '',
      date: e.date ? e.date.slice(0, 10) : '',
      payment_method: e.payment_method ?? '',
      status: e.status,
      amount_paid: e.status === 'partially_paid' ? String(toFormVal(e.amount_paid)) : '',
      notes: e.notes ?? '',
    })
    setError('')
    setShowNewVendor(false)
    setNewVendorForm(BLANK_NEW_VENDOR)
    setNewVendorError('')
    setCreatePayment(false)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setError('')
    setShowNewVendor(false)
    setNewVendorForm(BLANK_NEW_VENDOR)
    setNewVendorError('')
    setCreatePayment(false)
  }

  async function createNewVendorInline() {
    setNewVendorError('')
    if (!newVendorForm.name.trim()) { setNewVendorError('Name is required'); return }
    setNewVendorSubmitting(true)
    try {
      const res = await fetch('/api/admin/finance/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newVendorForm.name.trim(),
          category: newVendorForm.category.trim() || null,
          contact_name: newVendorForm.contact_name.trim() || null,
        }),
      })
      if (!res.ok) { const d = await res.json(); setNewVendorError(d.error ?? 'Failed'); return }
      const { vendor } = await res.json()
      const item: DropdownItem = { id: vendor.id, name: vendor.name }
      setVendorList(prev => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)))
      setFormField('vendor_id', vendor.id)
      setShowNewVendor(false)
      setNewVendorForm(BLANK_NEW_VENDOR)
    } catch {
      setNewVendorError('Something went wrong')
    } finally {
      setNewVendorSubmitting(false)
    }
  }

  function setFormField<K extends keyof ExpenseFormState>(key: K, value: ExpenseFormState[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      // Reset amount_paid when leaving partially_paid
      if (key === 'status' && value !== 'partially_paid') {
        next.amount_paid = ''
      }
      return next
    })
  }

  async function submitExpense() {
    setError('')
    if (!form.description.trim()) { setError('Description is required'); return }
    if (!form.amount || Number(form.amount) <= 0) { setError('Amount must be greater than 0'); return }
    const parsedAmount = formToInr(Number(form.amount))
    const parsedAmountPaid = form.amount_paid ? formToInr(Number(form.amount_paid)) : 0
    if (form.status === 'partially_paid' && parsedAmountPaid > parsedAmount) {
      setError('Amount paid cannot exceed total amount')
      return
    }

    setSubmitting(true)
    try {
      const body = {
        description: form.description,
        amount: parsedAmount,
        amount_paid: parsedAmountPaid,
        category_id: form.category_id || null,
        vendor_id: form.vendor_id || null,
        date: form.date || null,
        payment_method: form.payment_method || null,
        status: form.status,
        notes: form.notes || null,
        exchange_rate: formExchangeRate,
      }

      if (editing) {
        const res = await fetch(`/api/admin/finance/expenses/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
        const { expense } = await res.json()
        setExpenses((prev) => prev.map((e) => (e.id === expense.id ? expense : e)))
      } else {
        const res = await fetch('/api/admin/finance/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
        const { expense } = await res.json()
        setExpenses((prev) => [expense, ...prev])

        // Auto-create payment if requested and vendor is set
        if (createPayment && body.vendor_id) {
          const paymentStatus = expenseStatusToPaymentStatus(form.status)
          const isPaid = paymentStatus === 'paid' || paymentStatus === 'partially_paid'
          await fetch('/api/admin/finance/payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vendor_id: body.vendor_id,
              amount: parsedAmount,
              due_date: isPaid ? null : (form.date || null),
              paid_date: isPaid ? (form.date || null) : null,
              status: paymentStatus,
              amount_paid: paymentStatus === 'paid' ? parsedAmount : parsedAmountPaid,
              method: form.payment_method || null,
              notes: form.notes || null,
              exchange_rate: formExchangeRate,
            }),
          })
        }
      }
      closeModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteError('')
    setDeleteSubmitting(true)
    try {
      const res = await fetch(`/api/admin/finance/expenses/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
      setExpenses((prev) => prev.filter((e) => e.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDeleteSubmitting(false)
    }
  }

  // ── Filtered + sorted rows ────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = expenses
    if (filterCategory) rows = rows.filter((e) => e.category_id === filterCategory)
    if (filterVendor) rows = rows.filter((e) => e.vendor_id === filterVendor)
    if (filterStatus) rows = rows.filter((e) => e.status === filterStatus)
    if (filterDateFrom) rows = rows.filter((e) => e.date && e.date >= filterDateFrom)
    if (filterDateTo) rows = rows.filter((e) => e.date && e.date <= filterDateTo + 'T23:59:59')
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter((e) => e.description.toLowerCase().includes(q))
    }

    return [...rows].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'date') {
        cmp = (a.date ?? '').localeCompare(b.date ?? '')
      } else if (sortCol === 'description') {
        cmp = a.description.localeCompare(b.description)
      } else if (sortCol === 'amount') {
        cmp = a.amount - b.amount
      } else if (sortCol === 'status') {
        cmp = a.status.localeCompare(b.status)
      }
      return sortAsc ? cmp : -cmp
    })
  }, [expenses, filterCategory, filterVendor, filterStatus, filterDateFrom, filterDateTo, search, sortCol, sortAsc])

  // ── Running totals ────────────────────────────────────────────
  const totals = useMemo(() => {
    const totalAmount = filtered.reduce((s, e) => s + e.amount, 0)
    const totalPaid = filtered.reduce(
      (s, e) => s + (e.status === 'paid' ? e.amount : e.amount_paid),
      0
    )
    return { totalAmount, totalPaid, totalRemaining: totalAmount - totalPaid }
  }, [filtered])

  const hasFilters = !!(filterCategory || filterVendor || filterStatus || filterDateFrom || filterDateTo || search)

  function clearFilters() {
    setFilterCategory('')
    setFilterVendor('')
    setFilterStatus('')
    setFilterDateFrom('')
    setFilterDateTo('')
    setSearch('')
  }

  const inputCls = 'px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 transition-colors'
  const inputStyle = {
    borderColor: 'var(--color-highlight)',
    background: 'var(--color-background)',
    color: 'var(--color-foreground)',
  }
  const modalInputCls = 'w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 transition-colors'

  // Remaining calculation for form
  const formRemaining =
    form.status === 'partially_paid' && form.amount && form.amount_paid
      ? Math.max(0, Number(form.amount) - Number(form.amount_paid))
      : null

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Track all expenses and payment status for your side.
        </p>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: accent, color: '#fff' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Expense
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-muted)' }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search descriptions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} w-full pl-8`}
            style={inputStyle}
          />
        </div>

        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={inputCls} style={inputStyle}>
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)} className={inputCls} style={inputStyle}>
          <option value="">All Vendors</option>
          {vendorList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>

        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputCls} style={inputStyle}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className={inputCls} style={inputStyle} title="From date" />
        <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className={inputCls} style={inputStyle} title="To date" />

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{ color: accent, background: accentBg }}
          >
            Clear ×
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-highlight)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: accentBg }}>
                <th
                  className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
                  style={{ color: 'var(--color-muted)' }}
                  onClick={() => handleSort('date')}
                >
                  Date <SortIcon active={sortCol === 'date'} asc={sortAsc} />
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                  style={{ color: 'var(--color-muted)' }}
                  onClick={() => handleSort('description')}
                >
                  Description <SortIcon active={sortCol === 'description'} asc={sortAsc} />
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--color-muted)' }}>Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Vendor</th>
                <th
                  className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                  style={{ color: 'var(--color-muted)' }}
                  onClick={() => handleSort('amount')}
                >
                  Amount <SortIcon active={sortCol === 'amount'} asc={sortAsc} />
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Paid</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Remaining</th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                  style={{ color: 'var(--color-muted)' }}
                  onClick={() => handleSort('status')}
                >
                  Status <SortIcon active={sortCol === 'status'} asc={sortAsc} />
                </th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-sm" style={{ color: 'var(--color-muted)' }}>
                    {hasFilters ? 'No expenses match your filters.' : 'No expenses yet. Add your first expense.'}
                  </td>
                </tr>
              ) : (
                filtered.map((e, i) => {
                  const paid = e.status === 'paid' ? e.amount : e.amount_paid
                  const remaining = e.amount - paid
                  const s = STATUS_STYLES[e.status]

                  return (
                    <tr
                      key={e.id}
                      style={{ borderTop: i > 0 ? '1px solid var(--color-highlight)' : undefined }}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: 'var(--color-muted)' }}>
                        {e.date ? format(new Date(e.date), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3 font-medium max-w-[200px]" style={{ color: 'var(--color-foreground)' }}>
                        <span className="block truncate">{e.description}</span>
                        {e.notes && (
                          <span className="block text-xs font-normal truncate mt-0.5" style={{ color: 'var(--color-muted)' }}>
                            {e.notes}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-muted)' }}>
                        {e.category?.name ?? <span className="italic opacity-50">None</span>}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-muted)' }}>
                        {e.vendor?.name ?? <span className="italic opacity-50">None</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: 'var(--color-foreground)' }}>
                        {fmt(e.amount, e.exchange_rate)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs" style={{ color: '#16a34a' }}>
                        {fmt(paid, e.exchange_rate)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs" style={{ color: remaining > 0 ? '#dc2626' : 'var(--color-muted)' }}>
                        {fmt(remaining, e.exchange_rate)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap" style={{ background: s.bg, color: s.color }}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => openEdit(e)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                            style={{ background: accentBg, color: accent }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(e); setDeleteError('') }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50"
                            style={{ color: '#dc2626' }}
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Totals footer */}
        <div
          className="flex flex-wrap items-center gap-4 px-4 py-3 border-t text-sm"
          style={{ borderColor: 'var(--color-highlight)', background: accentBg }}
        >
          <span style={{ color: 'var(--color-muted)' }}>
            Showing <strong style={{ color: 'var(--color-foreground)' }}>{filtered.length}</strong> expense{filtered.length !== 1 ? 's' : ''}
          </span>
          <span style={{ color: 'var(--color-muted)' }}>
            Total: <strong style={{ color: 'var(--color-foreground)' }}>{fmt(totals.totalAmount)}</strong>
          </span>
          <span style={{ color: 'var(--color-muted)' }}>
            Paid: <strong style={{ color: '#16a34a' }}>{fmt(totals.totalPaid)}</strong>
          </span>
          <span style={{ color: 'var(--color-muted)' }}>
            Remaining: <strong style={{ color: totals.totalRemaining > 0 ? '#dc2626' : 'var(--color-muted)' }}>{fmt(totals.totalRemaining)}</strong>
          </span>
        </div>
      </div>

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(45,45,45,0.4)' }}>
          <div
            className="w-full max-w-lg rounded-2xl shadow-xl overflow-y-auto"
            style={{ background: 'var(--color-background)', maxHeight: '90vh' }}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--color-highlight)' }}>
              <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-cormorant)', color: 'var(--color-foreground)' }}>
                {editing ? 'Edit Expense' : 'Add Expense'}
              </h2>
              <button onClick={closeModal} style={{ color: 'var(--color-muted)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Description */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Description *</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setFormField('description', e.target.value)}
                  placeholder="e.g. Venue deposit"
                  className={modalInputCls}
                  style={inputStyle}
                />
              </div>

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>Amount *</label>
                    <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ background: 'rgba(0,0,0,0.06)' }}>
                      {(['INR', 'USD'] as const).map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => switchFormCurrency(c)}
                          disabled={c === 'USD' && rateLoading}
                          className="px-2 py-0.5 rounded-full text-xs font-medium transition-colors"
                          style={formCurrency === c ? { background: accent, color: '#fff' } : { color: 'var(--color-muted)' }}
                        >
                          {c === 'USD' && rateLoading ? '…' : c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setFormField('amount', e.target.value)}
                    placeholder="0.00"
                    className={modalInputCls}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setFormField('date', e.target.value)}
                    className={modalInputCls}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Category + Vendor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Category</label>
                  <select
                    value={form.category_id}
                    onChange={(e) => setFormField('category_id', e.target.value)}
                    className={modalInputCls}
                    style={inputStyle}
                  >
                    <option value="">None</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>Vendor</label>
                    {!showNewVendor && (
                      <button
                        type="button"
                        onClick={() => { setShowNewVendor(true); setNewVendorError('') }}
                        className="text-xs font-medium hover:underline"
                        style={{ color: accent }}
                      >
                        + New
                      </button>
                    )}
                  </div>
                  <select
                    value={form.vendor_id}
                    onChange={(e) => setFormField('vendor_id', e.target.value)}
                    className={modalInputCls}
                    style={inputStyle}
                  >
                    <option value="">None</option>
                    {vendorList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Inline new-vendor mini-form */}
              {showNewVendor && (
                <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--color-highlight)' }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>New Vendor</p>
                    <button
                      type="button"
                      onClick={() => { setShowNewVendor(false); setNewVendorForm(BLANK_NEW_VENDOR); setNewVendorError('') }}
                      className="text-xs"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      Cancel
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Name *</label>
                    <input
                      type="text"
                      value={newVendorForm.name}
                      onChange={e => setNewVendorForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Vendor name"
                      className={modalInputCls}
                      style={inputStyle}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Category</label>
                      <select
                        value={newVendorForm.category}
                        onChange={e => setNewVendorForm(f => ({ ...f, category: e.target.value }))}
                        className={modalInputCls}
                        style={inputStyle}
                      >
                        <option value="">— None —</option>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Contact</label>
                      <input
                        type="text"
                        value={newVendorForm.contact_name}
                        onChange={e => setNewVendorForm(f => ({ ...f, contact_name: e.target.value }))}
                        placeholder="Contact name"
                        className={modalInputCls}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  {newVendorError && <p className="text-xs text-red-600">{newVendorError}</p>}
                  <button
                    type="button"
                    onClick={createNewVendorInline}
                    disabled={newVendorSubmitting}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                    style={{ background: accent, color: '#fff' }}
                  >
                    {newVendorSubmitting ? 'Creating…' : 'Create & Select'}
                  </button>
                </div>
              )}

              {/* Auto-payment toggle — only on add, only when vendor selected */}
              {!editing && form.vendor_id && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createPayment}
                    onChange={e => setCreatePayment(e.target.checked)}
                    className="rounded"
                    style={{ accentColor: accent }}
                  />
                  <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>
                    Also create a payment for this vendor
                  </span>
                  {createPayment && (
                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                      (amount · due date · status will be copied from this expense)
                    </span>
                  )}
                </label>
              )}

              {/* Payment Method + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Payment Method</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setFormField('payment_method', e.target.value)}
                    className={modalInputCls}
                    style={inputStyle}
                  >
                    <option value="">Select…</option>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setFormField('status', e.target.value as ExpenseStatus)}
                    className={modalInputCls}
                    style={inputStyle}
                  >
                    {Object.entries(STATUS_STYLES).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Partially Paid field */}
              {form.status === 'partially_paid' && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Amount Paid ({formSymbol})</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount_paid}
                    onChange={(e) => setFormField('amount_paid', e.target.value)}
                    placeholder="0.00"
                    className={modalInputCls}
                    style={inputStyle}
                  />
                  {formRemaining !== null && (
                    <p className="mt-1 text-xs font-medium" style={{ color: '#dc2626' }}>
                      Remaining: {formSymbol}{formRemaining.toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setFormField('notes', e.target.value)}
                  rows={2}
                  className={modalInputCls}
                  style={inputStyle}
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--color-highlight)' }}>
              <button onClick={closeModal} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--color-muted)' }}>
                Cancel
              </button>
              <button
                onClick={submitExpense}
                disabled={submitting}
                className="px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                style={{ background: accent, color: '#fff' }}
              >
                {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Expense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(45,45,45,0.4)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-xl p-6" style={{ background: 'var(--color-background)' }}>
            <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: 'var(--font-cormorant)', color: 'var(--color-foreground)' }}>
              Delete this expense?
            </h3>
            <p className="text-sm mb-1 font-medium" style={{ color: 'var(--color-foreground)' }}>
              &ldquo;{deleteTarget.description}&rdquo; — {fmt(deleteTarget.amount, deleteTarget.exchange_rate)}
            </p>
            <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
              This cannot be undone.
            </p>
            {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError('') }}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--color-muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteSubmitting}
                className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                style={{ background: '#dc2626', color: '#fff' }}
              >
                {deleteSubmitting ? 'Deleting…' : 'Delete Expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
