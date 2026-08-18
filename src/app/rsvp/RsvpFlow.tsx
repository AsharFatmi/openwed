'use client'

import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import confetti from 'canvas-confetti'
import { format } from 'date-fns'
import { type DisplayGroup } from '@prisma/client'
import { HIGH_CONFIDENCE } from '@/lib/duplicate-match'

// ─── Types ────────────────────────────────────────────────────────────────────

type EventStub = {
  id: string
  name: string
  date: string
  start_time: string | null
  display_group: DisplayGroup
  sort_order: number
}

type GuestDetail = {
  id: string
  name: string
  email: string | null
  phone: string | null
  arrival_date: string | null
  departure_date: string | null
}

type ExistingRsvp = {
  event_id: string
  attending: boolean | null
  dietary_restrictions: string | null
}

type ExistingFamilyMember = {
  id: string
  name: string
  is_child: boolean
  rsvps: ExistingRsvp[]
}

type HouseholdMember = {
  id: string
  name: string
  rsvps: ExistingRsvp[]
}

type FormData = {
  guest: GuestDetail
  events: EventStub[]
  rsvpResponses: ExistingRsvp[]
  familyMembers: ExistingFamilyMember[]
  householdMembers: HouseholdMember[]
}

type AttendingEventDetail = {
  id: string
  name: string
  date: string
  start_time: string | null
  end_time: string | null
  venue_name: string | null
  venue_address: string | null
  description: string | null
  dress_code: string | null
}

type ConfirmationData = {
  guestName: string
  attendingEvents: string[]
  attendingEventDetails: AttendingEventDetail[]
  familyMemberNames: string[]
  overallAttending: boolean | null
}

type FamilyMemberRow = {
  _localId: string
  id?: string              // existing FamilyMember DB id
  linked_guest_id?: string // existing Guest linked via search
  name: string
  is_child: boolean
  rsvps: Map<string, { attending: boolean | null; dietary: string }>
}

type GuestSearchResult = {
  id: string
  name: string
  fuzzy?: boolean
  confidence?: number
}

type Step = 'form' | 'confirmation'

// ─── Constants ────────────────────────────────────────────────────────────────

const GROUP_ORDER: DisplayGroup[] = ['bride', 'groom', 'joint']

const GROUP_LABELS: Record<DisplayGroup, string> = {
  bride: "Bride's Celebrations",
  groom: "Groom's Celebrations",
  joint: 'Wedding Celebrations',
}

