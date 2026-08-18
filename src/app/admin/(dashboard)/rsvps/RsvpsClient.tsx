'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { type Side } from '@prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type EventStub = {
  id: string
  name: string
  date: string
  sort_order: number
}

type FamilyMemberStub = {
  id: string
  name: string
  is_child: boolean
}

type GuestStub = {
  id: string
  name: string
  email: string | null
  household_group: string | null
  created_at: string
  arrival_date?: string | null
  departure_date?: string | null
  familyMembers?: FamilyMemberStub[]
}

type RsvpStub = {
  guest_id: string
  event_id: string
  attending: boolean | null
}

type FmRsvpStub = {
  family_member_id: string
  event_id: string
  attending: boolean | null
}

type FamilyMemberRsvpRow = {
  id: string
  attending: boolean | null
  dietary_restrictions: string | null
  familyMember: { id: string; name: string; is_child: boolean }
}

type ResponseRow = {
  id: string
  attending: boolean | null
  dietary_restrictions: string | null
  submitted_at: string
  guest: { id: string; name: string; email: string | null; phone: string | null; household_group: string | null }
  familyMemberRsvps: FamilyMemberRsvpRow[]
}

type EventData = {
  event: { id: string; name: string; date: string }
  responses: ResponseRow[]
  nonResponders: GuestStub[]
  totals: {
    guestsConfirmed: number
    guestsDeclined: number
    guestsPending: number
    householdsAttending: number
    childrenAttending: number
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SIDE_ACCENT: Record<Side, string> = {
  bride: '#be185d',
  groom: '#1d4ed8',
}

function StatusBadge({ attending }: { attending: boolean | null }) {
  if (attending === true)
    return (
      <span
        className="px-2 py-0.5 text-xs rounded-full font-medium"
        style={{ background: '#dcfce7', color: '#16a34a' }}
      >
        Attending
      </span>
    )
  if (attending === false)
    return (
      <span
        className="px-2 py-0.5 text-xs rounded-full font-medium"
        style={{ background: '#fee2e2', color: '#dc2626' }}
      >
        Declined
      </span>
    )
  return (
    <span
      className="px-2 py-0.5 text-xs rounded-full font-medium"
      style={{ background: '#f3f4f6', color: '#6b7280' }}
    >
      Pending
    </span>
  )
}

// ─── OverviewTab ──────────────────────────────────────────────────────────────

function formatDatetime(raw: string | null | undefined): string {
  if (!raw) return '—'
  try {
    return format(new Date(raw), 'MMM d, h:mm a')
  } catch {
    return raw
  }
}

type AttendanceFilter = 'all' | 'attending' | 'declined' | 'pending'

// ─── Phase grouping ────────────────────────────────────────────────────────────

type Phase = {
  label: string
  date: string
  guests: GuestStub[]
}

// Group guests into phases by created_at — guests within ±1 day of the earliest
// un-grouped guest form one phase. Mirrors buildPhases() in Send Invites so the
// RSVP Overview list is organized the same way as the guest list.
function buildPhases(guests: GuestStub[]): Phase[] {
  if (guests.length === 0) return []

  const sorted = [...guests].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const groups: GuestStub[][] = []
  let current: GuestStub[] = [sorted[0]]
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

function AttendanceCell({ attending }: { attending: boolean | null | undefined }) {
  if (attending === true) return <span className="text-base leading-none" style={{ color: '#16a34a' }}>✓</span>
  if (attending === false) return <span className="text-base leading-none" style={{ color: '#dc2626' }}>✗</span>
  return <span className="text-xs" style={{ color: '#d1d5db' }}>—</span>
}

function OverviewTab({
  guests,
  events,
  allRsvps,
  allFmRsvps,
}: {
  guests: GuestStub[]
  events: EventStub[]
  allRsvps: RsvpStub[]
  allFmRsvps: FmRsvpStub[]
}) {
  const [search, setSearch] = useState('')
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('all')
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set())
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())

  // Build lookup: guest_id → event_id → attending
  const rsvpMap = new Map<string, Map<string, boolean | null>>()
  for (const r of allRsvps) {
    if (!rsvpMap.has(r.guest_id)) rsvpMap.set(r.guest_id, new Map())
    rsvpMap.get(r.guest_id)!.set(r.event_id, r.attending)
  }

  // Build lookup: family_member_id → event_id → attending
  const fmRsvpMap = new Map<string, Map<string, boolean | null>>()
  for (const r of allFmRsvps) {
    if (!fmRsvpMap.has(r.family_member_id)) fmRsvpMap.set(r.family_member_id, new Map())
    fmRsvpMap.get(r.family_member_id)!.set(r.event_id, r.attending)
  }

  // Build reverse map: family member name (lower) → primary guest id
  // so searching a FM name expands the right primary row
  const fmNameToGuestId = new Map<string, string>()
  for (const g of guests) {
    for (const fm of g.familyMembers ?? []) {
      fmNameToGuestId.set(fm.name.toLowerCase(), g.id)
    }
  }

  function toggleFamily(guestId: string) {
    setExpandedFamilies((prev) => {
      const next = new Set(prev)
      if (next.has(guestId)) next.delete(guestId)
      else next.add(guestId)
      return next
    })
  }

  // Determine which primary guest IDs match the search (either by their own name or a FM name)
  const q = search.trim().toLowerCase()
  const matchedGuestIds = new Set<string>()
  const autoExpandIds = new Set<string>() // guest IDs that matched via a family member name

  if (q) {
    for (const g of guests) {
      if (g.name.toLowerCase().includes(q)) {
        matchedGuestIds.add(g.id)
      }
      for (const fm of g.familyMembers ?? []) {
        if (fm.name.toLowerCase().includes(q)) {
          matchedGuestIds.add(g.id)
          autoExpandIds.add(g.id)
        }
      }
    }
  }

  // Attendance filter: does this guest have any "attending=true" response?
  function passesAttendanceFilter(g: GuestStub): boolean {
    if (attendanceFilter === 'all') return true
    const gRsvps = rsvpMap.get(g.id)
    const hasAttending = gRsvps && [...gRsvps.values()].some((v) => v === true)
    const hasDeclined = gRsvps && [...gRsvps.values()].every((v) => v === false)
    const hasPending = !gRsvps || gRsvps.size === 0

    if (attendanceFilter === 'attending') return !!hasAttending
    if (attendanceFilter === 'declined') return !!hasDeclined
    if (attendanceFilter === 'pending') return !!hasPending
    return true
  }

  const visibleGuests = guests.filter((g) => {
    if (q && !matchedGuestIds.has(g.id)) return false
    return passesAttendanceFilter(g)
  })

  // Group the filtered guests into phases (by created_at), like Send Invites
  const phases = buildPhases(visibleGuests)

  function togglePhaseCollapse(label: string) {
    setCollapsedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const allPhasesCollapsed = phases.length > 0 && phases.every((p) => collapsedPhases.has(p.label))

  function toggleAllPhases() {
    setCollapsedPhases(allPhasesCollapsed ? new Set() : new Set(phases.map((p) => p.label)))
  }

  // Merge auto-expand (FM name matches) with user-toggled state
  function isFamilyExpanded(guestId: string): boolean {
    return expandedFamilies.has(guestId) || (q.length > 0 && autoExpandIds.has(guestId))
  }

  if (guests.length === 0) {
    return (
      <p className="text-sm text-center py-16" style={{ color: 'var(--color-muted)' }}>
        No guests on your list yet.
      </p>
    )
  }

  const filterLabels: { value: AttendanceFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'attending', label: 'Attending' },
    { value: 'declined', label: 'Declined' },
    { value: 'pending', label: 'No Response' },
  ]

  return (
    <div>
      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: 'var(--color-muted)' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guests or family members…"
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-sm outline-none"
            style={{ borderColor: 'var(--color-highlight)', background: 'var(--color-background)' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: 'var(--color-muted)' }}
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {filterLabels.map((f) => (
            <button
              key={f.value}
              onClick={() => setAttendanceFilter(f.value)}
              className="px-3 py-1.5 text-xs rounded-sm border transition-colors whitespace-nowrap"
              style={{
                background: attendanceFilter === f.value ? 'var(--color-foreground)' : 'transparent',
                color: attendanceFilter === f.value ? 'var(--color-background)' : 'var(--color-muted)',
                borderColor: attendanceFilter === f.value ? 'var(--color-foreground)' : 'var(--color-highlight)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        {phases.length > 1 && (
          <button
            onClick={toggleAllPhases}
            className="ml-auto text-xs px-3 py-2 rounded-lg border transition-colors hover:bg-amber-50"
            style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
          >
            {allPhasesCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </div>

      {visibleGuests.length === 0 ? (
        <p className="text-sm text-center py-12" style={{ color: 'var(--color-muted)' }}>
          No guests match your search or filter.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse min-w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-highlight)' }}>
                <th
                  className="text-left py-2 pb-3 pr-6 text-xs tracking-wide font-medium whitespace-nowrap sticky left-0 z-10"
                  style={{ color: 'var(--color-muted)', background: 'var(--color-background)' }}
                >
                  Guest
                </th>
                {events.map((ev) => (
                  <th
                    key={ev.id}
                    className="py-2 pb-3 px-3 text-xs tracking-wide font-medium text-center whitespace-nowrap"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    <div>{ev.name}</div>
                    <div className="opacity-60 font-normal">{format(new Date(ev.date), 'M/d')}</div>
                  </th>
                ))}
                <th
                  className="text-left py-2 pb-3 px-3 text-xs tracking-wide font-medium whitespace-nowrap"
                  style={{ color: 'var(--color-muted)' }}
                >
                  Arrival
                </th>
                <th
                  className="text-left py-2 pb-3 px-3 text-xs tracking-wide font-medium whitespace-nowrap"
                  style={{ color: 'var(--color-muted)' }}
                >
                  Departure
                </th>
              </tr>
            </thead>
            <tbody>
              {phases.map((phase) => (
                <React.Fragment key={phase.label}>
                  {/* Phase header row */}
                  <tr>
                    <td
                      colSpan={events.length + 3}
                      className="px-4 py-2"
                      style={{
                        background: '#f5f0e8',
                        borderTop: '1px solid var(--color-highlight)',
                        borderBottom: '1px solid var(--color-highlight)',
                      }}
                    >
                      <div className="flex items-center gap-3">
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
                      </div>
                    </td>
                  </tr>
                  {/* Guest rows */}
                  {!collapsedPhases.has(phase.label) && phase.guests.map((g) => {
                    const guestRsvps = rsvpMap.get(g.id)
                    const hasFamilyMembers = (g.familyMembers?.length ?? 0) > 0
                    const expanded = isFamilyExpanded(g.id)
                    return (
                      <React.Fragment key={g.id}>
                        {/* Primary guest row */}
                    <tr
                      key={g.id}
                      className="border-b"
                      style={{ borderColor: 'var(--color-highlight)' }}
                    >
                      <td
                        className="py-3 pr-6 sticky left-0 z-10"
                        style={{ background: 'var(--color-background)' }}
                      >
                        <div className="flex items-center gap-2">
                          {hasFamilyMembers ? (
                            <button
                              onClick={() => toggleFamily(g.id)}
                              className="shrink-0 w-4 h-4 flex items-center justify-center text-xs rounded transition-colors"
                              style={{ color: 'var(--color-muted)' }}
                              title={expanded ? 'Collapse family' : 'Expand family'}
                            >
                              {expanded ? '▼' : '▶'}
                            </button>
                          ) : (
                            <span className="shrink-0 w-4" />
                          )}
                          <div>
                            <p className="font-medium whitespace-nowrap" style={{ color: 'var(--color-foreground)' }}>
                              {g.name}
                            </p>
                            {g.household_group && (
                              <p className="text-xs mt-0.5 whitespace-nowrap" style={{ color: 'var(--color-muted)' }}>
                                {g.household_group}
                              </p>
                            )}
                            {hasFamilyMembers && (
                              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                                {g.familyMembers!.length} family member{g.familyMembers!.length !== 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      {events.map((ev) => (
                        <td key={ev.id} className="py-3 px-3 text-center">
                          <AttendanceCell attending={guestRsvps?.get(ev.id)} />
                        </td>
                      ))}
                      <td className="py-3 px-3 text-xs whitespace-nowrap" style={{ color: 'var(--color-muted)' }}>
                        {formatDatetime(g.arrival_date)}
                      </td>
                      <td className="py-3 px-3 text-xs whitespace-nowrap" style={{ color: 'var(--color-muted)' }}>
                        {formatDatetime(g.departure_date)}
                      </td>
                    </tr>

                    {/* Family member rows (expanded) */}
                    {expanded && g.familyMembers?.map((fm) => {
                      const fmRsvps = fmRsvpMap.get(fm.id)
                      return (
                        <tr
                          key={fm.id}
                          className="border-b"
                          style={{ borderColor: 'var(--color-highlight)', background: '#faf9f4' }}
                        >
                          <td
                            className="py-2 pr-6 sticky left-0 z-10"
                            style={{ background: '#faf9f4' }}
                          >
                            <div className="flex items-center gap-2 pl-6">
                              <div>
                                <p className="text-xs whitespace-nowrap" style={{ color: 'var(--color-foreground)' }}>
                                  {fm.name}
                                </p>
                                {fm.is_child && (
                                  <span
                                    className="text-xs px-1.5 py-0.5 rounded-full"
                                    style={{ background: '#e0f2fe', color: '#0369a1' }}
                                  >
                                    Child
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          {events.map((ev) => (
                            <td key={ev.id} className="py-2 px-3 text-center">
                              <AttendanceCell attending={fmRsvps?.get(ev.id)} />
                            </td>
                          ))}
                          <td className="py-2 px-3 text-xs" style={{ color: '#d1d5db' }}>—</td>
                          <td className="py-2 px-3 text-xs" style={{ color: '#d1d5db' }}>—</td>
                        </tr>
                      )
                      })}
                    </React.Fragment>
                  )
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── ManualRsvpGridModal ───────────────────────────────────────────────────────

function ManualRsvpGridModal({
  events,
  allGuests,
  open,
  onClose,
  onSaved,
  accent,
}: {
  events: Array<{ id: string; name: string }>
  allGuests: Array<{ id: string; name: string; household_group: string | null }>
  open: boolean
  onClose: () => void
  onSaved: () => Promise<void> | void
  accent: string
}) {
  const [selectedGuests, setSelectedGuests] = useState<typeof allGuests>([])
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [grid, setGrid] = useState<Record<string, Record<string, 'yes' | 'no' | null>>>({})
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guestSearch, setGuestSearch] = useState('')

  // Debounced preview fetch
  useEffect(() => {
    if (!open || selectedGuests.length === 0 || selectedEvents.length === 0) return
    const handle = setTimeout(async () => {
      setLoadingPreview(true)
      try {
        const url = `/api/admin/rsvps/preview?guestIds=${selectedGuests.map((g) => g.id).join(',')}&eventIds=${selectedEvents.join(',')}`
        const res = await fetch(url)
        if (!res.ok) throw new Error('preview fetch failed')
        const data = await res.json() as {
          cells: Record<string, Record<string, boolean | null>>
        }
        // Only fill cells the admin hasn't touched yet
        setGrid((prev) => {
          const next = { ...prev }
          for (const g of selectedGuests) {
            next[g.id] = { ...(prev[g.id] ?? {}) }
            for (const eId of selectedEvents) {
              if (next[g.id][eId] === undefined) {
                const v = data.cells[g.id]?.[eId]
                next[g.id][eId] = v === true ? 'yes' : v === false ? 'no' : null
              }
            }
          }
          return next
        })
      } catch {
        setError('Could not load existing RSVPs. Try again.')
      } finally {
        setLoadingPreview(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [open, selectedGuests, selectedEvents])

  // Reset transient selections when the modal closes. The parent always
  // mounts this component (open is a prop, not a conditional render), so
  // without this a Cancel→reopen would show stale guests/events/clicks —
  // and stale grid cells are treated as admin-touched, which blocks the
  // debounced preview from re-fetching the true DB state.
  useEffect(() => {
    if (open) return
    setSelectedGuests([])
    setSelectedEvents([])
    setGrid({})
    setGuestSearch('')
    setError(null)
  }, [open])

  // Cell cycle
  function cycleCell(guestId: string, eventId: string) {
    setGrid((prev) => {
      const cur = prev[guestId]?.[eventId] ?? null
      const next: 'yes' | 'no' | null = cur === null ? 'yes' : cur === 'yes' ? 'no' : null
      return {
        ...prev,
        [guestId]: { ...(prev[guestId] ?? {}), [eventId]: next },
      }
    })
  }

  function toggleGuest(g: typeof allGuests[number]) {
    setSelectedGuests((prev) =>
      prev.some((x) => x.id === g.id) ? prev.filter((x) => x.id !== g.id) : [...prev, g]
    )
  }

  function toggleEvent(eventId: string) {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId]
    )
  }

  // Total count for the save button label
  const totalToSave = selectedGuests.length * selectedEvents.length

  async function handleSave() {
    if (totalToSave === 0) return
    setSaving(true)
    setError(null)
    const rows = selectedGuests.map((g) => ({
      guestId: g.id,
      cells: selectedEvents.map((eId) => ({
        eventId: eId,
        attending:
          grid[g.id]?.[eId] === 'yes' ? true :
          grid[g.id]?.[eId] === 'no'  ? false :
          null,
      })),
    }))
    try {
      const res = await fetch('/api/admin/rsvps/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(`Save failed: ${body.error ?? res.statusText}`)
        return
      }
    } catch {
      setError('Network error. Please try again.')
      return
    } finally {
      setSaving(false)
    }
    // POST succeeded — the batch was already written. A refresh failure here
    // must NOT be reported as a save/network error (that would mislead the
    // admin into retrying an already-applied, idempotent batch); log it and
    // close the modal anyway.
    try {
      await onSaved()
    } catch (e) {
      console.error('[manual-rsvp] post-save refresh failed', e)
    }
    onClose()
  }

  if (!open) return null

  const filteredGuests = allGuests.filter((g) =>
    g.name.toLowerCase().includes(guestSearch.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(45,45,45,0.5)' }}>
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Manual RSVP — multiple guests</h2>
          <button onClick={onClose} aria-label="Close" className="hover:opacity-70" style={{ color: 'var(--color-muted)' }}>✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Event picker */}
          <div>
            <label className="text-sm font-medium block mb-1">Events</label>
            <div className="flex flex-wrap gap-2">
              {events.map((e) => (
                <label key={e.id} className="inline-flex items-center gap-1 text-sm px-2 py-1 border rounded">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(e.id)}
                    onChange={() => toggleEvent(e.id)}
                  />
                  {e.name}
                </label>
              ))}
            </div>
          </div>

          {/* Guest picker */}
          <div>
            <label className="text-sm font-medium block mb-1">Guests</label>
            <input
              type="text"
              placeholder="Search guests…"
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm mb-2"
            />
            <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-1">
              {filteredGuests.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedGuests.some((x) => x.id === g.id)}
                    onChange={() => toggleGuest(g)}
                  />
                  {g.name}
                  {g.household_group && <span className="text-gray-400 text-xs">({g.household_group})</span>}
                </label>
              ))}
            </div>
            {/* Selected chips */}
            {selectedGuests.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedGuests.map((g) => (
                  <span key={g.id} className="inline-flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5 text-xs">
                    {g.name}
                    <button onClick={() => toggleGuest(g)} aria-label={`Remove ${g.name}`}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Grid */}
          {selectedGuests.length > 0 && selectedEvents.length > 0 && (
            <div>
              {loadingPreview && <p className="text-xs text-gray-500 mb-2">Loading existing RSVPs…</p>}
              <div className="overflow-x-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Guest</th>
                      {selectedEvents.map((eId) => {
                        const ev = events.find((x) => x.id === eId)
                        return <th key={eId} className="px-3 py-2 font-medium text-center">{ev?.name}</th>
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGuests.map((g) => (
                      <tr key={g.id} className="border-t">
                        <td className="px-3 py-2">{g.name}</td>
                        {selectedEvents.map((eId) => {
                          const cell = grid[g.id]?.[eId] ?? null
                          const label = cell === 'yes' ? '✓ Y' : cell === 'no' ? '✗ N' : '—'
                          const color = cell === 'yes' ? 'text-green-700' : cell === 'no' ? 'text-red-700' : 'text-gray-400'
                          return (
                            <td key={eId} className="px-3 py-2 text-center">
                              <button
                                onClick={() => cycleCell(g.id, eId)}
                                className={`${color} hover:opacity-70 font-mono w-12`}
                                aria-label={`Toggle ${g.name} for ${events.find((x) => x.id === eId)?.name}`}
                              >
                                {label}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || totalToSave === 0}
            className="px-4 py-2 text-sm rounded text-white disabled:opacity-50"
            style={{ background: accent }}
          >
            {saving ? 'Saving…' : `Save ${totalToSave} RSVPs`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── RsvpsClient ──────────────────────────────────────────────────────────────

export default function RsvpsClient({
  events,
  guests,
  initialNonResponders,
  allRsvps,
  allFmRsvps,
  side,
}: {
  events: EventStub[]
  guests: GuestStub[]
  initialNonResponders: GuestStub[]
  allRsvps: RsvpStub[]
  allFmRsvps: FmRsvpStub[]
  side: Side
}) {
  const accent = SIDE_ACCENT[side]

  const [activeEventId, setActiveEventId] = useState<string | 'nonresponders' | 'overview'>('overview')
  const [eventData, setEventData] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedGuests, setExpandedGuests] = useState<Set<string>>(new Set())
  const [nonResponders, setNonResponders] = useState<GuestStub[]>(initialNonResponders)
  const [showManual, setShowManual] = useState(false)

  // Edit modal
  const [editRow, setEditRow] = useState<ResponseRow | null>(null)
  const [editAttending, setEditAttending] = useState<boolean | null>(null)
  const [editDietary, setEditDietary] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')

  const refreshNonResponders = useCallback(() => {
    fetch('/api/admin/rsvps/non-responders')
      .then((r) => r.json())
      .then((data: { nonResponders: GuestStub[] }) => setNonResponders(data.nonResponders))
      .catch(() => {/* silent */})
  }, [])

  const refreshCurrentEvent = useCallback(() => {
    if (activeEventId === 'nonresponders' || activeEventId === 'overview') return
    setLoading(true)
    setEventData(null)
    fetch(`/api/admin/rsvps?eventId=${activeEventId}`)
      .then((r) => r.json())
      .then((data) => { setEventData(data); refreshNonResponders() })
      .finally(() => setLoading(false))
  }, [activeEventId, refreshNonResponders])

  useEffect(() => {
    if (activeEventId === 'nonresponders' || activeEventId === 'overview') {
      refreshNonResponders()
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setEventData(null)
      const res = await fetch(`/api/admin/rsvps?eventId=${activeEventId}`)
      const data = (await res.json()) as EventData
      if (!cancelled) {
        setEventData(data)
        setLoading(false)
        refreshNonResponders()
      }
    }
    void load()
    return () => { cancelled = true }
  }, [activeEventId, refreshNonResponders])

  function toggleExpanded(guestId: string) {
    setExpandedGuests((prev) => {
      const next = new Set(prev)
      if (next.has(guestId)) next.delete(guestId)
      else next.add(guestId)
      return next
    })
  }

  async function submitEdit() {
    if (!editRow || editAttending === null) {
      setEditError('Please select attendance.')
      return
    }
    setEditLoading(true)
    setEditError('')
    try {
      const res = await fetch(`/api/admin/rsvps/${editRow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attending: editAttending, dietary_restrictions: editDietary.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error ?? 'Error'); return }
      setEditRow(null)
      refreshCurrentEvent()
    } finally {
      setEditLoading(false)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl 2xl:max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-2xl font-light"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
          >
            RSVP Responses
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            {guests.length} guest{guests.length !== 1 ? 's' : ''} on your list
          </p>
        </div>
        <button
          onClick={() => setShowManual(true)}
          className="px-4 py-2 text-sm text-white rounded-sm"
          style={{ background: accent }}
        >
          + Manual RSVP
        </button>
      </div>

      {/* Event tabs */}
      {events.length === 0 ? (
        <p className="text-sm text-center py-16" style={{ color: 'var(--color-muted)' }}>
          No events found. Add events first.
        </p>
      ) : (
        <>
          <div
            className="flex gap-1 overflow-x-auto pb-2 mb-6 border-b"
            style={{ borderColor: 'var(--color-highlight)' }}
          >
            <button
              onClick={() => setActiveEventId('overview')}
              className="shrink-0 px-4 py-2 text-xs rounded-t-sm transition-colors whitespace-nowrap font-medium"
              style={{
                background: activeEventId === 'overview' ? accent : 'transparent',
                color: activeEventId === 'overview' ? 'white' : 'var(--color-muted)',
                borderBottom: activeEventId === 'overview' ? `2px solid ${accent}` : '2px solid transparent',
              }}
            >
              Overview
            </button>
            {events.map((ev) => {
              const active = activeEventId === ev.id
              return (
                <button
                  key={ev.id}
                  onClick={() => setActiveEventId(ev.id)}
                  className="shrink-0 px-4 py-2 text-xs rounded-t-sm transition-colors whitespace-nowrap"
                  style={{
                    background: active ? accent : 'transparent',
                    color: active ? 'white' : 'var(--color-muted)',
                    borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
                  }}
                >
                  {ev.name}
                  <span className="ml-1.5 opacity-70">
                    {format(new Date(ev.date), 'M/d')}
                  </span>
                </button>
              )
            })}
            <button
              onClick={() => setActiveEventId('nonresponders')}
              className="shrink-0 px-4 py-2 text-xs rounded-t-sm transition-colors whitespace-nowrap"
              style={{
                background: activeEventId === 'nonresponders' ? '#6b7280' : 'transparent',
                color: activeEventId === 'nonresponders' ? 'white' : 'var(--color-muted)',
                borderBottom: activeEventId === 'nonresponders' ? '2px solid #6b7280' : '2px solid transparent',
              }}
            >
              Non-Responders
              <span className="ml-1.5 opacity-70">({nonResponders.length})</span>
            </button>
          </div>

          {/* Non-responders tab */}
          {activeEventId === 'nonresponders' && (
            <div>
              {nonResponders.length === 0 ? (
                <p className="text-sm text-center py-16" style={{ color: 'var(--color-muted)' }}>
                  Everyone has responded!
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--color-highlight)' }}>
                        <th className="text-left py-2 pb-3 text-xs tracking-wide font-medium" style={{ color: 'var(--color-muted)' }}>
                          Name
                        </th>
                        <th className="text-left py-2 pb-3 text-xs tracking-wide font-medium" style={{ color: 'var(--color-muted)' }}>
                          Email
                        </th>
                        <th className="text-left py-2 pb-3 text-xs tracking-wide font-medium" style={{ color: 'var(--color-muted)' }}>
                          Household
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--color-highlight)' }}>
                      {nonResponders.map((g) => (
                        <tr key={g.id}>
                          <td className="py-3 font-medium" style={{ color: 'var(--color-foreground)' }}>
                            {g.name}
                          </td>
                          <td className="py-3" style={{ color: 'var(--color-muted)' }}>
                            {g.email ?? '—'}
                          </td>
                          <td className="py-3" style={{ color: 'var(--color-muted)' }}>
                            {g.household_group ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Overview tab */}
          {activeEventId === 'overview' && (
            <OverviewTab guests={guests} events={events} allRsvps={allRsvps} allFmRsvps={allFmRsvps} />
          )}

          {/* Event tab content */}
          {activeEventId !== 'nonresponders' && activeEventId !== 'overview' && (
            <>
              {loading && (
                <p className="text-sm text-center py-12" style={{ color: 'var(--color-muted)' }}>
                  Loading…
                </p>
              )}

              {!loading && eventData && (
                <>
                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                    {[
                      { label: 'Confirmed', value: eventData.totals.guestsConfirmed, color: '#16a34a' },
                      { label: 'Declined', value: eventData.totals.guestsDeclined, color: '#dc2626' },
                      { label: 'Pending', value: eventData.totals.guestsPending, color: '#6b7280' },
                      { label: 'Households', value: eventData.totals.householdsAttending, color: accent },
                      { label: 'Children', value: eventData.totals.childrenAttending, color: accent },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="px-4 py-3 rounded-sm border"
                        style={{ borderColor: 'var(--color-highlight)' }}
                      >
                        <p className="text-2xl font-light" style={{ color: stat.color }}>
                          {stat.value}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                          {stat.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Responses table */}
                  {eventData.responses.length === 0 ? (
                    <p className="text-sm text-center py-12" style={{ color: 'var(--color-muted)' }}>
                      No responses for this event yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b" style={{ borderColor: 'var(--color-highlight)' }}>
                            <th className="text-left py-2 pb-3 text-xs tracking-wide font-medium" style={{ color: 'var(--color-muted)' }}>
                              Guest
                            </th>
                            <th className="text-left py-2 pb-3 text-xs tracking-wide font-medium" style={{ color: 'var(--color-muted)' }}>
                              Status
                            </th>
                            <th className="text-left py-2 pb-3 text-xs tracking-wide font-medium" style={{ color: 'var(--color-muted)' }}>
                              Family
                            </th>
                            <th className="text-left py-2 pb-3 text-xs tracking-wide font-medium" style={{ color: 'var(--color-muted)' }}>
                              Dietary
                            </th>
                            <th className="py-2 pb-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {eventData.responses.map((row) => (
                            <React.Fragment key={row.id}>
                              <tr
                                className="border-b cursor-pointer hover:bg-gray-50 transition-colors"
                                style={{ borderColor: 'var(--color-highlight)' }}
                                onClick={() => row.familyMemberRsvps.length > 0 && toggleExpanded(row.guest.id)}
                              >
                                <td className="py-3 pr-4">
                                  <p className="font-medium" style={{ color: 'var(--color-foreground)' }}>
                                    {row.guest.name}
                                  </p>
                                  {row.guest.household_group && (
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                                      {row.guest.household_group}
                                    </p>
                                  )}
                                </td>
                                <td className="py-3 pr-4">
                                  <StatusBadge attending={row.attending} />
                                </td>
                                <td className="py-3 pr-4">
                                  {row.familyMemberRsvps.length > 0 ? (
                                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                                      {row.familyMemberRsvps.length} member{row.familyMemberRsvps.length !== 1 ? 's' : ''}
                                      {row.familyMemberRsvps.some((f) => f.familyMember.is_child) && (
                                        <span className="ml-1">· {row.familyMemberRsvps.filter((f) => f.familyMember.is_child).length} child</span>
                                      )}
                                      <span className="ml-1 opacity-60">
                                        {expandedGuests.has(row.guest.id) ? '▲' : '▼'}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>—</span>
                                  )}
                                </td>
                                <td className="py-3 pr-4">
                                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                                    {row.dietary_restrictions ?? '—'}
                                  </span>
                                </td>
                                <td className="py-3 text-right">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setEditRow(row)
                                      setEditAttending(row.attending)
                                      setEditDietary(row.dietary_restrictions ?? '')
                                      setEditError('')
                                    }}
                                    className="text-xs px-3 py-1 border rounded-sm"
                                    style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
                                  >
                                    Edit
                                  </button>
                                </td>
                              </tr>
                              {expandedGuests.has(row.guest.id) &&
                                row.familyMemberRsvps.map((fmr) => (
                                  <tr
                                    key={fmr.id}
                                    className="border-b"
                                    style={{ borderColor: 'var(--color-highlight)', background: '#faf9f4' }}
                                  >
                                    <td className="py-2 pl-6 pr-4">
                                      <p className="text-xs" style={{ color: 'var(--color-foreground)' }}>
                                        {fmr.familyMember.name}
                                        {fmr.familyMember.is_child && (
                                          <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                                            Child
                                          </span>
                                        )}
                                      </p>
                                    </td>
                                    <td className="py-2 pr-4">
                                      <StatusBadge attending={fmr.attending} />
                                    </td>
                                    <td className="py-2 pr-4" />
                                    <td className="py-2 pr-4">
                                      <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                                        {fmr.dietary_restrictions ?? '—'}
                                      </span>
                                    </td>
                                    <td />
                                  </tr>
                                ))}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      


      <ManualRsvpGridModal
        events={events}
        allGuests={guests}
        open={showManual}
        onClose={() => setShowManual(false)}
        onSaved={async () => {
          await Promise.all([refreshNonResponders(), refreshCurrentEvent()])
        }}
        accent={accent}
      />

{/* Edit modal */}
      {editRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(45,45,45,0.5)' }}
          onClick={() => setEditRow(null)}
        >
          <div
            className="w-full max-w-sm rounded-sm p-6 space-y-5"
            style={{ background: 'var(--color-background)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-light" style={{ fontFamily: 'var(--font-heading)' }}>
              Edit RSVP
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {editRow.guest.name}
            </p>

            <div>
              <label className="block text-xs mb-2" style={{ color: 'var(--color-muted)' }}>Attending?</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditAttending(true)}
                  className="flex-1 py-2 text-sm border rounded-sm"
                  style={{
                    background: editAttending === true ? accent : 'transparent',
                    color: editAttending === true ? 'white' : 'var(--color-muted)',
                    borderColor: editAttending === true ? accent : 'var(--color-highlight)',
                  }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setEditAttending(false)}
                  className="flex-1 py-2 text-sm border rounded-sm"
                  style={{
                    background: editAttending === false ? '#6b7280' : 'transparent',
                    color: editAttending === false ? 'white' : 'var(--color-muted)',
                    borderColor: editAttending === false ? '#6b7280' : 'var(--color-highlight)',
                  }}
                >
                  No
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Dietary restrictions</label>
              <input
                type="text"
                value={editDietary}
                onChange={(e) => setEditDietary(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 text-sm border rounded-sm outline-none"
                style={{ borderColor: 'var(--color-highlight)' }}
              />
            </div>

            {editError && <p className="text-sm text-red-600">{editError}</p>}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditRow(null)}
                className="flex-1 py-2 text-sm border rounded-sm"
                style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={submitEdit}
                disabled={editLoading}
                className="flex-1 py-2 text-sm text-white rounded-sm disabled:opacity-50"
                style={{ background: accent }}
              >
                {editLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
