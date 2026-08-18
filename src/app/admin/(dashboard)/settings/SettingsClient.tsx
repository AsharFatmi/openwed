'use client'

import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { type Side, type DisplayGroup } from '@prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type EventRow = {
  id: string
  name: string
  date: string
  start_time: string | null
  end_time: string | null
  venue_name: string | null
  venue_address: string | null
  description: string | null
  dress_code: string | null
  map_url: string | null
  image_url: string | null
  image_alt: string | null
  managed_by: Side
  display_group: DisplayGroup
  sort_order: number
  created_at: string
  updated_at: string
}

type HotelRow = {
  id: string
  name: string
  image_url: string | null
  image_alt: string | null
}

type GalleryPhotoRow = {
  id: string
  file_path: string
  alt_text: string | null
  original_filename: string | null
  sort_order: number
  uploaded_at: string
}

type SettingsMap = {
  couple_names: string
  wedding_date: string
  rsvp_deadline: string
  wedding_hashtag: string
  contact_email: string
  bride_contact_email: string
  groom_contact_email: string
  hero_image: string
  wedding_city: string
  site_password: string
}

type EventFormState = {
  name: string
  date: string
  start_time: string
  end_time: string
  venue_name: string
  venue_address: string
  description: string
  dress_code: string
  map_url: string
  display_group: DisplayGroup
  sort_order: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BLANK_FORM: EventFormState = {
  name: '', date: '', start_time: '', end_time: '',
  venue_name: '', venue_address: '', description: '',
  dress_code: '', map_url: '', display_group: 'joint', sort_order: '0',
}

const DISPLAY_GROUP_STYLES: Record<DisplayGroup, { label: string; bg: string; color: string }> = {
  bride: { label: 'Bride', bg: '#fdf2f8', color: '#be185d' },
  groom: { label: 'Groom', bg: '#eff6ff', color: '#1d4ed8' },
  joint: { label: 'Joint', bg: '#fefce8', color: '#b45309' },
}

const MAX_FILE_BYTES = 25 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function DisplayGroupBadge({ group }: { group: DisplayGroup }) {
  const s = DISPLAY_GROUP_STYLES[group]
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function eventToForm(e: EventRow): EventFormState {
  return {
    name: e.name, date: e.date.slice(0, 10),
    start_time: e.start_time ?? '', end_time: e.end_time ?? '',
    venue_name: e.venue_name ?? '', venue_address: e.venue_address ?? '',
    description: e.description ?? '', dress_code: e.dress_code ?? '',
    map_url: e.map_url ?? '', display_group: e.display_group,
    sort_order: String(e.sort_order),
  }
}

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

// ─── ImageSlot ────────────────────────────────────────────────────────────────

type ImageSlotProps = {
  currentUrl: string | null
  altText: string
  slot: string
  accent: string
  accentBg: string
  aspectClass?: string
  onUploadDone: (url: string) => void
  onDelete: () => void
  onAltChange: (val: string) => void
  onAltSave: () => void
  altSaving?: boolean
}

function ImageSlot({
  currentUrl, altText, slot, accent, accentBg,
  aspectClass = 'aspect-video',
  onUploadDone, onDelete, onAltChange, onAltSave, altSaving,
}: ImageSlotProps) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setError('')
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only JPG, PNG, or WebP allowed')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('File must be under 25 MB')
      return
    }
    setUploading(true)
    try {
      const urlRes = await fetch(`/api/admin/upload-url?slot=${encodeURIComponent(slot)}&contentType=${encodeURIComponent(file.type)}&filename=${encodeURIComponent(file.name)}`)
      if (!urlRes.ok) { const d = await urlRes.json(); throw new Error(d.error ?? 'Failed to get upload URL') }
      const { uploadUrl, publicUrl } = await urlRes.json()
      const putRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`)
      onUploadDone(publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function onDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true) }
  function onDragLeave() { setDragging(false) }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 transition-colors'
  const inputStyle = { borderColor: 'var(--color-highlight)', background: 'var(--color-background)', color: 'var(--color-foreground)' }

  return (
    <div>
      {currentUrl ? (
        <div className={`relative rounded-xl overflow-hidden border ${aspectClass}`} style={{ borderColor: 'var(--color-highlight)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentUrl} alt={altText || ''} className="w-full h-full object-cover" />
          <button
            onClick={onDelete}
            className="absolute top-2 right-2 p-1.5 rounded-lg text-white"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            title="Remove image"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <label
            className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
          >
            {uploading ? 'Uploading…' : 'Replace'}
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
          </label>
        </div>
      ) : (
        <div
          onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${aspectClass}`}
          style={{
            borderColor: dragging ? accent : 'var(--color-highlight)',
            background: dragging ? accentBg : '#fafaf8',
          }}
        >
          <span style={{ color: dragging ? accent : 'var(--color-muted)' }}><UploadIcon /></span>
          <p className="text-xs text-center px-4" style={{ color: 'var(--color-muted)' }}>
            {uploading ? 'Uploading…' : 'Drop image here or click to upload'}
          </p>
          <p className="text-xs" style={{ color: 'var(--color-muted)', opacity: 0.7 }}>JPG · PNG · WebP · max 25 MB</p>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      {/* Alt text */}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={altText}
          onChange={(e) => onAltChange(e.target.value)}
          placeholder="Alt text (accessibility)"
          className={inputCls + ' flex-1 text-xs'}
          style={{ ...inputStyle, padding: '6px 10px' }}
        />
        <button
          onClick={onAltSave}
          disabled={altSaving}
          className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60 whitespace-nowrap"
          style={{ background: accentBg, color: accent }}
        >
          {altSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ─── GalleryDropZone ──────────────────────────────────────────────────────────

function GalleryDropZone({
  accent, accentBg, onFiles,
}: { accent: string; accentBg: string; onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    onFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <div
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer py-8 transition-colors"
      style={{ borderColor: dragging ? accent : 'var(--color-highlight)', background: dragging ? accentBg : '#fafaf8' }}
    >
      <span style={{ color: dragging ? accent : 'var(--color-muted)' }}><UploadIcon /></span>
      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Drop photos here or click to select multiple</p>
      <p className="text-xs" style={{ color: 'var(--color-muted)', opacity: 0.7 }}>JPG · PNG · WebP · max 25 MB each</p>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) onFiles(Array.from(e.target.files)); e.target.value = '' }} />
    </div>
  )
}