const GROUP_ACCENT: Record<DisplayGroup, string> = {
  bride: '#be185d',
  groom: '#1d4ed8',
  joint: 'var(--color-accent)',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localId() {
  return Math.random().toString(36).slice(2)
}

function formatEventDate(date: string) {
  return format(new Date(date), 'EEE, MMM d')
}

// ─── Calendar helpers ─────────────────────────────────────────────────────────

// Event times are in IST (UTC+5:30)
const IST_OFFSET_MINUTES = 330

function parseTimeString(s: string): { hours: number; minutes: number } | null {
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (m12) {
    let h = parseInt(m12[1]!, 10)
    const min = parseInt(m12[2]!, 10)
    if (m12[3]!.toUpperCase() === 'PM' && h !== 12) h += 12
    if (m12[3]!.toUpperCase() === 'AM' && h === 12) h = 0
    return { hours: h, minutes: min }
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/)
  if (m24) return { hours: parseInt(m24[1]!, 10), minutes: parseInt(m24[2]!, 10) }
  return null
}

function toUtcDateStr(isoDate: string, timeStr: string | null, addHours = 0): string | null {
  if (!timeStr) return null
  const parts = isoDate.substring(0, 10).split('-').map(Number) as [number, number, number]
  const [year, month, day] = parts
  const t = parseTimeString(timeStr)
  if (!t) return null
  const ms = Date.UTC(year, month - 1, day, t.hours + addHours, t.minutes, 0) - IST_OFFSET_MINUTES * 60_000
  const d = new Date(ms)
  return (
    String(d.getUTCFullYear()) +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0') +
    'T' +
    String(d.getUTCHours()).padStart(2, '0') +
    String(d.getUTCMinutes()).padStart(2, '0') +
    '00Z'
  )
}

function buildGoogleCalendarUrl(ev: AttendingEventDetail): string {
  const start = toUtcDateStr(ev.date, ev.start_time)
  const end = ev.end_time
    ? toUtcDateStr(ev.date, ev.end_time)
    : start
    ? toUtcDateStr(ev.date, ev.start_time, 2)
    : null
  const datePart = ev.date.substring(0, 10).replace(/-/g, '')
  const dates = start && end ? `${start}/${end}` : `${datePart}/${datePart}`
  const params = new URLSearchParams({ action: 'TEMPLATE', text: `${ev.name} – Aarav & Ananya`, dates })
  const loc = [ev.venue_name, ev.venue_address].filter(Boolean).join(', ')
  if (loc) params.set('location', loc)
  const descParts = [ev.description, ev.dress_code ? `Dress code: ${ev.dress_code}` : null].filter(Boolean)
  if (descParts.length) params.set('details', descParts.join('\n'))
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// ─── FamilyMemberCombobox ─────────────────────────────────────────────────────

export type FamilyMemberComboboxHandle = { focusAndSearch: () => void }

const FamilyMemberCombobox = forwardRef<FamilyMemberComboboxHandle, {
  value: string
  linkedGuestId?: string
  token: string | null
  onSelect: (guest: GuestSearchResult | null, typedName: string) => void
  onClear: () => void
}>(function FamilyMemberCombobox({
  value,
  linkedGuestId,
  token,
  onSelect,
  onClear,
}, ref) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<GuestSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null)
  const [confirmCreate, setConfirmCreate] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Highest-confidence fuzzy match in the current results — if at/above
  // HIGH_CONFIDENCE, "Add as new guest" prompts "create anyway?" so a near-
  // duplicate family member is never created by accident.
  const bestFuzzy = results.find((r) => r.fuzzy && (r.confidence ?? 0) >= HIGH_CONFIDENCE)

  const runSearch = useCallback(async (v: string) => {
    setLoading(true)
    try {
      const url = token
        ? `/api/public/guests/search?q=${encodeURIComponent(v)}&token=${encodeURIComponent(token)}`
        : `/api/public/guests/search?q=${encodeURIComponent(v)}`
      const res = await fetch(url)
      const data = (await res.json()) as { guests: GuestSearchResult[] }
      setResults(data.guests)
      setSearchedQuery(v)
      setOpen(data.guests.length > 0)
      setConfirmCreate(false)
    } finally {
      setLoading(false)
    }
  }, [token])

  // Exposed to the parent row's ✎ affordance: focus + select the name input
  // and re-run the search so a corrected/variant spelling finds the existing
  // guest instead of creating a duplicate.
  useImperativeHandle(ref, () => ({
    focusAndSearch: () => {
      inputRef.current?.focus()
      inputRef.current?.select()
      if (query.trim().length >= 2) runSearch(query.trim())
    },
  }), [query, runSearch])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    setSearchedQuery(null)
    onSelect(null, v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim().length < 2) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(() => runSearch(v), 300)
  }

  function handlePick(guest: GuestSearchResult) {
    setQuery(guest.name)
    setResults([])
    setOpen(false)
    setSearchedQuery(null)
    setConfirmCreate(false)
    onSelect(guest, guest.name)
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search guest name…"
          className="flex-1 px-3 py-2 text-sm border rounded-sm outline-none"
          style={{
            borderColor: linkedGuestId ? 'var(--color-accent)' : 'var(--color-highlight)',
            background: 'white',
          }}
        />
        {linkedGuestId && (
          <button
            type="button"
            onClick={() => { setQuery(''); onClear(); setResults([]); setOpen(false); setSearchedQuery(null) }}
            className="text-xs px-2 py-1 rounded-sm shrink-0"
            style={{ color: 'var(--color-muted)' }}
            title="Clear selection"
          >
            ✕
          </button>
        )}
      </div>
      {linkedGuestId && (
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-accent)' }}>
          Linked from guest list
        </p>
      )}
      {!linkedGuestId && loading && (
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>Searching…</p>
      )}
      {!linkedGuestId && !loading && searchedQuery && results.length === 0 && (
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
          Not in guest list — will be added as a new guest
        </p>
      )}
      {open && results.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1 border rounded-sm shadow-md z-20 overflow-y-auto max-h-48"
          style={{ background: 'white', borderColor: 'var(--color-highlight)' }}
        >
          {results.map((g) => (
            <button
              key={g.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handlePick(g) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors"
              style={{ color: 'var(--color-foreground)' }}
            >
              {g.name}
              {g.fuzzy && (
                <span className="ml-2 text-xs italic" style={{ color: 'var(--color-muted)' }}>
                  similar
                </span>
              )}
            </button>
          ))}
          {confirmCreate ? (
            <div
              className="w-full px-3 py-2 text-xs border-t space-y-1.5"
              style={{ borderColor: 'var(--color-highlight)', background: '#fff8ee' }}
            >
              <p style={{ color: 'var(--color-foreground)' }}>
                Looks like <strong>{bestFuzzy?.name}</strong> — add &ldquo;{query}&rdquo; as a new guest anyway?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setOpen(false)
                    setResults([])
                    setSearchedQuery(query)
                    setConfirmCreate(false)
                  }}
                  className="px-2 py-1 rounded-sm text-xs"
                  style={{ background: 'var(--color-accent)', color: 'white' }}
                >
                  Create anyway
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setConfirmCreate(false) }}
                  className="px-2 py-1 rounded-sm text-xs border"
                  style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                if (bestFuzzy) {
                  setConfirmCreate(true)
                  return
                }
                setOpen(false)
                setResults([])
                setSearchedQuery(query)
              }}
              className="w-full text-left px-3 py-2 text-xs border-t"
              style={{ color: 'var(--color-muted)', borderColor: 'var(--color-highlight)' }}
            >
              Add &ldquo;{query}&rdquo; as new guest
            </button>
          )}
        </div>
      )}
    </div>
  )
})

