'use client'
import { CurrencyProvider, useCurrency } from '@/lib/currency'
import FinanceTabBar from './FinanceTabBar'

function CurrencyToggle({ accent }: { accent: string }) {
  const { currency, setCurrency, rateLoading } = useCurrency()

  const base = 'px-3 py-1 text-sm font-medium rounded-full transition-colors duration-150'
  const active = 'text-white'
  const inactive = 'text-[#2D2D2D] bg-transparent hover:bg-black/5'

  return (
    <div
      className="flex items-center gap-0.5 rounded-full p-0.5"
      style={{ background: 'rgba(0,0,0,0.06)' }}
    >
      <button
        className={`${base} ${currency === 'INR' ? active : inactive}`}
        style={currency === 'INR' ? { background: accent } : {}}
        onClick={() => setCurrency('INR')}
      >
        ₹ INR
      </button>
      <button
        className={`${base} ${currency === 'USD' ? active : inactive}`}
        style={currency === 'USD' ? { background: accent } : {}}
        onClick={() => setCurrency('USD')}
        disabled={rateLoading}
      >
        {rateLoading ? '…' : '$ USD'}
      </button>
    </div>
  )
}

export default function FinanceCurrencyShell({
  side,
  children,
}: {
  side: 'bride' | 'groom'
  children: React.ReactNode
}) {
  const accent = side === 'bride' ? '#be185d' : '#1d4ed8'

  return (
    <CurrencyProvider>
      <div className="p-6 md:p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <h1
            style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: '2rem',
              color: 'var(--color-foreground)',
              fontWeight: 600,
            }}
          >
            Financial Management
          </h1>
          <CurrencyToggle accent={accent} />
        </div>
        <FinanceTabBar side={side} />
        {children}
      </div>
    </CurrencyProvider>
  )
}
