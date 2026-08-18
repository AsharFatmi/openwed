'use client'

import React, { useState, useMemo } from 'react'
import { type WhatsAppTemplate } from '@/app/api/admin/whatsapp-templates/route'

// ─── Types ────────────────────────────────────────────────────────────────────

type GuestRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  household_group: string | null
  invitation_sent: boolean
  rsvp_token: string | null
  created_at: Date
}

type Filter = 'all' | 'sent' | 'unsent'

// ─── Phase grouping ───────────────────────────────────────────────────────────

type Phase = {
  label: string
  date: string
  guests: GuestRow[]
}

function buildPhases(guests: GuestRow[]): Phase[] {
  if (guests.length === 0) return []

  const sorted = [...guests].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const groups: GuestRow[][] = []
  let current: GuestRow[] = [sorted[0]]
  let anchorTime = new Date(sorted[0].created_at).getTime()

  for (let i = 1; i < sorted.length; i++) {
    const t = new Date(sorted[i].created_at).getTime()
    const daysDiff = (t - anchorTime) / (1000 * 60 * 60 * 24)
    if (daysDiff <= 1) {
      current.push(sorted[i])
    } else {
      groups.push(current)
      current = [sorted[i]]
      anchorTime = t
    }
  }
  groups.push(current)

  return groups.map((groupGuests, idx) => {
    const anchor = new Date(groupGuests[0].created_at)
    const date = anchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return { label: `Phase ${idx + 1}`, date, guests: groupGuests }
  })
}

// ─── Preview constants ────────────────────────────────────────────────────────

const PREVIEW_NAME = 'Ahmed'
const PREVIEW_LINK = 'https://your-wedding-site.com/?invite=abc123'

// ─── Component ────────────────────────────────────────────────────────────────