// LookupStep removed — RSVP access is now via per-guest magic link only

// ─── RsvpFormStep ─────────────────────────────────────────────────────────────

function RsvpFormStep({
  guestId,
  token,
  formData,
  onSubmit,
}: {
  guestId: string
  token: string | null
  formData: FormData
  onSubmit: (data: ConfirmationData) => void
}) {
  const {
    guest,
    events,
    rsvpResponses,
    familyMembers: existingFamilyMembers,
    householdMembers = [],
  } = formData

  // Pre-populate guest RSVP map
  const initGuestRsvps = () => {
    const m = new Map<string, { attending: boolean | null; dietary: string }>()
    for (const e of events) {
      const existing = rsvpResponses.find((r) => r.event_id === e.id)
      m.set(e.id, {
        attending: existing?.attending ?? null,
        dietary: existing?.dietary_restrictions ?? '',
      })
    }
    return m
  }

  const initFamilyMembers = (): FamilyMemberRow[] => {
    const rows: FamilyMemberRow[] = existingFamilyMembers.map((fm) => {
      const rsvpMap = new Map<string, { attending: boolean | null; dietary: string }>()
      for (const e of events) {
        const existing = fm.rsvps.find((r) => r.event_id === e.id)
        rsvpMap.set(e.id, {
          attending: existing?.attending ?? null,
          dietary: existing?.dietary_restrictions ?? '',
        })
      }
      return { _localId: localId(), id: fm.id, name: fm.name, is_child: fm.is_child, rsvps: rsvpMap }
    })

    // Return visit only: seed responded household peers as linked editable rows
    if (rsvpResponses.length > 0) {
      const existingNames = new Set(rows.map((r) => r.name.trim().toLowerCase()))
      for (const member of householdMembers) {
        if (existingNames.has(member.name.trim().toLowerCase())) continue
        const rsvpMap = new Map<string, { attending: boolean | null; dietary: string }>()
        for (const e of events) {
          const existing = member.rsvps.find((r) => r.event_id === e.id)
          rsvpMap.set(e.id, {
            attending: existing?.attending ?? null,
            dietary: existing?.dietary_restrictions ?? '',
          })
        }
        rows.push({
          _localId: localId(),
          linked_guest_id: member.id,
          name: member.name,
          is_child: false,
          rsvps: rsvpMap,
        })
        existingNames.add(member.name.trim().toLowerCase())
      }
    }

    return rows
  }

  const [email, setEmail] = useState(guest.email ?? '')
  const [phone, setPhone] = useState(guest.phone ?? '')
  const [arrivalDate, setArrivalDate] = useState(guest.arrival_date ?? '')
  const [departureDate, setDepartureDate] = useState(guest.departure_date ?? '')
  const [guestName, setGuestName] = useState(guest.name)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(guest.name)
  const [guestRsvps, setGuestRsvps] = useState<Map<string, { attending: boolean | null; dietary: string }>>(initGuestRsvps)

  // Independent top-level toggle — seeded from existing responses if present
  const [overallAttending, setOverallAttending] = useState<boolean | null>(() => {
    if (rsvpResponses.length === 0) return null
    if (rsvpResponses.every((r) => r.attending === true)) return true
    if (rsvpResponses.every((r) => r.attending === false)) return false
    return null
  })

  function fireConfetti() {
    const colors = ['#B8860B', '#E8D5C4', '#A3B18A', '#ffffff', '#f5c842']
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors })
    setTimeout(() => confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.65 }, colors }), 150)
    setTimeout(() => confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.65 }, colors }), 300)
  }

  function fireSadEmojis() {
    const emojis = ['😢', '😞', '😔', '💔', '😿']
    const count = 18
    for (let i = 0; i < count; i++) {
      const emoji = emojis[i % emojis.length]
      const el = document.createElement('span')
      el.textContent = emoji
      el.style.cssText = `position:fixed;font-size:${Math.random() * 16 + 20}px;left:${Math.random() * 100}vw;top:-40px;pointer-events:none;z-index:9999;transition:none;`
      document.body.appendChild(el)
      const duration = Math.random() * 1500 + 1500
      const sway = (Math.random() - 0.5) * 120
      el.animate(
        [
          { transform: 'translateY(0) translateX(0) rotate(0deg)', opacity: 1 },
          { transform: `translateY(110vh) translateX(${sway}px) rotate(${Math.random() * 60 - 30}deg)`, opacity: 0.3 },
        ],
        { duration, delay: i * 80, easing: 'ease-in', fill: 'forwards' }
      ).onfinish = () => el.remove()
    }
  }

  function setAllAttending(attending: boolean) {
    setOverallAttending(attending)
    if (attending) fireConfetti()
    else fireSadEmojis()
    setGuestRsvps((prev) => {
      const next = new Map(prev)
      for (const e of events) {
        const cur = next.get(e.id) ?? { attending: null, dietary: '' }
        next.set(e.id, { ...cur, attending })
      }
      return next
    })
  }
  const [guestDietary, setGuestDietary] = useState(() => {
    const first = rsvpResponses.find((r) => r.dietary_restrictions)
    return first?.dietary_restrictions ?? ''
  })
  const [familyMemberRows, setFamilyMemberRows] = useState<FamilyMemberRow[]>(initFamilyMembers)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const comboRefs = useRef<Record<string, FamilyMemberComboboxHandle | null>>({})

  function setGuestAttending(eventId: string, attending: boolean) {
    setGuestRsvps((prev) => {
      const next = new Map(prev)
      const cur = next.get(eventId) ?? { attending: null, dietary: '' }
      next.set(eventId, { ...cur, attending })
      return next
    })
  }

  function setFmAttending(localId: string, eventId: string, attending: boolean) {
    setFamilyMemberRows((prev) =>
      prev.map((fm) => {
        if (fm._localId !== localId) return fm
        const nextRsvps = new Map(fm.rsvps)
        const cur = nextRsvps.get(eventId) ?? { attending: null, dietary: '' }
        nextRsvps.set(eventId, { ...cur, attending })
        return { ...fm, rsvps: nextRsvps }
      })
    )
  }

  function setFmDietary(localId: string, eventId: string, dietary: string) {
    setFamilyMemberRows((prev) =>
      prev.map((fm) => {
        if (fm._localId !== localId) return fm
        const nextRsvps = new Map(fm.rsvps)
        const cur = nextRsvps.get(eventId) ?? { attending: null, dietary: '' }
        nextRsvps.set(eventId, { ...cur, dietary })
        return { ...fm, rsvps: nextRsvps }
      })
    )
  }

  function addFamilyMember() {
    const rsvpMap = new Map<string, { attending: boolean | null; dietary: string }>()
    for (const e of events) rsvpMap.set(e.id, { attending: null, dietary: '' })
    setFamilyMemberRows((prev) => [
      ...prev,
      { _localId: localId(), name: '', is_child: false, rsvps: rsvpMap },
    ])
  }

  function removeFamilyMember(lid: string) {
    setFamilyMemberRows((prev) => prev.filter((fm) => fm._localId !== lid))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validate: all events must have a Yes/No selection
    for (const ev of events) {
      if (guestRsvps.get(ev.id)?.attending === null) {
        setError(`Please select Yes or No for "${ev.name}".`)
        return
      }
    }
    for (const fm of familyMemberRows) {
      if (!fm.name.trim()) {
        setError('Each family member must have a name.')
        return
      }
      for (const ev of events) {
        if (fm.rsvps.get(ev.id)?.attending === null) {
          setError(`Please select Yes or No for ${fm.name || 'each family member'} for "${ev.name}".`)
          return
        }
      }
    }

    setError('')
    setSubmitting(true)

    try {
      const res = await fetch(`/api/public/rsvp/${guestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name: guestName.trim() || guest.name,
          email: email.trim() || null,
          phone: phone.trim() || null,
          arrival_date: arrivalDate.trim() || null,
          departure_date: departureDate.trim() || null,
          guestRsvps: events.map((ev) => ({
            event_id: ev.id,
            attending: guestRsvps.get(ev.id)?.attending ?? false,
            dietary_restrictions: guestDietary.trim() || null,
          })),
          familyMembers: familyMemberRows.map((fm) => ({
            ...(fm.id ? { id: fm.id } : {}),
            ...(fm.linked_guest_id ? { linked_guest_id: fm.linked_guest_id } : {}),
            name: fm.name.trim(),
            is_child: fm.is_child,
            rsvps: events.map((ev) => ({
              event_id: ev.id,
              attending: fm.rsvps.get(ev.id)?.attending ?? false,
              dietary_restrictions: fm.rsvps.get(ev.id)?.dietary.trim() || null,
            })),
          })),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.')
        return
      }

      onSubmit({ ...(data as ConfirmationData), overallAttending })
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const grouped: Record<DisplayGroup, EventStub[]> = { bride: [], groom: [], joint: [] }
  for (const ev of events) grouped[ev.display_group].push(ev)

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto w-full text-left space-y-10">
      {/* Header */}
      <div className="text-center">
        <p className="text-xs tracking-[0.3em] uppercase" style={{ color: 'var(--color-muted)' }}>
          RSVP for
        </p>
        {editingName ? (
          <div className="flex items-center justify-center gap-2 mt-1">
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setGuestName(nameDraft.trim() || guest.name)
                  setEditingName(false)
                }
                if (e.key === 'Escape') {
                  setNameDraft(guestName)
                  setEditingName(false)
                }
              }}
              className="text-3xl font-light text-center border-b outline-none px-1"
              style={{
                fontFamily: 'var(--font-heading)',
                color: 'var(--color-foreground)',
                borderColor: 'var(--color-accent)',
                background: 'transparent',
              }}
            />
            <button
              type="button"
              onClick={() => {
                setGuestName(nameDraft.trim() || guest.name)
                setEditingName(false)
              }}
              className="text-xs px-2 py-1 rounded-sm"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setNameDraft(guestName)
                setEditingName(false)
              }}
              className="text-xs px-2 py-1 rounded-sm border"
              style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 mt-1">
            <h2
              className="text-3xl font-light"
              style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
            >
              {guestName || guest.name}
            </h2>
            <button
              type="button"
              title="Edit name (fix spelling)"
              aria-label="Edit name"
              onClick={() => {
                setNameDraft(guestName || guest.name)
                setEditingName(true)
              }}
              className="text-xs px-1.5 py-0.5 rounded-sm"
              style={{ color: 'var(--color-muted)' }}
            >
              ✎
            </button>
          </div>
        )}
      </div>

      {/* Overall attendance */}
      <section className="space-y-4 text-center">
        <h3
          className="text-2xl font-light"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
        >
          Will you be joining us?
        </h3>
        <div className="flex justify-center gap-4">
          <button
            type="button"
            onClick={() => setAllAttending(true)}
            className="px-10 py-3 text-sm tracking-wide transition-all"
            style={{
              background: overallAttending === true ? 'var(--color-accent)' : 'transparent',
              color: overallAttending === true ? 'white' : 'var(--color-foreground)',
              border: overallAttending === true ? '2px solid var(--color-accent)' : '2px solid var(--color-foreground)',
              borderRadius: '2px',
              fontWeight: overallAttending === true ? 600 : 400,
              letterSpacing: '0.05em',
            }}
          >
            Joyfully accepts
          </button>
          <button
            type="button"
            onClick={() => setAllAttending(false)}
            className="px-10 py-3 text-sm tracking-wide transition-all"
            style={{
              background: overallAttending === false ? 'var(--color-foreground)' : 'transparent',
              color: overallAttending === false ? 'white' : 'var(--color-foreground)',
              border: overallAttending === false ? '2px solid var(--color-foreground)' : '2px solid var(--color-foreground)',
              borderRadius: '2px',
              fontWeight: overallAttending === false ? 600 : 400,
              letterSpacing: '0.05em',
              opacity: overallAttending === true ? 0.45 : 1,
            }}
          >
            Regretfully declines
          </button>
        </div>
        {overallAttending !== null && (
          <p className="text-xs" style={{ color: overallAttending ? 'var(--color-accent)' : 'var(--color-muted)' }}>
            {overallAttending ? 'Attending all events — adjust individually below if needed' : 'Declining all events — adjust individually below if needed'}
          </p>
        )}
      </section>

      {/* Contact info */}
      <section className="space-y-4">
        <h3 className="text-xs tracking-[0.2em] uppercase font-medium" style={{ color: 'var(--color-muted)' }}>
          Contact Info
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-2.5 text-sm border rounded-sm outline-none"
              style={{ borderColor: 'var(--color-highlight)', background: 'white' }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="w-full px-4 py-2.5 text-sm border rounded-sm outline-none"
              style={{ borderColor: 'var(--color-highlight)', background: 'white' }}
            />
          </div>
        </div>
      </section>

      {/* Accommodation */}
      <section className="space-y-4">
        <h3 className="text-xs tracking-[0.2em] uppercase font-medium" style={{ color: 'var(--color-muted)' }}>
          Accommodation
        </h3>
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
          Let us know your planned hotel check-in and check-out dates so we can plan ahead.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Arriving</label>
            <input
              type="datetime-local"
              value={arrivalDate}
              onChange={(e) => setArrivalDate(e.target.value)}
              className="w-full px-4 py-2.5 text-sm border rounded-sm outline-none"
              style={{ borderColor: 'var(--color-highlight)', background: 'white', color: 'var(--color-foreground)' }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Leaving</label>
            <input
              type="datetime-local"
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
              className="w-full px-4 py-2.5 text-sm border rounded-sm outline-none"
              style={{ borderColor: 'var(--color-highlight)', background: 'white', color: 'var(--color-foreground)' }}
            />
          </div>
        </div>
      </section>

      {/* Events */}
      <section className="space-y-6">
        <h3 className="text-xs tracking-[0.2em] uppercase font-medium" style={{ color: 'var(--color-muted)' }}>
          Events
        </h3>
        {GROUP_ORDER.map((group) => {
          const groupEvents = grouped[group]
          if (groupEvents.length === 0) return null
          return (
            <div key={group}>
              <p className="text-xs font-medium mb-3" style={{ color: GROUP_ACCENT[group] }}>
                {GROUP_LABELS[group]}
              </p>
              <div className="space-y-3">
                {groupEvents.map((ev) => {
                  const cur = guestRsvps.get(ev.id)
                  return (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between gap-4 px-4 py-3 border rounded-sm"
                      style={{ borderColor: 'var(--color-highlight)' }}
                    >
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                          {ev.name}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                          {formatEventDate(ev.date)}
                          {ev.start_time && ` · ${ev.start_time}`}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setGuestAttending(ev.id, true)}
                          className="px-4 py-1.5 text-xs border rounded-sm transition-colors"
                          style={{
                            background: cur?.attending === true ? 'var(--color-accent)' : 'transparent',
                            color: cur?.attending === true ? 'white' : 'var(--color-muted)',
                            borderColor: cur?.attending === true ? 'var(--color-accent)' : 'var(--color-highlight)',
                          }}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setGuestAttending(ev.id, false)}
                          className="px-4 py-1.5 text-xs border rounded-sm transition-colors"
                          style={{
                            background: cur?.attending === false ? '#6b7280' : 'transparent',
                            color: cur?.attending === false ? 'white' : 'var(--color-muted)',
                            borderColor: cur?.attending === false ? '#6b7280' : 'var(--color-highlight)',
                          }}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </section>

      {/* Dietary restrictions */}
      <section className="space-y-3">
        <h3 className="text-xs tracking-[0.2em] uppercase font-medium" style={{ color: 'var(--color-muted)' }}>
          Dietary Restrictions
        </h3>
        <textarea
          value={guestDietary}
          onChange={(e) => setGuestDietary(e.target.value)}
          placeholder="Any dietary restrictions or allergies? (optional)"
          rows={2}
          className="w-full px-4 py-2.5 text-sm border rounded-sm outline-none resize-none"
          style={{ borderColor: 'var(--color-highlight)', background: 'white' }}
        />
      </section>

      {/* Family members */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs tracking-[0.2em] uppercase font-medium" style={{ color: 'var(--color-muted)' }}>
            Family Members
          </h3>
          <button
            type="button"
            onClick={addFamilyMember}
            className="text-xs px-3 py-1.5 border rounded-sm transition-colors"
            style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
          >
            + Add family member
          </button>
        </div>

        {familyMemberRows.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No additional family members. Click above to add.
          </p>
        )}

        {familyMemberRows.map((fm) => (
          <div
            key={fm._localId}
            className="border rounded-sm p-4 space-y-4"
            style={{ borderColor: 'var(--color-highlight)', background: '#faf9f4' }}
          >
            <div className="flex items-center gap-3">
              <FamilyMemberCombobox
                ref={(el) => { comboRefs.current[fm._localId] = el }}
                value={fm.name}
                linkedGuestId={fm.linked_guest_id}
                token={token}
                onSelect={(guest, typedName) =>
                  setFamilyMemberRows((prev) =>
                    prev.map((r) =>
                      r._localId === fm._localId
                        ? { ...r, name: guest ? guest.name : typedName, linked_guest_id: guest?.id }
                        : r
                    )
                  )
                }
                onClear={() =>
                  setFamilyMemberRows((prev) =>
                    prev.map((r) =>
                      r._localId === fm._localId ? { ...r, name: '', linked_guest_id: undefined } : r
                    )
                  )
                }
              />
              <label className="flex items-center gap-1.5 text-xs shrink-0" style={{ color: 'var(--color-muted)' }}>
                <input
                  type="checkbox"
                  checked={fm.is_child}
                  onChange={(e) =>
                    setFamilyMemberRows((prev) =>
                      prev.map((r) => (r._localId === fm._localId ? { ...r, is_child: e.target.checked } : r))
                    )
                  }
                />
                Child
              </label>
              {fm.name.trim() && (
                <button
                  type="button"
                  title="Edit name / find existing guest"
                  aria-label="Edit name"
                  onClick={() => {
                    // Unlink so re-search can surface alternatives (keep the typed name)
                    if (fm.linked_guest_id) {
                      setFamilyMemberRows((prev) =>
                        prev.map((r) =>
                          r._localId === fm._localId ? { ...r, linked_guest_id: undefined } : r
                        )
                      )
                    }
                    comboRefs.current[fm._localId]?.focusAndSearch()
                  }}
                  className="text-xs px-2 py-1 rounded-sm shrink-0"
                  style={{ color: 'var(--color-muted)' }}
                >
                  ✎
                </button>
              )}
              <button
                type="button"
                onClick={() => removeFamilyMember(fm._localId)}
                className="text-xs px-2 py-1 rounded-sm"
                style={{ color: '#ef4444' }}
                aria-label="Remove"
              >
                ✕
              </button>
            </div>

            {/* Per-event toggles for family member */}
            <div className="space-y-2">
              {events.map((ev) => {
                const cur = fm.rsvps.get(ev.id)
                return (
                  <div key={ev.id} className="flex items-center justify-between gap-3">
                    <p className="text-xs" style={{ color: 'var(--color-foreground)' }}>
                      {ev.name}
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFmAttending(fm._localId, ev.id, true)}
                        className="px-3 py-1 text-xs border rounded-sm"
                        style={{
                          background: cur?.attending === true ? 'var(--color-accent)' : 'transparent',
                          color: cur?.attending === true ? 'white' : 'var(--color-muted)',
                          borderColor: cur?.attending === true ? 'var(--color-accent)' : 'var(--color-highlight)',
                        }}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setFmAttending(fm._localId, ev.id, false)}
                        className="px-3 py-1 text-xs border rounded-sm"
                        style={{
                          background: cur?.attending === false ? '#6b7280' : 'transparent',
                          color: cur?.attending === false ? 'white' : 'var(--color-muted)',
                          borderColor: cur?.attending === false ? '#6b7280' : 'var(--color-highlight)',
                        }}
                      >
                        No
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Family member dietary */}
            <textarea
              value={fm.rsvps.get(events[0]?.id ?? '')?.dietary ?? ''}
              onChange={(e) => {
                // Apply dietary to all events for this family member
                for (const ev of events) setFmDietary(fm._localId, ev.id, e.target.value)
              }}
              placeholder="Dietary restrictions (optional)"
              rows={1}
              className="w-full px-3 py-2 text-xs border rounded-sm outline-none resize-none"
              style={{ borderColor: 'var(--color-highlight)', background: 'white' }}
            />
          </div>
        ))}
      </section>

      {error && (
        <p className="text-sm text-red-600 text-center">{error}</p>
      )}

      <div className="pt-2 text-center">
        <button
          type="submit"
          disabled={submitting}
          className="px-10 py-3 text-sm text-white tracking-[0.1em] uppercase disabled:opacity-50"
          style={{ background: 'var(--color-accent)', borderRadius: '2px' }}
        >
          {submitting ? 'Saving…' : 'Submit RSVP'}
        </button>
      </div>
    </form>
  )
}

// ─── ConfirmationStep ─────────────────────────────────────────────────────────

function ConfirmationStep({
  confirmation,
  guestId,
  onEdit,
}: {
  confirmation: ConfirmationData
  guestId: string
  onEdit: () => void
}) {
  return (
    <div className="max-w-md mx-auto text-center space-y-6">
      <div>
        <p className="text-xs tracking-[0.3em] uppercase" style={{ color: 'var(--color-muted)' }}>
          Thank you
        </p>
        <h2
          className="text-4xl font-light mt-2"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
        >
          {confirmation.guestName}
        </h2>
        <div className="h-px w-16 mx-auto mt-4" style={{ background: 'var(--color-highlight)' }} />
      </div>

      {confirmation.attendingEvents.length > 0 ? (
        <div className="space-y-2 text-left">
          <p className="text-xs tracking-wide uppercase text-center" style={{ color: 'var(--color-muted)' }}>
            Attending
          </p>
          <ul className="space-y-1">
            {confirmation.attendingEvents.map((name) => (
              <li
                key={name}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded-sm"
                style={{ background: '#f5f3ed' }}
              >
                <span style={{ color: 'var(--color-accent)' }}>✓</span>
                <span style={{ color: 'var(--color-foreground)' }}>{name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : confirmation.overallAttending === false ? (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          You&apos;ve declined all events.
        </p>
      ) : null}

      {confirmation.familyMemberNames.length > 0 && (
        <div className="space-y-2 text-left">
          <p className="text-xs tracking-wide uppercase text-center" style={{ color: 'var(--color-muted)' }}>
            Family members included
          </p>
          <ul className="space-y-1">
            {confirmation.familyMemberNames.map((name) => (
              <li
                key={name}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded-sm"
                style={{ background: '#f5f3ed' }}
              >
                <span style={{ color: 'var(--color-muted)' }}>·</span>
                <span style={{ color: 'var(--color-foreground)' }}>{name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add to Calendar */}
      {confirmation.attendingEventDetails.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs tracking-wide uppercase" style={{ color: 'var(--color-muted)' }}>
            Add to Calendar
          </p>

          {/* Single .ics download for all events */}
          <a
            href={`/api/public/rsvp/${guestId}/calendar.ics`}
            download
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm border rounded-sm transition-colors"
            style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <polyline points="8 17 12 21 16 17" />
              <line x1="12" y1="13" x2="12" y2="21" />
            </svg>
            Download all events (.ics)
          </a>

          {/* Google Calendar — one per event */}
          <div className="space-y-2">
            {confirmation.attendingEventDetails.map((ev) => (
              <a
                key={ev.id}
                href={buildGoogleCalendarUrl(ev)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 w-full px-4 py-2 text-sm border rounded-sm transition-colors hover:bg-amber-50"
                style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
              >
                <span className="truncate text-left">{ev.name}</span>
                <span className="text-xs shrink-0 font-medium" style={{ color: 'var(--color-accent)' }}>
                  Google Calendar ↗
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onEdit}
        className="text-sm underline mt-4"
        style={{ color: 'var(--color-muted)' }}
      >
        Need to change your response?
      </button>
    </div>
  )
}

// ─── RsvpFlow (root) ──────────────────────────────────────────────────────────

export default function RsvpFlow({
  contactEmail,
  rsvpDeadline,
  guestId: initialGuestId,
  token,
  invalidToken = false,
}: {
  contactEmail: string | null
  rsvpDeadline: string | null
  guestId: string | null
  token: string | null
  invalidToken?: boolean
}) {
  const [step, setStep] = useState<Step>('form')
  const [formData, setFormData] = useState<FormData | null>(null)
  const [confirmationData, setConfirmationData] = useState<ConfirmationData | null>(null)
  const [loadingForm, setLoadingForm] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const loadAndShowForm = useCallback(async (gid: string, tok: string | null) => {
    setLoadingForm(true)
    setLoadError(false)
    try {
      const url = tok
        ? `/api/public/rsvp/${gid}?token=${encodeURIComponent(tok)}`
        : `/api/public/rsvp/${gid}`
      const res = await fetch(url)
      if (!res.ok) { setLoadError(true); return }
      const data = await res.json()
      setFormData(data as FormData)
    } catch {
      setLoadError(true)
    } finally {
      setLoadingForm(false)
    }
  }, [])

  useEffect(() => {
    if (initialGuestId && !invalidToken) {
      void loadAndShowForm(initialGuestId, token)
    }
  }, [initialGuestId, token, invalidToken, loadAndShowForm])

  async function handleEdit() {
    if (initialGuestId) await loadAndShowForm(initialGuestId, token)
  }

  const guestId = initialGuestId

  return (
    <div className="pt-32 pb-24 px-6" style={{ background: 'var(--color-background)' }}>
      <div className="max-w-2xl mx-auto mb-12 text-center">
        <p className="text-xs tracking-[0.3em] uppercase" style={{ color: 'var(--color-muted)' }}>
          Kindly Reply
        </p>
        <h1
          className="text-5xl font-light mt-2"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
        >
          RSVP
        </h1>
        <div className="h-px w-16 mx-auto mt-4" style={{ background: 'var(--color-highlight)' }} />
        {!invalidToken && !guestId && (
          <p className="text-sm mt-4" style={{ color: 'var(--color-muted)' }}>
            Please use the personal link you were sent to access your RSVP.
          </p>
        )}
        {rsvpDeadline && guestId && step === 'form' && (
          <p className="text-xs mt-2" style={{ color: 'var(--color-muted)' }}>
            Please RSVP by{' '}
            <span className="font-medium" style={{ color: 'var(--color-foreground)' }}>
              {format(new Date(rsvpDeadline), 'MMMM d, yyyy')}
            </span>
          </p>
        )}
      </div>

      {/* Invalid / missing token */}
      {(invalidToken || (!guestId && !loadingForm)) && (
        <div className="max-w-md mx-auto text-center space-y-3">
          {invalidToken && (
            <>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                This link isn&apos;t valid.
              </p>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                Please use the link you were sent
                {contactEmail && (
                  <>, or contact us at{' '}
                    <a href={`mailto:${contactEmail}`} className="underline" style={{ color: 'var(--color-accent)' }}>
                      {contactEmail}
                    </a>
                  </>
                )}.
              </p>
            </>
          )}
        </div>
      )}

      {/* Loading */}
      {loadingForm && (
        <p className="text-center text-sm" style={{ color: 'var(--color-muted)' }}>
          Loading your RSVP…
        </p>
      )}

      {/* Load error */}
      {loadError && (
        <div className="max-w-md mx-auto text-center space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            We couldn&apos;t load your RSVP. Please use the link you were sent
            {contactEmail && (
              <>, or contact us at{' '}
                <a href={`mailto:${contactEmail}`} className="underline" style={{ color: 'var(--color-accent)' }}>
                  {contactEmail}
                </a>
              </>
            )}.
          </p>
        </div>
      )}

      {!loadingForm && !loadError && step === 'form' && formData && guestId && (
        <RsvpFormStep
          guestId={guestId}
          token={token}
          formData={formData}
          onSubmit={(data) => {
            setConfirmationData(data)
            setStep('confirmation')
          }}
        />
      )}

      {!loadingForm && step === 'confirmation' && confirmationData && guestId && (
        <ConfirmationStep
          confirmation={confirmationData}
          guestId={guestId}
          onEdit={handleEdit}
        />
      )}
    </div>
  )
}
