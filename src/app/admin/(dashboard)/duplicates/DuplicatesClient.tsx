'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { type Side } from '@prisma/client'
import {
  type DuplicateDetail,
  type RecordDetail,
  type Ref,
} from '@/lib/duplicate-match'
import { type MergePayload } from '@/lib/duplicate-merge'

// ─── Design tokens ────────────────────────────────────────────────────────────

const SIDE_ACCENT: Record<Side, string> = {
  bride: '#be185d',
  groom: '#1d4ed8',
}

const SIDE_BG: Record<Side, string> = {
  bride: '#fdf2f8',
  groom: '#eff6ff',
}

// ─── Local helpers ────────────────────────────────────────────────────────────

type EventStub = { id: string; name: string }

type FieldChoice = 'a' | 'b' | 'none'
type RsvpPick = 'a' | 'b'

type RsvpRow = {
  eventId: string
  aAttending: boolean | null
  aDietary: string | null
  bAttending: boolean | null
  bDietary: string | null
  pick: RsvpPick
  conflict: boolean
}

function attendingGlyph(v: boolean | null): string {
  if (v === true) return '✓'
  if (v === false) return '✗'
  return '—'
}

function attendingColor(v: boolean | null, muted: string): string {
  if (v === true) return '#166534'
  if (v === false) return '#991b1b'
  return muted
}

function roomLabel(roomId: string | null, sideLabel: string): string {
  if (!roomId) return `No room (${sideLabel})`
  return `${sideLabel}'s room: ${roomId}`
}

// ─── Candidate card column ────────────────────────────────────────────────────

