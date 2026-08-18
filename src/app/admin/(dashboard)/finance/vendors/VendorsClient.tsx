'use client'

import { useState, useMemo } from 'react'
import { useCurrency } from '@/lib/currency'

type PaymentStatus = 'upcoming' | 'paid' | 'partially_paid' | 'overdue'

type PaymentRow = {
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
}

type VendorRow = {
  id: string
  name: string
  category: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  website: string | null
  contract_amount: number | null
  side: string
  notes: string | null
  created_at: string
  updated_at: string
  payments: PaymentRow[]
}

type VendorStatus = 'all_paid' | 'partially_paid' | 'payment_due' | 'overdue' | 'no_payments'

type VendorForm = {
  name: string
  category: string
  contact_name: string
  phone: string
  email: string
  website: string
  contract_amount: string
  notes: string
}

type PaymentForm = {
  amount: string
  due_date: string
  paid_date: string
  status: PaymentStatus
  amount_paid: string
  method: string
  notes: string
}

const BLANK_VENDOR_FORM: VendorForm = {
  name: '', category: '', contact_name: '', phone: '',
  email: '', website: '', contract_amount: '', notes: '',
}

const BLANK_PAYMENT_FORM: PaymentForm = {
  amount: '', due_date: '', paid_date: '', status: 'upcoming', amount_paid: '', method: '', notes: '',
}

const PAYMENT_METHODS = ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Check', 'Other']

const SIDE_ACCENT: Record<'bride' | 'groom', string> = { bride: '#be185d', groom: '#1d4ed8' }
const SIDE_BG: Record<'bride' | 'groom', string> = { bride: '#fdf2f8', groom: '#eff6ff' }

const VENDOR_STATUS_BADGE: Record<VendorStatus, { bg: string; color: string; label: string }> = {
  all_paid:       { bg: '#dcfce7', color: '#166534', label: 'All Paid' },
  partially_paid: { bg: '#dbeafe', color: '#1e40af', label: 'Partially Paid' },
  payment_due:    { bg: '#fef3c7', color: '#92400e', label: 'Payment Due' },
  overdue:        { bg: '#fee2e2', color: '#991b1b', label: 'Overdue' },
  no_payments:    { bg: '#f3f4f6', color: '#6b7280', label: 'No Payments' },
}

