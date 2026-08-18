'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { type Side } from '@prisma/client'

type Account = {
  id: string
  name: string
  email: string
  side: Side | null
  active: boolean
  created_at: Date
}

type FormState = {
  name: string
  email: string
  password: string
  side: Side | ''
}

type EditState = {
  id: string
  name: string
  email: string
}

type ResetState = {
  id: string
  name: string
  password: string
}

export default function AccountsClient({
  initialAccounts,
}: {
  initialAccounts: Account[]
}) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [form, setForm] = useState<FormState>({ name: '', email: '', password: '', side: '' })
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  const [editState, setEditState] = useState<EditState | null>(null)
  const [editError, setEditError] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  const [resetState, setResetState] = useState<ResetState | null>(null)
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)

  const atMax = false

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.side) {
      setFormError('Please select a side.')
      return
    }
    setFormLoading(true)

    const res = await fetch('/api/admin/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    setFormLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setFormError(data.error ?? 'Failed to create account.')
      return
    }

    const data = await res.json()
    setAccounts((prev) => [...prev, data.account])
    setForm({ name: '', email: '', password: '', side: '' })
  }

  async function handleDelete(account: Account) {
    if (!confirm(`Delete ${account.name}'s account? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/accounts/${account.id}`, { method: 'DELETE' })
    if (!res.ok) return
    setAccounts((prev) => prev.filter((a) => a.id !== account.id))
  }

  async function handleToggleActive(account: Account) {
    const res = await fetch(`/api/admin/accounts/${account.id}`, {
      method: 'PATCH',
    })
    if (!res.ok) return
    const data = await res.json()
    setAccounts((prev) =>
      prev.map((a) => (a.id === account.id ? { ...a, active: data.active } : a))
    )
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editState) return
    setEditError('')
    setEditLoading(true)

    const res = await fetch(`/api/admin/accounts/${editState.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editState.name, email: editState.email }),
    })

    setEditLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setEditError(data.error ?? 'Failed to update account.')
      return
    }

    const data = await res.json()
    setAccounts((prev) =>
      prev.map((a) => (a.id === editState.id ? { ...a, ...data.account } : a))
    )
    setEditState(null)
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!resetState) return
    setResetError('')
    setResetLoading(true)

    const res = await fetch(`/api/admin/accounts/${resetState.id}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: resetState.password }),
    })

    setResetLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setResetError(data.error ?? 'Failed to reset password.')
      return
    }

    setResetSuccess(true)
    setTimeout(() => {
      setResetState(null)
      setResetSuccess(false)
    }, 1500)
  }

  const inputStyle = {
    borderColor: 'var(--color-highlight)',
    color: 'var(--color-foreground)',
  }

  const focusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
      (e.currentTarget.style.borderColor = 'var(--color-accent)'),
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
      (e.currentTarget.style.borderColor = 'var(--color-highlight)'),
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-12">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-4xl font-light tracking-wide"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
          >
            Account Management
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            Manage bride and groom side admin accounts
          </p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/admin/login' })}
          className="text-sm px-4 py-2 rounded-lg border transition-colors hover:bg-gray-50"
          style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
        >
          Sign out
        </button>
      </div>

      {/* Create form */}
      <div
        className="bg-white rounded-2xl shadow-sm border p-8"
        style={{ borderColor: 'var(--color-highlight)' }}
      >
        <h2
          className="text-xl font-medium mb-6"
          style={{ color: 'var(--color-foreground)' }}
        >
          {atMax ? 'Account Limit Reached' : 'Create Side Admin'}
        </h2>

        {atMax ? (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Both bride and groom admin accounts have been created. You can edit or manage them below.
          </p>
        ) : (
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {formError && (
              <p
                className="sm:col-span-2 text-sm py-2 px-4 rounded-lg"
                style={{ background: '#fef2f2', color: '#991b1b' }}
              >
                {formError}
              </p>
            )}

            <div className="space-y-1">
              <label className="block text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-colors"
                style={inputStyle}
                {...focusHandlers}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
                className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-colors"
                style={inputStyle}
                {...focusHandlers}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                Password
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
                minLength={8}
                className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-colors"
                style={inputStyle}
                {...focusHandlers}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                Side
              </label>
              <select
                value={form.side}
                onChange={(e) => setForm((f) => ({ ...f, side: e.target.value as Side | '' }))}
                required
                className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-colors bg-white"
                style={inputStyle}
                {...focusHandlers}
              >
                <option value="">Select side…</option>
                <option value="bride">Bride</option>
                <option value="groom">Groom</option>
              </select>
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={formLoading}
                className="px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
                style={{ background: 'var(--color-accent)' }}
              >
                {formLoading ? 'Creating…' : 'Create account'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Account list */}
      <div
        className="bg-white rounded-2xl shadow-sm border"
        style={{ borderColor: 'var(--color-highlight)' }}
      >
        <div className="px-8 py-6 border-b" style={{ borderColor: 'var(--color-highlight)' }}>
          <h2 className="text-xl font-medium" style={{ color: 'var(--color-foreground)' }}>
            Side Admin Accounts
          </h2>
        </div>

        {accounts.length === 0 ? (
          <div className="px-8 py-12 text-center">
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              No side admin accounts yet. Create one above.
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-highlight)' }}>
            {accounts.map((account) => (
              <div key={account.id} className="px-8 py-5">
                {editState?.id === account.id ? (
                  <form onSubmit={handleEdit} className="space-y-3">
                    {editError && (
                      <p className="text-sm py-2 px-4 rounded-lg" style={{ background: '#fef2f2', color: '#991b1b' }}>
                        {editError}
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={editState.name}
                        onChange={(e) => setEditState((s) => s ? { ...s, name: e.target.value } : s)}
                        required
                        placeholder="Name"
                        className="px-4 py-2 rounded-lg border text-sm outline-none"
                        style={inputStyle}
                        {...focusHandlers}
                      />
                      <input
                        type="email"
                        value={editState.email}
                        onChange={(e) => setEditState((s) => s ? { ...s, email: e.target.value } : s)}
                        required
                        placeholder="Email"
                        className="px-4 py-2 rounded-lg border text-sm outline-none"
                        style={inputStyle}
                        {...focusHandlers}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={editLoading}
                        className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                        style={{ background: 'var(--color-accent)' }}
                      >
                        {editLoading ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditState(null); setEditError('') }}
                        className="px-4 py-1.5 rounded-lg text-sm border"
                        style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : resetState?.id === account.id ? (
                  <form onSubmit={handleResetPassword} className="space-y-3">
                    <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                      Set new password for {account.name}
                    </p>
                    {resetError && (
                      <p className="text-sm py-2 px-4 rounded-lg" style={{ background: '#fef2f2', color: '#991b1b' }}>
                        {resetError}
                      </p>
                    )}
                    {resetSuccess && (
                      <p className="text-sm py-2 px-4 rounded-lg" style={{ background: '#f0fdf4', color: '#166534' }}>
                        Password updated.
                      </p>
                    )}
                    <input
                      type="password"
                      value={resetState.password}
                      onChange={(e) => setResetState((s) => s ? { ...s, password: e.target.value } : s)}
                      required
                      minLength={8}
                      placeholder="New password (min 8 chars)"
                      className="px-4 py-2 rounded-lg border text-sm outline-none w-full max-w-xs"
                      style={inputStyle}
                      {...focusHandlers}
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={resetLoading || resetSuccess}
                        className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                        style={{ background: 'var(--color-accent)' }}
                      >
                        {resetLoading ? 'Updating…' : 'Update password'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setResetState(null); setResetError(''); setResetSuccess(false) }}
                        className="px-4 py-1.5 rounded-lg text-sm border"
                        style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-muted)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm" style={{ color: 'var(--color-foreground)' }}>
                          {account.name}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full capitalize"
                          style={{
                            background: account.side === 'bride' ? '#fce7f3' : '#dbeafe',
                            color: account.side === 'bride' ? '#9d174d' : '#1e40af',
                          }}
                        >
                          {account.side}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: account.active ? '#f0fdf4' : '#f9fafb',
                            color: account.active ? '#166534' : '#6b7280',
                          }}
                        >
                          {account.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                        {account.email}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditState({ id: account.id, name: account.name, email: account.email })}
                        className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                        style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setResetState({ id: account.id, name: account.name, password: '' })}
                        className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                        style={{ borderColor: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
                      >
                        Reset password
                      </button>
                      <button
                        onClick={() => handleToggleActive(account)}
                        className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                        style={{
                          borderColor: account.active ? '#fca5a5' : 'var(--color-highlight)',
                          color: account.active ? '#991b1b' : '#166534',
                        }}
                      >
                        {account.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(account)}
                        className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                        style={{ borderColor: '#fca5a5', color: '#991b1b' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