export default function SendInvitesClient({
  guests: initialGuests,
  initialTemplates,
  side,
}: {
  guests: GuestRow[]
  initialTemplates: WhatsAppTemplate[]
  side: string
}) {
  const [guests, setGuests] = useState(initialGuests)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [emailingId, setEmailingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ─── Template state ─────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>(initialTemplates)
  const [panelOpen, setPanelOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', body: '' })
  const [templateError, setTemplateError] = useState('')
  const [templateSaving, setTemplateSaving] = useState(false)

  const activeTemplate = templates.find((t) => t.active) ?? templates[0]

  // ─── Template helpers ────────────────────────────────────────────────────────

  async function saveTemplates(updated: WhatsAppTemplate[]) {
    setTemplateSaving(true)
    try {
      await fetch('/api/admin/whatsapp-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: updated }),
      })
    } finally {
      setTemplateSaving(false)
    }
  }

  function activateTemplate(id: string) {
    const updated = templates.map((t) => ({ ...t, active: t.id === id }))
    setTemplates(updated)
    saveTemplates(updated)
  }

  function openEditTemplate(id: string) {
    const t = templates.find((t) => t.id === id)
    if (!t) return
    setEditForm({ name: t.name, body: t.body })
    setEditingId(id)
    setTemplateError('')
  }

  function cancelEdit() {
    // If the template was just added (not yet saved), remove it
    const t = templates.find((t) => t.id === editingId)
    if (t && t.name === 'New Template' && t.body === "Hi {name}! Here's your invite link: {link}") {
      const updated = templates.filter((t) => t.id !== editingId)
      if (updated.length > 0) {
        if (!updated.some((t) => t.active)) updated[0].active = true
        setTemplates(updated)
      }
    }
    setEditingId(null)
    setTemplateError('')
  }

  async function saveEditedTemplate() {
    if (!editForm.name.trim()) {
      setTemplateError('Template name is required')
      return
    }
    if (!editForm.body.includes('{link}')) {
      setTemplateError('Message must include {link}')
      return
    }
    const updated = templates.map((t) =>
      t.id === editingId ? { ...t, name: editForm.name.trim(), body: editForm.body } : t
    )
    setTemplates(updated)
    setEditingId(null)
    setTemplateError('')
    await saveTemplates(updated)
  }

  function addTemplate() {
    const newT: WhatsAppTemplate = {
      id: crypto.randomUUID(),
      name: 'New Template',
      body: "Hi {name}! Here's your invite link: {link}",
      active: false,
    }
    const updated = [...templates, newT]
    setTemplates(updated)
    setEditForm({ name: newT.name, body: newT.body })
    setEditingId(newT.id)
    setTemplateError('')
  }

  function deleteTemplate(id: string) {
    if (templates.length <= 1) return
    const wasActive = templates.find((t) => t.id === id)?.active ?? false
    let updated = templates.filter((t) => t.id !== id)
    if (wasActive) {
      updated = updated.map((t, i) => (i === 0 ? { ...t, active: true } : t))
    }
    setTemplates(updated)
    saveTemplates(updated)
  }

  // ─── Guest filtering ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return guests.filter((g) => {
      if (q && !g.name.toLowerCase().includes(q)) return false
      if (filter === 'sent' && !g.invitation_sent) return false
      if (filter === 'unsent' && g.invitation_sent) return false
      return true
    })
  }, [guests, search, filter])

  const phases = useMemo(() => buildPhases(filtered), [filtered])

  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())

  function togglePhaseCollapse(label: string) {
    setCollapsedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const allCollapsed = phases.length > 0 && phases.every((p) => collapsedPhases.has(p.label))

  function toggleAllPhases() {
    setCollapsedPhases(allCollapsed ? new Set() : new Set(phases.map((p) => p.label)))
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((g) => selectedIds.has(g.id))

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const g of filtered) next.delete(g.id)
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const g of filtered) next.add(g.id)
        return next
      })
    }
  }

  function toggleSelectPhase(phaseGuests: GuestRow[]) {
    const allSelected = phaseGuests.every((g) => selectedIds.has(g.id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const g of phaseGuests) {
        if (allSelected) next.delete(g.id)
        else next.add(g.id)
      }
      return next
    })
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Invite actions ──────────────────────────────────────────────────────────

  async function handleCopyLink(guest: GuestRow) {
    if (!guest.rsvp_token) return
    const url = `${window.location.origin}/?invite=${guest.rsvp_token}`
    await navigator.clipboard.writeText(url)
    setCopiedId(guest.id)
    setTimeout(() => setCopiedId((prev) => (prev === guest.id ? null : prev)), 1500)
  }

  async function handleEmailInvite(guest: GuestRow) {
    if (!guest.email || !guest.rsvp_token) return
    setEmailingId(guest.id)
    try {
      const res = await fetch(`/api/admin/guests/${guest.id}/send-invite`, { method: 'POST' })
      if (res.ok) {
        setGuests((prev) => prev.map((g) => g.id === guest.id ? { ...g, invitation_sent: true } : g))
      }
    } finally {
      setEmailingId(null)
    }
  }

  async function handleToggleSent(guest: GuestRow) {
    setTogglingId(guest.id)
    try {
      const newValue = !guest.invitation_sent
      const res = await fetch(`/api/admin/guests/${guest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_sent: newValue }),
      })
      if (res.ok) {
        setGuests((prev) => prev.map((g) =>
          g.id === guest.id ? { ...g, invitation_sent: newValue } : g
        ))
      }
    } finally {
      setTogglingId(null)
    }
  }

  function handleWhatsApp(guest: GuestRow) {
    if (!guest.phone || !guest.rsvp_token) return
    const firstName = guest.name.split(' ')[0]
    const inviteUrl = `${window.location.origin}/?invite=${guest.rsvp_token}`
    const active = templates.find((t) => t.active) ?? templates[0]
    const message = active.body
      .replace(/{name}/g, firstName)
      .replace(/{link}/g, inviteUrl)
    const digits = guest.phone.replace(/\D/g, '')
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank')
  }

  async function handleBulkEmail() {
    const eligible = (selectedIds.size > 0
      ? filtered.filter((g) => selectedIds.has(g.id))
      : filtered
    ).filter((g) => g.email && g.rsvp_token && !g.invitation_sent)

    if (eligible.length === 0) return
    setBulkLoading(true)
    setBulkMessage('')
    try {
      const res = await fetch('/api/admin/guests/send-invites-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestIds: eligible.map((g) => g.id) }),
      })
      const data = await res.json()
      if (res.ok) {
        const sentIds = new Set(eligible.map((g) => g.id))
        setGuests((prev) => prev.map((g) => sentIds.has(g.id) ? { ...g, invitation_sent: true } : g))
        setSelectedIds(new Set())
        setBulkMessage(`Sent ${data.sent} invitation${data.sent !== 1 ? 's' : ''}.`)
      } else {
        setBulkMessage('Failed to send. Please try again.')
      }
    } finally {
      setBulkLoading(false)
    }
  }

  const unsentWithEmailCount = filtered.filter((g) => g.email && g.rsvp_token && !g.invitation_sent).length
  const selectedUnsentCount = filtered.filter((g) => selectedIds.has(g.id) && g.email && g.rsvp_token && !g.invitation_sent).length
  const bulkTarget = selectedIds.size > 0 ? selectedUnsentCount : unsentWithEmailCount

  const previewText = editForm.body
    .replace(/{name}/g, PREVIEW_NAME)
    .replace(/{link}/g, PREVIEW_LINK)

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-cormorant)', color: 'var(--color-foreground)' }}>
          Send Invites
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
          Share personal RSVP links via email or WhatsApp. Guests are grouped by when they were added.
        </p>
      </div>

      {/* ─── WhatsApp Template Panel ─────────────────────────────────────────── */}
      <div
        className="mb-6 rounded-xl border overflow-hidden"
        style={{ borderColor: 'var(--color-highlight)' }}
      >
        {/* Panel toggle header */}
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-amber-50"
          style={{ background: '#fdf9f0' }}
        >
          <div className="flex items-center gap-3">
            {/* WhatsApp icon */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#16a34a">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <span className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
              WhatsApp Message Templates
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}
            >
              Active: {activeTemplate.name}
            </span>
            {templateSaving && (
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Saving…</span>
            )}
          </div>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: 'var(--color-muted)', transform: panelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Panel body */}
        {panelOpen && (
          <div className="border-t px-4 py-4" style={{ borderColor: 'var(--color-highlight)', background: 'var(--color-background)' }}>
            <div className="space-y-2">
              {templates.map((t) => (
                <div key={t.id}>
                  {editingId === t.id ? (
                    /* ── Inline editor ── */
                    <div
                      className="rounded-lg p-4 border"
                      style={{ borderColor: 'var(--color-accent)', background: '#fdf9f0' }}
                    >
                      {/* Name input */}
                      <div className="mb-3">
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)' }}>
                          Template name
                        </label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm rounded-lg border outline-none"
                          style={{
                            borderColor: 'var(--color-highlight)',
                            background: 'var(--color-background)',
                            color: 'var(--color-foreground)',
                          }}
                          placeholder="e.g. Friends, Family, Formal"
                        />
                      </div>

                      {/* Body textarea */}
                      <div className="mb-1">
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)' }}>
                          Message text
                        </label>
                        <textarea
                          value={editForm.body}
                          onChange={(e) => setEditForm((f) => ({ ...f, body: e.target.value }))}
                          rows={4}
                          className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-y"
                          style={{
                            borderColor: 'var(--color-highlight)',
                            background: 'var(--color-background)',
                            color: 'var(--color-foreground)',
                            fontFamily: 'inherit',
                          }}
                        />
                      </div>
                      <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
                        Use <code className="px-1 rounded" style={{ background: '#f3f4f6' }}>{'{name}'}</code> for the guest&apos;s first name,{' '}
                        <code className="px-1 rounded" style={{ background: '#f3f4f6' }}>{'{link}'}</code> for the RSVP link (required).
                      </p>

                      {/* Live preview */}
                      {editForm.body.trim() && (
                        <div className="mb-3 p-3 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                          <p className="text-xs font-medium mb-1" style={{ color: '#166534' }}>Preview (with sample data)</p>
                          <p className="text-xs whitespace-pre-wrap" style={{ color: '#14532d' }}>{previewText}</p>
                        </div>
                      )}

                      {/* Error */}
                      {templateError && (
                        <p className="text-xs mb-3" style={{ color: '#991b1b' }}>{templateError}</p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditedTemplate}
                          className="text-xs px-4 py-1.5 rounded-lg font-medium transition-colors"
                          style={{ background: 'var(--color-accent)', color: '#fff' }}
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-xs px-4 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                          style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Collapsed template row ── */
                    <div
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border"
                      style={{
                        borderColor: t.active ? 'var(--color-accent)' : 'var(--color-highlight)',
                        background: t.active ? '#fdf9f0' : 'var(--color-background)',
                      }}
                    >
                      {/* Active radio */}
                      <button
                        onClick={() => activateTemplate(t.id)}
                        className="flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
                        style={{
                          borderColor: t.active ? 'var(--color-accent)' : '#d1d5db',
                        }}
                        title={t.active ? 'Active' : 'Set as active'}
                        aria-label={t.active ? `${t.name} (active)` : `Set ${t.name} as active`}
                      >
                        {t.active && (
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: 'var(--color-accent)' }}
                          />
                        )}
                      </button>

                      {/* Name + preview snippet */}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                          {t.name}
                        </span>
                        {t.active && (
                          <span className="ml-2 text-xs" style={{ color: 'var(--color-accent)' }}>Active</span>
                        )}
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-muted)' }}>
                          {t.body.replace(/{name}/g, PREVIEW_NAME).replace(/{link}/g, '…')}
                        </p>
                      </div>

                      {/* Edit + Delete */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => openEditTemplate(t.id)}
                          className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-gray-50"
                          style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteTemplate(t.id)}
                          disabled={templates.length <= 1}
                          className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ borderColor: '#fecaca', color: '#dc2626' }}
                          title={templates.length <= 1 ? 'Cannot delete the only template' : 'Delete template'}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add template button */}
            {editingId === null && (
              <button
                onClick={addTemplate}
                className="mt-3 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-amber-50"
                style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add template
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Stats strip ─────────────────────────────────────────────────────── */}
      <div className="flex gap-6 mb-6">
        {(['all', 'unsent', 'sent'] as Filter[]).map((f) => {
          const count = f === 'all' ? guests.length : f === 'sent' ? guests.filter((g) => g.invitation_sent).length : guests.filter((g) => !g.invitation_sent).length
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-sm flex items-center gap-2 pb-1 transition-colors"
              style={{
                color: filter === f ? 'var(--color-foreground)' : 'var(--color-muted)',
                borderBottom: filter === f ? '2px solid var(--color-accent)' : '2px solid transparent',
              }}
            >
              <span className="font-medium">{count}</span>
              <span className="capitalize">{f === 'all' ? 'Total' : f === 'sent' ? 'Sent' : 'Not yet sent'}</span>
            </button>
          )
        })}
      </div>

      {/* Search + bulk email */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-muted)' }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search guests…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border outline-none"
            style={{ background: 'var(--color-background)', borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
          />
        </div>

        {bulkTarget > 0 && (
          <button
            onClick={handleBulkEmail}
            disabled={bulkLoading}
            className="text-xs px-4 py-2 rounded-lg border font-medium flex items-center gap-1.5 transition-colors hover:bg-amber-50 disabled:opacity-50"
            style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" />
            </svg>
            {bulkLoading ? 'Sending…' : `Email ${selectedIds.size > 0 ? `${bulkTarget} selected` : `all ${bulkTarget}`} un-sent`}
          </button>
        )}

        {bulkMessage && (
          <span className="text-xs" style={{ color: bulkMessage.startsWith('Sent') ? '#166534' : '#991b1b' }}>
            {bulkMessage}
          </span>
        )}

        {phases.length > 1 && (
          <button
            onClick={toggleAllPhases}
            className="ml-auto text-xs px-3 py-2 rounded-lg border transition-colors hover:bg-amber-50"
            style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </div>

      {/* Guest table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-sm" style={{ color: 'var(--color-muted)' }}>
          No guests match your filter.
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-highlight)' }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: 'var(--color-background)', borderBottom: '1px solid var(--color-highlight)' }}>
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="rounded"
                    aria-label="Select all visible"
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-foreground)' }}>Guest</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-foreground)' }}>Contact</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-foreground)' }}>Added</th>
                <th className="text-center px-4 py-3 font-medium" style={{ color: 'var(--color-foreground)' }}>Status</th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--color-foreground)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((phase) => {
                const allPhaseSelected = phase.guests.every((g) => selectedIds.has(g.id))
                const phaseUnsentCount = phase.guests.filter((g) => g.email && g.rsvp_token && !g.invitation_sent).length
                return (
                  <React.Fragment key={phase.label}>
                    {/* Phase header row */}
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-2"
                        style={{
                          background: '#f5f0e8',
                          borderTop: '1px solid var(--color-highlight)',
                          borderBottom: '1px solid var(--color-highlight)',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={allPhaseSelected}
                            onChange={() => toggleSelectPhase(phase.guests)}
                            className="rounded"
                            aria-label={`Select all ${phase.label} guests`}
                          />
                          <button
                            onClick={() => togglePhaseCollapse(phase.label)}
                            className="flex items-center gap-3 bg-transparent border-none cursor-pointer p-0"
                            aria-label={collapsedPhases.has(phase.label) ? `Expand ${phase.label}` : `Collapse ${phase.label}`}
                          >
                            <svg
                              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                              style={{
                                color: 'var(--color-accent)',
                                transform: collapsedPhases.has(phase.label) ? 'rotate(-90deg)' : 'none',
                                transition: 'transform 0.15s',
                              }}
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
                              {phase.label}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                              Added {phase.date} · {phase.guests.length} {phase.guests.length === 1 ? 'guest' : 'guests'}
                            </span>
                          </button>
                          {phaseUnsentCount > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#fef9ee', color: '#92400e', border: '1px solid #fde68a' }}>
                              {phaseUnsentCount} un-sent
                            </span>
                          )}
                          {phaseUnsentCount === 0 && phase.guests.length > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                              All sent ✓
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Guest rows */}
                    {!collapsedPhases.has(phase.label) && phase.guests.map((guest, idx) => (
                      <tr
                        key={guest.id}
                        style={{
                          background: selectedIds.has(guest.id)
                            ? 'rgba(184,134,11,0.04)'
                            : idx % 2 === 0 ? 'var(--color-background)' : '#fdfcf8',
                          borderBottom: '1px solid var(--color-highlight)',
                        }}
                      >
                        <td className="px-4 py-3 w-8">
                          <input type="checkbox" checked={selectedIds.has(guest.id)} onChange={() => toggleSelect(guest.id)} className="rounded" />
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-medium" style={{ color: 'var(--color-foreground)' }}>{guest.name}</div>
                          {guest.household_group && (
                            <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{guest.household_group}</div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {guest.email && <div className="text-xs truncate max-w-[180px]" style={{ color: 'var(--color-muted)' }}>{guest.email}</div>}
                          {guest.phone && <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{guest.phone}</div>}
                          {!guest.email && !guest.phone && <span className="text-xs opacity-40" style={{ color: 'var(--color-muted)' }}>—</span>}
                        </td>

                        <td className="px-4 py-3">
                          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                            {new Date(guest.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleToggleSent(guest)}
                            disabled={togglingId === guest.id}
                            className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors disabled:opacity-50 cursor-pointer"
                            style={{
                              background: guest.invitation_sent ? '#f0fdf4' : '#f9fafb',
                              color: guest.invitation_sent ? '#166534' : '#6b7280',
                              borderColor: guest.invitation_sent ? '#bbf7d0' : '#e5e7eb',
                            }}
                            title={guest.invitation_sent ? 'Click to mark as not sent' : 'Click to mark as sent'}
                          >
                            {togglingId === guest.id ? (
                              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : guest.invitation_sent ? (
                              <>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Sent
                              </>
                            ) : (
                              'Not sent'
                            )}
                          </button>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {guest.rsvp_token && (
                              <button
                                onClick={() => handleCopyLink(guest)}
                                title="Copy invite link"
                                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                                style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
                              >
                                {copiedId === guest.id ? (
                                  <span style={{ color: '#166534' }}>Copied ✓</span>
                                ) : (
                                  <>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                    Copy link
                                  </>
                                )}
                              </button>
                            )}

                            {guest.email && guest.rsvp_token && (
                              <button
                                onClick={() => handleEmailInvite(guest)}
                                disabled={emailingId === guest.id}
                                title="Send invite email"
                                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-amber-50 disabled:opacity-50"
                                style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-accent)' }}
                              >
                                {emailingId === guest.id ? (
                                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" />
                                    </svg>
                                    Email
                                  </>
                                )}
                              </button>
                            )}

                            {guest.phone && guest.rsvp_token && (
                              <button
                                onClick={() => handleWhatsApp(guest)}
                                title="Send via WhatsApp"
                                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-green-50"
                                style={{ borderColor: 'var(--color-highlight)', color: '#16a34a' }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                                WhatsApp
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
