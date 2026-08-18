'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reset = searchParams.get('reset')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('Invalid email or password.')
      return
    }

    if (result?.ok) {
      router.push('/admin')
    }
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
            Admin Portal
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Wedding Management
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border px-8 py-10 space-y-6"
          style={{ borderColor: 'var(--color-highlight)' }}
        >
          {reset && (
            <p
              className="text-sm text-center py-2 px-4 rounded-lg"
              style={{ background: '#f0fdf4', color: '#166534' }}
            >
              Password updated. Please log in.
            </p>
          )}

          {error && (
            <p
              className="text-sm text-center py-2 px-4 rounded-lg"
              style={{ background: '#fef2f2', color: '#991b1b' }}
            >
              {error}
            </p>
          )}

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

          <div className="space-y-1">
            <label
              htmlFor="password"
              className="block text-sm font-medium"
              style={{ color: 'var(--color-foreground)' }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
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
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="text-center">
            <Link
              href="/admin/forgot-password"
              className="text-sm hover:underline"
              style={{ color: 'var(--color-accent)' }}
            >
              Forgot password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
