'use client'

import { useMemo, useState } from 'react'
import { type Side } from '@prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type FamilyMemberStub = { id: string; name: string; is_child: boolean }

type HouseholdGuest = {
  id: string
  name: string
  email: string | null
  phone: string | null
  household_group: string | null
  familyMembers: FamilyMemberStub[]
}

type Household = {
  name: string | null // null == "Unassigned"
  guests: HouseholdGuest[]
}

// Sentinel <select> values for the move dialog (kept distinct from any real
// household name, which can't contain a control character).
const OPT_NEW = '__new__'
const OPT_NONE = '__none__'

const SIDE_ACCENT: Record<Side, string> = {
  bride: '#be185d',
  groom: '#1d4ed8',
}

const SIDE_BG: Record<Side, string> = {
  bride: '#fdf2f8',
  groom: '#eff6ff',
}

// ─── Main client ──────────────────────────────────────────────────────────────

export default function HouseholdsClient({
  initialGuests,
  side,
}: {
  initialGuests: HouseholdGuest[]
  side: Side
}) {
  const accent = SIDE_ACCENT[side]
  const bg = SIDE_BG[side]

  const [guests, setGuests] = useState<HouseholdGuest[]>(initialGuests)
  const [movingGuest, setMovingGuest] = useState<HouseholdGuest | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Group guests by household_group; "Unassigned" (null) sorts last.
  const households = useMemo<Household[]>(() => {
    const map = new Map<string | null, HouseholdGuest[]>()
    for (const g of guests) {
      const key = g.household_group
      const arr = map.get(key)
      if (arr) arr.push(g)
      else map.set(key, [g])
    }
    return Array.from(map.entries())
      .map(([name, gs]) => ({ name, guests: gs }))
      .sort((a, b) => {
        if (a.name === null) return 1
        if (b.name === null) return -1
        return a.name.localeCompare(b.name)
      })
  }, [guests])

  // Existing household names (non-null), for the move dialog's dropdown.
  const existingNames = useMemo(() => {
    const set = new Set<string>()
    for (const g of guests) if (g.household_group) set.add(g.household_group)
    return Array.from(set).sort()
  }, [guests])

  const totalPeople = useMemo(
    () => guests.reduce((s, g) => s + 1 + g.familyMembers.length, 0),
    [guests],
  )

  function applyMove(guestId: string, newGroup: string | null) {
    setGuests((prev) =>
      prev.map((g) => (g.id === guestId ? { ...g, household_group: newGroup } : g)),
    )
  }

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-3xl font-light tracking-wide"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
        >
          Household Management
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
          {guests.length === 0
            ? 'No guests yet.'
            : `${households.length} household${households.length === 1 ? '' : 's'} · ${totalPeople} ${
                totalPeople === 1 ? 'person' : 'people'
              }`}
        </p>
      </div>

      {error && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: bg, color: accent, border: `1px solid ${accent}33` }}
        >
          {error}
        </div>
      )}

      {guests.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {households.map((h) => (
            <HouseholdCard
              key={h.name ?? '__unassigned__'}
              household={h}
              accent={accent}
              bg={bg}
              onMove={(g) => {
                setError(null)
                setMovingGuest(g)
              }}
            />
          ))}
        </div>
      )}

      {movingGuest && (
        <MoveModal
          guest={movingGuest}
          existingNames={existingNames}
          accent={accent}
          bg={bg}
          onClose={() => setMovingGuest(null)}
          onMoved={(newGroup) => {
            applyMove(movingGuest.id, newGroup)
            setMovingGuest(null)
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="rounded-xl border p-10 text-center"
      style={{ borderColor: 'var(--color-highlight)', background: 'var(--color-background)' }}
    >
      <p className="text-base" style={{ color: 'var(--color-foreground)' }}>
        No guests to organize yet.
      </p>
      <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
        Add guests on the Guests page, then group them into households here.
      </p>
    </div>
  )
}

// ─── Household card ───────────────────────────────────────────────────────────

function HouseholdCard({
  household,
  accent,
  bg,
  onMove,
}: {
  household: Household
  accent: string
  bg: string
  onMove: (guest: HouseholdGuest) => void
}) {
  const unassigned = household.name === null
  const memberCount = household.guests.reduce((s, g) => s + 1 + g.familyMembers.length, 0)

  return (
    <div
      className="rounded-xl border p-4 flex flex-col"
      style={{
        borderColor: unassigned ? 'var(--color-highlight)' : `${accent}40`,
        background: 'var(--color-background)',
        borderStyle: unassigned ? 'dashed' : 'solid',
      }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <h2
            className="text-lg font-medium truncate"
            style={{
              fontFamily: 'var(--font-heading)',
              color: unassigned ? 'var(--color-muted)' : 'var(--color-foreground)',
            }}
          >
            {unassigned ? 'Unassigned' : household.name}
          </h2>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {memberCount} {memberCount === 1 ? 'person' : 'people'}
            {' · '}
            {household.guests.length} {household.guests.length === 1 ? 'guest' : 'guests'}
          </p>
        </div>
        {!unassigned && (
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: accent }}
            aria-hidden
          />
        )}
      </div>

      {/* Members */}
      <div className="space-y-2 flex-1">
        {household.guests.map((g) => (
          <GuestRow key={g.id} guest={g} accent={accent} bg={bg} onMove={() => onMove(g)} />
        ))}
      </div>
    </div>
  )
}

// ─── Guest row (with nested family members) ───────────────────────────────────

function GuestRow({
  guest,
  accent,
  bg,
  onMove,
}: {
  guest: HouseholdGuest
  accent: string
  bg: string
  onMove: () => void
}) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: 'var(--color-highlight)', border: '1px solid var(--color-highlight)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className="text-sm font-medium truncate"
            style={{ color: 'var(--color-foreground)' }}
          >
            {guest.name}
          </p>
          {(guest.email || guest.phone) && (
            <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-muted)' }}>
              {[guest.email, guest.phone].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onMove}
          className="text-xs px-2 py-1 rounded-md flex-shrink-0 transition-opacity hover:opacity-80"
          style={{ color: accent, background: bg }}
        >
          Move
        </button>
      </div>

      {guest.familyMembers.length > 0 && (
        <ul className="mt-2 space-y-1">
          {guest.familyMembers.map((fm) => (
            <li
              key={fm.id}
              className="text-xs flex items-center gap-1.5 pl-2"
              style={{ color: 'var(--color-muted)' }}
            >
              <span
                className="inline-block w-1 h-1 rounded-full flex-shrink-0"
                style={{ background: accent }}
                aria-hidden
              />
              <span className="truncate">{fm.name}</span>
              {fm.is_child && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: bg, color: accent }}
                >
                  child
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Move modal ───────────────────────────────────────────────────────────────

function MoveModal({
  guest,
  existingNames,
  accent,
  bg,
  onClose,
  onMoved,
  onError,
}: {
  guest: HouseholdGuest
  existingNames: string[]
  accent: string
  bg: string
  onClose: () => void
  onMoved: (newGroup: string | null) => void
  onError: (message: string) => void
}) {
  // Other households (exclude the guest's current one — moving there is a no-op).
  const otherNames = existingNames.filter((n) => n !== guest.household_group)

  // Default selection: first other household if any, else "new household".
  const defaultOpt = otherNames.length > 0 ? otherNames[0] : OPT_NEW

  const [selected, setSelected] = useState<string>(defaultOpt)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const showNewField = selected === OPT_NEW

  async function handleConfirm() {
    if (submitting) return
    if (showNewField && !newName.trim()) {
      onError('Household name cannot be empty.')
      return
    }
    setSubmitting(true)
    let value: string | null
    if (selected === OPT_NEW) value = newName.trim()
    else if (selected === OPT_NONE) value = null
    else value = selected

    try {
      const res = await fetch(`/api/admin/guests/${guest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_group: value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to move guest.')
      }
      onMoved(value)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(45,45,45,0.4)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 w-full max-w-md"
        style={{ background: 'var(--color-background)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          className="text-xl font-medium mb-1"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
        >
          Move guest
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
          Move{' '}
          <span style={{ color: 'var(--color-foreground)', fontWeight: 500 }}>{guest.name}</span>
          {guest.familyMembers.length > 0 && (
            <>
              {' '}
              and {guest.familyMembers.length} family{' '}
              {guest.familyMembers.length === 1 ? 'member' : 'members'}
            </>
          )}{' '}
          to another household.
        </p>

        <label
          className="block text-xs mb-1.5"
          style={{ color: 'var(--color-muted)' }}
        >
          Target household
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm mb-3"
          style={{
            border: '1px solid var(--color-highlight)',
            background: 'var(--color-background)',
            color: 'var(--color-foreground)',
          }}
        >
          {otherNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value={OPT_NEW}>+ New household…</option>
          <option value={OPT_NONE}>No household (Unassigned)</option>
        </select>

        {showNewField && (
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New household name"
            autoFocus
            className="w-full rounded-lg px-3 py-2 text-sm mb-4"
            style={{
              border: '1px solid var(--color-highlight)',
              background: 'var(--color-background)',
              color: 'var(--color-foreground)',
            }}
          />
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ color: 'var(--color-muted)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm transition-opacity disabled:opacity-60"
            style={{ background: accent, color: '#fff' }}
          >
            {submitting ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  )
}