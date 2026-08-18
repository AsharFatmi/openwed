'use client'

import { useEffect, useState } from 'react'

type TimeLeft = {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function getTimeLeft(targetDate: string): TimeLeft | null {
  const diff = new Date(targetDate).getTime() - Date.now()
  if (diff <= 0) return null
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

export default function Countdown({ targetDate, overPhoto }: { targetDate?: string; overPhoto?: boolean }) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null)

  useEffect(() => {
    if (!targetDate) return
    setTimeLeft(getTimeLeft(targetDate))
    const id = setInterval(() => setTimeLeft(getTimeLeft(targetDate)), 1000)
    return () => clearInterval(id)
  }, [targetDate])

  if (!targetDate) return null
  const numColor = overPhoto ? 'rgba(255,255,255,0.95)' : 'var(--color-foreground)'
  const labelColor = overPhoto ? 'rgba(255,255,255,0.6)' : 'var(--color-muted)'

  if (timeLeft === null) {
    return (
      <p className="text-xs tracking-widest uppercase" style={{ color: labelColor }}>
        The celebration has begun
      </p>
    )
  }

  const units = [
    { value: timeLeft.days, label: 'Days' },
    { value: timeLeft.hours, label: 'Hours' },
    { value: timeLeft.minutes, label: 'Minutes' },
    { value: timeLeft.seconds, label: 'Seconds' },
  ]

  return (
    <div className="flex gap-6 sm:gap-10 justify-center">
      {units.map(({ value, label }) => (
        <div key={label} className="flex flex-col items-center">
          <span
            className="text-3xl sm:text-4xl font-light tabular-nums"
            style={{ fontFamily: 'var(--font-heading)', color: numColor }}
          >
            {String(value).padStart(2, '0')}
          </span>
          <span
            className="text-[10px] tracking-[0.2em] uppercase mt-1"
            style={{ color: labelColor }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
