import BackToTop from './BackToTop'

export default function Footer({ settings }: { settings: Record<string, string> }) {
  const coupleName = settings.couple_names
  const hashtag = settings.hashtag
  const brideContactEmail = settings.bride_contact_email
  const groomContactEmail = settings.groom_contact_email

  return (
    <footer
      className="py-16 px-6 border-t text-center space-y-4"
      style={{ borderColor: 'var(--color-highlight)', background: 'var(--color-background)' }}
    >
      {coupleName && (
        <p
          className="text-2xl font-light italic"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
        >
          {coupleName}
        </p>
      )}

      {hashtag && (
        <p className="text-sm tracking-wide" style={{ color: 'var(--color-accent)' }}>
          {hashtag}
        </p>
      )}

      {(brideContactEmail || groomContactEmail) && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-x-8 gap-y-2 pt-2">
          {brideContactEmail && (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Bride side questions?{' '}
              <a
                href={`mailto:${brideContactEmail}`}
                className="hover:opacity-70 transition-opacity underline underline-offset-2"
                style={{ color: '#be185d' }}
              >
                {brideContactEmail}
              </a>
            </p>
          )}
          {groomContactEmail && (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Groom side questions?{' '}
              <a
                href={`mailto:${groomContactEmail}`}
                className="hover:opacity-70 transition-opacity underline underline-offset-2"
                style={{ color: '#1d4ed8' }}
              >
                {groomContactEmail}
              </a>
            </p>
          )}
        </div>
      )}

      <div className="pt-2">
        <BackToTop />
      </div>

      <div className="pt-4 border-t" style={{ borderColor: 'var(--color-highlight)' }}>
        <a
          href="/admin"
          className="text-xs hover:opacity-70 transition-opacity"
          style={{ color: 'var(--color-muted)' }}
        >
          Admin
        </a>
      </div>
    </footer>
  )
}
