'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { type Side, type RoomType } from '@prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type AssignmentRow = {
  id: string
  room_id: string
  guest_id: string
  family_member_id: string | null
  check_in: string | null
  check_out: string | null
  notes: string | null
  assigned_at: string
  guest?: { id: string; name: string; household_group: string | null }
  familyMember?: { id: string; name: string; is_child: boolean } | null
}

type RoomRow = {
  id: string
  hotel_id: string
  room_number: string
  room_type: RoomType
  capacity: number
  floor: string | null
  notes: string | null
  assignments: AssignmentRow[]
}

type HotelRow = {
  id: string
  name: string
  address: string | null
  city: string | null
  map_url: string | null
  total_rooms: number
  check_in_date: string | null
  check_out_date: string | null
  contact_phone: string | null
  distance_info: string | null
  side: Side
  notes: string | null
  created_at: string
  updated_at: string
  rooms: RoomRow[]
}

type ConfirmedGuest = {
  id: string
  name: string
  household_group: string | null
  // Non-empty means the primary guest themselves is attending and needs a room.
  rsvpResponses: { id: string }[]
  // Only family members who are attending (each needs their own bed).
  familyMembers: { id: string; name: string; is_child: boolean }[]
}

type Props = {
  initialHotels: HotelRow[]
  confirmedGuests: ConfirmedGuest[]
  initialAssignments: AssignmentRow[]
  side: Side
}

// A person is the unit of room assignment: either a primary guest
// (familyMemberId null) or one of their family members. Each occupies one bed.
type Person = {
  key: string
  guestId: string
  familyMemberId: string | null
  name: string
  isChild: boolean
  primaryName: string
  householdGroup: string | null
}

type HotelFormState = {
  name: string
  address: string
  city: string
  map_url: string
  check_in_date: string
  check_out_date: string
  contact_phone: string
  distance_info: string
  total_rooms: string
  notes: string
}

type RoomFormState = {
  room_number: string
  room_type: RoomType
  capacity: string
  floor: string
  notes: string
}