// ─── SitePasswordInput ────────────────────────────────────────────────────────

function SitePasswordInput({ value, onChange, inputCls, inputStyle }: {
  value: string
  onChange: (v: string) => void
  inputCls: string
  inputStyle: React.CSSProperties
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Set a password to protect the site"
        className={inputCls}
        style={{ ...inputStyle, paddingRight: '2.5rem' }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
        style={{ color: 'var(--color-muted)' }}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsClient({
  initialEvents,
  initialSettings,
  initialHotels,
  initialGallery,
  side,
}: {
  initialEvents: EventRow[]
  initialSettings: SettingsMap
  initialHotels: HotelRow[]
  initialGallery: GalleryPhotoRow[]
  side: Side
}) {
  const sideAccent = side === 'bride' ? '#be185d' : '#1d4ed8'
  const sideBg = side === 'bride' ? '#fdf2f8' : '#eff6ff'

  const [activeTab, setActiveTab] = useState<'events' | 'images' | 'general'>('events')

  // ── Events state ──────────────────────────────────────────────
  const [events, setEvents] = useState<EventRow[]>(initialEvents)
  const [showEventModal, setShowEventModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null)
  const [eventForm, setEventForm] = useState<EventFormState>(BLANK_FORM)
  const [eventSubmitting, setEventSubmitting] = useState(false)
  const [eventError, setEventError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<EventRow | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // ── Images state ──────────────────────────────────────────────
  const [heroUrl, setHeroUrl] = useState(initialSettings.hero_image)
  const [heroAlt, setHeroAlt] = useState('')
  const [heroAltSaving, setHeroAltSaving] = useState(false)

  const [eventImages, setEventImages] = useState<Record<string, { url: string | null; alt: string; altSaving: boolean }>>(
    () => Object.fromEntries(initialEvents.map((e) => [e.id, { url: e.image_url, alt: e.image_alt ?? '', altSaving: false }]))
  )
  const [hotelImages, setHotelImages] = useState<Record<string, { url: string | null; alt: string; altSaving: boolean }>>(
    () => Object.fromEntries(initialHotels.map((h) => [h.id, { url: h.image_url, alt: h.image_alt ?? '', altSaving: false }]))
  )
  const [gallery, setGallery] = useState<GalleryPhotoRow[]>(initialGallery)
  const [galleryUploading, setGalleryUploading] = useState(false)
  const [galleryError, setGalleryError] = useState('')
  const [galleryAltState, setGalleryAltState] = useState<Record<string, { alt: string; saving: boolean }>>(
    () => Object.fromEntries(initialGallery.map((p) => [p.id, { alt: p.alt_text ?? '', saving: false }]))
  )

  // ── Settings state ────────────────────────────────────────────
  const [settings, setSettings] = useState<SettingsMap>(initialSettings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsError, setSettingsError] = useState('')

  // ─── Event modal helpers ──────────────────────────────────────

  function openAddEvent() { setEditingEvent(null); setEventForm(BLANK_FORM); setEventError(''); setShowEventModal(true) }
  function openEditEvent(e: EventRow) { setEditingEvent(e); setEventForm(eventToForm(e)); setEventError(''); setShowEventModal(true) }
  function closeEventModal() { setShowEventModal(false); setEditingEvent(null); setEventError('') }

  async function submitEvent() {
    setEventError('')
    if (!eventForm.name.trim()) { setEventError('Name is required'); return }
    if (!eventForm.date) { setEventError('Date is required'); return }
    setEventSubmitting(true)
    try {
      const body = {
        name: eventForm.name, date: eventForm.date,
        start_time: eventForm.start_time || null, end_time: eventForm.end_time || null,
        venue_name: eventForm.venue_name || null, venue_address: eventForm.venue_address || null,
        description: eventForm.description || null, dress_code: eventForm.dress_code || null,
        map_url: eventForm.map_url || null, display_group: eventForm.display_group,
        sort_order: eventForm.sort_order ? Number(eventForm.sort_order) : 0,
      }
      if (editingEvent) {
        const res = await fetch(`/api/admin/events/${editingEvent.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed to update event') }
        const { event } = await res.json()
        setEvents((prev) => prev.map((e) => (e.id === event.id ? event : e)))
      } else {
        const res = await fetch('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed to create event') }
        const { event } = await res.json()
        setEvents((prev) => [event, ...prev])
        setEventImages((prev) => ({ ...prev, [event.id]: { url: null, alt: '', altSaving: false } }))
      }
      closeEventModal()
    } catch (err) {
      setEventError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setEventSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteError(''); setDeleteSubmitting(true)
    try {
      const res = await fetch(`/api/admin/events/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed to delete') }
      setEvents((prev) => prev.filter((e) => e.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDeleteSubmitting(false)
    }
  }

  // ─── Hero image helpers ───────────────────────────────────────

  async function saveHeroAlt() {
    setHeroAltSaving(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, hero_image: heroUrl }),
      })
    } finally { setHeroAltSaving(false) }
  }

  async function handleHeroUpload(url: string) {
    setHeroUrl(url)
    setSettings((s) => ({ ...s, hero_image: url }))
    await fetch('/api/admin/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, hero_image: url }),
    })
  }

  async function handleHeroDelete() {
    setHeroUrl('')
    setSettings((s) => ({ ...s, hero_image: '' }))
    await fetch('/api/admin/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, hero_image: '' }),
    })
  }

  // ─── Event image helpers ──────────────────────────────────────

  async function handleEventImageUpload(eventId: string, url: string) {
    setEventImages((prev) => ({ ...prev, [eventId]: { ...prev[eventId], url } }))
    await fetch(`/api/admin/events/${eventId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: url }),
    })
  }

  async function handleEventImageDelete(eventId: string) {
    setEventImages((prev) => ({ ...prev, [eventId]: { ...prev[eventId], url: null } }))
    await fetch(`/api/admin/events/${eventId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: null }),
    })
  }

  async function saveEventAlt(eventId: string) {
    setEventImages((prev) => ({ ...prev, [eventId]: { ...prev[eventId], altSaving: true } }))
    try {
      await fetch(`/api/admin/events/${eventId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_alt: eventImages[eventId]?.alt ?? '' }),
      })
    } finally {
      setEventImages((prev) => ({ ...prev, [eventId]: { ...prev[eventId], altSaving: false } }))
    }
  }

  // ─── Hotel image helpers ──────────────────────────────────────

  async function handleHotelImageUpload(hotelId: string, url: string) {
    setHotelImages((prev) => ({ ...prev, [hotelId]: { ...prev[hotelId], url } }))
    await fetch(`/api/admin/hotels/${hotelId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: url }),
    })
  }

  async function handleHotelImageDelete(hotelId: string) {
    setHotelImages((prev) => ({ ...prev, [hotelId]: { ...prev[hotelId], url: null } }))
    await fetch(`/api/admin/hotels/${hotelId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: null }),
    })
  }

  async function saveHotelAlt(hotelId: string) {
    setHotelImages((prev) => ({ ...prev, [hotelId]: { ...prev[hotelId], altSaving: true } }))
    try {
      await fetch(`/api/admin/hotels/${hotelId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_alt: hotelImages[hotelId]?.alt ?? '' }),
      })
    } finally {
      setHotelImages((prev) => ({ ...prev, [hotelId]: { ...prev[hotelId], altSaving: false } }))
    }
  }

  // ─── Gallery helpers ──────────────────────────────────────────

  async function handleGalleryFiles(files: File[]) {
    setGalleryError('')
    setGalleryUploading(true)
    for (const file of files) {
      if (!ACCEPTED_TYPES.includes(file.type)) { setGalleryError(`${file.name}: only JPG, PNG, WebP allowed`); continue }
      if (file.size > MAX_FILE_BYTES) { setGalleryError(`${file.name}: must be under 25 MB`); continue }
      try {
        const urlRes = await fetch(`/api/admin/upload-url?slot=gallery&contentType=${encodeURIComponent(file.type)}&filename=${encodeURIComponent(file.name)}`)
        if (!urlRes.ok) { const d = await urlRes.json(); throw new Error(d.error ?? 'Failed to get upload URL') }
        const { uploadUrl, publicUrl: url } = await urlRes.json()
        const putRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
        if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`)
        const addRes = await fetch('/api/admin/gallery', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_path: url, alt_text: '', original_filename: file.name }),
        })
        if (!addRes.ok) { const d = await addRes.json(); throw new Error(d.error ?? 'Failed to save') }
        const { photo } = await addRes.json()
        setGallery((prev) => [...prev, { ...photo, uploaded_at: photo.uploaded_at ?? new Date().toISOString() }])
        setGalleryAltState((prev) => ({ ...prev, [photo.id]: { alt: '', saving: false } }))
      } catch (err) {
        setGalleryError(err instanceof Error ? err.message : 'Failed to upload')
      }
    }
    setGalleryUploading(false)
  }

  async function deleteGalleryPhoto(id: string) {
    const res = await fetch(`/api/admin/gallery/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setGallery((prev) => prev.filter((p) => p.id !== id))
      setGalleryAltState((prev) => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  async function saveGalleryAlt(id: string) {
    setGalleryAltState((prev) => ({ ...prev, [id]: { ...prev[id], saving: true } }))
    try {
      await fetch(`/api/admin/gallery/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alt_text: galleryAltState[id]?.alt ?? '' }),
      })
    } finally {
      setGalleryAltState((prev) => ({ ...prev, [id]: { ...prev[id], saving: false } }))
    }
  }

  // ─── Settings save ────────────────────────────────────────────

  async function saveSettings() {
    setSaving(true); setSaved(false); setSettingsError('')
    try {
      const res = await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed to save') }
      const { settings: updated } = await res.json()
      setSettings(updated); setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────

  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 transition-colors'
  const inputStyle = { borderColor: 'var(--color-highlight)', background: 'var(--color-background)', color: 'var(--color-foreground)' }

  const tabs = [
    { id: 'events', label: 'Events' },
    { id: 'images', label: 'Images' },
    { id: 'general', label: 'General' },
  ] as const

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6" style={{ fontFamily: 'var(--font-cormorant)', color: 'var(--color-foreground)' }}>
        Settings
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: 'var(--color-highlight)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: activeTab === tab.id ? 'var(--color-background)' : 'transparent',
              color: activeTab === tab.id ? sideAccent : 'var(--color-muted)',
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Events Tab ── */}
      {activeTab === 'events' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Events you manage — guests RSVP to each one individually.
            </p>
            <button
              onClick={openAddEvent}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: sideAccent, color: '#fff' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Event
            </button>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-16 rounded-xl border" style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-40">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p className="text-sm">No events yet. Add your first event.</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-highlight)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: sideBg }}>
                    <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Sort</th>
                    <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Name</th>
                    <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Date</th>
                    <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Display</th>
                    <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Venue</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {events
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order || a.date.localeCompare(b.date))
                    .map((ev, i) => (
                      <tr key={ev.id} style={{ borderTop: i > 0 ? '1px solid var(--color-highlight)' : undefined }}>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--color-highlight)', color: 'var(--color-muted)' }}>{ev.sort_order}</span>
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-foreground)' }}>
                          {ev.name}
                          {(ev.start_time || ev.end_time) && (
                            <span className="block text-xs font-normal mt-0.5" style={{ color: 'var(--color-muted)' }}>
                              {ev.start_time}{ev.start_time && ev.end_time ? ' – ' : ''}{ev.end_time}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--color-muted)' }}>{format(new Date(ev.date), 'MMM d, yyyy')}</td>
                        <td className="px-4 py-3"><DisplayGroupBadge group={ev.display_group} /></td>
                        <td className="px-4 py-3 text-xs max-w-[180px] truncate" style={{ color: 'var(--color-muted)' }}>{ev.venue_name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => openEditEvent(ev)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: sideBg, color: sideAccent }}>Edit</button>
                            <button onClick={() => { setDeleteTarget(ev); setDeleteError('') }} className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50" style={{ color: '#dc2626' }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Images Tab ── */}
      {activeTab === 'images' && (
        <div className="space-y-10">

          {/* Hero Image */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-foreground)' }}>Homepage Hero</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>Shared — both admins can update this image. Shown as the banner on the public site.</p>
            <div className="max-w-xl">
              <ImageSlot
                currentUrl={heroUrl || null}
                altText={heroAlt}
                slot="hero"
                accent={sideAccent}
                accentBg={sideBg}
                aspectClass="aspect-[16/7]"
                onUploadDone={handleHeroUpload}
                onDelete={handleHeroDelete}
                onAltChange={setHeroAlt}
                onAltSave={saveHeroAlt}
                altSaving={heroAltSaving}
              />
            </div>
          </section>

          {/* Event Images */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-foreground)' }}>Event Images</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>One photo per event — shown on the public events section.</p>
            {events.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No events yet. Add events in the Events tab first.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {events
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((ev) => {
                    const img = eventImages[ev.id] ?? { url: null, alt: '', altSaving: false }
                    return (
                      <div key={ev.id}>
                        <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-foreground)' }}>{ev.name}</p>
                        <ImageSlot
                          currentUrl={img.url}
                          altText={img.alt}
                          slot={`event-${ev.id}`}
                          accent={sideAccent}
                          accentBg={sideBg}
                          onUploadDone={(url) => handleEventImageUpload(ev.id, url)}
                          onDelete={() => handleEventImageDelete(ev.id)}
                          onAltChange={(val) => setEventImages((prev) => ({ ...prev, [ev.id]: { ...prev[ev.id], alt: val } }))}
                          onAltSave={() => saveEventAlt(ev.id)}
                          altSaving={img.altSaving}
                        />
                      </div>
                    )
                  })}
              </div>
            )}
          </section>

          {/* Hotel Images */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-foreground)' }}>Hotel Images</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>One photo per hotel — shown on the public travel section.</p>
            {initialHotels.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No hotels added for your side yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {initialHotels.map((hotel) => {
                  const img = hotelImages[hotel.id] ?? { url: null, alt: '', altSaving: false }
                  return (
                    <div key={hotel.id}>
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-foreground)' }}>{hotel.name}</p>
                      <ImageSlot
                        currentUrl={img.url}
                        altText={img.alt}
                        slot={`hotel-${hotel.id}`}
                        accent={sideAccent}
                        accentBg={sideBg}
                        onUploadDone={(url) => handleHotelImageUpload(hotel.id, url)}
                        onDelete={() => handleHotelImageDelete(hotel.id)}
                        onAltChange={(val) => setHotelImages((prev) => ({ ...prev, [hotel.id]: { ...prev[hotel.id], alt: val } }))}
                        onAltSave={() => saveHotelAlt(hotel.id)}
                        altSaving={img.altSaving}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Gallery */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-foreground)' }}>Gallery</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>Shared — both admins can add photos. Shown in the gallery section on the public site.</p>

            <GalleryDropZone accent={sideAccent} accentBg={sideBg} onFiles={handleGalleryFiles} />

            {galleryUploading && (
              <p className="mt-2 text-xs" style={{ color: 'var(--color-muted)' }}>Uploading…</p>
            )}
            {galleryError && <p className="mt-2 text-xs text-red-600">{galleryError}</p>}

            {gallery.length > 0 && (
              <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {gallery.map((photo) => {
                  const altState = galleryAltState[photo.id] ?? { alt: photo.alt_text ?? '', saving: false }
                  return (
                    <div key={photo.id} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-highlight)' }}>
                      <div className="relative aspect-square">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.file_path} alt={altState.alt || ''} className="w-full h-full object-cover" />
                        <button
                          onClick={() => deleteGalleryPhoto(photo.id)}
                          className="absolute top-1.5 right-1.5 p-1.5 rounded-lg text-white"
                          style={{ background: 'rgba(0,0,0,0.55)' }}
                          title="Delete photo"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                      <div className="p-2 flex gap-1.5">
                        <input
                          type="text"
                          value={altState.alt}
                          onChange={(e) => setGalleryAltState((prev) => ({ ...prev, [photo.id]: { ...prev[photo.id], alt: e.target.value } }))}
                          placeholder="Alt text"
                          className="flex-1 px-2 py-1 text-xs rounded-lg border focus:outline-none"
                          style={{ borderColor: 'var(--color-highlight)', background: 'var(--color-background)', color: 'var(--color-foreground)' }}
                        />
                        <button
                          onClick={() => saveGalleryAlt(photo.id)}
                          disabled={altState.saving}
                          className="px-2 py-1 rounded-lg text-xs font-medium disabled:opacity-60"
                          style={{ background: sideBg, color: sideAccent }}
                        >
                          {altState.saving ? '…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {gallery.length === 0 && !galleryUploading && (
              <p className="mt-4 text-sm text-center" style={{ color: 'var(--color-muted)' }}>No gallery photos yet.</p>
            )}
          </section>
        </div>
      )}

      {/* ── General Tab ── */}
      {activeTab === 'general' && (
        <div className="max-w-xl">
          <p className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>
            Shared settings visible on the public website. Both admins can edit these.
          </p>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Wedding City</label>
              <input type="text" value={settings.wedding_city} onChange={(e) => setSettings((s) => ({ ...s, wedding_city: e.target.value }))} placeholder="e.g. Hyderabad, India" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Couple Names</label>
              <input type="text" value={settings.couple_names} onChange={(e) => setSettings((s) => ({ ...s, couple_names: e.target.value }))} placeholder="e.g. Aarav & Ananya" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
                Wedding Date <span className="font-normal text-xs" style={{ color: 'var(--color-muted)' }}>(display format)</span>
              </label>
              <input type="text" value={settings.wedding_date} onChange={(e) => setSettings((s) => ({ ...s, wedding_date: e.target.value }))} placeholder="e.g. December 18, 2026" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>RSVP Deadline</label>
              <input type="date" value={settings.rsvp_deadline} onChange={(e) => setSettings((s) => ({ ...s, rsvp_deadline: e.target.value }))} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Wedding Hashtag</label>
              <input type="text" value={settings.wedding_hashtag} onChange={(e) => setSettings((s) => ({ ...s, wedding_hashtag: e.target.value }))} placeholder="e.g. #AaravAndAnanya" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Contact Email</label>
              <input type="email" value={settings.contact_email} onChange={(e) => setSettings((s) => ({ ...s, contact_email: e.target.value }))} placeholder="e.g. hello@example.com" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Bride Side Contact Email</label>
              <input type="email" value={settings.bride_contact_email} onChange={(e) => setSettings((s) => ({ ...s, bride_contact_email: e.target.value }))} placeholder="e.g. bride@example.com" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Groom Side Contact Email</label>
              <input type="email" value={settings.groom_contact_email} onChange={(e) => setSettings((s) => ({ ...s, groom_contact_email: e.target.value }))} placeholder="e.g. groom@example.com" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
                Site Password{' '}
                <span className="font-normal text-xs" style={{ color: 'var(--color-muted)' }}>(leave blank to make site public)</span>
              </label>
              <SitePasswordInput
                value={settings.site_password}
                onChange={(v) => setSettings((s) => ({ ...s, site_password: v }))}
                inputCls={inputCls}
                inputStyle={inputStyle}
              />
            </div>
            {settingsError && <p className="text-sm text-red-600">{settingsError}</p>}
            <div className="flex items-center gap-3 pt-2">
              <button onClick={saveSettings} disabled={saving} className="px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60" style={{ background: sideAccent, color: '#fff' }}>
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
              {saved && <span className="text-sm font-medium" style={{ color: '#16a34a' }}>Saved!</span>}
            </div>
          </div>
        </div>
      )}

      {/* ── Event Add/Edit Modal ── */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(45,45,45,0.4)' }}>
          <div className="w-full max-w-2xl rounded-2xl shadow-xl overflow-y-auto" style={{ background: 'var(--color-background)', maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--color-highlight)' }}>
              <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-cormorant)', color: 'var(--color-foreground)' }}>
                {editingEvent ? 'Edit Event' : 'Add Event'}
              </h2>
              <button onClick={closeEventModal} style={{ color: 'var(--color-muted)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Name *</label>
                <input type="text" value={eventForm.name} onChange={(e) => setEventForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Mehndi Night" className={inputCls} style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Date *</label>
                  <input type="date" value={eventForm.date} onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))} className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Sort Order</label>
                  <input type="number" value={eventForm.sort_order} onChange={(e) => setEventForm((f) => ({ ...f, sort_order: e.target.value }))} className={inputCls} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Start Time</label>
                  <input type="time" value={eventForm.start_time} onChange={(e) => setEventForm((f) => ({ ...f, start_time: e.target.value }))} className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>End Time</label>
                  <input type="time" value={eventForm.end_time} onChange={(e) => setEventForm((f) => ({ ...f, end_time: e.target.value }))} className={inputCls} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Venue Name</label>
                  <input type="text" value={eventForm.venue_name} onChange={(e) => setEventForm((f) => ({ ...f, venue_name: e.target.value }))} className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Display Group</label>
                  <select value={eventForm.display_group} onChange={(e) => setEventForm((f) => ({ ...f, display_group: e.target.value as DisplayGroup }))} className={inputCls} style={inputStyle}>
                    <option value="bride">Bride</option>
                    <option value="groom">Groom</option>
                    <option value="joint">Joint</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Venue Address</label>
                <input type="text" value={eventForm.venue_address} onChange={(e) => setEventForm((f) => ({ ...f, venue_address: e.target.value }))} className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Google Maps URL</label>
                <input type="url" value={eventForm.map_url} onChange={(e) => setEventForm((f) => ({ ...f, map_url: e.target.value }))} className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Dress Code</label>
                <input type="text" value={eventForm.dress_code} onChange={(e) => setEventForm((f) => ({ ...f, dress_code: e.target.value }))} placeholder="e.g. Black Tie, Formal, Pakistani Traditional" className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Description</label>
                <textarea value={eventForm.description} onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))} rows={3} className={inputCls} style={inputStyle} />
              </div>
              {eventError && <p className="text-sm text-red-600">{eventError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--color-highlight)' }}>
              <button onClick={closeEventModal} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--color-muted)' }}>Cancel</button>
              <button onClick={submitEvent} disabled={eventSubmitting} className="px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60" style={{ background: sideAccent, color: '#fff' }}>
                {eventSubmitting ? 'Saving…' : editingEvent ? 'Save Changes' : 'Add Event'}
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
              This will permanently delete all RSVP responses for this event. This cannot be undone.
            </p>
            {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeleteError('') }} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--color-muted)' }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleteSubmitting} className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60" style={{ background: '#dc2626', color: '#fff' }}>
                {deleteSubmitting ? 'Deleting…' : 'Delete Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
