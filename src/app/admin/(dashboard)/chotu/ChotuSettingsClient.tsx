'use client'

import { useState } from 'react'
import { type Side } from '@prisma/client'

type ChotuKey =
  | 'chotu_partner1_bio'
  | 'chotu_partner2_bio'
  | 'chotu_contact_name'
  | 'chotu_contact_whatsapp'
  | 'chotu_contact_email'
  | 'chotu_extra_instructions'

type Props = {
  initialSettings: Record<ChotuKey, string>
  side: Side
}

const SIDE_CONFIG = {
  bride: { accent: '#be185d', accentBg: 'rgba(190,24,93,0.07)', label: 'Bride Side' },
  groom: { accent: '#1d4ed8', accentBg: 'rgba(29,78,216,0.07)', label: 'Groom Side' },
}

export default function ChotuSettingsClient({ initialSettings, side }: Props) {
  const { accent } = SIDE_CONFIG[side]

  const [settings, setSettings] = useState<Record<ChotuKey, string>>(initialSettings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputCls =
    'w-full px-3 py-2 text-sm rounded border focus:outline-none focus:ring-1 transition-colors'
  const inputStyle = {
    borderColor: 'var(--color-highlight)',
    background: 'var(--color-background)',
    color: 'var(--color-foreground)',
    focusRingColor: accent,
  }

  function set(key: ChotuKey, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/chotu', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save.')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-6 space-y-10">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-light"
          style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}
        >
          Chotu Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
          Configure the context Chotu uses to answer guest questions.
        </p>
      </div>

      {/* Bios */}
      <section className="space-y-6">
        <h2 className="text-xs tracking-[0.2em] uppercase" style={{ color: accent }}>
          About the Couple
        </h2>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>
            Partner 1&apos;s Bio
          </label>
          <textarea
            rows={4}
            value={settings.chotu_partner1_bio}
            onChange={(e) => set('chotu_partner1_bio', e.target.value)}
            placeholder="e.g. Partner 1 is a software engineer who loves cricket and long drives…"
            className={inputCls}
            style={inputStyle}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>
            Partner 2&apos;s Bio
          </label>
          <textarea
            rows={4}
            value={settings.chotu_partner2_bio}
            onChange={(e) => set('chotu_partner2_bio', e.target.value)}
            placeholder="e.g. Partner 2 is a doctor who loves poetry, cooking, and cats…"
            className={inputCls}
            style={inputStyle}
          />
        </div>
      </section>

      {/* Contact Info */}
      <section className="space-y-6">
        <h2 className="text-xs tracking-[0.2em] uppercase" style={{ color: accent }}>
          RSVP Contact Info
        </h2>
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
          Chotu will share this when a guest says they haven&apos;t received their invite link.
        </p>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>
            Contact Name
          </label>
          <input
            type="text"
            value={settings.chotu_contact_name}
            onChange={(e) => set('chotu_contact_name', e.target.value)}
            placeholder="e.g. Aarav Sharma"
            className={inputCls}
            style={inputStyle}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>
            WhatsApp Number
          </label>
          <input
            type="text"
            value={settings.chotu_contact_whatsapp}
            onChange={(e) => set('chotu_contact_whatsapp', e.target.value)}
            placeholder="e.g. +1 (555) 123-4567"
            className={inputCls}
            style={inputStyle}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>
            Email Address
          </label>
          <input
            type="email"
            value={settings.chotu_contact_email}
            onChange={(e) => set('chotu_contact_email', e.target.value)}
            placeholder="e.g. partner1@example.com"
            className={inputCls}
            style={inputStyle}
          />
        </div>
      </section>

      {/* Extra Instructions */}
      <section className="space-y-4">
        <h2 className="text-xs tracking-[0.2em] uppercase" style={{ color: accent }}>
          Extra Instructions
        </h2>
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
          Any additional context or behaviour you want Chotu to follow.
        </p>
        <textarea
          rows={3}
          value={settings.chotu_extra_instructions}
          onChange={(e) => set('chotu_extra_instructions', e.target.value)}
          placeholder="e.g. Always remind guests to bring a shawl for the evening events as it may get cool."
          className={inputCls}
          style={inputStyle}
        />
      </section>

      {/* Save */}
      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 text-sm text-white rounded transition-opacity disabled:opacity-60"
          style={{ background: accent }}
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {saved && (
          <span className="text-sm" style={{ color: accent }}>
            Saved!
          </span>
        )}
        {error && (
          <span className="text-sm text-red-600">{error}</span>
        )}
      </div>
    </div>
  )
}
