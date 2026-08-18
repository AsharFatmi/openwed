'use client'
import { createContext, useContext, useState, useEffect } from 'react'

export type Currency = 'INR' | 'USD'

export type CurrencyCtx = {
  currency: Currency
  setCurrency: (c: Currency) => void
  usdToInr: number
  rateLoading: boolean
  fmt: (inrAmount: number, storedRate?: number | null) => string
  toInr: (displayAmount: number) => number
  fromInr: (inrAmount: number, storedRate?: number | null) => number
  currencySymbol: string
  currentRate: number | null
}

let cachedRate: number | null = null

export const CurrencyContext = createContext<CurrencyCtx | null>(null)

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>('INR')
  const [usdToInr, setUsdToInr] = useState(83)
  const [rateLoading, setRateLoading] = useState(false)
  const [currentRate, setCurrentRate] = useState<number | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('finance_currency') as Currency | null
    if (saved === 'USD') void switchToUsd()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function switchToUsd() {
    setCurrencyState('USD')
    localStorage.setItem('finance_currency', 'USD')
    if (cachedRate) {
      setUsdToInr(cachedRate)
      setCurrentRate(cachedRate)
      return
    }
    setRateLoading(true)
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD')
      const data = (await res.json()) as { rates?: Record<string, number> }
      const rate: number = data.rates?.INR ?? 83
      cachedRate = rate
      setUsdToInr(rate)
      setCurrentRate(rate)
    } catch {
      cachedRate = 83
      setUsdToInr(83)
      setCurrentRate(83)
    } finally {
      setRateLoading(false)
    }
  }

  function setCurrency(c: Currency) {
    if (c === 'USD') {
      void switchToUsd()
    } else {
      setCurrencyState('INR')
      localStorage.setItem('finance_currency', 'INR')
    }
  }

  function fmt(inrAmount: number, storedRate?: number | null): string {
    if (currency === 'USD') {
      const rate = storedRate ?? usdToInr
      const usdAmount = inrAmount / rate
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      }).format(usdAmount)
    }
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(inrAmount)
  }

  function toInr(displayAmount: number): number {
    if (currency === 'USD') return Math.round(displayAmount * usdToInr)
    return displayAmount
  }

  function fromInr(inrAmount: number, storedRate?: number | null): number {
    if (currency === 'USD') {
      const rate = storedRate ?? usdToInr
      return parseFloat((inrAmount / rate).toFixed(2))
    }
    return inrAmount
  }

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        usdToInr,
        rateLoading,
        fmt,
        toInr,
        fromInr,
        currencySymbol: currency === 'INR' ? '₹' : '$',
        currentRate,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider')
  return ctx
}