type BulkFormState = {
  prefix: string
  start: string
  count: string
  room_type: RoomType
  capacity: string
  floor: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDE_ACCENT: Record<Side, string> = { bride: '#be185d', groom: '#1d4ed8' }
const SIDE_BG: Record<Side, string> = { bride: '#fdf2f8', groom: '#eff6ff' }
const SIDE_LABEL: Record<Side, string> = { bride: 'Bride Side', groom: 'Groom Side' }
const ROOM_TYPE_LABELS: Record<RoomType, string> = { single: 'Single', double: 'Double', suite: 'Suite' }

const EMPTY_HOTEL_FORM: HotelFormState = {
  name: '', address: '', city: '', map_url: '', check_in_date: '',
  check_out_date: '', contact_phone: '', distance_info: '', total_rooms: '0', notes: '',
}
const EMPTY_ROOM_FORM: RoomFormState = {
  room_number: '', room_type: 'double', capacity: '2', floor: '', notes: '',
}
const EMPTY_BULK_FORM: BulkFormState = {
  prefix: '', start: '01', count: '10', room_type: 'double', capacity: '2', floor: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function csvEscape(val: string) {
  if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`
  return val
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function capacityBadge(assigned: number, capacity: number) {
  if (assigned >= capacity) return { label: 'Full', color: '#dc2626', bg: '#fee2e2' }
  if (assigned === capacity - 1) return { label: '1 spot', color: '#92400e', bg: '#fef3c7' }
  return { label: `${capacity - assigned} left`, color: '#166534', bg: '#dcfce7' }
}

// Unique key for a person: (guest_id, family_member_id). null family_member_id
// identifies the primary guest; a concrete id identifies one family member.
function personKey(guestId: string, familyMemberId: string | null | undefined) {
  return `${guestId}|${familyMemberId ?? ''}`
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(45,45,45,0.4)' }}>
      <div className="w-full max-w-lg rounded-2xl shadow-lg max-h-[90vh] flex flex-col" style={{ background: 'var(--color-background)', border: '1px solid var(--color-highlight)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--color-highlight)' }}>
          <h3 className="text-base font-medium" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" style={{ color: 'var(--color-muted)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ─── Shared input style ───────────────────────────────────────────────────────

const inputCls = 'w-full rounded-sm px-3 py-2 text-sm border outline-none focus:ring-1'
const inputStyle = { borderColor: 'var(--color-highlight)', background: 'white', color: 'var(--color-foreground)' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>{label}</label>
      {children}
    </div>
  )
}

// ─── Hotel form ───────────────────────────────────────────────────────────────

function HotelForm({
  form, setForm, error, loading, onSubmit, onCancel, mode,
}: {
  form: HotelFormState
  setForm: React.Dispatch<React.SetStateAction<HotelFormState>>
  error: string
  loading: boolean
  onSubmit: () => void
  onCancel: () => void
  mode: 'add' | 'edit'
}) {
  const accent = { color: 'white', background: '#2D2D2D' }
  const [distLoading, setDistLoading] = React.useState(false)
  const [distError, setDistError] = React.useState('')

  async function calcDistances() {
    const address = [form.name, form.address, form.city].filter(Boolean).join(', ')
    if (!form.address && !form.city) { setDistError('Enter an address or city first.'); return }
    setDistLoading(true)
    setDistError('')
    const res = await fetch('/api/admin/hotels/distances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    })
    const data = await res.json() as { distance_info?: string; error?: string }
    setDistLoading(false)
    if (!res.ok) { setDistError(data.error ?? 'Failed to calculate distances.'); return }
    setForm(f => ({ ...f, distance_info: data.distance_info ?? f.distance_info }))
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{error}</p>}
      <Field label="Hotel Name *">
        <input className={inputCls} style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Grand Hyatt" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Address">
          <input className={inputCls} style={inputStyle} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </Field>
        <Field label="City">
          <input className={inputCls} style={inputStyle} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check-in Date">
          <input type="date" className={inputCls} style={inputStyle} value={form.check_in_date} onChange={e => setForm(f => ({ ...f, check_in_date: e.target.value }))} />
        </Field>
        <Field label="Check-out Date">
          <input type="date" className={inputCls} style={inputStyle} value={form.check_out_date} onChange={e => setForm(f => ({ ...f, check_out_date: e.target.value }))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact Phone">
          <input className={inputCls} style={inputStyle} value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
        </Field>
        <Field label="Total Rooms (inventory)">
          <input type="number" min="0" className={inputCls} style={inputStyle} value={form.total_rooms} onChange={e => setForm(f => ({ ...f, total_rooms: e.target.value }))} />
        </Field>
      </div>
      <Field label="Distances from landmarks">
        <div className="flex gap-2 items-start">
          <input
            className={inputCls}
            style={{ ...inputStyle, flex: 1, background: '#f9f9f7' }}
            value={form.distance_info}
            onChange={e => setForm(f => ({ ...f, distance_info: e.target.value }))}
            placeholder="Auto-filled via Google Maps — or type manually"
          />
          <button
            type="button"
            onClick={calcDistances}
            disabled={distLoading}
            className="shrink-0 px-3 py-2 text-xs rounded-sm border transition-opacity hover:opacity-70 disabled:opacity-50"
            style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)', whiteSpace: 'nowrap' }}
          >
            {distLoading ? 'Calculating…' : 'Calculate'}
          </button>
        </div>
        {distError && <p className="text-xs mt-1" style={{ color: '#991b1b' }}>{distError}</p>}
      </Field>
      <Field label="Notes">
        <textarea rows={2} className={inputCls} style={inputStyle} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </Field>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm rounded-sm border" style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}>Cancel</button>
        <button onClick={onSubmit} disabled={loading} className="px-4 py-2 text-sm rounded-sm" style={accent}>
          {loading ? 'Saving…' : mode === 'add' ? 'Add Hotel' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Room form ────────────────────────────────────────────────────────────────

function RoomForm({
  form, setForm, error, loading, onSubmit, onCancel, mode,
}: {
  form: RoomFormState
  setForm: React.Dispatch<React.SetStateAction<RoomFormState>>
  error: string
  loading: boolean
  onSubmit: () => void
  onCancel: () => void
  mode: 'add' | 'edit'
}) {
  return (
    <div className="space-y-4">
      {error && <p className="text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Room Number *">
          <input className={inputCls} style={inputStyle} value={form.room_number} onChange={e => setForm(f => ({ ...f, room_number: e.target.value }))} placeholder="101" />
        </Field>
        <Field label="Room Type">
          <select className={inputCls} style={inputStyle} value={form.room_type} onChange={e => setForm(f => ({ ...f, room_type: e.target.value as RoomType }))}>
            {(['single', 'double', 'suite'] as RoomType[]).map(t => <option key={t} value={t}>{ROOM_TYPE_LABELS[t]}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Capacity">
          <input type="number" min="1" className={inputCls} style={inputStyle} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
        </Field>
        <Field label="Floor">
          <input className={inputCls} style={inputStyle} value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} placeholder="1" />
        </Field>
      </div>
      <Field label="Notes">
        <textarea rows={2} className={inputCls} style={inputStyle} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </Field>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm rounded-sm border" style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}>Cancel</button>
        <button onClick={onSubmit} disabled={loading} className="px-4 py-2 text-sm rounded-sm" style={{ color: 'white', background: '#2D2D2D' }}>
          {loading ? 'Saving…' : mode === 'add' ? 'Add Room' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RoomsClient({ initialHotels, confirmedGuests, initialAssignments, side }: Props) {
  const accent = SIDE_ACCENT[side]

  // ── Tab ──
  const [activeTab, setActiveTab] = useState<'hotels' | 'assignments'>('hotels')

  // ── Hotels state ──
  const [hotels, setHotels] = useState<HotelRow[]>(initialHotels)
  const [expandedHotels, setExpandedHotels] = useState<Set<string>>(new Set())

  // Hotel modal
  const [hotelModal, setHotelModal] = useState<{ mode: 'add' | 'edit'; hotel?: HotelRow } | null>(null)
  const [hotelForm, setHotelForm] = useState<HotelFormState>(EMPTY_HOTEL_FORM)
  const [hotelLoading, setHotelLoading] = useState(false)
  const [hotelError, setHotelError] = useState('')

  // Delete hotel
  const [deleteHotelTarget, setDeleteHotelTarget] = useState<HotelRow | null>(null)
  const [deleteHotelLoading, setDeleteHotelLoading] = useState(false)

  // Room modal
  const [roomModal, setRoomModal] = useState<{ mode: 'add' | 'edit'; hotelId: string; room?: RoomRow } | null>(null)
  const [roomForm, setRoomForm] = useState<RoomFormState>(EMPTY_ROOM_FORM)
  const [roomLoading, setRoomLoading] = useState(false)
  const [roomError, setRoomError] = useState('')

  // Delete room
  const [deleteRoomTarget, setDeleteRoomTarget] = useState<{ room: RoomRow; hotelId: string } | null>(null)
  const [deleteRoomLoading, setDeleteRoomLoading] = useState(false)

  // Bulk add
  const [bulkModal, setBulkModal] = useState<{ hotelId: string } | null>(null)
  const [bulkForm, setBulkForm] = useState<BulkFormState>(EMPTY_BULK_FORM)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkError, setBulkError] = useState('')

  // ── Assignments state ──
  const [assignments, setAssignments] = useState<AssignmentRow[]>(initialAssignments)
  const [hotelFilter, setHotelFilter] = useState('')
  const [guestSearch, setGuestSearch] = useState('')
  const [assignLoading, setAssignLoading] = useState('')
  const [assignError, setAssignError] = useState('')
  const [editingAssignment, setEditingAssignment] = useState<string | null>(null)
  const [editCheckIn, setEditCheckIn] = useState('')
  const [editCheckOut, setEditCheckOut] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // ── Derived ──
  // Every attending person (primary guest or family member) who needs a bed.
  const allPeople = useMemo<Person[]>(() => {
    const list: Person[] = []
    for (const g of confirmedGuests) {
      if (g.rsvpResponses.length > 0) {
        list.push({ key: personKey(g.id, null), guestId: g.id, familyMemberId: null, name: g.name, isChild: false, primaryName: g.name, householdGroup: g.household_group })
      }
      for (const fm of g.familyMembers) {
        list.push({ key: personKey(g.id, fm.id), guestId: g.id, familyMemberId: fm.id, name: fm.name, isChild: fm.is_child, primaryName: g.name, householdGroup: g.household_group })
      }
    }
    return list
  }, [confirmedGuests])

  const assignedPersonKeys = useMemo(() => new Set(assignments.map(a => personKey(a.guest_id, a.family_member_id))), [assignments])
  const unassignedPeople = useMemo(() => allPeople.filter(p => !assignedPersonKeys.has(p.key)), [allPeople, assignedPersonKeys])

  // Search filter for the assignment panels — matches the person's own name,
  // their primary guest (for family members), or their household group.
  const filteredUnassigned = useMemo(() => {
    const q = guestSearch.trim().toLowerCase()
    if (!q) return unassignedPeople
    return unassignedPeople.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.primaryName.toLowerCase().includes(q) ||
      (p.householdGroup ?? '').toLowerCase().includes(q)
    )
  }, [unassignedPeople, guestSearch])
  const assignmentsByRoom = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>()
    for (const a of assignments) {
      if (!map.has(a.room_id)) map.set(a.room_id, [])
      map.get(a.room_id)!.push(a)
    }
    return map
  }, [assignments])
  const totalRooms = useMemo(() => hotels.reduce((s, h) => s + h.rooms.length, 0), [hotels])
  const occupiedRooms = useMemo(() => new Set(assignments.map(a => a.room_id)).size, [assignments])

  // ── Hotel/Room helpers ──
  function patchRooms(hotelId: string, updater: (rooms: RoomRow[]) => RoomRow[]) {
    setHotels(prev => prev.map(h => h.id !== hotelId ? h : { ...h, rooms: updater(h.rooms) }))
  }

  function openHotelAdd() {
    setHotelForm(EMPTY_HOTEL_FORM)
    setHotelError('')
    setHotelModal({ mode: 'add' })
  }

  function openHotelEdit(hotel: HotelRow) {
    setHotelForm({
      name: hotel.name,
      address: hotel.address ?? '',
      city: hotel.city ?? '',
      map_url: hotel.map_url ?? '',
      distance_info: hotel.distance_info ?? '',
      check_in_date: hotel.check_in_date ? hotel.check_in_date.slice(0, 10) : '',
      check_out_date: hotel.check_out_date ? hotel.check_out_date.slice(0, 10) : '',
      contact_phone: hotel.contact_phone ?? '',
      total_rooms: String(hotel.total_rooms),
      notes: hotel.notes ?? '',
    })
    setHotelError('')
    setHotelModal({ mode: 'edit', hotel })
  }

  const handleHotelSubmit = useCallback(async () => {
    if (!hotelForm.name.trim()) { setHotelError('Hotel name is required.'); return }
    setHotelLoading(true)
    setHotelError('')
    const isEdit = hotelModal?.mode === 'edit'
    const url = isEdit ? `/api/admin/hotels/${hotelModal!.hotel!.id}` : '/api/admin/hotels'
    const res = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hotelForm),
    })
    setHotelLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setHotelError(data.error ?? 'Something went wrong.')
      return
    }
    const data = await res.json()
    if (isEdit) {
      setHotels(prev => prev.map(h => h.id === data.hotel.id ? { ...data.hotel, rooms: h.rooms } : h))
    } else {
      setHotels(prev => [...prev, { ...data.hotel, rooms: [] }])
    }
    setHotelModal(null)
  }, [hotelForm, hotelModal])

  const handleHotelDelete = useCallback(async () => {
    if (!deleteHotelTarget) return
    setDeleteHotelLoading(true)
    const res = await fetch(`/api/admin/hotels/${deleteHotelTarget.id}`, { method: 'DELETE' })
    setDeleteHotelLoading(false)
    if (!res.ok) return
    setHotels(prev => prev.filter(h => h.id !== deleteHotelTarget.id))
    // Remove assignments for deleted hotel's rooms
    const roomIds = new Set(deleteHotelTarget.rooms.map(r => r.id))
    setAssignments(prev => prev.filter(a => !roomIds.has(a.room_id)))
    setDeleteHotelTarget(null)
  }, [deleteHotelTarget])

  function openRoomAdd(hotelId: string) {
    setRoomForm(EMPTY_ROOM_FORM)
    setRoomError('')
    setRoomModal({ mode: 'add', hotelId })
  }

  function openRoomEdit(hotelId: string, room: RoomRow) {
    setRoomForm({
      room_number: room.room_number,
      room_type: room.room_type,
      capacity: String(room.capacity),
      floor: room.floor ?? '',
      notes: room.notes ?? '',
    })
    setRoomError('')
    setRoomModal({ mode: 'edit', hotelId, room })
  }

  const handleRoomSubmit = useCallback(async () => {
    if (!roomForm.room_number.trim()) { setRoomError('Room number is required.'); return }
    if (!roomModal) return
    setRoomLoading(true)
    setRoomError('')
    const isEdit = roomModal.mode === 'edit'
    const url = isEdit ? `/api/admin/rooms/${roomModal.room!.id}` : `/api/admin/hotels/${roomModal.hotelId}/rooms`
    const res = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...roomForm, capacity: Number(roomForm.capacity) }),
    })
    setRoomLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setRoomError(data.error ?? 'Something went wrong.')
      return
    }
    const data = await res.json()
    if (isEdit) {
      patchRooms(roomModal.hotelId, rooms => rooms.map(r => r.id === data.room.id ? data.room : r))
    } else {
      patchRooms(roomModal.hotelId, rooms => [...rooms, data.room])
    }
    setRoomModal(null)
  }, [roomForm, roomModal])

  const handleRoomDelete = useCallback(async () => {
    if (!deleteRoomTarget) return
    setDeleteRoomLoading(true)
    const res = await fetch(`/api/admin/rooms/${deleteRoomTarget.room.id}`, { method: 'DELETE' })
    setDeleteRoomLoading(false)
    if (!res.ok) return
    patchRooms(deleteRoomTarget.hotelId, rooms => rooms.filter(r => r.id !== deleteRoomTarget.room.id))
    setAssignments(prev => prev.filter(a => a.room_id !== deleteRoomTarget.room.id))
    setDeleteRoomTarget(null)
  }, [deleteRoomTarget])

  // ── Bulk preview ──
  const bulkPreview = useMemo(() => {
    const count = Math.min(Number(bulkForm.count) || 0, 50)
    const start = Number(bulkForm.start) || 1
    const padLen = bulkForm.start.length
    return Array.from({ length: count }, (_, i) =>
      `${bulkForm.prefix}${String(start + i).padStart(padLen, '0')}`
    )
  }, [bulkForm.prefix, bulkForm.start, bulkForm.count])

  const handleBulkSubmit = useCallback(async () => {
    if (!bulkModal) return
    const count = Number(bulkForm.count)
    if (!count || count < 1) { setBulkError('Count must be at least 1.'); return }
    setBulkLoading(true)
    setBulkError('')
    const rooms = bulkPreview.map(num => ({
      room_number: num,
      room_type: bulkForm.room_type,
      capacity: Number(bulkForm.capacity) || 2,
      floor: bulkForm.floor || null,
      notes: null,
    }))
    const res = await fetch(`/api/admin/hotels/${bulkModal.hotelId}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rooms }),
    })
    setBulkLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setBulkError(data.error ?? 'Something went wrong.')
      return
    }
    const data = await res.json()
    patchRooms(bulkModal.hotelId, () => data.rooms)
    setBulkModal(null)
  }, [bulkModal, bulkForm, bulkPreview])

  // ── Assignment handlers ──
  const handleAssign = useCallback(async (guestId: string, roomId: string, familyMemberId?: string | null) => {
    if (!roomId) return
    const loadingKey = personKey(guestId, familyMemberId ?? null)
    setAssignLoading(loadingKey)
    setAssignError('')
    const res = await fetch('/api/admin/room-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, guest_id: guestId, family_member_id: familyMemberId ?? undefined }),
    })
    setAssignLoading('')
    if (!res.ok) {
      const data = await res.json()
      setAssignError(data.error ?? 'Assignment failed.')
      return
    }
    const data = await res.json()
    setAssignments(prev => [...prev, data.assignment])
  }, [])

  function startEditAssignment(a: AssignmentRow) {
    setEditingAssignment(a.id)
    setEditCheckIn(a.check_in ? a.check_in.slice(0, 10) : '')
    setEditCheckOut(a.check_out ? a.check_out.slice(0, 10) : '')
    setEditNotes(a.notes ?? '')
  }

  const handleUpdateAssignment = useCallback(async (id: string) => {
    setEditLoading(true)
    const res = await fetch(`/api/admin/room-assignments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        check_in: editCheckIn || null,
        check_out: editCheckOut || null,
        notes: editNotes || null,
      }),
    })
    setEditLoading(false)
    if (!res.ok) return
    const data = await res.json()
    setAssignments(prev => prev.map(a => a.id === id ? data.assignment : a))
    setEditingAssignment(null)
  }, [editCheckIn, editCheckOut, editNotes])

  const handleRemoveAssignment = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/room-assignments/${id}`, { method: 'DELETE' })
    if (!res.ok) return
    setAssignments(prev => prev.filter(a => a.id !== id))
  }, [])

  // ── CSV export ──
  function handleExportCsv() {
    const hotelsToExport = hotelFilter ? hotels.filter(h => h.id === hotelFilter) : hotels
    const rows: string[][] = [['Person Name', 'Household', 'Room Number', 'Hotel Name', 'Check-in', 'Check-out']]
    for (const hotel of hotelsToExport) {
      for (const room of hotel.rooms) {
        const roomAssignments = assignmentsByRoom.get(room.id) ?? []
        for (const a of roomAssignments) {
          // Person name — family member if set, else the primary guest.
          const personName = a.familyMember?.name
            ?? confirmedGuests.find(g => g.id === a.guest_id)?.familyMembers.find(fm => fm.id === a.family_member_id)?.name
            ?? a.guest?.name
            ?? confirmedGuests.find(g => g.id === a.guest_id)?.name
            ?? ''
          const household = a.guest?.name ?? confirmedGuests.find(g => g.id === a.guest_id)?.name ?? ''
          rows.push([
            csvEscape(personName),
            csvEscape(household),
            csvEscape(room.room_number),
            csvEscape(hotel.name),
            a.check_in ? a.check_in.slice(0, 10) : '',
            a.check_out ? a.check_out.slice(0, 10) : '',
          ])
        }
      }
    }
    const csv = rows.map(r => r.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const el = document.createElement('a')
    el.href = url
    el.download = `room-assignments-${side}-${new Date().toISOString().slice(0, 10)}.csv`
    el.click()
    URL.revokeObjectURL(url)
  }

  // ── Tab bar ──
  const TABS = [
    { id: 'hotels' as const, label: 'Hotels & Rooms' },
    { id: 'assignments' as const, label: 'Assignments' },
  ]

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-3" style={{ background: SIDE_BG[side], color: accent }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
            {SIDE_LABEL[side]}
          </div>
          <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Hotel Management</h1>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b mb-6" style={{ borderColor: 'var(--color-highlight)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={{
              borderColor: activeTab === tab.id ? accent : 'transparent',
              color: activeTab === tab.id ? accent : 'var(--color-muted)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════ TAB 1: Hotels & Rooms ═══════════════ */}
      {activeTab === 'hotels' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={openHotelAdd}
              className="px-4 py-2 text-sm rounded-sm"
              style={{ background: accent, color: 'white' }}
            >
              + Add Hotel
            </button>
          </div>

          {hotels.length === 0 ? (
            <div className="border rounded-sm p-12 text-center" style={{ borderColor: 'var(--color-highlight)' }}>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No hotels added yet.</p>
              <button onClick={openHotelAdd} className="mt-3 text-sm" style={{ color: accent }}>Add your first hotel →</button>
            </div>
          ) : (
            <div className="border rounded-sm overflow-hidden" style={{ borderColor: 'var(--color-highlight)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: '#FAFAF8' }}>
                    {['', 'Hotel', 'City', 'Rooms', 'Check-in', 'Check-out', ''].map((h, i) => (
                      <th key={i} className={`px-4 py-3 text-left text-xs font-medium tracking-wide uppercase`} style={{ color: 'var(--color-muted)', borderBottom: '1px solid var(--color-highlight)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--color-highlight)' }}>
                  {hotels.map(hotel => {
                    const isExpanded = expandedHotels.has(hotel.id)
                    return (
                      <React.Fragment key={hotel.id}>
                        <tr className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-3 w-8">
                            <button
                              onClick={() => setExpandedHotels(prev => {
                                const next = new Set(prev)
                                if (isExpanded) { next.delete(hotel.id) } else { next.add(hotel.id) }
                                return next
                              })}
                              className="p-1 rounded hover:bg-gray-200"
                              style={{ color: 'var(--color-muted)' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium" style={{ color: 'var(--color-foreground)' }}>{hotel.name}</p>
                            {hotel.address && <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{hotel.address}</p>}
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--color-muted)' }}>{hotel.city ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: SIDE_BG[side], color: accent }}>
                              {hotel.rooms.length} / {hotel.total_rooms || '?'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-muted)' }}>{fmtDate(hotel.check_in_date)}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-muted)' }}>{fmtDate(hotel.check_out_date)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => openHotelEdit(hotel)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}>Edit</button>
                              <button onClick={() => setDeleteHotelTarget(hotel)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#fecaca', color: '#dc2626' }}>Delete</button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-6 py-4" style={{ background: '#FAFAF8', borderTop: '1px solid var(--color-highlight)' }}>
                              {/* Room sub-table */}
                              {hotel.rooms.length === 0 ? (
                                <p className="text-xs py-2" style={{ color: 'var(--color-muted)' }}>No rooms added yet.</p>
                              ) : (
                                <table className="w-full text-xs mb-3">
                                  <thead>
                                    <tr>
                                      {['Room #', 'Type', 'Floor', 'Capacity', 'Assigned', ''].map((h, i) => (
                                        <th key={i} className="pb-2 pr-4 text-left font-medium" style={{ color: 'var(--color-muted)' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y" style={{ borderColor: 'var(--color-highlight)' }}>
                                    {hotel.rooms.map(room => {
                                      const roomAssignments = assignmentsByRoom.get(room.id) ?? []
                                      const badge = capacityBadge(roomAssignments.length, room.capacity)
                                      return (
                                        <tr key={room.id}>
                                          <td className="py-2 pr-4 font-medium" style={{ color: 'var(--color-foreground)' }}>{room.room_number}</td>
                                          <td className="py-2 pr-4" style={{ color: 'var(--color-muted)' }}>{ROOM_TYPE_LABELS[room.room_type]}</td>
                                          <td className="py-2 pr-4" style={{ color: 'var(--color-muted)' }}>{room.floor ?? '—'}</td>
                                          <td className="py-2 pr-4" style={{ color: 'var(--color-muted)' }}>{room.capacity}</td>
                                          <td className="py-2 pr-4">
                                            <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: badge.bg, color: badge.color }}>
                                              {roomAssignments.length}/{room.capacity} · {badge.label}
                                            </span>
                                          </td>
                                          <td className="py-2">
                                            <div className="flex gap-2">
                                              <button onClick={() => openRoomEdit(hotel.id, room)} className="px-2 py-0.5 rounded border" style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}>Edit</button>
                                              <button onClick={() => setDeleteRoomTarget({ room, hotelId: hotel.id })} className="px-2 py-0.5 rounded border" style={{ borderColor: '#fecaca', color: '#dc2626' }}>Delete</button>
                                            </div>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              )}
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => openRoomAdd(hotel.id)} className="text-xs px-3 py-1.5 rounded-sm border" style={{ borderColor: accent, color: accent }}>+ Add Room</button>
                                <button onClick={() => { setBulkForm(EMPTY_BULK_FORM); setBulkError(''); setBulkModal({ hotelId: hotel.id }) }} className="text-xs px-3 py-1.5 rounded-sm border" style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}>Bulk Add</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ TAB 2: Assignments ═══════════════ */}
      {activeTab === 'assignments' && (
        <div className="space-y-5">
          {/* Summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Rooms', value: totalRooms },
              { label: 'Occupied', value: occupiedRooms },
              { label: 'Available', value: totalRooms - occupiedRooms },
              { label: 'Unassigned People', value: unassignedPeople.length },
            ].map(s => (
              <div key={s.label} className="border rounded-sm px-4 py-3" style={{ borderColor: 'var(--color-highlight)', borderLeft: `3px solid ${accent}`, background: 'white' }}>
                <p className="text-2xl font-light" style={{ color: 'var(--color-foreground)' }}>{s.value}</p>
                <p className="text-xs mt-0.5 font-medium tracking-wide uppercase" style={{ color: 'var(--color-muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Actions bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-muted)' }}>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search guests…"
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  className="w-56 pl-8 pr-3 py-1.5 text-sm rounded-sm border outline-none"
                  style={{ background: 'var(--color-background)', borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
                />
              </div>
              <label className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>Filter by hotel:</label>
              <select
                className="text-sm rounded-sm px-3 py-1.5 border"
                style={{ borderColor: 'var(--color-highlight)', background: 'white', color: 'var(--color-foreground)' }}
                value={hotelFilter}
                onChange={e => setHotelFilter(e.target.value)}
              >
                <option value="">All Hotels</option>
                {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <button onClick={handleExportCsv} className="text-xs px-3 py-1.5 rounded-sm border" style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}>
              Export CSV
            </button>
          </div>

          {assignError && <p className="text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{assignError}</p>}

          {/* Two-panel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

            {/* Left: Unassigned People */}
            <div className="border rounded-sm overflow-hidden" style={{ borderColor: 'var(--color-highlight)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-highlight)', background: '#FAFAF8' }}>
                <h3 className="text-xs font-medium tracking-wide uppercase" style={{ color: 'var(--color-muted)' }}>
                  Unassigned People ({filteredUnassigned.length})
                </h3>
              </div>
              {filteredUnassigned.length === 0 ? (
                <p className="px-4 py-8 text-sm text-center" style={{ color: 'var(--color-muted)' }}>
                  {guestSearch.trim() ? 'No guests match your search.' : 'All confirmed guests are assigned.'}
                </p>
              ) : (
                <ul className="divide-y" style={{ borderColor: 'var(--color-highlight)' }}>
                  {filteredUnassigned.map(person => (
                    <li key={person.key} className={`px-4 py-3 flex items-center justify-between gap-3 ${person.familyMemberId ? 'pl-8' : ''}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--color-foreground)' }}>{person.name}</p>
                        {person.familyMemberId && (
                          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                            <span className="inline-flex items-center gap-1">
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ background: SIDE_BG[side], color: accent }}>
                                {person.isChild ? 'Child' : 'Family'}
                              </span>
                              of {person.primaryName}
                            </span>
                          </p>
                        )}
                      </div>
                      <select
                        className="text-xs rounded-sm px-2 py-1.5 border shrink-0"
                        style={{ borderColor: 'var(--color-highlight)', background: 'white', color: 'var(--color-foreground)', maxWidth: 180 }}
                        value=""
                        disabled={assignLoading === person.key}
                        onChange={e => { void handleAssign(person.guestId, e.target.value, person.familyMemberId) }}
                      >
                        <option value="">{assignLoading === person.key ? 'Assigning…' : 'Assign room…'}</option>
                        {hotels.map(hotel => {
                          const filtered = hotelFilter && hotel.id !== hotelFilter
                          if (filtered) return null
                          return (
                            <optgroup key={hotel.id} label={hotel.name}>
                              {hotel.rooms.map(room => {
                                const roomAssignments = assignmentsByRoom.get(room.id) ?? []
                                const isFull = roomAssignments.length >= room.capacity
                                return (
                                  <option key={room.id} value={room.id} disabled={isFull}>
                                    {room.room_number} – {ROOM_TYPE_LABELS[room.room_type]} ({roomAssignments.length}/{room.capacity}){isFull ? ' Full' : ''}
                                  </option>
                                )
                              })}
                            </optgroup>
                          )
                        })}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Right: Room Occupancy — tile grid */}
            <div className="space-y-6">
              <h3 className="text-xs font-medium tracking-wide uppercase" style={{ color: 'var(--color-muted)' }}>Room Occupancy</h3>
              {hotels.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No hotels set up yet.</p>
              ) : (
                hotels
                  .filter(h => !hotelFilter || h.id === hotelFilter)
                  .map(hotel => (
                    <div key={hotel.id}>
                      <p className="text-xs font-semibold mb-3" style={{ color: accent }}>{hotel.name}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {hotel.rooms.map(room => {
                          const roomAssignments = assignmentsByRoom.get(room.id) ?? []
                          const badge = capacityBadge(roomAssignments.length, room.capacity)
                          const fillPct = room.capacity > 0 ? Math.round((roomAssignments.length / room.capacity) * 100) : 0
                          const barColor = fillPct >= 100 ? '#dc2626' : fillPct >= 75 ? '#f59e0b' : '#16a34a'
                          const hasEditing = roomAssignments.some(a => editingAssignment === a.id)

                          return (
                            <div
                              key={room.id}
                              className="border rounded-sm p-3 flex flex-col gap-2"
                              style={{
                                borderColor: 'var(--color-highlight)',
                                background: 'white',
                                gridColumn: hasEditing ? 'span 2' : undefined,
                              }}
                            >
                              {/* Tile header */}
                              <div className="flex items-start justify-between gap-1">
                                <div>
                                  <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--color-foreground)' }}>
                                    {room.room_number}
                                  </p>
                                  <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                                    {ROOM_TYPE_LABELS[room.room_type]}{room.floor ? ` · Fl ${room.floor}` : ''}
                                  </p>
                                </div>
                                <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: badge.bg, color: badge.color }}>
                                  {roomAssignments.length}/{room.capacity}
                                </span>
                              </div>

                              {/* Fill bar */}
                              <div className="h-1 rounded-full overflow-hidden" style={{ background: '#e5e7eb' }}>
                                <div className="h-full rounded-full transition-all" style={{ width: `${fillPct}%`, background: barColor }} />
                              </div>

                              {/* Guests */}
                              {roomAssignments.length === 0 ? (
                                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Empty</p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {roomAssignments.map(a => {
                                    // Person name: family member if this is a family assignment,
                                    // else the primary guest.
                                    const familyMemberName = a.familyMember?.name
                                      ?? confirmedGuests.find(g => g.id === a.guest_id)?.familyMembers.find(fm => fm.id === a.family_member_id)?.name
                                    const primaryName = a.guest?.name ?? confirmedGuests.find(g => g.id === a.guest_id)?.name ?? 'Unknown'
                                    const isFamily = !!a.family_member_id
                                    const personName = isFamily ? (familyMemberName ?? 'Family member') : primaryName
                                    const isChild = isFamily ? (a.familyMember?.is_child ?? false) : false
                                    const isEditing = editingAssignment === a.id

                                    return (
                                      <li key={a.id}>
                                        {!isEditing ? (
                                          <div className="flex items-start justify-between gap-1">
                                            <div className="min-w-0">
                                              <p className="text-xs font-medium truncate" style={{ color: 'var(--color-foreground)' }}>
                                                {personName}
                                                {isFamily && (
                                                  <span className="ml-1 font-normal" style={{ color: 'var(--color-muted)' }}>
                                                    · {isChild ? 'Child' : 'Family'} of {primaryName}
                                                  </span>
                                                )}
                                              </p>
                                              {(a.check_in || a.check_out) && (
                                                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                                                  {fmtDate(a.check_in)} → {fmtDate(a.check_out)}
                                                </p>
                                              )}
                                            </div>
                                            <div className="flex gap-1 shrink-0">
                                              <button onClick={() => startEditAssignment(a)} className="text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}>Edit</button>
                                              <button onClick={() => { void handleRemoveAssignment(a.id) }} className="text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: '#fecaca', color: '#dc2626' }}>✕</button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="space-y-2 pt-1">
                                            <p className="text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>
                                              {personName}
                                              {isFamily && <span className="ml-1 font-normal" style={{ color: 'var(--color-muted)' }}>· of {primaryName}</span>}
                                            </p>
                                            <div className="grid grid-cols-2 gap-2">
                                              <div>
                                                <label className="block text-xs mb-0.5" style={{ color: 'var(--color-muted)' }}>Check-in</label>
                                                <input type="date" className={inputCls} style={{ ...inputStyle, fontSize: 11 }} value={editCheckIn} onChange={e => setEditCheckIn(e.target.value)} />
                                              </div>
                                              <div>
                                                <label className="block text-xs mb-0.5" style={{ color: 'var(--color-muted)' }}>Check-out</label>
                                                <input type="date" className={inputCls} style={{ ...inputStyle, fontSize: 11 }} value={editCheckOut} onChange={e => setEditCheckOut(e.target.value)} />
                                              </div>
                                            </div>
                                            <input className={inputCls} style={{ ...inputStyle, fontSize: 11 }} value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes…" />
                                            <div className="flex gap-2">
                                              <button onClick={() => { void handleUpdateAssignment(a.id) }} disabled={editLoading} className="text-xs px-2 py-1 rounded-sm" style={{ background: '#2D2D2D', color: 'white' }}>
                                                {editLoading ? '…' : 'Save'}
                                              </button>
                                              <button onClick={() => setEditingAssignment(null)} className="text-xs px-2 py-1 rounded-sm border" style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}>Cancel</button>
                                            </div>
                                          </div>
                                        )}
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ Modals ═══════════════ */}

      {/* Hotel add/edit */}
      {hotelModal && (
        <Modal title={hotelModal.mode === 'add' ? 'Add Hotel' : 'Edit Hotel'} onClose={() => setHotelModal(null)}>
          <HotelForm form={hotelForm} setForm={setHotelForm} error={hotelError} loading={hotelLoading} onSubmit={() => { void handleHotelSubmit() }} onCancel={() => setHotelModal(null)} mode={hotelModal.mode} />
        </Modal>
      )}

      {/* Delete hotel */}
      {deleteHotelTarget && (
        <Modal title="Delete Hotel" onClose={() => setDeleteHotelTarget(null)}>
          <p className="text-sm mb-4" style={{ color: 'var(--color-foreground)' }}>
            Delete <strong>{deleteHotelTarget.name}</strong>? This will remove all {deleteHotelTarget.rooms.length} rooms and all room assignments. This cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteHotelTarget(null)} className="px-4 py-2 text-sm rounded-sm border" style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}>Cancel</button>
            <button onClick={() => { void handleHotelDelete() }} disabled={deleteHotelLoading} className="px-4 py-2 text-sm rounded-sm" style={{ background: '#dc2626', color: 'white' }}>
              {deleteHotelLoading ? 'Deleting…' : 'Delete Hotel'}
            </button>
          </div>
        </Modal>
      )}

      {/* Room add/edit */}
      {roomModal && (
        <Modal title={roomModal.mode === 'add' ? 'Add Room' : 'Edit Room'} onClose={() => setRoomModal(null)}>
          <RoomForm form={roomForm} setForm={setRoomForm} error={roomError} loading={roomLoading} onSubmit={() => { void handleRoomSubmit() }} onCancel={() => setRoomModal(null)} mode={roomModal.mode} />
        </Modal>
      )}

      {/* Delete room */}
      {deleteRoomTarget && (
        <Modal title="Delete Room" onClose={() => setDeleteRoomTarget(null)}>
          <p className="text-sm mb-4" style={{ color: 'var(--color-foreground)' }}>
            Delete room <strong>{deleteRoomTarget.room.room_number}</strong>? Any guest assignments to this room will also be removed.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteRoomTarget(null)} className="px-4 py-2 text-sm rounded-sm border" style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}>Cancel</button>
            <button onClick={() => { void handleRoomDelete() }} disabled={deleteRoomLoading} className="px-4 py-2 text-sm rounded-sm" style={{ background: '#dc2626', color: 'white' }}>
              {deleteRoomLoading ? 'Deleting…' : 'Delete Room'}
            </button>
          </div>
        </Modal>
      )}

      {/* Bulk add rooms */}
      {bulkModal && (
        <Modal title="Bulk Add Rooms" onClose={() => setBulkModal(null)}>
          <div className="space-y-4">
            {bulkError && <p className="text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{bulkError}</p>}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Floor Prefix">
                <input className={inputCls} style={inputStyle} value={bulkForm.prefix} onChange={e => setBulkForm(f => ({ ...f, prefix: e.target.value }))} placeholder="1" />
              </Field>
              <Field label="Start Number">
                <input className={inputCls} style={inputStyle} value={bulkForm.start} onChange={e => setBulkForm(f => ({ ...f, start: e.target.value }))} placeholder="01" />
              </Field>
              <Field label="Count">
                <input type="number" min="1" max="50" className={inputCls} style={inputStyle} value={bulkForm.count} onChange={e => setBulkForm(f => ({ ...f, count: e.target.value }))} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Room Type">
                <select className={inputCls} style={inputStyle} value={bulkForm.room_type} onChange={e => setBulkForm(f => ({ ...f, room_type: e.target.value as RoomType }))}>
                  {(['single', 'double', 'suite'] as RoomType[]).map(t => <option key={t} value={t}>{ROOM_TYPE_LABELS[t]}</option>)}
                </select>
              </Field>
              <Field label="Capacity">
                <input type="number" min="1" className={inputCls} style={inputStyle} value={bulkForm.capacity} onChange={e => setBulkForm(f => ({ ...f, capacity: e.target.value }))} />
              </Field>
              <Field label="Floor">
                <input className={inputCls} style={inputStyle} value={bulkForm.floor} onChange={e => setBulkForm(f => ({ ...f, floor: e.target.value }))} placeholder="1" />
              </Field>
            </div>
            {bulkPreview.length > 0 && (
              <div className="rounded-sm px-3 py-2" style={{ background: SIDE_BG[side] }}>
                <p className="text-xs font-medium mb-1" style={{ color: accent }}>Preview ({bulkPreview.length} rooms):</p>
                <p className="text-xs" style={{ color: 'var(--color-foreground)' }}>
                  {bulkPreview.slice(0, 10).join(', ')}{bulkPreview.length > 10 ? ` … +${bulkPreview.length - 10} more` : ''}
                </p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setBulkModal(null)} className="px-4 py-2 text-sm rounded-sm border" style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}>Cancel</button>
              <button onClick={() => { void handleBulkSubmit() }} disabled={bulkLoading || bulkPreview.length === 0} className="px-4 py-2 text-sm rounded-sm" style={{ background: '#2D2D2D', color: 'white' }}>
                {bulkLoading ? 'Adding…' : `Add ${bulkPreview.length} Rooms`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
