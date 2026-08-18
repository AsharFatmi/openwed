'use client'

import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { type Side, type DisplayGroup } from '@prisma/client'

type GoogleContact = { name: string; phone: string | null; email: string | null }

// ─── Types ────────────────────────────────────────────────────────────────────

type EventStub = { id: string; name: string; display_group: DisplayGroup }

type GuestRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  household_group: string | null
  invitation_sent: boolean
  rsvp_token: string | null
  notes: string | null
  arrival_date: string | null
  departure_date: string | null
  created_at: Date
  familyMembers: { id: string }[]
  rsvpResponses: { attending: boolean | null; dietary_restrictions: string | null }[]
  eventInvitations: { event_id: string }[]
}

type RsvpStatus = 'pending' | 'confirmed' | 'declined' | 'partial'

type SortCol = 'name' | 'email' | 'phone' | 'household_group' | 'familyCount' | 'rsvpStatus' | 'created_at'

type FormState = {
  name: string
  email: string
  countryCode: string
  phoneNumber: string
  address: string
  household_group: string
  notes: string
}

const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 +91' },
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+971', label: '🇦🇪 +971' },
  { code: '+61', label: '🇦🇺 +61' },
  { code: '+92', label: '🇵🇰 +92' },
  { code: '+966', label: '🇸🇦 +966' },
  { code: '+65', label: '🇸🇬 +65' },
  { code: '+49', label: '🇩🇪 +49' },
  { code: '+33', label: '🇫🇷 +33' },
]

function splitPhone(phone: string | null): { countryCode: string; phoneNumber: string } {
  if (!phone) return { countryCode: '+91', phoneNumber: '' }
  for (const c of COUNTRY_CODES) {
    if (phone.startsWith(c.code)) {
      return { countryCode: c.code, phoneNumber: phone.slice(c.code.length).trim() }
    }
  }
  // Unknown code — treat whole value as number
  return { countryCode: '+91', phoneNumber: phone }
}

const SIDE_ACCENT: Record<Side, string> = {
  bride: '#be185d',
  groom: '#1d4ed8',
}

const GROUP_LABELS: Record<DisplayGroup, string> = {
  bride: "Bride's Events",
  groom: "Groom's Events",
  joint: 'Joint Events',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRsvpStatus(responses: GuestRow['rsvpResponses']): RsvpStatus {
  if (responses.length === 0) return 'pending'
  const defined = responses.filter((r) => r.attending !== null)
  if (defined.length === 0) return 'pending'
  const allYes = defined.every((r) => r.attending === true)
  const allNo = defined.every((r) => r.attending === false)
  if (allYes) return 'confirmed'
  if (allNo) return 'declined'
  return 'partial'
}

function getDietaryNotes(responses: GuestRow['rsvpResponses']): string {
  return responses
    .map((r) => r.dietary_restrictions)
    .filter(Boolean)
    .join(', ')
}

const RSVP_LABELS: Record<RsvpStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  declined: 'Declined',
  partial: 'Partial',
}

const RSVP_STYLES: Record<RsvpStatus, { bg: string; color: string }> = {
  pending: { bg: '#f9fafb', color: '#6b7280' },
  confirmed: { bg: '#f0fdf4', color: '#166534' },
  declined: { bg: '#fef2f2', color: '#991b1b' },
  partial: { bg: '#fffbeb', color: '#92400e' },
}

function emptyForm(): FormState {
  return { name: '', email: '', countryCode: '+91', phoneNumber: '', address: '', household_group: '', notes: '' }
}

function formToPhone(f: FormState): string {
  if (!f.phoneNumber.trim()) return ''
  if (f.countryCode === 'other') return f.phoneNumber.trim()
  return `${f.countryCode}${f.phoneNumber.trim()}`
}

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(45,45,45,0.4)' }}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ border: '1px solid var(--color-highlight)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-highlight)' }}>
          <h2 className="text-lg font-medium" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
            {title}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Event checkboxes ────────────────────────────────────────────────────────