const PAYMENT_STATUS_BADGE: Record<PaymentStatus, { bg: string; color: string; label: string }> = {
  upcoming:       { bg: '#fef3c7', color: '#92400e', label: 'Upcoming' },
  paid:           { bg: '#dcfce7', color: '#166534', label: 'Paid' },
  partially_paid: { bg: '#dbeafe', color: '#1e40af', label: 'Partially Paid' },
  overdue:        { bg: '#fee2e2', color: '#991b1b', label: 'Overdue' },
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function computeVendorStatus(payments: PaymentRow[]): VendorStatus {
  if (!payments.length) return 'no_payments'
  const total = payments.reduce((s, p) => s + p.amount, 0)
  const paid  = payments.reduce((s, p) => s + (p.status === 'paid' ? p.amount : p.amount_paid), 0)
  if (paid >= total) return 'all_paid'
  if (payments.some(p => p.status === 'overdue')) return 'overdue'
  if (payments.some(p => p.status === 'upcoming' && p.due_date && new Date(p.due_date) <= new Date())) return 'payment_due'
  return 'partially_paid'
}

function vendorPaidTotal(payments: PaymentRow[]) {
  return payments.reduce((s, p) => s + (p.status === 'paid' ? p.amount : p.amount_paid), 0)
}

export default function VendorsClient({
  initialVendors,
  categories,
  side,
}: {
  initialVendors: VendorRow[]
  categories: { id: string; name: string }[]
  side: 'bride' | 'groom'
}) {
  const accent = SIDE_ACCENT[side]
  const accentBg = SIDE_BG[side]

  const { fmt, usdToInr, currency, currentRate, setCurrency, rateLoading } = useCurrency()

  // Per-modal currency for payment modal
  const [formCurrency, setFormCurrency] = useState<'INR' | 'USD'>(currency)
  function formToInr(val: number) { return formCurrency === 'USD' ? Math.round(val * usdToInr) : val }
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

  const [vendors, setVendors] = useState<VendorRow[]>(initialVendors)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  // Vendor modal
  const [showVendorModal, setShowVendorModal] = useState(false)
  const [editingVendor, setEditingVendor] = useState<VendorRow | null>(null)
  const [vendorForm, setVendorForm] = useState<VendorForm>(BLANK_VENDOR_FORM)
  const [vendorSubmitting, setVendorSubmitting] = useState(false)
  const [vendorError, setVendorError] = useState('')

  // Delete vendor
  const [deleteTarget, setDeleteTarget] = useState<VendorRow | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Slide-out panel
  const [slideOutVendor, setSlideOutVendor] = useState<VendorRow | null>(null)

  // Payment modal (inside slide-out)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null)
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(BLANK_PAYMENT_FORM)
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  // Delete payment
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<PaymentRow | null>(null)
  const [deletePaymentSubmitting, setDeletePaymentSubmitting] = useState(false)

  const categoryNames = useMemo(() => categories.map(c => c.name), [categories])

  const filtered = useMemo(() => {
    return vendors.filter(v => {
      if (search && !v.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterCategory && v.category !== filterCategory) return false
      return true
    })
  }, [vendors, search, filterCategory])

  const hasFilters = search !== '' || filterCategory !== ''

  // --- Vendor CRUD ---
  function openAddVendor() {
    setEditingVendor(null)
    setVendorForm(BLANK_VENDOR_FORM)
    setVendorError('')
    setShowVendorModal(true)
  }

  function openEditVendor(v: VendorRow) {
    setEditingVendor(v)
    setVendorForm({
      name: v.name,
      category: v.category ?? '',
      contact_name: v.contact_name ?? '',
      phone: v.phone ?? '',
      email: v.email ?? '',
      website: v.website ?? '',
      contract_amount: v.contract_amount != null ? String(v.contract_amount) : '',
      notes: v.notes ?? '',
    })
    setVendorError('')
    setShowVendorModal(true)
  }

  function closeVendorModal() {
    setShowVendorModal(false)
    setEditingVendor(null)
    setVendorError('')
  }

  async function submitVendor() {
    setVendorError('')
    if (!vendorForm.name.trim()) { setVendorError('Name is required'); return }
    setVendorSubmitting(true)
    try {
      const body = {
        name: vendorForm.name.trim(),
        category: vendorForm.category.trim() || null,
        contact_name: vendorForm.contact_name.trim() || null,
        phone: vendorForm.phone.trim() || null,
        email: vendorForm.email.trim() || null,
        website: vendorForm.website.trim() || null,
        contract_amount: vendorForm.contract_amount ? Number(vendorForm.contract_amount) : null,
        notes: vendorForm.notes.trim() || null,
      }
      const url = editingVendor ? `/api/admin/finance/vendors/${editingVendor.id}` : '/api/admin/finance/vendors'
      const method = editingVendor ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const data = await res.json()
        setVendorError(data.error ?? 'Something went wrong')
        return
      }
      const data = await res.json()
      if (editingVendor) {
        setVendors(prev => prev.map(v => v.id === editingVendor.id ? data.vendor : v))
        if (slideOutVendor?.id === editingVendor.id) setSlideOutVendor(data.vendor)
      } else {
        setVendors(prev => [...prev, data.vendor].sort((a, b) => a.name.localeCompare(b.name)))
      }
      closeVendorModal()
    } catch {
      setVendorError('Something went wrong')
    } finally {
      setVendorSubmitting(false)
    }
  }

  async function confirmDeleteVendor() {
    if (!deleteTarget) return
    setDeleteSubmitting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/admin/finance/vendors/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setDeleteError(data.error ?? 'Something went wrong')
        return
      }
      setVendors(prev => prev.filter(v => v.id !== deleteTarget.id))
      if (slideOutVendor?.id === deleteTarget.id) setSlideOutVendor(null)
      setDeleteTarget(null)
    } catch {
      setDeleteError('Something went wrong')
    } finally {
      setDeleteSubmitting(false)
    }
  }

  // --- Payment CRUD ---
  function openAddPayment() {
    setEditingPayment(null)
    setPaymentForm(BLANK_PAYMENT_FORM)
    setFormCurrency(currency)
    setPaymentError('')
    setShowPaymentModal(true)
  }

  function openEditPayment(p: PaymentRow) {
    const fc: 'INR' | 'USD' = p.exchange_rate != null ? 'USD' : 'INR'
    setEditingPayment(p)
    setFormCurrency(fc)
    const toFormVal = (inr: number) => fc === 'USD' ? parseFloat((inr / (p.exchange_rate ?? usdToInr)).toFixed(2)) : inr
    setPaymentForm({
      amount: String(toFormVal(p.amount)),
      due_date: p.due_date ? p.due_date.substring(0, 10) : '',
      paid_date: p.paid_date ? p.paid_date.substring(0, 10) : '',
      status: p.status,
      amount_paid: p.amount_paid > 0 ? String(toFormVal(p.amount_paid)) : '',
      method: p.method ?? '',
      notes: p.notes ?? '',
    })
    setPaymentError('')
    setShowPaymentModal(true)
  }

  function closePaymentModal() {
    setShowPaymentModal(false)
    setEditingPayment(null)
    setPaymentError('')
  }

  function updateVendorPayments(vendorId: string, updater: (prev: PaymentRow[]) => PaymentRow[]) {
    setVendors(prev => prev.map(v => {
      if (v.id !== vendorId) return v
      const updated = { ...v, payments: updater(v.payments) }
      return updated
    }))
    if (slideOutVendor?.id === vendorId) {
      setSlideOutVendor(prev => prev ? { ...prev, payments: updater(prev.payments) } : null)
    }
  }

  async function submitPayment() {
    if (!slideOutVendor) return
    setPaymentError('')
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
      setPaymentError('Amount must be greater than 0'); return
    }
    if (paymentForm.amount_paid && Number(paymentForm.amount_paid) > Number(paymentForm.amount)) {
      setPaymentError('Amount paid cannot exceed total amount'); return
    }
    setPaymentSubmitting(true)
    try {
      const body = {
        vendor_id: slideOutVendor.id,
        amount: formToInr(Number(paymentForm.amount)),
        due_date: paymentForm.due_date || null,
        paid_date: paymentForm.paid_date || null,
        status: paymentForm.status,
        amount_paid: paymentForm.amount_paid ? formToInr(Number(paymentForm.amount_paid)) : 0,
        method: paymentForm.method || null,
        notes: paymentForm.notes || null,
        exchange_rate: formExchangeRate,
      }
      const url = editingPayment ? `/api/admin/finance/payments/${editingPayment.id}` : '/api/admin/finance/payments'
      const method = editingPayment ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const data = await res.json()
        setPaymentError(data.error ?? 'Something went wrong')
        return
      }
      const data = await res.json()
      const saved: PaymentRow = {
        id: data.payment.id,
        vendor_id: data.payment.vendor_id,
        amount: data.payment.amount,
        due_date: data.payment.due_date,
        paid_date: data.payment.paid_date,
        status: data.payment.status,
        amount_paid: data.payment.amount_paid,
        exchange_rate: data.payment.exchange_rate ?? null,
        method: data.payment.method,
        notes: data.payment.notes,
        created_at: data.payment.created_at,
        updated_at: data.payment.updated_at,
      }
      if (editingPayment) {
        updateVendorPayments(slideOutVendor.id, prev => prev.map(p => p.id === editingPayment.id ? saved : p))
      } else {
        updateVendorPayments(slideOutVendor.id, prev => [...prev, saved].sort((a, b) => {
          if (!a.due_date) return 1
          if (!b.due_date) return -1
          return a.due_date.localeCompare(b.due_date)
        }))
      }
      closePaymentModal()
    } catch {
      setPaymentError('Something went wrong')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  async function markPaymentPaid(p: PaymentRow) {
    if (!slideOutVendor) return
    try {
      const res = await fetch(`/api/admin/finance/payments/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid', amount_paid: p.amount }),
      })
      if (!res.ok) return
      const data = await res.json()
      const saved: PaymentRow = {
        id: data.payment.id,
        vendor_id: data.payment.vendor_id,
        amount: data.payment.amount,
        due_date: data.payment.due_date,
        paid_date: data.payment.paid_date,
        status: data.payment.status,
        amount_paid: data.payment.amount_paid,
        exchange_rate: data.payment.exchange_rate ?? null,
        method: data.payment.method,
        notes: data.payment.notes,
        created_at: data.payment.created_at,
        updated_at: data.payment.updated_at,
      }
      updateVendorPayments(slideOutVendor.id, prev => prev.map(q => q.id === p.id ? saved : q))
    } catch {
      // silent fail
    }
  }

  async function deletePayment(p: PaymentRow) {
    if (!slideOutVendor) return
    setDeletePaymentTarget(p)
    setDeletePaymentSubmitting(true)
    try {
      const res = await fetch(`/api/admin/finance/payments/${p.id}`, { method: 'DELETE' })
      if (!res.ok) return
      updateVendorPayments(slideOutVendor.id, prev => prev.filter(q => q.id !== p.id))
    } catch {
      // silent fail
    } finally {
      setDeletePaymentTarget(null)
      setDeletePaymentSubmitting(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {filtered.length} vendor{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={openAddVendor}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: accent, color: '#fff' }}
        >
          + Add Vendor
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--color-muted)' }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search vendors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${inputCls} w-full pl-8`}
            style={inputStyle}
          />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className={inputCls} style={inputStyle}>
          <option value="">All Categories</option>
          {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setSearch(''); setFilterCategory('') }}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{ color: accent, background: accentBg }}>
            Clear ×
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-highlight)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--color-highlight)' }}>
              {['Name', 'Category', 'Contact', 'Contract', 'Paid', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide"
                  style={{ color: 'var(--color-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'var(--color-muted)' }}>
                  {hasFilters ? 'No vendors match your filters.' : 'No vendors yet. Add your first vendor above.'}
                </td>
              </tr>
            ) : filtered.map((v, i) => {
              const status = computeVendorStatus(v.payments)
              const badge = VENDOR_STATUS_BADGE[status]
              const totalPaid = vendorPaidTotal(v.payments)
              const totalAmount = v.payments.reduce((s, p) => s + p.amount, 0)
              return (
                <tr key={v.id} style={{
                  background: i % 2 === 0 ? 'var(--color-background)' : 'var(--color-highlight)20',
                  borderTop: '1px solid var(--color-highlight)',
                }}>
                  <td className="px-4 py-3 font-medium">{v.name}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-muted)' }}>{v.category ?? '—'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-muted)' }}>{v.contact_name ?? '—'}</td>
                  <td className="px-4 py-3">{v.contract_amount != null ? fmt(v.contract_amount) : '—'}</td>
                  <td className="px-4 py-3">
                    {v.payments.length > 0 ? (
                      <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                        {fmt(totalPaid)} / {fmt(totalAmount)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded-full text-xs font-medium"
                      style={{ background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setSlideOutVendor(v)}
                        className="text-xs font-medium hover:underline"
                        style={{ color: accent }}>View</button>
                      <button onClick={() => openEditVendor(v)}
                        className="text-xs font-medium hover:underline"
                        style={{ color: 'var(--color-muted)' }}>Edit</button>
                      <button onClick={() => { setDeleteTarget(v); setDeleteError('') }}
                        className="text-xs font-medium hover:underline" style={{ color: '#dc2626' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Slide-out panel */}
      {slideOutVendor && (
        <>
          <div
            className="fixed inset-0 z-30"
            style={{ background: 'rgba(45,45,45,0.3)' }}
            onClick={() => setSlideOutVendor(null)}
          />
          <div
            className="fixed inset-y-0 right-0 z-40 w-full max-w-md shadow-2xl overflow-y-auto"
            style={{ background: 'var(--color-background)', transition: 'transform 0.2s ease' }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-5 border-b sticky top-0 z-10"
              style={{ borderColor: 'var(--color-highlight)', background: 'var(--color-background)' }}>
              <div>
                <h2 className="font-semibold text-lg" style={{ fontFamily: 'var(--font-cormorant)', color: 'var(--color-foreground)' }}>
                  {slideOutVendor.name}
                </h2>
                {slideOutVendor.category && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{slideOutVendor.category}</p>
                )}
              </div>
              <button onClick={() => setSlideOutVendor(null)}
                className="text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: 'var(--color-muted)' }}>×</button>
            </div>

            <div className="p-6 space-y-6">
              {/* Contact info */}
              <div className="space-y-2">
                {slideOutVendor.contact_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{ color: 'var(--color-muted)' }}>Contact:</span>
                    <span>{slideOutVendor.contact_name}</span>
                  </div>
                )}
                {slideOutVendor.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{ color: 'var(--color-muted)' }}>Phone:</span>
                    <span>{slideOutVendor.phone}</span>
                  </div>
                )}
                {slideOutVendor.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{ color: 'var(--color-muted)' }}>Email:</span>
                    <a href={`mailto:${slideOutVendor.email}`} style={{ color: accent }}>{slideOutVendor.email}</a>
                  </div>
                )}
                {slideOutVendor.website && (
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{ color: 'var(--color-muted)' }}>Website:</span>
                    <a href={slideOutVendor.website} target="_blank" rel="noopener noreferrer" style={{ color: accent }}>
                      {slideOutVendor.website}
                    </a>
                  </div>
                )}
              </div>

              {/* Contract + status */}
              <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--color-highlight)' }}>
                {slideOutVendor.contract_amount != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: 'var(--color-muted)' }}>Contract Amount</span>
                    <span className="font-medium">{fmt(slideOutVendor.contract_amount)}</span>
                  </div>
                )}
                {(() => {
                  const st = computeVendorStatus(slideOutVendor.payments)
                  const badge = VENDOR_STATUS_BADGE[st]
                  const paid = vendorPaidTotal(slideOutVendor.payments)
                  const total = slideOutVendor.payments.reduce((s, p) => s + p.amount, 0)
                  return (
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-1 rounded-full text-xs font-medium"
                        style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                      {slideOutVendor.payments.length > 0 && (
                        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                          {fmt(paid)} / {fmt(total)} paid
                        </span>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Payments sub-table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-sm">Payment Schedule</h3>
                  <button onClick={openAddPayment}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: accent, color: '#fff' }}>
                    + Add Payment
                  </button>
                </div>

                {slideOutVendor.payments.length === 0 ? (
                  <p className="text-sm py-4 text-center" style={{ color: 'var(--color-muted)' }}>
                    No payments scheduled yet.
                  </p>
                ) : (
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-highlight)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'var(--color-highlight)' }}>
                          {['Due Date', 'Amount', 'Paid', 'Status', 'Actions'].map(h => (
                            <th key={h} className="text-left px-3 py-2 font-medium uppercase tracking-wide"
                              style={{ color: 'var(--color-muted)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {slideOutVendor.payments.map((p, i) => {
                          const pbadge = PAYMENT_STATUS_BADGE[p.status]
                          return (
                            <tr key={p.id} style={{
                              borderTop: i === 0 ? 'none' : '1px solid var(--color-highlight)',
                              background: i % 2 === 0 ? 'var(--color-background)' : 'transparent',
                            }}>
                              <td className="px-3 py-2">{formatDate(p.due_date)}</td>
                              <td className="px-3 py-2 font-medium">{fmt(p.amount, p.exchange_rate)}</td>
                              <td className="px-3 py-2">{fmt(p.amount_paid, p.exchange_rate)}</td>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.5 rounded-full font-medium"
                                  style={{ background: pbadge.bg, color: pbadge.color }}>
                                  {pbadge.label}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  {p.status !== 'paid' && (
                                    <button
                                      onClick={() => markPaymentPaid(p)}
                                      className="font-medium hover:underline"
                                      style={{ color: '#166534' }}>Paid</button>
                                  )}
                                  <button onClick={() => openEditPayment(p)}
                                    className="font-medium hover:underline"
                                    style={{ color: 'var(--color-muted)' }}>Edit</button>
                                  <button
                                    onClick={() => deletePayment(p)}
                                    disabled={deletePaymentTarget?.id === p.id && deletePaymentSubmitting}
                                    className="font-medium hover:underline"
                                    style={{ color: '#dc2626' }}>Delete</button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Notes */}
              {slideOutVendor.notes && (
                <div>
                  <h3 className="font-medium text-sm mb-2">Notes</h3>
                  <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{slideOutVendor.notes}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Vendor modal */}
      {showVendorModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(45,45,45,0.4)' }}>
          <div className="w-full max-w-lg mx-4 rounded-2xl shadow-xl overflow-y-auto max-h-[90vh]"
            style={{ background: 'var(--color-background)' }}>
            <div className="flex items-center justify-between px-6 py-5 border-b"
              style={{ borderColor: 'var(--color-highlight)' }}>
              <h2 className="font-semibold" style={{ fontFamily: 'var(--font-cormorant)', fontSize: '1.25rem' }}>
                {editingVendor ? 'Edit Vendor' : 'Add Vendor'}
              </h2>
              <button onClick={closeVendorModal} className="text-xl leading-none w-8 h-8 flex items-center justify-center"
                style={{ color: 'var(--color-muted)' }}>×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Name *</label>
                <input value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))}
                  className={modalInputCls} style={inputStyle} placeholder="Vendor name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Category</label>
                  <select value={vendorForm.category} onChange={e => setVendorForm(f => ({ ...f, category: e.target.value }))}
                    className={modalInputCls} style={inputStyle}>
                    <option value="">— None —</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Contact Name</label>
                  <input value={vendorForm.contact_name} onChange={e => setVendorForm(f => ({ ...f, contact_name: e.target.value }))}
                    className={modalInputCls} style={inputStyle} placeholder="Point of contact" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Phone</label>
                  <input value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone: e.target.value }))}
                    className={modalInputCls} style={inputStyle} placeholder="+91 98765 43210" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Email</label>
                  <input type="email" value={vendorForm.email} onChange={e => setVendorForm(f => ({ ...f, email: e.target.value }))}
                    className={modalInputCls} style={inputStyle} placeholder="vendor@example.com" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Website</label>
                <input value={vendorForm.website} onChange={e => setVendorForm(f => ({ ...f, website: e.target.value }))}
                  className={modalInputCls} style={inputStyle} placeholder="https://..." />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Contract Amount (₹)</label>
                <input type="number" min="0" step="1" value={vendorForm.contract_amount}
                  onChange={e => setVendorForm(f => ({ ...f, contract_amount: e.target.value }))}
                  className={modalInputCls} style={inputStyle} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Notes</label>
                <textarea rows={3} value={vendorForm.notes} onChange={e => setVendorForm(f => ({ ...f, notes: e.target.value }))}
                  className={modalInputCls} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Any additional notes…" />
              </div>
              {vendorError && <p className="text-sm text-red-600">{vendorError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t"
              style={{ borderColor: 'var(--color-highlight)' }}>
              <button onClick={closeVendorModal} className="px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--color-muted)' }}>Cancel</button>
              <button onClick={submitVendor} disabled={vendorSubmitting}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: accent, color: '#fff' }}>
                {vendorSubmitting ? 'Saving…' : editingVendor ? 'Save Changes' : 'Add Vendor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(45,45,45,0.4)' }}>
          <div className="w-full max-w-md mx-4 rounded-2xl shadow-xl overflow-y-auto max-h-[90vh]"
            style={{ background: 'var(--color-background)' }}>
            <div className="flex items-center justify-between px-6 py-5 border-b"
              style={{ borderColor: 'var(--color-highlight)' }}>
              <h2 className="font-semibold" style={{ fontFamily: 'var(--font-cormorant)', fontSize: '1.25rem' }}>
                {editingPayment ? 'Edit Payment' : 'Add Payment'}
              </h2>
              <button onClick={closePaymentModal} className="text-xl leading-none w-8 h-8 flex items-center justify-center"
                style={{ color: 'var(--color-muted)' }}>×</button>
            </div>
            <div className="p-6 space-y-4">
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
                  <input type="number" min="0" step="0.01" value={paymentForm.amount}
                    onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                    className={modalInputCls} style={inputStyle} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Due Date</label>
                  <input type="date" value={paymentForm.due_date}
                    onChange={e => setPaymentForm(f => ({ ...f, due_date: e.target.value }))}
                    className={modalInputCls} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Status</label>
                  <select value={paymentForm.status}
                    onChange={e => {
                      const s = e.target.value as PaymentStatus
                      setPaymentForm(f => ({
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
                  <select value={paymentForm.method}
                    onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))}
                    className={modalInputCls} style={inputStyle}>
                    <option value="">— Select —</option>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              {paymentForm.status === 'partially_paid' && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Amount Paid ({formSymbol})</label>
                  <input type="number" min="0" step="0.01" value={paymentForm.amount_paid}
                    onChange={e => setPaymentForm(f => ({ ...f, amount_paid: e.target.value }))}
                    className={modalInputCls} style={inputStyle} placeholder="0" />
                  {paymentForm.amount && paymentForm.amount_paid && (
                    <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                      Remaining: {formSymbol}{Math.max(0, Number(paymentForm.amount) - Number(paymentForm.amount_paid)).toFixed(2)}
                    </p>
                  )}
                </div>
              )}
              {(paymentForm.status === 'paid' || paymentForm.status === 'partially_paid') && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Paid Date</label>
                  <input type="date" value={paymentForm.paid_date}
                    onChange={e => setPaymentForm(f => ({ ...f, paid_date: e.target.value }))}
                    className={modalInputCls} style={inputStyle} />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Notes</label>
                <textarea rows={2} value={paymentForm.notes}
                  onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))}
                  className={modalInputCls} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Any notes…" />
              </div>
              {paymentError && <p className="text-sm text-red-600">{paymentError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t"
              style={{ borderColor: 'var(--color-highlight)' }}>
              <button onClick={closePaymentModal} className="px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--color-muted)' }}>Cancel</button>
              <button onClick={submitPayment} disabled={paymentSubmitting}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: accent, color: '#fff' }}>
                {paymentSubmitting ? 'Saving…' : editingPayment ? 'Save Changes' : 'Add Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete vendor confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(45,45,45,0.4)' }}>
          <div className="w-full max-w-sm mx-4 rounded-2xl shadow-xl p-6"
            style={{ background: 'var(--color-background)' }}>
            <h2 className="font-semibold mb-2" style={{ fontFamily: 'var(--font-cormorant)', fontSize: '1.25rem' }}>
              Delete Vendor
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
              Delete <strong>{deleteTarget.name}</strong>? This will also delete all {deleteTarget.payments.length} associated payment{deleteTarget.payments.length !== 1 ? 's' : ''}. This cannot be undone.
            </p>
            {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--color-muted)' }}>Cancel</button>
              <button onClick={confirmDeleteVendor} disabled={deleteSubmitting}
                className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: '#dc2626', color: '#fff' }}>
                {deleteSubmitting ? 'Deleting…' : 'Delete Vendor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
