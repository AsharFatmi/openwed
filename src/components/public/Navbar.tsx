'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const LEFT_LINKS = [
  { label: 'Events', href: '#events' },
  { label: 'Travel & Stay', href: '#travel' },
  { label: 'RSVP', href: '#rsvp' },
]

const RIGHT_LINKS: { label: string; href: string }[] = []

export default function Navbar({
  coupleName,
  overPhoto = false,
  guestName = null,
  token = null,
}: {
  coupleName?: string
  overPhoto?: boolean
  guestName?: string | null
  token?: string | null
}) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  const isHome = pathname === '/'
  const firstName = guestName ? guestName.split(' ')[0] : null
  const rsvpHref = token ? `/rsvp?invite=${token}` : '#rsvp'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleNavClick = (href: string) => {
    setMenuOpen(false)
    // Section anchors (#events, #travel, #rsvp) only exist on the home page.
    // Off-home, route to the home page with the hash so the browser scrolls
    // to the section after navigation.
    if (!isHome) {
      window.location.href = `/${href}`
      return
    }
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  // When over photo: white text, transparent bg → frosted ivory on scroll
  // When not over photo: charcoal text, ivory bg always
  const onPhoto = overPhoto && !scrolled
  const textColor = onPhoto ? 'rgba(255,255,255,0.95)' : 'var(--color-foreground)'
  const textShadow = onPhoto ? '0 1px 8px rgba(0,0,0,0.7), 0 0px 2px rgba(0,0,0,0.5)' : 'none'
  const bg = scrolled
    ? 'rgba(255,253,247,0.95)'
    : overPhoto
    ? 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.0) 100%)'
    : 'var(--color-background)'

  // Initials from couple_names "Fatima & Ahmed" → "FA"
  const initials = coupleName
    ? coupleName
        .split(/\s*&\s*|\s+and\s+/i)
        .map((n) => n.trim()[0]?.toUpperCase() ?? '')
        .join('')
    : '♡'

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
      style={{
        background: bg,
        backdropFilter: scrolled ? 'blur(10px)' : 'none',
        boxShadow: scrolled ? '0 1px 16px rgba(45,45,45,0.07)' : 'none',
      }}
    >
      {/* Desktop: split nav with centered monogram */}
      <div className="hidden md:flex items-center h-20 px-8 max-w-7xl mx-auto">
        {/* Left links */}
        <div className="flex items-center gap-8 flex-1">
          {LEFT_LINKS.map((link) => (
            <button
              key={link.label}
              onClick={() => handleNavClick(link.href)}
              className="text-xs tracking-[0.18em] uppercase transition-opacity hover:opacity-60 bg-transparent border-none cursor-pointer"
              style={{ color: textColor, textShadow }}
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* Center monogram badge */}
        <div className="flex flex-col items-center mx-8 flex-shrink-0">
          {isHome ? (
          <button
            onClick={() => handleNavClick('#hero')}
            className="flex flex-col items-center gap-0.5 cursor-pointer bg-transparent border-none"
          >
            {/* Badge */}
            <div
              className="w-14 h-14 flex items-center justify-center rounded-sm transition-all"
              style={{
                background: onPhoto ? 'rgba(255,255,255,0.15)' : 'rgba(184,134,11,0.08)',
                border: `1px solid ${onPhoto ? 'rgba(255,255,255,0.4)' : 'rgba(184,134,11,0.3)'}`,
              }}
            >
              <span
                className="text-xl font-light tracking-wider"
                style={{
                  fontFamily: 'var(--font-heading)',
                  color: onPhoto ? 'white' : 'var(--color-accent)',
                }}
              >
                {initials}
              </span>
            </div>
            {/* Leaf decoration */}
            <svg width="28" height="10" viewBox="0 0 28 10" fill="none" className="mt-0.5" style={{ opacity: onPhoto ? 0.7 : 0.4 }}>
              <path d="M1 5 C5 1, 9 1, 14 5 C19 9, 23 9, 27 5" stroke={onPhoto ? 'white' : 'var(--color-accent)'} strokeWidth="1" fill="none" />
              <circle cx="14" cy="5" r="1" fill={onPhoto ? 'white' : 'var(--color-accent)'} />
            </svg>
          </button>
          ) : (
          <a href="/" className="flex flex-col items-center gap-0.5" style={{ textDecoration: 'none' }}>
            <div
              className="w-14 h-14 flex items-center justify-center rounded-sm transition-all"
              style={{
                background: onPhoto ? 'rgba(255,255,255,0.15)' : 'rgba(184,134,11,0.08)',
                border: `1px solid ${onPhoto ? 'rgba(255,255,255,0.4)' : 'rgba(184,134,11,0.3)'}`,
              }}
            >
              <span
                className="text-xl font-light tracking-wider"
                style={{ fontFamily: 'var(--font-heading)', color: onPhoto ? 'white' : 'var(--color-accent)' }}
              >
                {initials}
              </span>
            </div>
            <svg width="28" height="10" viewBox="0 0 28 10" fill="none" className="mt-0.5" style={{ opacity: onPhoto ? 0.7 : 0.4 }}>
              <path d="M1 5 C5 1, 9 1, 14 5 C19 9, 23 9, 27 5" stroke={onPhoto ? 'white' : 'var(--color-accent)'} strokeWidth="1" fill="none" />
              <circle cx="14" cy="5" r="1" fill={onPhoto ? 'white' : 'var(--color-accent)'} />
            </svg>
          </a>
          )}
        </div>

        {/* Right links */}
        <div className="flex items-center gap-8 flex-1 justify-end">
          {RIGHT_LINKS.map((link) => (
            <button
              key={link.label}
              onClick={() => handleNavClick(link.href)}
              className="text-xs tracking-[0.18em] uppercase transition-opacity hover:opacity-60 bg-transparent border-none cursor-pointer"
              style={{ color: textColor, textShadow }}
            >
              {link.label}
            </button>
          ))}
          {firstName ? (
            <a
              href={rsvpHref}
              className="text-xs px-4 py-2 transition-opacity hover:opacity-80 flex items-center gap-1.5"
              style={{
                color: onPhoto ? 'rgba(255,255,255,0.9)' : 'var(--color-accent)',
                border: `1px solid ${onPhoto ? 'rgba(255,255,255,0.4)' : 'rgba(184,134,11,0.4)'}`,
                borderRadius: '20px',
                textDecoration: 'none',
                background: onPhoto ? 'rgba(255,255,255,0.1)' : 'rgba(184,134,11,0.06)',
              }}
            >
              <span style={{ fontSize: '10px' }}>♡</span>
              <span style={{ letterSpacing: '0.05em' }}>Welcome back, {firstName}</span>
            </a>
          ) : (
            <button
              onClick={() => handleNavClick('#rsvp')}
              className="text-xs px-5 py-2 tracking-[0.18em] uppercase transition-opacity hover:opacity-80"
              style={{
                color: 'white',
                background: 'var(--color-accent)',
                borderRadius: '2px',
              }}
            >
              RSVP
            </button>
          )}
        </div>
      </div>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between h-16 px-5">
        {isHome ? (
          <button
            onClick={() => handleNavClick('#hero')}
            className="flex items-center justify-center w-10 h-10 bg-transparent border-none cursor-pointer"
            style={{ border: `1px solid ${onPhoto ? 'rgba(255,255,255,0.4)' : 'rgba(184,134,11,0.3)'}`, borderRadius: '2px' }}
          >
            <span className="text-sm font-light" style={{ fontFamily: 'var(--font-heading)', color: onPhoto ? 'white' : 'var(--color-accent)' }}>
              {initials}
            </span>
          </button>
        ) : (
          <a
            href="/"
            className="flex items-center justify-center w-10 h-10"
            style={{ border: `1px solid ${onPhoto ? 'rgba(255,255,255,0.4)' : 'rgba(184,134,11,0.3)'}`, borderRadius: '2px', textDecoration: 'none' }}
          >
            <span className="text-sm font-light" style={{ fontFamily: 'var(--font-heading)', color: onPhoto ? 'white' : 'var(--color-accent)' }}>
              {initials}
            </span>
          </a>
        )}

        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="p-2 bg-transparent border-none cursor-pointer"
          aria-label="Toggle menu"
        >
          <div className="flex flex-col gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="block w-5 h-px transition-all duration-200"
                style={{
                  background: onPhoto ? 'white' : 'var(--color-foreground)',
                  transform:
                    menuOpen && i === 0 ? 'rotate(45deg) translate(2px, 3px)' :
                    menuOpen && i === 2 ? 'rotate(-45deg) translate(2px, -3px)' : '',
                  opacity: menuOpen && i === 1 ? 0 : 1,
                }}
              />
            ))}
          </div>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="md:hidden border-t px-5 py-5 flex flex-col gap-4"
          style={{ background: 'rgba(255,253,247,0.98)', borderColor: 'var(--color-highlight)' }}
        >
          {[...LEFT_LINKS, ...RIGHT_LINKS].map((link) => (
            <button
              key={link.label}
              onClick={() => handleNavClick(link.href)}
              className="text-xs tracking-[0.18em] uppercase text-left bg-transparent border-none cursor-pointer py-1"
              style={{ color: 'var(--color-foreground)' }}
            >
              {link.label}
            </button>
          ))}
          {firstName ? (
            <a
              href={rsvpHref}
              className="text-xs px-4 py-2 w-fit mt-1 flex items-center gap-1.5"
              style={{
                color: 'var(--color-accent)',
                border: '1px solid rgba(184,134,11,0.4)',
                borderRadius: '20px',
                textDecoration: 'none',
                background: 'rgba(184,134,11,0.06)',
              }}
            >
              <span style={{ fontSize: '10px' }}>♡</span>
              <span>Welcome back, {firstName}</span>
            </a>
          ) : (
            <button
              onClick={() => handleNavClick('#rsvp')}
              className="text-xs px-5 py-2.5 tracking-[0.18em] uppercase text-white w-fit mt-1"
              style={{ background: 'var(--color-accent)', borderRadius: '2px' }}
            >
              RSVP
            </button>
          )}
        </div>
      )}
    </nav>
  )
}
