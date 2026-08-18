'use client'

export default function BackToTop() {
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="text-xs tracking-widest uppercase transition-opacity hover:opacity-60"
      style={{ color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
    >
      ↑ Back to top
    </button>
  )
}
