'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <p className="text-sm" style={{ color: '#991b1b' }}>
          Invalid or missing reset token.
        </p>
        <Link
          href="/admin/forgot-password"
          className="text-sm hover:underline"
          style={{ color: 'var(--color-accent)' }}
        >
          Request a new reset link
        </Link>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })

    setLoading(false)

    if (res.ok) {
      router.push('/admin/login?reset=1')
    } else {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong. The link may have expired.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <p
          className="text-sm py-2 px-4 rounded-lg"
          style={{ background: '#fef2f2', color: '#991b1b' }}
        >
          {error}
        </p>
      )}

      <div className="space-y-1">
        <label
          htmlFor="password"
          className="block text-sm font-medium"
          style={{ color: 'var(--color-foreground)' }}
        >
          New password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-colors"
          style={{
            borderColor: 'var(--color-highlight)',
            color: 'var(--color-foreground)',
          }}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = 'var(--color-accent)')
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = 'var(--color-highlight)')
          }
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="confirm"
          className="block text-sm font-medium"
          style={{ color: 'var(--color-foreground)' }}
        >
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-colors"
          style={{
            borderColor: 'var(--color-highlight)',
            color: 'var(--color-foreground)',
          }}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = 'var(--color-accent)')
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = 'var(--color-highlight)')
          }
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
        style={{ background: 'var(--color-accent)' }}
      >
        {loading ? 'Updating…' : 'Set new password'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--color-background)' }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1
            className="text-4xl font-light tracking-wide mb-2"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
          >
            New Password
          </h1>
        </div>

        <div
          className="bg-white rounded-2xl shadow-sm border px-8 py-10"
          style={{ borderColor: 'var(--color-highlight)' }}
        >
          <Suspense fallback={<p className="text-sm text-center">Loading…</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
