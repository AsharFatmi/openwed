'use client'

import { useState } from 'react'

export default function EnterForm({ from }: { from: string }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/public/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        window.location.href = from || '/'
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Incorrect password.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full">
      <div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          required
          autoFocus
          className="w-full px-4 py-3 text-sm rounded-sm border text-center tracking-widest outline-none transition-colors"
          style={{
            borderColor: 'var(--color-highlight)',
            background: 'white',
            color: 'var(--color-foreground)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-highlight)')}
        />
      </div>
      {error && (
        <p className="text-sm text-center" style={{ color: '#dc2626' }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || !password}
        className="w-full py-3 text-sm tracking-[0.15em] uppercase text-white disabled:opacity-60 transition-opacity hover:opacity-80"
        style={{ background: 'var(--color-accent)', borderRadius: '2px' }}
      >
        {loading ? 'Entering…' : 'Enter'}
      </button>
    </form>
  )
}