function EventCheckboxes({
  events,
  selected,
  onChange,
}: {
  events: EventStub[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  if (events.length === 0) return null

  const groups: Partial<Record<DisplayGroup, EventStub[]>> = {}
  for (const e of events) {
    if (!groups[e.display_group]) groups[e.display_group] = []
    groups[e.display_group]!.push(e)
  }
  const groupOrder: DisplayGroup[] = ['bride', 'groom', 'joint']

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>
          Invited to Events
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChange(events.map((e) => e.id))}
            className="text-xs underline"
            style={{ color: 'var(--color-accent)' }}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs underline"
            style={{ color: 'var(--color-muted)' }}
          >
            None
          </button>
        </div>
      </div>
      {groupOrder.map((group) => {
        const groupEvents = groups[group]
        if (!groupEvents?.length) return null
        return (
          <div key={group}>
            <p className="text-xs mb-1.5" style={{ color: 'var(--color-muted)' }}>
              {GROUP_LABELS[group]}
            </p>
            <div className="space-y-1.5">
              {groupEvents.map((ev) => (
                <label key={ev.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(ev.id)}
                    onChange={() => toggle(ev.id)}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>
                    {ev.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Guest form ───────────────────────────────────────────────────────────────

function GuestForm({
  initial,
  onSubmit,
  loading,
  error,
  accent,
  submitLabel,
  autoHousehold,
  contacts = [],
}: {
  initial: FormState
  onSubmit: (f: FormState) => void
  loading: boolean
  error: string
  accent: string
  submitLabel: string
  autoHousehold?: boolean
  contacts?: GoogleContact[]
}) {
  const [form, setForm] = useState<FormState>(initial)
  const [contactQuery, setContactQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const phoneWrapRef = useRef<HTMLDivElement>(null)

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'name' && autoHousehold) {
        const trimmed = value.trim()
        next.household_group = trimmed ? `${trimmed}'s Family` : ''
      }
      return next
    })
  }

  // Filter contacts by query (matches name or phone)
  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase()
    if (!q || contacts.length === 0) return []
    return contacts
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [contactQuery, contacts])

  function openDropdown() {
    if (!phoneWrapRef.current) return
    const rect = phoneWrapRef.current.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX, width: rect.width })
    setShowDropdown(true)
  }

  // Close dropdown on outside click
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (phoneWrapRef.current && !phoneWrapRef.current.contains(e.target as Node)) {
      setShowDropdown(false)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [handleClickOutside])

  function selectContact(c: GoogleContact) {
    const { countryCode, phoneNumber } = c.phone ? splitPhone(c.phone) : { countryCode: '+91', phoneNumber: '' }
    setForm((f) => ({
      ...f,
      name: f.name.trim() ? f.name : c.name,
      email: f.email.trim() ? f.email : (c.email ?? ''),
      countryCode,
      phoneNumber,
    }))
    setContactQuery('')
    setShowDropdown(false)
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors'
  const inputStyle = { borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form) }} className="space-y-4">
      {error && (
        <p className="text-sm py-2 px-3 rounded-lg" style={{ background: '#fef2f2', color: '#991b1b' }}>
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1 sm:col-span-2">
          <label className="block text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>Name *</label>
          <input type="text" value={form.name} onChange={set('name')} required className={inputCls} style={inputStyle} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>Email</label>
          <input type="email" value={form.email} onChange={set('email')} className={inputCls} style={inputStyle} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>
            Phone
            {contacts.length > 0 && (
              <span className="ml-1.5 font-normal" style={{ color: 'var(--color-muted)' }}>
                — type to search contacts
              </span>
            )}
          </label>
          <div className="flex gap-1 relative" ref={phoneWrapRef} style={{ position: 'relative' }}>
            <select
              value={form.countryCode}
              onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value }))}
              className="px-2 py-2 rounded-lg border text-sm outline-none bg-white"
              style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)', minWidth: '100px' }}
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
              <option value="other">Other…</option>
            </select>
            <div className="flex-1 relative">
              <input
                type="tel"
                value={contacts.length > 0 ? contactQuery || form.phoneNumber : form.phoneNumber}
                onChange={(e) => {
                  if (contacts.length > 0) {
                    setContactQuery(e.target.value)
                    setForm((f) => ({ ...f, phoneNumber: e.target.value }))
                    openDropdown()
                  } else {
                    setForm((f) => ({ ...f, phoneNumber: e.target.value }))
                  }
                }}
                onFocus={() => { if (contacts.length > 0) openDropdown() }}
                placeholder={form.countryCode === 'other' ? '+XX XXXXXXXXXX' : contacts.length > 0 ? 'Type name or number…' : 'Phone number'}
                className={`w-full ${inputCls}`}
                style={inputStyle}
                autoComplete="off"
              />
            </div>
          </div>
          {showDropdown && filteredContacts.length > 0 && dropdownPos && (
            <ul
              className="bg-white rounded-xl shadow-xl border overflow-hidden"
              style={{
                position: 'fixed',
                top: dropdownPos.top + 4,
                left: dropdownPos.left,
                width: dropdownPos.width,
                zIndex: 9999,
                borderColor: 'var(--color-highlight)',
              }}
            >
              {filteredContacts.map((c, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectContact(c) }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between gap-3"
                    style={{ color: 'var(--color-foreground)' }}
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs shrink-0" style={{ color: 'var(--color-muted)' }}>
                      {c.phone}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="block text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>Address</label>
          <input type="text" value={form.address} onChange={set('address')} className={inputCls} style={inputStyle} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="block text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>Household Group *</label>
          <input type="text" value={form.household_group} onChange={set('household_group')} required placeholder="e.g. Smith Family" className={inputCls} style={inputStyle} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="block text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2} className={inputCls} style={inputStyle} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
          style={{ background: accent }}
        >
          {loading ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GuestsClient({
  initialGuests,
  side,
  events,
  contacts = [],
  isGoogleConnected = false,
}: {
  initialGuests: GuestRow[]
  side: Side
  events: EventStub[]
  contacts?: GoogleContact[]
  isGoogleConnected?: boolean
}) {
  const accent = SIDE_ACCENT[side]
  const searchParams = useSearchParams()

  // ── Data state
  const [guests, setGuests] = useState<GuestRow[]>(initialGuests)

  // ── Google Contacts sync state
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncMessage, setSyncMessage] = useState(() => {
    const status = searchParams.get('contacts')
    const count = searchParams.get('count')
    if (status === 'synced') return `✓ ${count ?? '0'} contacts synced from Google`
    if (status === 'denied') return ''
    if (status === 'error') return 'Google connection failed — please try again'
    return ''
  })

  // ── Filter / search / sort / pagination state
  const [search, setSearch] = useState('')
  const [rsvpFilter, setRsvpFilter] = useState<'' | RsvpStatus>('')
  const [householdFilter, setHouseholdFilter] = useState('')
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'created_at', dir: 'desc' })

  // ── Modal state
  const [showAdd, setShowAdd] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [addInvitedEventIds, setAddInvitedEventIds] = useState<string[]>([])

  const [editGuest, setEditGuest] = useState<GuestRow | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [editInvitedEventIds, setEditInvitedEventIds] = useState<string[]>([])

  const [deleteGuest, setDeleteGuest] = useState<GuestRow | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // ── Bulk invite state
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set())
  const [showBulkInvite, setShowBulkInvite] = useState(false)
  const [bulkInviteEventIds, setBulkInviteEventIds] = useState<string[]>([])
  const [bulkInviteMode, setBulkInviteMode] = useState<'add' | 'remove'>('add')
  const [bulkInviteLoading, setBulkInviteLoading] = useState(false)
  const [bulkInviteError, setBulkInviteError] = useState('')

  // ── Import state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)

  // ── Derived: unique household groups
  const householdGroups = useMemo(() => {
    const groups = guests.map((g) => g.household_group).filter(Boolean) as string[]
    return [...new Set(groups)].sort()
  }, [guests])

  // ── Filtering + sorting + pagination
  const filtered = useMemo(() => {
    let list = guests.map((g) => ({
      ...g,
      _rsvpStatus: getRsvpStatus(g.rsvpResponses),
      _familyCount: g.familyMembers.length,
      _dietary: getDietaryNotes(g.rsvpResponses),
    }))

    if (rsvpFilter) list = list.filter((g) => g._rsvpStatus === rsvpFilter)
    if (householdFilter) list = list.filter((g) => g.household_group === householdFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.email ?? '').toLowerCase().includes(q) ||
          (g.phone ?? '').toLowerCase().includes(q)
      )
    }

    // Sort
    list.sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      if (sort.col === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase() }
      else if (sort.col === 'email') { av = (a.email ?? '').toLowerCase(); bv = (b.email ?? '').toLowerCase() }
      else if (sort.col === 'phone') { av = (a.phone ?? '').toLowerCase(); bv = (b.phone ?? '').toLowerCase() }
      else if (sort.col === 'household_group') { av = (a.household_group ?? '').toLowerCase(); bv = (b.household_group ?? '').toLowerCase() }
      else if (sort.col === 'familyCount') { av = a._familyCount; bv = b._familyCount }
      else if (sort.col === 'rsvpStatus') { av = a._rsvpStatus; bv = b._rsvpStatus }
      else if (sort.col === 'created_at') { av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime() }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [guests, search, rsvpFilter, householdFilter, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  function handleSort(col: SortCol) {
    setSort((s) => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
    setPage(1)
  }

  function resetPage() { setPage(1) }

  // ── Add guest
  async function handleAdd(form: FormState) {
    setAddError('')
    setAddLoading(true)
    const { countryCode: _cc, phoneNumber: _pn, ...rest } = form
    const res = await fetch('/api/admin/guests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rest, phone: formToPhone(form), invitedEventIds: addInvitedEventIds }),
    })
    setAddLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setAddError(data.error ?? 'Failed to add guest.')
      return
    }
    const data = await res.json()
    setGuests((prev) => [data.guest, ...prev])
    setShowAdd(false)
  }

  // ── Edit guest
  async function handleEdit(form: FormState) {
    if (!editGuest) return
    setEditError('')
    setEditLoading(true)
    const { countryCode: _cc, phoneNumber: _pn, ...rest } = form
    const res = await fetch(`/api/admin/guests/${editGuest.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rest, phone: formToPhone(form), invitedEventIds: editInvitedEventIds }),
    })
    setEditLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setEditError(data.error ?? 'Failed to update guest.')
      return
    }
    const data = await res.json()
    setGuests((prev) => prev.map((g) => g.id === editGuest.id ? data.guest : g))
    setEditGuest(null)
  }

  // ── Bulk invite
  async function handleBulkInvite() {
    setBulkInviteError('')
    setBulkInviteLoading(true)
    const res = await fetch('/api/admin/guests/bulk-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guestIds: Array.from(selectedGuestIds),
        eventIds: bulkInviteEventIds,
        mode: bulkInviteMode,
      }),
    })
    setBulkInviteLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setBulkInviteError(data.error ?? 'Failed to update invitations.')
      return
    }
    // Optimistically update invitation state for affected guests
    setGuests((prev) =>
      prev.map((g) => {
        if (!selectedGuestIds.has(g.id)) return g
        let updatedInvitations = [...g.eventInvitations]
        if (bulkInviteMode === 'add') {
          const existing = new Set(updatedInvitations.map((i) => i.event_id))
          for (const eid of bulkInviteEventIds) {
            if (!existing.has(eid)) updatedInvitations.push({ event_id: eid })
          }
        } else {
          const removing = new Set(bulkInviteEventIds)
          updatedInvitations = updatedInvitations.filter((i) => !removing.has(i.event_id))
        }
        return { ...g, eventInvitations: updatedInvitations }
      })
    )
    setShowBulkInvite(false)
    setSelectedGuestIds(new Set())
  }

  // ── Delete guest
  async function handleDelete() {
    if (!deleteGuest) return
    setDeleteLoading(true)
    const res = await fetch(`/api/admin/guests/${deleteGuest.id}`, { method: 'DELETE' })
    setDeleteLoading(false)
    if (!res.ok) return
    setGuests((prev) => prev.filter((g) => g.id !== deleteGuest.id))
    setDeleteGuest(null)
  }

  // ── Google Contacts sync
  async function handleGoogleSync() {
    setSyncLoading(true)
    setSyncMessage('')
    const res = await fetch('/api/admin/google/contacts/sync', { method: 'POST' })
    setSyncLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setSyncMessage(data.error ?? 'Sync failed — please try again')
      return
    }
    const data = await res.json()
    setSyncMessage(`✓ ${data.count} contacts synced from Google`)
    // Refresh page to load new contacts into GuestForm
    window.location.reload()
  }

  // ── CSV import
  function downloadImportTemplate() {
    const csv = [
      'name,email,phone,address,household_group',
      'Jane Smith,jane@example.com,+1-555-0100,123 Main St,Smith Family',
      'John Doe,,,,',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'guests-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setShowImportModal(false)
    setImportMessage('')
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result as string
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length < 2) { setImportMessage('CSV must have a header row and at least one data row.'); return }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))
      const colIdx = (col: string) => headers.indexOf(col)
      const nameIdx = colIdx('name')
      if (nameIdx === -1) { setImportMessage('CSV must have a "name" column.'); return }

      const rows = lines.slice(1).map((line) => {
        const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
        return {
          name: cells[nameIdx] ?? '',
          email: cells[colIdx('email')] ?? '',
          phone: cells[colIdx('phone')] ?? '',
          address: cells[colIdx('address')] ?? '',
          household_group: cells[colIdx('household_group')] ?? '',
        }
      }).filter((r) => r.name)

      if (rows.length === 0) { setImportMessage('No valid rows found.'); return }

      setImportLoading(true)
      const res = await fetch('/api/admin/guests/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      setImportLoading(false)
      if (!file) return
      // reset file input
      if (fileInputRef.current) fileInputRef.current.value = ''

      if (!res.ok) {
        const data = await res.json()
        setImportMessage(data.error ?? 'Import failed.')
        return
      }
      const data = await res.json()
      setGuests((prev) => [...data.guests, ...prev.filter((g) => !data.guests.find((ng: GuestRow) => ng.id === g.id))])
      setImportMessage(`✓ Imported ${data.imported} guest${data.imported !== 1 ? 's' : ''}.`)
    }
    reader.readAsText(file)
  }

  // ── CSV export
  function handleExport() {
    const header = ['Name', 'Email', 'Phone', 'Address', 'Household Group', 'RSVP Status', 'Family Members', 'Dietary Notes']
    const rows = filtered.map((g) => [
      g.name,
      g.email ?? '',
      g.phone ?? '',
      g.address ?? '',
      g.household_group ?? '',
      RSVP_LABELS[g._rsvpStatus],
      String(g._familyCount),
      g._dietary,
    ].map(csvEscape).join(','))
    const csv = [header.map(csvEscape).join(','), ...rows].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `guests-${side}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Sort indicator
  function SortIcon({ col }: { col: SortCol }) {
    if (sort.col !== col) return <span className="opacity-20 ml-1">↕</span>
    return <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>
  }

  const thCls = 'px-4 py-3 text-left text-xs font-medium tracking-wide cursor-pointer select-none whitespace-nowrap'

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-light tracking-wide"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
          >
            Guest List
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
            {guests.length} total guest{guests.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Google Contacts */}
          {isGoogleConnected ? (
            <>
              <button
                onClick={handleGoogleSync}
                disabled={syncLoading}
                className="text-xs px-4 py-2 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
                style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                {syncLoading ? 'Syncing…' : `Sync Contacts${contacts.length > 0 ? ` (${contacts.length})` : ''}`}
              </button>
              <a
                href="/api/admin/google/auth"
                title="Reconnect if sync fails — Google tokens expire"
                className="text-xs px-4 py-2 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50 flex items-center gap-1.5"
                style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
              >
                Reconnect
              </a>
            </>
          ) : (
            <a
              href="/api/admin/google/auth"
              className="text-xs px-4 py-2 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50 flex items-center gap-1.5"
              style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              Connect Google Contacts
            </a>
          )}

          {/* Import */}
          <button
            onClick={() => { setShowImportModal(true); setImportMessage('') }}
            disabled={importLoading}
            className="text-xs px-4 py-2 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
            style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            {importLoading ? 'Importing…' : 'Import CSV'}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} disabled={importLoading} />

          {/* Export */}
          <button
            onClick={handleExport}
            className="text-xs px-4 py-2 rounded-lg border transition-colors hover:bg-gray-50 flex items-center gap-1.5"
            style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Export CSV
          </button>

          {/* Bulk invite — only when guests selected */}
          {selectedGuestIds.size > 0 && (
            <button
              onClick={() => {
                setBulkInviteEventIds(events.map((e) => e.id))
                setBulkInviteMode('add')
                setBulkInviteError('')
                setShowBulkInvite(true)
              }}
              className="text-xs px-4 py-2 rounded-lg border font-medium flex items-center gap-1.5"
              style={{ borderColor: accent, color: accent }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              Assign Events ({selectedGuestIds.size})
            </button>
          )}

          {/* Add guest */}
          <button
            onClick={() => { setShowAdd(true); setAddError(''); setAddInvitedEventIds(events.map((e) => e.id)) }}
            className="text-xs px-4 py-2 rounded-lg text-white font-medium flex items-center gap-1.5"
            style={{ background: accent }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Guest
          </button>
        </div>
      </div>

      {/* Sync message */}
      {syncMessage && (
        <div
          className="text-sm py-2 px-4 rounded-lg"
          style={{
            background: syncMessage.startsWith('✓') ? '#f0fdf4' : '#fef2f2',
            color: syncMessage.startsWith('✓') ? '#166534' : '#991b1b',
          }}
        >
          {syncMessage}
        </div>
      )}

      {/* Import message */}
      {importMessage && (
        <div
          className="text-sm py-2 px-4 rounded-lg flex items-center gap-3"
          style={{
            background: importMessage.startsWith('✓') ? '#f0fdf4' : '#fef2f2',
            color: importMessage.startsWith('✓') ? '#166534' : '#991b1b',
          }}
        >
          <span>{importMessage}</span>
          {importMessage.startsWith('✓') && (
            <a
              href="/admin/invitations"
              className="underline text-xs font-medium whitespace-nowrap"
              style={{ color: '#166534' }}
            >
              Review invitations →
            </a>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-muted)' }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search name, email, phone…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage() }}
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
          />
        </div>

        {/* RSVP filter */}
        <select
          value={rsvpFilter}
          onChange={(e) => { setRsvpFilter(e.target.value as '' | RsvpStatus); resetPage() }}
          className="px-3 py-2 rounded-lg border text-sm outline-none bg-white"
          style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
        >
          <option value="">All RSVP statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="declined">Declined</option>
          <option value="partial">Partial</option>
        </select>

        {/* Household filter */}
        {householdGroups.length > 0 && (
          <select
            value={householdFilter}
            onChange={(e) => { setHouseholdFilter(e.target.value); resetPage() }}
            className="px-3 py-2 rounded-lg border text-sm outline-none bg-white"
            style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
          >
            <option value="">All households</option>
            {householdGroups.map((hg) => (
              <option key={hg} value={hg}>{hg}</option>
            ))}
          </select>
        )}

        {/* Per page */}
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value) as 25 | 50 | 100); resetPage() }}
          className="px-3 py-2 rounded-lg border text-sm outline-none bg-white"
          style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
        >
          <option value={25}>25 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
        </select>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: 'var(--color-highlight)' }}
      >
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {guests.length === 0
                ? 'No guests yet. Add your first guest above.'
                : 'No guests match your filters.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: '#faf9f4', borderBottom: '1px solid var(--color-highlight)' }}>
                  <tr>
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={pageItems.length > 0 && pageItems.every((g) => selectedGuestIds.has(g.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedGuestIds((prev) => {
                              const next = new Set(prev)
                              pageItems.forEach((g) => next.add(g.id))
                              return next
                            })
                          } else {
                            setSelectedGuestIds((prev) => {
                              const next = new Set(prev)
                              pageItems.forEach((g) => next.delete(g.id))
                              return next
                            })
                          }
                        }}
                      />
                    </th>
                    <th className={thCls} style={{ color: 'var(--color-muted)' }} onClick={() => handleSort('name')}>
                      Name <SortIcon col="name" />
                    </th>
                    <th className={thCls} style={{ color: 'var(--color-muted)' }} onClick={() => handleSort('email')}>
                      Email <SortIcon col="email" />
                    </th>
                    <th className={thCls} style={{ color: 'var(--color-muted)' }} onClick={() => handleSort('phone')}>
                      Phone <SortIcon col="phone" />
                    </th>
                    <th className={thCls} style={{ color: 'var(--color-muted)' }} onClick={() => handleSort('household_group')}>
                      Household <SortIcon col="household_group" />
                    </th>
                    <th className={thCls + ' text-center'} style={{ color: 'var(--color-muted)' }} onClick={() => handleSort('familyCount')}>
                      +Family <SortIcon col="familyCount" />
                    </th>
                    <th className={thCls} style={{ color: 'var(--color-muted)' }} onClick={() => handleSort('rsvpStatus')}>
                      RSVP <SortIcon col="rsvpStatus" />
                    </th>
                    <th className={thCls} style={{ color: 'var(--color-muted)' }}>
                      Dietary
                    </th>
                    <th className={thCls} style={{ color: 'var(--color-muted)' }}>
                      Arriving
                    </th>
                    <th className={thCls} style={{ color: 'var(--color-muted)' }}>
                      Leaving
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium tracking-wide" style={{ color: 'var(--color-muted)', position: 'sticky', right: 0, background: '#faf9f4', zIndex: 1 }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--color-highlight)' }}>
                  {pageItems.map((guest) => {
                    const rsvpStyle = RSVP_STYLES[guest._rsvpStatus]
                    return (
                      <tr key={guest.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 w-8">
                          <input
                            type="checkbox"
                            checked={selectedGuestIds.has(guest.id)}
                            onChange={(e) => {
                              setSelectedGuestIds((prev) => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(guest.id)
                                else next.delete(guest.id)
                                return next
                              })
                            }}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-foreground)' }}>
                          {guest.name}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--color-muted)' }}>
                          {guest.email ?? <span className="opacity-40">—</span>}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--color-muted)' }}>
                          {guest.phone ?? <span className="opacity-40">—</span>}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--color-muted)' }}>
                          {guest.household_group ?? <span className="opacity-40">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center" style={{ color: 'var(--color-muted)' }}>
                          {guest._familyCount > 0 ? (
                            <span className="font-medium" style={{ color: 'var(--color-foreground)' }}>+{guest._familyCount}</span>
                          ) : (
                            <span className="opacity-40">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={rsvpStyle}
                          >
                            {RSVP_LABELS[guest._rsvpStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[160px] truncate" style={{ color: 'var(--color-muted)' }}>
                          {guest._dietary || <span className="opacity-40">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-muted)' }}>
                          {guest.arrival_date || <span className="opacity-40">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-muted)' }}>
                          {guest.departure_date || <span className="opacity-40">—</span>}
                        </td>
                        <td className="px-4 py-3" style={{ position: 'sticky', right: 0, background: 'var(--color-background)', zIndex: 1 }}>
                          <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                            {/* Invitation sent badge */}
                            {guest.invitation_sent && (
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                                ✉ Sent
                              </span>
                            )}
                            <button
                              onClick={() => {
                                setEditGuest(guest)
                                setEditError('')
                                setEditInvitedEventIds(guest.eventInvitations.map((i) => i.event_id))
                              }}
                              className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                              style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeleteGuest(guest)}
                              className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-red-50"
                              style={{ borderColor: '#fca5a5', color: '#991b1b' }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div
              className="flex items-center justify-between px-4 py-3 border-t text-sm"
              style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
            >
              <span>
                Showing {Math.min((safePage - 1) * pageSize + 1, filtered.length)}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length} guest{filtered.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="px-3 py-1 rounded-lg border text-xs disabled:opacity-40 transition-colors hover:bg-gray-50"
                  style={{ borderColor: 'var(--color-highlight)' }}
                >
                  Previous
                </button>
                <span className="text-xs">
                  {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="px-3 py-1 rounded-lg border text-xs disabled:opacity-40 transition-colors hover:bg-gray-50"
                  style={{ borderColor: 'var(--color-highlight)' }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Import modal */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(45,45,45,0.5)' }}
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-sm p-6 space-y-5"
            style={{ background: 'var(--color-background)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-light" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                Import Guests
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                Columns: <span style={{ color: 'var(--color-foreground)' }}>name</span> (required), email, phone, address, household_group
              </p>
            </div>

            {/* Step 1 — download template */}
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide" style={{ color: 'var(--color-muted)' }}>
                STEP 1 — Download &amp; fill the template
              </p>
              <button
                onClick={downloadImportTemplate}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm border rounded-sm transition-colors hover:opacity-90"
                style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download Template (.csv)
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: 'var(--color-highlight)' }} />
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>then</span>
              <div className="flex-1 h-px" style={{ background: 'var(--color-highlight)' }} />
            </div>

            {/* Step 2 — upload filled file */}
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide" style={{ color: 'var(--color-muted)' }}>
                STEP 2 — Upload your filled CSV
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-white rounded-sm transition-colors hover:opacity-90"
                style={{ background: accent }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Choose CSV File
              </button>
            </div>

            <button
              onClick={() => setShowImportModal(false)}
              className="w-full py-2 text-sm border rounded-sm"
              style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <Modal title="Add Guest" onClose={() => setShowAdd(false)}>
          <div className="space-y-5">
            <GuestForm
              initial={emptyForm()}
              onSubmit={handleAdd}
              loading={addLoading}
              error={addError}
              accent={accent}
              submitLabel="Add Guest"
              autoHousehold
              contacts={contacts}
            />
            {events.length > 0 && (
              <div className="border-t pt-4" style={{ borderColor: 'var(--color-highlight)' }}>
                <EventCheckboxes
                  events={events}
                  selected={addInvitedEventIds}
                  onChange={setAddInvitedEventIds}
                />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editGuest && (
        <Modal title="Edit Guest" onClose={() => setEditGuest(null)}>
          <div className="space-y-5">
            <GuestForm
              initial={{
                name: editGuest.name,
                email: editGuest.email ?? '',
                ...splitPhone(editGuest.phone),
                address: editGuest.address ?? '',
                household_group: editGuest.household_group ?? '',
                notes: editGuest.notes ?? '',
              }}
              onSubmit={handleEdit}
              loading={editLoading}
              error={editError}
              accent={accent}
              submitLabel="Save Changes"
              contacts={contacts}
            />
            {events.length > 0 && (
              <div className="border-t pt-4" style={{ borderColor: 'var(--color-highlight)' }}>
                <EventCheckboxes
                  events={events}
                  selected={editInvitedEventIds}
                  onChange={setEditInvitedEventIds}
                />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteGuest && (
        <Modal title="Delete Guest" onClose={() => setDeleteGuest(null)}>
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--color-foreground)' }}>
              Are you sure you want to delete <strong>{deleteGuest.name}</strong>? This will also remove all their RSVP responses and family members.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteGuest(null)}
                className="px-4 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                style={{ background: '#dc2626' }}
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk invite modal */}
      {showBulkInvite && (
        <Modal title="Assign Events" onClose={() => setShowBulkInvite(false)}>
          <div className="space-y-5">
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {selectedGuestIds.size} guest{selectedGuestIds.size !== 1 ? 's' : ''} selected
            </p>

            {/* Mode selector */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--color-foreground)' }}>
                <input
                  type="radio"
                  name="bulkMode"
                  checked={bulkInviteMode === 'add'}
                  onChange={() => setBulkInviteMode('add')}
                />
                Add to events
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--color-foreground)' }}>
                <input
                  type="radio"
                  name="bulkMode"
                  checked={bulkInviteMode === 'remove'}
                  onChange={() => setBulkInviteMode('remove')}
                />
                Remove from events
              </label>
            </div>

            <EventCheckboxes
              events={events}
              selected={bulkInviteEventIds}
              onChange={setBulkInviteEventIds}
            />

            {bulkInviteError && (
              <p className="text-sm py-2 px-3 rounded-lg" style={{ background: '#fef2f2', color: '#991b1b' }}>
                {bulkInviteError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowBulkInvite(false)}
                className="px-4 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkInvite}
                disabled={bulkInviteLoading || bulkInviteEventIds.length === 0}
                className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                style={{ background: accent }}
              >
                {bulkInviteLoading ? 'Saving…' : 'Apply'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
