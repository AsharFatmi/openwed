'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { type Side } from '@prisma/client'

const SIDE_CONFIG: Record<Side, { label: string; accent: string; bg: string }> = {
  bride: { label: 'Bride Side', accent: '#be185d', bg: '#fdf2f8' },
  groom: { label: 'Groom Side', accent: '#1d4ed8', bg: '#eff6ff' },
}

type NavLink = { label: string; href: string; exact?: boolean; icon: React.ReactNode }
type NavGroup = { label: string; icon: React.ReactNode; children: NavLink[] }
type NavEntry = NavLink | NavGroup

const NAV_LINKS: NavEntry[] = [
  {
    label: 'Dashboard',
    href: '/admin',
    exact: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Guest Management',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    children: [
      {
        label: 'Guests',
        href: '/admin/guests',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        ),
      },
      {
        label: 'Household Management',
        href: '/admin/households',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
        ),
      },
      {
        label: 'Invitations',
        href: '/admin/invitations',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <polyline points="3 7 12 13 21 7" />
          </svg>
        ),
      },
      {
        label: 'Send Invites',
        href: '/admin/send-invites',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        ),
      },
      {
        label: 'RSVP Responses',
        href: '/admin/rsvps',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        ),
      },
      {
        label: 'Duplicates',
        href: '/admin/duplicates',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <path d="M10 10l4 4" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Hotel Management',
    href: '/admin/rooms',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: 'Financial Management',
    href: '/admin/finance',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    label: 'Chotu',
    href: '/admin/chotu',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M12 8v4" />
        <path d="M10 10h4" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

export default function Sidebar({ side, adminName }: { side: Side; adminName: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // Which collapsible nav groups are manually expanded. A group is shown open
  // when it is manually toggled open OR when the active route is one of its
  // children (so the current page's section is always expanded on load/navigate).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const config = SIDE_CONFIG[side]

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Side indicator */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--color-highlight)' }}>
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{ background: config.bg, color: config.accent }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: config.accent }} />
          {config.label}
        </div>
        <p className="text-xs mt-2 truncate" style={{ color: 'var(--color-muted)' }}>
          {adminName}
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_LINKS.map((entry) => {
          // ── Collapsible group with nested children ────────────────────────
          if ('children' in entry) {
            const groupActive = entry.children.some((c) =>
              c.exact ? pathname === c.href : pathname.startsWith(c.href),
            )
            const isOpen = groupActive || !!openGroups[entry.label]
            return (
              <div key={entry.label} className="space-y-1">
                <button
                  type="button"
                  onClick={() => setOpenGroups((o) => ({ ...o, [entry.label]: !isOpen }))}
                  aria-expanded={isOpen}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm w-full transition-colors"
                  style={{
                    background: groupActive ? config.bg : 'transparent',
                    color: groupActive ? config.accent : 'var(--color-foreground)',
                    fontWeight: groupActive ? 500 : 400,
                  }}
                >
                  <span style={{ color: groupActive ? config.accent : 'var(--color-muted)' }}>
                    {entry.icon}
                  </span>
                  <span className="flex-1 text-left">{entry.label}</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      color: 'var(--color-muted)',
                      transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 0.2s',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {isOpen && (
                  <div
                    className="ml-3 pl-3 border-l space-y-1"
                    style={{ borderColor: 'var(--color-highlight)' }}
                  >
                    {entry.children.map((child) => {
                      const active = child.exact
                        ? pathname === child.href
                        : pathname.startsWith(child.href)
                      return (
                        <a
                          key={child.href}
                          href={child.href}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
                          style={{
                            background: active ? config.bg : 'transparent',
                            color: active ? config.accent : 'var(--color-foreground)',
                            fontWeight: active ? 500 : 400,
                          }}
                        >
                          <span style={{ color: active ? config.accent : 'var(--color-muted)' }}>
                            {child.icon}
                          </span>
                          {child.label}
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          // ── Leaf link ──────────────────────────────────────────────────────
          const active = entry.exact ? pathname === entry.href : pathname.startsWith(entry.href)
          return (
            <a
              key={entry.href}
              href={entry.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
              style={{
                background: active ? config.bg : 'transparent',
                color: active ? config.accent : 'var(--color-foreground)',
                fontWeight: active ? 500 : 400,
              }}
            >
              <span style={{ color: active ? config.accent : 'var(--color-muted)' }}>
                {entry.icon}
              </span>
              {entry.label}
            </a>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t" style={{ borderColor: 'var(--color-highlight)' }}>
        <button
          onClick={() => signOut({ callbackUrl: '/admin/login' })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm w-full transition-colors hover:bg-gray-50"
          style={{ color: 'var(--color-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-between px-4 border-b"
        style={{ background: 'var(--color-background)', borderColor: 'var(--color-highlight)' }}
      >
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
          style={{ background: config.bg, color: config.accent }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: config.accent }} />
          {config.label}
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="p-2"
          aria-label="Toggle menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-foreground)' }}>
            {open ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-30"
          onClick={() => setOpen(false)}
          style={{ background: 'rgba(45,45,45,0.3)' }}
        />
      )}

      {/* Mobile drawer */}
      <div
        className="md:hidden fixed top-14 left-0 bottom-0 z-40 w-64 transition-transform duration-200"
        style={{
          background: 'var(--color-background)',
          borderRight: '1px solid var(--color-highlight)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col w-60 flex-shrink-0 min-h-screen sticky top-0 border-r"
        style={{ background: 'var(--color-background)', borderColor: 'var(--color-highlight)' }}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
