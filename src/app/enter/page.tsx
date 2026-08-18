import { prisma } from '@/lib/prisma'
import EnterForm from './EnterForm'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ from?: string }> }

export default async function EnterPage({ searchParams }: Props) {
  const { from } = await searchParams
  const rows = await prisma.siteSettings.findMany()
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  const initials = s.couple_names
    ? s.couple_names
        .split(/\s*&\s*|\s+and\s+/i)
        .map((n: string) => n.trim()[0]?.toUpperCase() ?? '')
        .join('')
    : '♡'

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16"
      style={{ background: 'var(--color-background)' }}
    >
      {/* Monogram */}
      <div
        className="w-16 h-16 flex items-center justify-center mb-8"
        style={{
          border: '1px solid rgba(184,134,11,0.3)',
          background: 'rgba(184,134,11,0.06)',
          borderRadius: '2px',
        }}
      >
        <span
          className="text-2xl font-light"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-accent)' }}
        >
          {initials}
        </span>
      </div>

      {/* Heading */}
      <p className="text-xs tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--color-muted)' }}>
        You&apos;re Invited
      </p>
      <h1
        className="text-4xl sm:text-5xl font-light text-center mb-2"
        style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
      >
        {s.couple_names || 'Our Wedding'}
      </h1>
      <div className="h-px w-16 mb-8" style={{ background: 'var(--color-highlight)' }} />

      <p className="text-sm mb-8 text-center" style={{ color: 'var(--color-muted)' }}>
        This site is password protected. Please enter the password shared with you.
      </p>

      <div className="w-full max-w-sm">
        <EnterForm from={from ?? '/'} />
      </div>
    </div>
  )
}
