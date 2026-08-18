'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    setLoading(false)
    setSubmitted(true)
  }

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
            Reset Password
          </h1>
        </div>

        <div
          className="bg-white rounded-2xl shadow-sm border px-8 py-10"
          style={{ borderColor: 'var(--color-highlight)' }}
        >
          {submitted ? (
            <div className="text-center space-y-4">
              <p className="text-sm" style={{ color: 'var(--color-foreground)' }}>
                If that email is associated with an account, a reset link has been sent.
                Check your inbox.
              </p>
              <Link
                href="/admin/login"
                className="text-sm hover:underline"
                style={{ color: 'var(--color-accent)' }}
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                Enter your admin email and we&apos;ll send you a password reset link.
              </p>

              <div className="space-y-1">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium"
                  style={{ color: 'var(--color-foreground)' }}
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
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
                {loading ? 'Sending…' : 'Send reset link'}
              </button>

              <div className="text-center">
                <Link
                  href="/admin/login"
                  className="text-sm hover:underline"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