function RecordColumn({
  rec,
  side,
  muted,
  eventsByName,
}: {
  rec: RecordDetail
  side: Side
  muted: string
  eventsByName: Map<string, string>
}) {
  const accent = SIDE_ACCENT[side]
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate" style={{ color: 'var(--color-foreground)' }}>
            {rec.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: rec.type === 'guest' ? SIDE_BG[side] : '#f9fafb',
                color: rec.type === 'guest' ? accent : muted,
                border: `1px solid ${rec.type === 'guest' ? accent : 'var(--color-highlight)'}`,
              }}
            >
              {rec.type === 'guest' ? 'Guest' : 'Family Member'}
            </span>
            {rec.type === 'family_member' && rec.parentGuestName && (
              <span className="text-xs italic" style={{ color: muted }}>
                under {rec.parentGuestName}
              </span>
            )}
          </div>
        </div>
      </div>

      <dl className="text-xs space-y-1" style={{ color: 'var(--color-foreground)' }}>
        <div className="flex gap-2">
          <dt className="shrink-0" style={{ color: muted }}>Household:</dt>
          <dd className="truncate">{rec.householdGroup ?? <span style={{ color: muted }}>—</span>}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0" style={{ color: muted }}>Email:</dt>
          <dd className="truncate">{rec.email ?? <span style={{ color: muted }}>—</span>}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0" style={{ color: muted }}>Phone:</dt>
          <dd className="truncate">{rec.phone ?? <span style={{ color: muted }}>—</span>}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0" style={{ color: muted }}>Room:</dt>
          <dd className="truncate">
            {rec.roomId ? <span style={{ color: accent }}>{rec.roomId}</span> : <span style={{ color: muted }}>No room</span>}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0" style={{ color: muted }}>Invite link:</dt>
          <dd>
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                color: rec.linkState === 'valid' ? '#166534' : '#991b1b',
                background: rec.linkState === 'valid' ? '#f0fdf4' : '#fef2f2',
              }}
            >
              Link {rec.linkState}
            </span>
          </dd>
        </div>
      </dl>

      {rec.rsvps.length > 0 ? (
        <div className="pt-1.5">
          <p className="text-xs mb-1" style={{ color: muted }}>RSVPs:</p>
          <ul className="text-xs space-y-0.5" style={{ color: 'var(--color-foreground)' }}>
            {rec.rsvps.map((r) => (
              <li key={r.event_id} className="flex gap-2">
                <span className="shrink-0 font-medium" style={{ color: attendingColor(r.attending, muted) }}>
                  {attendingGlyph(r.attending)}
                </span>
                <span className="truncate">{eventsByName.get(r.event_id) ?? r.event_id}</span>
                {r.dietary && (
                  <span className="truncate italic" style={{ color: muted }}>· {r.dietary}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs" style={{ color: muted }}>No RSVPs</p>
      )}
    </div>
  )
}

// ─── MergeModal ───────────────────────────────────────────────────────────────

function MergeModal({
  target,
  side,
  events,
  onClose,
  onMerged,
}: {
  target: DuplicateDetail
  side: Side
  events: EventStub[]
  onClose: () => void
  onMerged: () => void
}) {
  const accent = SIDE_ACCENT[side]
  const muted = 'var(--color-muted)'

  const eventsByName = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of events) m.set(e.id, e.name)
    return m
  }, [events])

  // ── keep default: prefer keeping the Guest (preserves invite link)
  const initialKeep: 'a' | 'b' = useMemo(() => {
    if (target.a.type === 'guest' && target.b.type === 'family_member') return 'a'
    if (target.b.type === 'guest' && target.a.type === 'family_member') return 'b'
    return 'a'
  }, [target])

  const [keep, setKeep] = useState<'a' | 'b'>(initialKeep)
  const [name, setName] = useState<string>(() => (initialKeep === 'a' ? target.a.name : target.b.name))
  // Which source name is selected (drives the editable textbox). Suggested
  // default follows the kept record; the admin can switch to the other side's
  // name or freely edit the textbox for a spelling fix.
  const [namePick, setNamePick] = useState<'a' | 'b'>(initialKeep)

  // ── joinHousehold: only when winner Guest + loser FamilyMember
  const winnerIsGuestLoserIsFm =
    (keep === 'a' && target.a.type === 'guest' && target.b.type === 'family_member') ||
    (keep === 'b' && target.b.type === 'guest' && target.a.type === 'family_member')
  const loserParentName =
    winnerIsGuestLoserIsFm
      ? (keep === 'a' ? target.b.parentGuestName : target.a.parentGuestName)
      : null

  const [joinHousehold, setJoinHousehold] = useState<boolean>(true)

  // ── email / phone / address field choices
  function defaultFieldPick(aVal: string | null, bVal: string | null, winner: 'a' | 'b'): FieldChoice {
    const winnerVal = winner === 'a' ? aVal : bVal
    const loserVal = winner === 'a' ? bVal : aVal
    if (winnerVal && winnerVal.trim()) return winner
    if (loserVal && loserVal.trim()) return winner === 'a' ? 'b' : 'a'
    return 'none'
  }

  const [emailPick, setEmailPick] = useState<FieldChoice>(() => defaultFieldPick(target.a.email, target.b.email, initialKeep))
  const [phonePick, setPhonePick] = useState<FieldChoice>(() => defaultFieldPick(target.a.phone, target.b.phone, initialKeep))
  const [addressPick, setAddressPick] = useState<FieldChoice>(() => defaultFieldPick(target.a.address, target.b.address, initialKeep))

  // Selecting a source name repopulates the editable textbox with that name.
  function handleNamePickChange(next: 'a' | 'b') {
    setNamePick(next)
    setName(next === 'a' ? target.a.name : target.b.name)
  }

  // When keep changes, recompute defaults if the current pick no longer makes sense
  function handleKeepChange(next: 'a' | 'b') {
    setKeep(next)
    setNamePick(next)
    setName(next === 'a' ? target.a.name : target.b.name)
    setEmailPick(defaultFieldPick(target.a.email, target.b.email, next))
    setPhonePick(defaultFieldPick(target.a.phone, target.b.phone, next))
    setAddressPick(defaultFieldPick(target.a.address, target.b.address, next))
    setRoomChoice(next === 'a' ? (target.a.roomId ? 'a' : target.b.roomId ? 'b' : 'none') : next === 'b' ? (target.b.roomId ? 'b' : target.a.roomId ? 'a' : 'none') : 'none')
    setJoinHousehold(true)
    // Re-default RSVP picks toward new winner
    setRsvpRows((prev) =>
      prev.map((row) => {
        const winnerResp = next === 'a' ? row.aAttending : row.bAttending
        const loserResp = next === 'a' ? row.bAttending : row.aAttending
        const newPick: RsvpPick = winnerResp !== null ? (next === 'a' ? 'a' : 'b') : loserResp !== null ? (next === 'a' ? 'b' : 'a') : row.pick
        return { ...row, pick: newPick }
      }),
    )
  }

  // ── RSVP rows: union of invitedEventIds + rsvp event_ids
  const initialRsvpRows: RsvpRow[] = useMemo(() => {
    const eventIds = new Set<string>()
    for (const id of target.a.invitedEventIds) eventIds.add(id)
    for (const id of target.b.invitedEventIds) eventIds.add(id)
    for (const r of target.a.rsvps) eventIds.add(r.event_id)
    for (const r of target.b.rsvps) eventIds.add(r.event_id)

    const rows: RsvpRow[] = []
    for (const eventId of eventIds) {
      const aRsvp = target.a.rsvps.find((r) => r.event_id === eventId)
      const bRsvp = target.b.rsvps.find((r) => r.event_id === eventId)
      const aAttending = aRsvp ? aRsvp.attending : null
      const bAttending = bRsvp ? bRsvp.attending : null
      const conflict =
        aAttending !== null && bAttending !== null && aAttending !== bAttending
      const defaultPick: RsvpPick =
        initialKeep === 'a'
          ? aAttending !== null ? 'a' : bAttending !== null ? 'b' : 'a'
          : bAttending !== null ? 'b' : aAttending !== null ? 'a' : 'b'
      rows.push({
        eventId,
        aAttending,
        aDietary: aRsvp ? aRsvp.dietary : null,
        bAttending,
        bDietary: bRsvp ? bRsvp.dietary : null,
        pick: defaultPick,
        conflict,
      })
    }
    return rows
  }, [target, initialKeep])

  const [rsvpRows, setRsvpRows] = useState<RsvpRow[]>(initialRsvpRows)

  // ── Room choice
  const initialRoomChoice: 'a' | 'b' | 'none' = useMemo(() => {
    if (initialKeep === 'a') return target.a.roomId ? 'a' : target.b.roomId ? 'b' : 'none'
    return target.b.roomId ? 'b' : target.a.roomId ? 'a' : 'none'
  }, [target, initialKeep])
  const [roomChoice, setRoomChoice] = useState<'a' | 'b' | 'none'>(initialRoomChoice)

  // ── Event invitations: union, all checked by default
  const [invitedEventIds, setInvitedEventIds] = useState<string[]>(() => {
    const union = new Set<string>([...target.a.invitedEventIds, ...target.b.invitedEventIds])
    return Array.from(union)
  })

  // ── Derived: winner/loser records
  const winnerRec = keep === 'a' ? target.a : target.b
  const loserRec = keep === 'a' ? target.b : target.a

  // ── Submit
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function resolvedField(pick: FieldChoice, aVal: string | null, bVal: string | null): string | null {
    if (pick === 'a') return aVal && aVal.trim() ? aVal.trim() : null
    if (pick === 'b') return bVal && bVal.trim() ? bVal.trim() : null
    return null
  }

  async function handleConfirm() {
    setSubmitting(true)
    setError('')
    try {
      const payload: MergePayload = {
        pair: { a: target.a.ref, b: target.b.ref },
        keep,
        ...(winnerIsGuestLoserIsFm ? { joinHousehold } : {}),
        fields: {
          name: name.trim(),
          email: resolvedField(emailPick, target.a.email, target.b.email),
          phone: resolvedField(phonePick, target.a.phone, target.b.phone),
          address: resolvedField(addressPick, target.a.address, target.b.address),
        },
        rsvps: rsvpRows
          .map((row) => {
            const picked: RsvpPick = row.pick
            const attending = picked === 'a' ? row.aAttending : row.bAttending
            const dietary = picked === 'a' ? row.aDietary : row.bDietary
            return { eventId: row.eventId, attending, dietary: dietary ?? null }
          })
          .filter((row): row is { eventId: string; attending: boolean; dietary: string | null } => row.attending !== null)
          .map((row) => ({ event_id: row.eventId, attending: row.attending, dietary: row.dietary })),
        roomChoice,
        invitedEventIds,
      }

      const res = await fetch('/api/admin/duplicates/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Merge failed (${res.status})`)
        setSubmitting(false)
        return
      }
      onMerged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed')
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors'
  const inputStyle = { borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(45,45,45,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 max-h-[90vh] overflow-y-auto"
        style={{ border: '1px solid var(--color-highlight)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10"
          style={{ borderColor: 'var(--color-highlight)' }}
        >
          <h2
            className="text-lg font-medium"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
          >
            Merge Duplicate Records
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Keep A / Keep B */}
          <section>
            <p className="text-xs font-medium tracking-wide mb-2" style={{ color: muted }}>
              WHICH RECORD TO KEEP
            </p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--color-foreground)' }}>
                <input
                  type="radio"
                  name="keep"
                  checked={keep === 'a'}
                  onChange={() => handleKeepChange('a')}
                />
                Keep A — {target.a.name} ({target.a.type === 'guest' ? 'Guest' : 'Family Member'})
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--color-foreground)' }}>
                <input
                  type="radio"
                  name="keep"
                  checked={keep === 'b'}
                  onChange={() => handleKeepChange('b')}
                />
                Keep B — {target.b.name} ({target.b.type === 'guest' ? 'Guest' : 'Family Member'})
              </label>
            </div>

            {winnerIsGuestLoserIsFm && loserParentName && (
              <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm" style={{ color: 'var(--color-foreground)' }}>
                <input
                  type="checkbox"
                  checked={joinHousehold}
                  onChange={(e) => setJoinHousehold(e.target.checked)}
                />
                <span>
                  Add to <strong>{loserParentName}</strong>&apos;s household
                  <span className="ml-1 text-xs" style={{ color: muted }}>(recommended — keeps the invite link valid)</span>
                </span>
              </label>
            )}
          </section>

          {/* Name — pick a source name (suggested = kept record), then edit freely */}
          <section className="space-y-2">
            <p className="text-xs font-medium tracking-wide" style={{ color: muted }}>
              NAME
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 items-start">
              <div>
                <p className="text-xs" style={{ color: muted }}>Pick a name to keep</p>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="namePick"
                      checked={namePick === 'a'}
                      onChange={() => handleNamePickChange('a')}
                    />
                    <span style={{ color: 'var(--color-foreground)' }}>{target.a.name}</span>
                    {keep === 'a' && (
                      <span className="text-xs" style={{ color: muted }}>(suggested)</span>
                    )}
                  </label>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="namePick"
                      checked={namePick === 'b'}
                      onChange={() => handleNamePickChange('b')}
                    />
                    <span style={{ color: 'var(--color-foreground)' }}>{target.b.name}</span>
                    {keep === 'b' && (
                      <span className="text-xs" style={{ color: muted }}>(suggested)</span>
                    )}
                  </label>
                </div>
              </div>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              style={inputStyle}
              placeholder="Selected name — edit to fix spelling"
            />
            <p className="text-xs" style={{ color: muted }}>
              Select either side&rsquo;s name, then edit the textbox freely.
            </p>
          </section>

          {/* Email / Phone / Address field reconciliation */}
          <section className="space-y-4">
            <p className="text-xs font-medium tracking-wide" style={{ color: muted }}>
              FIELDS
            </p>
            <FieldRow
              label="Email"
              aVal={target.a.email}
              bVal={target.b.email}
              pick={emailPick}
              onPick={setEmailPick}
              muted={muted}
            />
            <FieldRow
              label="Phone"
              aVal={target.a.phone}
              bVal={target.b.phone}
              pick={phonePick}
              onPick={setPhonePick}
              muted={muted}
            />
            <FieldRow
              label="Address"
              aVal={target.a.address}
              bVal={target.b.address}
              pick={addressPick}
              onPick={setAddressPick}
              muted={muted}
            />
          </section>

          {/* Per-event RSVP table */}
          <section>
            <p className="text-xs font-medium tracking-wide mb-2" style={{ color: muted }}>
              PER-EVENT RSVP
            </p>
            {rsvpRows.length === 0 ? (
              <p className="text-sm" style={{ color: muted }}>No events invited on either record.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--color-highlight)' }}>
                <table className="w-full text-sm">
                  <thead style={{ background: '#faf9f4' }}>
                    <tr style={{ borderBottom: '1px solid var(--color-highlight)' }}>
                      <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: muted }}>Event</th>
                      <th className="px-3 py-2 text-center text-xs font-medium" style={{ color: muted }}>A</th>
                      <th className="px-3 py-2 text-center text-xs font-medium" style={{ color: muted }}>B</th>
                      <th className="px-3 py-2 text-center text-xs font-medium" style={{ color: muted }}>Pick</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--color-highlight)' }}>
                    {rsvpRows.map((row) => (
                      <tr
                        key={row.eventId}
                        style={row.conflict ? { background: 'var(--color-highlight)' } : undefined}
                      >
                        <td className="px-3 py-2" style={{ color: 'var(--color-foreground)' }}>
                          {eventsByName.get(row.eventId) ?? row.eventId}
                        </td>
                        <td className="px-3 py-2 text-center font-medium" style={{ color: attendingColor(row.aAttending, muted) }}>
                          {attendingGlyph(row.aAttending)}
                        </td>
                        <td className="px-3 py-2 text-center font-medium" style={{ color: attendingColor(row.bAttending, muted) }}>
                          {attendingGlyph(row.bAttending)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-3">
                            <label className="cursor-pointer">
                              <input
                                type="radio"
                                name={`rsvp-${row.eventId}`}
                                checked={row.pick === 'a'}
                                onChange={() =>
                                  setRsvpRows((prev) =>
                                    prev.map((r) => (r.eventId === row.eventId ? { ...r, pick: 'a' as RsvpPick } : r)),
                                  )
                                }
                              />
                            </label>
                            <label className="cursor-pointer">
                              <input
                                type="radio"
                                name={`rsvp-${row.eventId}`}
                                checked={row.pick === 'b'}
                                onChange={() =>
                                  setRsvpRows((prev) =>
                                    prev.map((r) => (r.eventId === row.eventId ? { ...r, pick: 'b' as RsvpPick } : r)),
                                  )
                                }
                              />
                            </label>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {rsvpRows.some((r) => r.conflict) && (
              <p className="text-xs mt-1.5" style={{ color: muted }}>
                Highlighted rows have conflicting responses between A and B.
              </p>
            )}
          </section>

          {/* Room */}
          <section>
            <p className="text-xs font-medium tracking-wide mb-2" style={{ color: muted }}>
              ROOM ASSIGNMENT
            </p>
            <div className="flex flex-wrap gap-4">
              <label
                className={`flex items-center gap-2 text-sm ${target.a.roomId ? 'cursor-pointer' : 'opacity-40'}`}
                style={{ color: 'var(--color-foreground)' }}
              >
                <input
                  type="radio"
                  name="room"
                  checked={roomChoice === 'a'}
                  onChange={() => target.a.roomId && setRoomChoice('a')}
                  disabled={!target.a.roomId}
                />
                {roomLabel(target.a.roomId, 'A')}
              </label>
              <label
                className={`flex items-center gap-2 text-sm ${target.b.roomId ? 'cursor-pointer' : 'opacity-40'}`}
                style={{ color: 'var(--color-foreground)' }}
              >
                <input
                  type="radio"
                  name="room"
                  checked={roomChoice === 'b'}
                  onChange={() => target.b.roomId && setRoomChoice('b')}
                  disabled={!target.b.roomId}
                />
                {roomLabel(target.b.roomId, 'B')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--color-foreground)' }}>
                <input
                  type="radio"
                  name="room"
                  checked={roomChoice === 'none'}
                  onChange={() => setRoomChoice('none')}
                />
                No room
              </label>
            </div>
          </section>

          {/* Event invitations */}
          <section>
            <p className="text-xs font-medium tracking-wide mb-2" style={{ color: muted }}>
              EVENT INVITATIONS
            </p>
            {invitedEventIds.length === 0 && (
              <p className="text-sm" style={{ color: muted }}>No events to invite on either record.</p>
            )}
            <div className="space-y-1.5">
              {Array.from(
                new Set([...target.a.invitedEventIds, ...target.b.invitedEventIds]),
              ).map((eventId) => {
                const checked = invitedEventIds.includes(eventId)
                return (
                  <label key={eventId} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setInvitedEventIds((prev) =>
                          prev.includes(eventId)
                            ? prev.filter((id) => id !== eventId)
                            : [...prev, eventId],
                        )
                      }
                    />
                    <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>
                      {eventsByName.get(eventId) ?? eventId}
                    </span>
                  </label>
                )
              })}
            </div>
          </section>

          {/* Summary */}
          <section
            className="rounded-xl p-4"
            style={{ background: SIDE_BG[side], border: `1px solid ${accent}` }}
          >
            <p className="text-sm" style={{ color: 'var(--color-foreground)' }}>
              Will keep: <strong>{winnerRec.name}</strong> ({winnerRec.type === 'guest' ? 'Guest' : 'Family Member'}).
            </p>
            <p className="text-sm" style={{ color: 'var(--color-foreground)' }}>
              Will delete: <strong>{loserRec.name}</strong> ({loserRec.type === 'guest' ? 'Guest' : 'Family Member'}).
            </p>
            <p className="text-xs mt-2" style={{ color: muted }}>
              {winnerRec.type === 'guest'
                ? 'Their invite link will stay valid.'
                : 'Their invite link will stop working.'}
            </p>
            <p className="text-xs mt-1" style={{ color: muted }}>
              {rsvpRows.length} RSVP response{rsvpRows.length !== 1 ? 's' : ''} will be applied;{' '}
              {roomChoice === 'none'
                ? 'no room assigned'
                : roomChoice === 'a'
                  ? `room ${target.a.roomId ?? '(A)'} kept`
                  : `room ${target.b.roomId ?? '(B)'} kept`}
              .
            </p>
          </section>

          {error && (
            <p className="text-sm py-2 px-3 rounded-lg" style={{ background: '#fef2f2', color: '#991b1b' }}>
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--color-highlight)', color: muted }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting || !name.trim()}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
              style={{ background: accent }}
            >
              {submitting ? 'Merging…' : 'Confirm Merge'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Field reconciliation row ─────────────────────────────────────────────────

function FieldRow({
  label,
  aVal,
  bVal,
  pick,
  onPick,
  muted,
}: {
  label: string
  aVal: string | null
  bVal: string | null
  pick: FieldChoice
  onPick: (p: FieldChoice) => void
  muted: string
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 items-start">
      <div>
        <p className="text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>{label}</p>
      </div>
      <div className="sm:col-span-2 space-y-1.5">
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name={label} checked={pick === 'a'} onChange={() => onPick('a')} />
            <span style={{ color: 'var(--color-foreground)' }}>
              {aVal ?? <span style={{ color: muted }}>—</span>}
            </span>
          </label>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name={label} checked={pick === 'b'} onChange={() => onPick('b')} />
            <span style={{ color: 'var(--color-foreground)' }}>
              {bVal ?? <span style={{ color: muted }}>—</span>}
            </span>
          </label>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name={label} checked={pick === 'none'} onChange={() => onPick('none')} />
            <span style={{ color: muted }}>none</span>
          </label>
        </div>
      </div>
    </div>
  )
}

// ─── Candidate card ───────────────────────────────────────────────────────────

function CandidateCard({
  dup,
  side,
  eventsByName,
  onMerge,
  onDismiss,
  dismissing,
}: {
  dup: DuplicateDetail
  side: Side
  eventsByName: Map<string, string>
  onMerge: () => void
  onDismiss: () => void
  dismissing: boolean
}) {
  const accent = SIDE_ACCENT[side]
  const muted = 'var(--color-muted)'
  const confidencePct = Math.round(dup.confidence * 100)

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: 'var(--color-highlight)' }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: SIDE_BG[side], borderBottom: '1px solid var(--color-highlight)' }}
      >
        <p className="text-xs font-medium" style={{ color: accent }}>
          Possible duplicate
        </p>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'white', color: accent, border: `1px solid ${accent}` }}
        >
          {confidencePct}% match
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x" style={{ borderColor: 'var(--color-highlight)' }}>
        <div className="p-4">
          <p className="text-xs font-medium mb-2" style={{ color: muted }}>RECORD A</p>
          <RecordColumn rec={dup.a} side={side} muted={muted} eventsByName={eventsByName} />
        </div>
        <div className="p-4">
          <p className="text-xs font-medium mb-2" style={{ color: muted }}>RECORD B</p>
          <RecordColumn rec={dup.b} side={side} muted={muted} eventsByName={eventsByName} />
        </div>
      </div>

      <div
        className="flex flex-col sm:flex-row sm:justify-end gap-2 px-4 py-3"
        style={{ borderTop: '1px solid var(--color-highlight)', background: '#faf9f4' }}
      >
        <button
          onClick={onDismiss}
          disabled={dismissing}
          className="text-xs px-4 py-2 rounded-lg border disabled:opacity-50"
          style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
        >
          {dismissing ? 'Dismissing…' : 'Not a duplicate'}
        </button>
        <button
          onClick={onMerge}
          className="text-xs px-4 py-2 rounded-lg text-white font-medium"
          style={{ background: accent }}
        >
          Merge
        </button>
      </div>
    </div>
  )
}

// ─── Manual map-and-merge panel ───────────────────────────────────────────────
//
// Lets the admin manually pair ANY family member with ANY guest — independent
// of the fuzzy auto-detector. Pick a family member (source), pick a guest
// (target), then the existing MergeModal opens for reconciliation. Reuses the
// merge endpoint, which accepts any pair of refs.

function ManualMergePanel({
  records,
  loading,
  error,
  side,
  eventsByName,
  onMerge,
}: {
  records: RecordDetail[]
  loading: boolean
  error: string
  side: Side
  eventsByName: Map<string, string>
  onMerge: (target: DuplicateDetail) => void
}) {
  const accent = SIDE_ACCENT[side]
  const muted = 'var(--color-muted)'

  const [fmQuery, setFmQuery] = useState('')
  const [guestQuery, setGuestQuery] = useState('')
  const [fmId, setFmId] = useState<string | null>(null)
  const [guestId, setGuestId] = useState<string | null>(null)

  const familyMembers = useMemo(
    () => records.filter((r) => r.type === 'family_member'),
    [records],
  )
  const guests = useMemo(() => records.filter((r) => r.type === 'guest'), [records])

  // Derive the selected records from the live list by id, so a stale id
  // (e.g. the family member just got deleted by a merge) drops cleanly.
  const selectedFm = useMemo(
    () => familyMembers.find((r) => r.ref.id === fmId) ?? null,
    [familyMembers, fmId],
  )
  const selectedGuest = useMemo(
    () => guests.find((r) => r.ref.id === guestId) ?? null,
    [guests, guestId],
  )

  const fmFiltered = useMemo(() => {
    const q = fmQuery.trim().toLowerCase()
    if (!q) return familyMembers
    return familyMembers.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.parentGuestName?.toLowerCase().includes(q) ?? false),
    )
  }, [familyMembers, fmQuery])

  const guestFiltered = useMemo(() => {
    const q = guestQuery.trim().toLowerCase()
    if (!q) return guests
    return guests.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.householdGroup?.toLowerCase().includes(q) ?? false) ||
        (r.email?.toLowerCase().includes(q) ?? false) ||
        (r.phone?.toLowerCase().includes(q) ?? false),
    )
  }, [guests, guestQuery])

  if (loading) {
    return (
      <div
        className="rounded-2xl border py-16 text-center"
        style={{ borderColor: 'var(--color-highlight)' }}
      >
        <p className="text-sm" style={{ color: muted }}>Loading records…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm py-2 px-4 rounded-lg" style={{ background: '#fef2f2', color: '#991b1b' }}>
        {error}
      </div>
    )
  }

  const inputCls = 'w-full text-sm px-3 py-2 rounded-lg border focus:outline-none'
  const inputStyle = { borderColor: 'var(--color-highlight)' }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: muted }}>
        Pick a family member, then pick the guest you believe is the same person.
        The merge window opens to reconcile their RSVPs, room, and invitations.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── Family members (source) ─────────────────────────────────────── */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ borderColor: 'var(--color-highlight)' }}
        >
          <div
            className="px-4 py-2.5"
            style={{ background: '#f9fafb', borderBottom: '1px solid var(--color-highlight)' }}
          >
            <p className="text-xs font-medium" style={{ color: muted }}>
              1. SELECT A FAMILY MEMBER ({familyMembers.length})
            </p>
          </div>
          <div className="p-3 space-y-2">
            <input
              type="text"
              placeholder="Search by name or parent guest…"
              value={fmQuery}
              onChange={(e) => setFmQuery(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
            <div className="max-h-80 overflow-y-auto -mx-1 px-1 space-y-1">
              {fmFiltered.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: muted }}>
                  {familyMembers.length === 0 ? 'No family members on your side.' : 'No matches.'}
                </p>
              ) : (
                fmFiltered.map((r) => {
                  const selected = r.ref.id === fmId
                  return (
                    <button
                      key={r.ref.id}
                      onClick={() => setFmId(r.ref.id)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{
                        background: selected ? SIDE_BG[side] : 'transparent',
                        border: `1px solid ${selected ? accent : 'transparent'}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate" style={{ color: 'var(--color-foreground)' }}>
                          {r.name}
                        </span>
                        {r.rsvps.length > 0 && (
                          <span className="text-xs shrink-0" style={{ color: muted }}>
                            {r.rsvps.filter((x) => x.attending).length} ✓
                          </span>
                        )}
                      </div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: muted }}>
                        {r.parentGuestName ? `under ${r.parentGuestName}` : '—'}
                        {r.householdGroup ? ` · ${r.householdGroup}` : ''}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* ── Guests (target) ────────────────────────────────────────────── */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ borderColor: 'var(--color-highlight)' }}
        >
          <div
            className="px-4 py-2.5"
            style={{ background: '#f9fafb', borderBottom: '1px solid var(--color-highlight)' }}
          >
            <p className="text-xs font-medium" style={{ color: muted }}>
              2. SELECT A GUEST TO MERGE INTO ({guests.length})
            </p>
          </div>
          <div className="p-3 space-y-2">
            <input
              type="text"
              placeholder="Search by name, household, email, phone…"
              value={guestQuery}
              onChange={(e) => setGuestQuery(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
            <div className="max-h-80 overflow-y-auto -mx-1 px-1 space-y-1">
              {guestFiltered.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: muted }}>
                  {guests.length === 0 ? 'No guests on your side.' : 'No matches.'}
                </p>
              ) : (
                guestFiltered.map((r) => {
                  const selected = r.ref.id === guestId
                  return (
                    <button
                      key={r.ref.id}
                      onClick={() => setGuestId(r.ref.id)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{
                        background: selected ? SIDE_BG[side] : 'transparent',
                        border: `1px solid ${selected ? accent : 'transparent'}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate" style={{ color: 'var(--color-foreground)' }}>
                          {r.name}
                        </span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            color: r.linkState === 'valid' ? '#166534' : '#991b1b',
                            background: r.linkState === 'valid' ? '#f0fdf4' : '#fef2f2',
                          }}
                        >
                          link {r.linkState}
                        </span>
                      </div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: muted }}>
                        {r.householdGroup ? `${r.householdGroup} · ` : ''}
                        {r.email ?? r.phone ?? 'no contact'}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Preview + action ───────────────────────────────────────────────── */}
      {selectedFm && selectedGuest ? (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ borderColor: 'var(--color-highlight)' }}
        >
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ background: SIDE_BG[side], borderBottom: '1px solid var(--color-highlight)' }}
          >
            <p className="text-xs font-medium" style={{ color: accent }}>
              Manual merge
            </p>
            <span className="text-xs" style={{ color: muted }}>
              {selectedFm.name} → {selectedGuest.name}
            </span>
          </div>
          <div
            className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x"
            style={{ borderColor: 'var(--color-highlight)' }}
          >
            <div className="p-4">
              <p className="text-xs font-medium mb-2" style={{ color: muted }}>FAMILY MEMBER (will be deleted)</p>
              <RecordColumn rec={selectedFm} side={side} muted={muted} eventsByName={eventsByName} />
            </div>
            <div className="p-4">
              <p className="text-xs font-medium mb-2" style={{ color: muted }}>GUEST (will be kept)</p>
              <RecordColumn rec={selectedGuest} side={side} muted={muted} eventsByName={eventsByName} />
            </div>
          </div>
          <div
            className="flex flex-col sm:flex-row sm:justify-end gap-2 px-4 py-3"
            style={{ borderTop: '1px solid var(--color-highlight)', background: '#faf9f4' }}
          >
            <button
              onClick={() => onMerge({ a: selectedFm, b: selectedGuest, confidence: 0 })}
              className="text-xs px-4 py-2 rounded-lg text-white font-medium"
              style={{ background: accent }}
            >
              Merge {selectedFm.name} into {selectedGuest.name}
            </button>
          </div>
        </div>
      ) : (
        <div
          className="rounded-2xl border py-10 text-center"
          style={{ borderColor: 'var(--color-highlight)' }}
        >
          <p className="text-sm" style={{ color: muted }}>
            {selectedFm ? 'Now pick a guest to merge into.' : 'Pick a family member to begin.'}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main client ──────────────────────────────────────────────────────────────

export default function DuplicatesClient({
  side,
  events,
}: {
  side: Side
  events: EventStub[]
}) {
  const muted = 'var(--color-muted)'

  const [duplicates, setDuplicates] = useState<DuplicateDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mergeTarget, setMergeTarget] = useState<DuplicateDetail | null>(null)
  const [dismissingKey, setDismissingKey] = useState<string | null>(null)
  const [dismissError, setDismissError] = useState('')

  // Manual map-and-merge tab state.
  const [tab, setTab] = useState<'detected' | 'manual'>('detected')
  const [records, setRecords] = useState<RecordDetail[]>([])
  const [recordsLoaded, setRecordsLoaded] = useState(false)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsError, setRecordsError] = useState('')

  const eventsByName = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of events) m.set(e.id, e.name)
    return m
  }, [events])

  const fetchDuplicates = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/duplicates')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Failed to load duplicates (${res.status})`)
      }
      const data = (await res.json()) as { duplicates: DuplicateDetail[] }
      setDuplicates(data.duplicates ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load duplicates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDuplicates()
  }, [fetchDuplicates])

  const fetchRecords = useCallback(async () => {
    setRecordsLoading(true)
    setRecordsError('')
    try {
      const res = await fetch('/api/admin/duplicates/records')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Failed to load records (${res.status})`)
      }
      const data = (await res.json()) as { records: RecordDetail[] }
      setRecords(data.records ?? [])
      setRecordsLoaded(true)
    } catch (e) {
      setRecordsError(e instanceof Error ? e.message : 'Failed to load records')
    } finally {
      setRecordsLoading(false)
    }
  }, [])

  // Fetch the full records list the first time the manual tab is opened.
  useEffect(() => {
    if (tab === 'manual' && !recordsLoaded && !recordsLoading) {
      fetchRecords()
    }
  }, [tab, recordsLoaded, recordsLoading, fetchRecords])

  function pairKey(d: DuplicateDetail): string {
    return `${d.a.ref.type}:${d.a.ref.id}+${d.b.ref.type}:${d.b.ref.id}`
  }

  async function handleDismiss(d: DuplicateDetail) {
    setDismissingKey(pairKey(d))
    setDismissError('')
    try {
      const res = await fetch('/api/admin/duplicates/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a: d.a.ref, b: d.b.ref }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Dismiss failed (${res.status})`)
      }
      await fetchDuplicates()
    } catch (e) {
      setDismissError(e instanceof Error ? e.message : 'Dismiss failed')
    } finally {
      setDismissingKey(null)
    }
  }

  function handleMerged() {
    setMergeTarget(null)
    fetchDuplicates()
    if (recordsLoaded) fetchRecords()
  }

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-3xl font-light tracking-wide"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
        >
          Duplicate Guests
        </h1>
        <p className="text-sm mt-0.5" style={{ color: muted }}>
          Review auto-detected duplicates, or manually map a family member to a guest.
        </p>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--color-highlight)' }}>
        {([
          ['detected', `Detected duplicates${duplicates.length > 0 ? ` (${duplicates.length})` : ''}`],
          ['manual', 'Manual merge'],
        ] as const).map(([key, label]) => {
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="text-sm px-4 py-2 -mb-px border-b-2 transition-colors"
              style={{
                borderColor: active ? SIDE_ACCENT[side] : 'transparent',
                color: active ? SIDE_ACCENT[side] : muted,
                fontWeight: active ? 500 : 400,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Errors */}
      {tab === 'detected' && error && (
        <div className="text-sm py-2 px-4 rounded-lg" style={{ background: '#fef2f2', color: '#991b1b' }}>
          {error}
        </div>
      )}
      {tab === 'detected' && dismissError && (
        <div className="text-sm py-2 px-4 rounded-lg" style={{ background: '#fef2f2', color: '#991b1b' }}>
          {dismissError}
        </div>
      )}

      {/* Body */}
      {tab === 'manual' ? (
        <ManualMergePanel
          records={records}
          loading={recordsLoading}
          error={recordsError}
          side={side}
          eventsByName={eventsByName}
          onMerge={(target) => setMergeTarget(target)}
        />
      ) : loading ? (
        <div
          className="rounded-2xl border py-16 text-center"
          style={{ borderColor: 'var(--color-highlight)' }}
        >
          <p className="text-sm" style={{ color: muted }}>Loading duplicates…</p>
        </div>
      ) : duplicates.length === 0 ? (
        <div
          className="rounded-2xl border py-16 text-center"
          style={{ borderColor: 'var(--color-highlight)' }}
        >
          <p className="text-sm" style={{ color: muted }}>No duplicates found.</p>
          <p className="text-xs mt-1" style={{ color: muted }}>
            Records with similar names above a confidence threshold appear here for review.
            Use the Manual merge tab to pair any family member with a guest yourself.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {duplicates.map((dup) => (
            <Fragment key={pairKey(dup)}>
              <CandidateCard
                dup={dup}
                side={side}
                eventsByName={eventsByName}
                onMerge={() => setMergeTarget(dup)}
                onDismiss={() => handleDismiss(dup)}
                dismissing={dismissingKey === pairKey(dup)}
              />
            </Fragment>
          ))}
        </div>
      )}

      {/* Merge modal */}
      {mergeTarget && (
        <MergeModal
          target={mergeTarget}
          side={side}
          events={events}
          onClose={() => setMergeTarget(null)}
          onMerged={handleMerged}
        />
      )}
    </div>
  )
}