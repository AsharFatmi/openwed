'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const TABS = [
  { label: 'Overview', href: '/admin/finance/overview' },
  { label: 'Reports', href: '/admin/finance/reports' },
  { label: 'Categories', href: '/admin/finance/categories' },
  { label: 'Expenses', href: '/admin/finance/expenses' },
  { label: 'Vendors', href: '/admin/finance/vendors' },
  { label: 'Payments', href: '/admin/finance/payments' },
]

const ACCENT: Record<'bride' | 'groom', string> = {
  bride: '#be185d',
  groom: '#1d4ed8',
}

export default function FinanceTabBar({ side }: { side: 'bride' | 'groom' }) {
  const pathname = usePathname()
  const accent = ACCENT[side]

  return (
    <div
      className="flex gap-1 mb-6 p-1 rounded-xl w-fit"
      style={{ background: 'var(--color-highlight)' }}
    >
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: active ? 'var(--color-background)' : 'transparent',
              color: active ? accent : 'var(--color-muted)',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
