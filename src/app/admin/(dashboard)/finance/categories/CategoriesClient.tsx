'use client'

import { useState, useMemo } from 'react'
import { type Side } from '@prisma/client'
import { useCurrency } from '@/lib/currency'

type CategoryRow = {
  id: string
  name: string
  budgeted_amount: number
  sort_order: number
  side: Side
  created_at: string
  updated_at: string
}

type ExpenseStub = {
  category_id: string | null
  amount: number
  amount_paid: number
}

export default function CategoriesClient({
  initialCategories,
  initialExpenses,
  side,
}: {
  initialCategories: CategoryRow[]
  initialExpenses: ExpenseStub[]
  side: Side
}) {
  const accent = side === 'bride' ? '#be185d' : '#1d4ed8'
  const accentBg = side === 'bride' ? '#fdf2f8' : '#eff6ff'

  const { fmt } = useCurrency()

  const [categories, setCategories] = useState<CategoryRow[]>(initialCategories)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CategoryRow | null>(null)
  const [form, setForm] = useState({ name: '', budgeted_amount: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Reorder state
  const [reorderSubmitting, setReorderSubmitting] = useState<string | null>(null)

  // Computed cost and actual paid per category
  const { costByCategory, actualByCategory } = useMemo(() => {
    const cost = new Map<string, number>()
    const paid = new Map<string, number>()
    for (const e of initialExpenses) {
      if (e.category_id) {
        cost.set(e.category_id, (cost.get(e.category_id) ?? 0) + e.amount)
        paid.set(e.category_id, (paid.get(e.category_id) ?? 0) + e.amount_paid)
      }
    }
    return { costByCategory: cost, actualByCategory: paid }
  }, [initialExpenses])

  const totals = useMemo(() => {
    const totalBudgeted = categories.reduce((s, c) => s + c.budgeted_amount, 0)
    const totalCost = categories.reduce((s, c) => s + (costByCategory.get(c.id) ?? 0), 0)
    const totalActual = categories.reduce((s, c) => s + (actualByCategory.get(c.id) ?? 0), 0)
    const uncategorizedActual = initialExpenses
      .filter((e) => !e.category_id)
      .reduce((s, e) => s + e.amount_paid, 0)
    return {
      totalBudgeted,
      totalCost,
      totalActual,
      totalVariance: totalBudgeted - totalActual,
      uncategorizedActual,
    }
  }, [categories, costByCategory, actualByCategory, initialExpenses])

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.sort_order - b.sort_order),
    [categories]
  )

  // ── Modal helpers ──────────────────────────────────────────────
  function openAdd() {
    setEditing(null)
    setForm({ name: '', budgeted_amount: '' })
    setError('')
    setShowModal(true)
  }

  function openEdit(c: CategoryRow) {
    setEditing(c)
    setForm({ name: c.name, budgeted_amount: String(c.budgeted_amount) })
    setError('')
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setError('')
  }

  async function submitCategory() {
    setError('')
    if (!form.name.trim()) { setError('Name is required'); return }
    if (form.budgeted_amount === '' || Number(form.budgeted_amount) < 0) {
      setError('Budgeted amount must be 0 or greater')
      return
    }
    setSubmitting(true)
    try {
      const body = { name: form.name, budgeted_amount: Number(form.budgeted_amount) }
      if (editing) {
        const res = await fetch(`/api/admin/finance/categories/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
        const { category } = await res.json()
        setCategories((prev) => prev.map((c) => (c.id === category.id ? category : c)))
      } else {
        const res = await fetch('/api/admin/finance/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
        const { category } = await res.json()
        setCategories((prev) => [...prev, category])
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
      const res = await fetch(`/api/admin/finance/categories/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
      setCategories((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDeleteSubmitting(false)
    }
  }

  async function moveCategory(id: string, dir: 'up' | 'down') {
    const list = [...sorted]
    const idx = list.findIndex((c) => c.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= list.length) return

    const a = list[idx]
    const b = list[swapIdx]
    setReorderSubmitting(id)

    // Optimistic update
    setCategories((prev) =>
      prev.map((c) =>
        c.id === a.id ? { ...c, sort_order: b.sort_order } :
        c.id === b.id ? { ...c, sort_order: a.sort_order } : c
      )
    )

    try {
      const res = await fetch('/api/admin/finance/categories/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swaps: [
            { id: a.id, sort_order: b.sort_order },
            { id: b.id, sort_order: a.sort_order },
          ],
        }),
      })
      if (!res.ok) throw new Error('Reorder failed')
    } catch {
      // Revert on failure
      setCategories((prev) =>
        prev.map((c) =>
          c.id === a.id ? { ...c, sort_order: a.sort_order } :
          c.id === b.id ? { ...c, sort_order: b.sort_order } : c
        )
      )
    } finally {
      setReorderSubmitting(null)
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 transition-colors'
  const inputStyle = {
    borderColor: 'var(--color-highlight)',
    background: 'var(--color-background)',
    color: 'var(--color-foreground)',
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Budget categories for your side. Track spending against each budget line.
        </p>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: accent, color: '#fff' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Category
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-highlight)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: accentBg }}>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide w-16" style={{ color: 'var(--color-muted)' }}>Order</th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Category</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Budgeted</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Total Cost</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Actual Paid</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Variance</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-sm" style={{ color: 'var(--color-muted)' }}>
                  No categories yet.
                </td>
              </tr>
            ) : (
              sorted.map((cat, i) => {
                const cost = costByCategory.get(cat.id) ?? 0
                const actual = actualByCategory.get(cat.id) ?? 0
                const variance = cat.budgeted_amount - actual
                const varianceColor = variance >= 0 ? '#16a34a' : '#dc2626'
                const isMoving = reorderSubmitting === cat.id

                return (
                  <tr
                    key={cat.id}
                    style={{
                      borderTop: i > 0 ? '1px solid var(--color-highlight)' : undefined,
                      opacity: isMoving ? 0.5 : 1,
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {/* Reorder arrows */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5 items-center">
                        <button
                          onClick={() => moveCategory(cat.id, 'up')}
                          disabled={i === 0 || isMoving}
                          className="p-0.5 rounded transition-colors disabled:opacity-20"
                          style={{ color: 'var(--color-muted)' }}
                          title="Move up"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="18 15 12 9 6 15" />
                          </svg>
                        </button>
                        <button
                          onClick={() => moveCategory(cat.id, 'down')}
                          disabled={i === sorted.length - 1 || isMoving}
                          className="p-0.5 rounded transition-colors disabled:opacity-20"
                          style={{ color: 'var(--color-muted)' }}
                          title="Move down"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-foreground)' }}>
                      {cat.name}
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--color-foreground)' }}>
                      {fmt(cat.budgeted_amount)}
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--color-foreground)' }}>
                      {fmt(cost)}
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--color-muted)' }}>
                      {fmt(actual)}
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: varianceColor }}>
                      {variance >= 0 ? '+' : ''}{fmt(variance)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => openEdit(cat)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: accentBg, color: accent }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => { setDeleteTarget(cat); setDeleteError('') }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50"
                          style={{ color: '#dc2626' }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>

          {/* Summary footer */}
          {sorted.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--color-highlight)', background: accentBg }}>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
                  Total
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: 'var(--color-foreground)' }}>
                  {fmt(totals.totalBudgeted)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: 'var(--color-foreground)' }}>
                  {fmt(totals.totalCost)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: 'var(--color-muted)' }}>
                  {fmt(totals.totalActual)}
                </td>
                <td
                  className="px-4 py-3 text-right tabular-nums font-semibold"
                  style={{ color: totals.totalVariance >= 0 ? '#16a34a' : '#dc2626' }}
                >
                  {totals.totalVariance >= 0 ? '+' : ''}{fmt(totals.totalVariance)}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Uncategorized note */}
      {totals.uncategorizedActual > 0 && (
        <p className="mt-3 text-xs" style={{ color: 'var(--color-muted)' }}>
          Note: {fmt(totals.uncategorizedActual)} in uncategorized expenses not reflected above.
        </p>
      )}

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(45,45,45,0.4)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-xl" style={{ background: 'var(--color-background)' }}>
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--color-highlight)' }}>
              <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-cormorant)', color: 'var(--color-foreground)' }}>
                {editing ? 'Edit Category' : 'Add Category'}
              </h2>
              <button onClick={closeModal} style={{ color: 'var(--color-muted)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Photography"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Budgeted Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.budgeted_amount}
                  onChange={(e) => setForm((f) => ({ ...f, budgeted_amount: e.target.value }))}
                  placeholder="0.00"
                  className={inputCls}
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
                onClick={submitCategory}
                disabled={submitting}
                className="px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                style={{ background: accent, color: '#fff' }}
              >
                {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(45,45,45,0.4)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-xl p-6" style={{ background: 'var(--color-background)' }}>
            <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: 'var(--font-cormorant)', color: 'var(--color-foreground)' }}>
              Delete &ldquo;{deleteTarget.name}&rdquo;?
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
              Expenses linked to this category will become uncategorized. This cannot be undone.
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
                {deleteSubmitting ? 'Deleting…' : 'Delete Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
