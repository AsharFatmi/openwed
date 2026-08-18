'use client'

import React, { useState, useMemo, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type GuestStub = {
  id: string
  name: string
  household_group: string | null
  created_at: Date
  eventInvitations: { event_id: string }[]
}

type EventStub = {
  id: string
  name: string
  date: Date
  sort_order: number | null
}

type Props = {
  guests: GuestStub[]
  events: EventStub[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEventDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function buildInitialMap(guests: GuestStub[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const g of guests) {
    map.set(g.id, new Set(g.eventInvitations.map((i) => i.event_id)))
  }
  return map
}

// Group guests into phases: each phase is a cluster of guests added within
// ±1 day of each other (sorted ascending by created_at).
type Phase = {
  label: string      // e.g. "Phase 1 — Jul 9"
  date: string       // formatted anchor date
  guests: GuestStub[]
}

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
    return {
      label: `Phase ${idx + 1}`,
      date,
      guests: groupGuests,
    }
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InvitationsClient({ guests, events }: Props) {
  const [invitationMap, setInvitationMap] = useState<Map<string, Set<string>>>(() =>
    buildInitialMap(guests)
  )
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set())
  const [pendingColumns, setPendingColumns] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [columnError, setColumnError] = useState<string | null>(null)
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())

  const filteredGuests = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return guests
    return guests.filter((g) => g.name.toLowerCase().includes(q))
  }, [guests, search])

  const phases = useMemo(() => buildPhases(filteredGuests), [filteredGuests])

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

  // ─── Single-cell toggle ───────────────────────────────────────────────────

  const toggleInvite = useCallback(
    async (guestId: string, eventId: string, currentlyInvited: boolean) => {
      const cellKey = `${guestId}:${eventId}`

      setPendingCells((p) => new Set(p).add(cellKey))
      setInvitationMap((prev) => {
        const next = new Map(prev)
        const s = new Set(next.get(guestId) ?? [])
        if (currentlyInvited) {
          s.delete(eventId)
        } else {
          s.add(eventId)
        }
        next.set(guestId, s)
        return next
      })

      try {
        const res = await fetch(`/api/admin/guests/${guestId}/invitations`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, invited: !currentlyInvited }),
        })
        if (!res.ok) throw new Error()
      } catch {
        setInvitationMap((prev) => {
          const next = new Map(prev)
          const s = new Set(next.get(guestId) ?? [])
          if (currentlyInvited) {
            s.add(eventId)
          } else {
            s.delete(eventId)
          }
          next.set(guestId, s)
          return next
        })
      } finally {
        setPendingCells((p) => {
          const n = new Set(p)
          n.delete(cellKey)
          return n
        })
      }
    },
    []
  )

  // ─── Column All / None ────────────────────────────────────────────────────

  const toggleColumn = useCallback(
    async (eventId: string, mode: 'add' | 'remove') => {
      if (filteredGuests.length === 0) return
      setColumnError(null)
      setPendingColumns((p) => new Set(p).add(eventId))

      const guestIds = filteredGuests.map((g) => g.id)

      setInvitationMap((prev) => {
        const next = new Map(prev)
        for (const gId of guestIds) {
          const s = new Set(next.get(gId) ?? [])
          if (mode === 'add') {
            s.add(eventId)
          } else {
            s.delete(eventId)
          }
          next.set(gId, s)
        }
        return next
      })

      try {
        const res = await fetch('/api/admin/guests/bulk-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guestIds, eventIds: [eventId], mode }),
        })
        if (!res.ok) throw new Error()
      } catch {
        setInvitationMap((prev) => {
          const next = new Map(prev)
          for (const gId of guestIds) {
            const s = new Set(next.get(gId) ?? [])
            if (mode === 'add') {
              s.delete(eventId)
            } else {
              s.add(eventId)
            }
            next.set(gId, s)
          }
          return next
        })
        setColumnError('Failed to update column. Please try again.')
      } finally {
        setPendingColumns((p) => {
          const n = new Set(p)
          n.delete(eventId)
          return n
        })
      }
    },
    [filteredGuests]
  )

  // ─── Phase toggle (all guests in a phase for one event) ───────────────────

  const togglePhase = useCallback(
    async (phaseGuests: GuestStub[], eventId: string, mode: 'add' | 'remove') => {
      setColumnError(null)
      const guestIds = phaseGuests.map((g) => g.id)

      setInvitationMap((prev) => {
        const next = new Map(prev)
        for (const gId of guestIds) {
          const s = new Set(next.get(gId) ?? [])
          if (mode === 'add') s.add(eventId)
          else s.delete(eventId)
          next.set(gId, s)
        }
        return next
      })

      try {
        const res = await fetch('/api/admin/guests/bulk-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guestIds, eventIds: [eventId], mode }),
        })
        if (!res.ok) throw new Error()
      } catch {
        setInvitationMap((prev) => {
          const next = new Map(prev)
          for (const gId of guestIds) {
            const s = new Set(next.get(gId) ?? [])
            if (mode === 'add') s.delete(eventId)
            else s.add(eventId)
            next.set(gId, s)
          }
          return next
        })
        setColumnError('Failed to update phase. Please try again.')
      }
    },
    []
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-8 max-w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-cormorant)', color: 'var(--color-foreground)' }}>
          Invitations
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
          Manage which guests are invited to each event. Guests are grouped by when they were added.
        </p>
      </div>

      {/* Search + count */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative flex-1 max-w-xs">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: 'var(--color-muted)' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search guests…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border"
            style={{
              background: 'var(--color-background)',
              borderColor: 'var(--color-highlight)',
              color: 'var(--color-foreground)',
              outline: 'none',
            }}
          />
        </div>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {filteredGuests.length} {filteredGuests.length === 1 ? 'guest' : 'guests'}
          {search && ` of ${guests.length}`}
        </span>
        {phases.length > 1 && (
          <button
            onClick={toggleAllPhases}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-amber-50"
            style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </div>

      {columnError && (
        <div
          className="mb-4 px-4 py-2 rounded-lg text-sm"
          style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}
        >
          {columnError}
        </div>
      )}

      {events.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--color-muted)' }}>
          No events found. Add events in Settings first.
        </div>
      ) : guests.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--color-muted)' }}>
          No guests yet. Import or add guests from the Guests page.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-highlight)' }}>
          <table className="w-full text-sm border-collapse" style={{ minWidth: `${180 + events.length * 110}px` }}>
            <thead>
              <tr style={{ background: 'var(--color-background)', borderBottom: '1px solid var(--color-highlight)' }}>
                {/* Guest column header */}
                <th
                  className="text-left px-4 py-3 font-medium sticky left-0 z-10"
                  style={{
                    background: 'var(--color-background)',
                    color: 'var(--color-foreground)',
                    minWidth: '200px',
                    borderRight: '1px solid var(--color-highlight)',
                  }}
                >
                  Guest
                </th>
                {/* Event column headers */}
                {events.map((ev) => {
                  const colPending = pendingColumns.has(ev.id)
                  return (
                    <th
                      key={ev.id}
                      className="px-3 py-3 text-center font-medium"
                      style={{ color: 'var(--color-foreground)', minWidth: '110px' }}
                    >
                      <div className="text-xs font-medium truncate" title={ev.name}>
                        {ev.name}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                        {formatEventDate(ev.date)}
                      </div>
                      <div className="flex items-center justify-center gap-1.5 mt-1.5">
                        <button
                          onClick={() => toggleColumn(ev.id, 'add')}
                          disabled={colPending || filteredGuests.length === 0}
                          className="text-xs px-2 py-0.5 rounded transition-opacity disabled:opacity-40"
                          style={{ color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0' }}
                        >
                          All
                        </button>
                        <button
                          onClick={() => toggleColumn(ev.id, 'remove')}
                          disabled={colPending || filteredGuests.length === 0}
                          className="text-xs px-2 py-0.5 rounded transition-opacity disabled:opacity-40"
                          style={{ color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb' }}
                        >
                          None
                        </button>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filteredGuests.length === 0 ? (
                <tr>
                  <td
                    colSpan={events.length + 1}
                    className="text-center py-10 text-sm"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    No guests match &ldquo;{search}&rdquo;
                  </td>
                </tr>
              ) : (
                phases.map((phase) => (
                  <React.Fragment key={phase.label}>
                    {/* Phase header row */}
                    <tr>
                      <td
                        colSpan={events.length + 1}
                        className="px-4 py-2 sticky left-0"
                        style={{
                          background: '#f5f0e8',
                          borderTop: '1px solid var(--color-highlight)',
                          borderBottom: '1px solid var(--color-highlight)',
                        }}
                      >
                        <div className="flex items-center justify-between">
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
                            <span
                              className="text-xs font-semibold uppercase tracking-wide"
                              style={{ color: 'var(--color-accent)' }}
                            >
                              {phase.label}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                              Added {phase.date} · {phase.guests.length} {phase.guests.length === 1 ? 'guest' : 'guests'}
                            </span>
                          </button>
                          {/* Phase-level bulk toggles */}
                          <div className="flex items-center gap-2 pr-2">
                            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Invite phase to:</span>
                            {events.map((ev) => (
                              <div key={ev.id} className="flex items-center gap-1">
                                <button
                                  onClick={() => togglePhase(phase.guests, ev.id, 'add')}
                                  className="text-xs px-1.5 py-0.5 rounded transition-opacity"
                                  style={{ color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0' }}
                                  title={`Invite all Phase ${phase.label.split(' ')[1]} guests to ${ev.name}`}
                                >
                                  +
                                </button>
                                <button
                                  onClick={() => togglePhase(phase.guests, ev.id, 'remove')}
                                  className="text-xs px-1.5 py-0.5 rounded transition-opacity"
                                  style={{ color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb' }}
                                  title={`Remove all Phase ${phase.label.split(' ')[1]} guests from ${ev.name}`}
                                >
                                  −
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                    {/* Guest rows in this phase */}
                    {!collapsedPhases.has(phase.label) && phase.guests.map((guest, idx) => {
                      const invitedSet = invitationMap.get(guest.id) ?? new Set()
                      return (
                        <tr
                          key={guest.id}
                          style={{
                            background: idx % 2 === 0 ? 'var(--color-background)' : '#fdfcf8',
                            borderBottom: '1px solid var(--color-highlight)',
                          }}
                        >
                          {/* Guest name cell — sticky */}
                          <td
                            className="px-4 py-3 sticky left-0 z-10"
                            style={{
                              background: idx % 2 === 0 ? 'var(--color-background)' : '#fdfcf8',
                              borderRight: '1px solid var(--color-highlight)',
                            }}
                          >
                            <div className="font-medium truncate" style={{ color: 'var(--color-foreground)', maxWidth: '160px' }}>
                              {guest.name}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {guest.household_group && (
                                <span className="text-xs truncate" style={{ color: 'var(--color-muted)', maxWidth: '120px' }}>
                                  {guest.household_group}
                                </span>
                              )}
                              <span className="text-xs" style={{ color: 'var(--color-muted)', opacity: 0.6 }}>
                                {new Date(guest.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          </td>
                          {/* Invitation toggle cells */}
                          {events.map((ev) => {
                            const cellKey = `${guest.id}:${ev.id}`
                            const invited = invitedSet.has(ev.id)
                            const pending = pendingCells.has(cellKey) || pendingColumns.has(ev.id)
                            return (
                              <td key={ev.id} className="px-3 py-3 text-center">
                                <button
                                  onClick={() => toggleInvite(guest.id, ev.id, invited)}
                                  disabled={pending}
                                  className="inline-flex items-center justify-center w-16 py-1 rounded-full text-xs font-medium transition-all disabled:opacity-50"
                                  style={
                                    invited
                                      ? { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }
                                      : { background: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb' }
                                  }
                                  title={invited ? 'Click to remove invitation' : 'Click to add invitation'}
                                >
                                  {pending ? (
                                    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  ) : invited ? (
                                    'Yes'
                                  ) : (
                                    'No'
                                  )}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
