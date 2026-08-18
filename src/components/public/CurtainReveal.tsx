'use client'

import { useEffect, useState } from 'react'

export default function CurtainReveal({ guestName = null }: { guestName?: string | null }) {
  const [phase, setPhase] = useState<'closed' | 'opening' | 'done'>('closed')
  const firstName = guestName ? guestName.split(' ')[0] : null

  useEffect(() => {
    // Hold the curtains longer so a personalised welcome is readable
    const openDelay = firstName ? 2500 : 600
    const doneDelay = openDelay + 1900
    const t1 = setTimeout(() => setPhase('opening'), openDelay)
    const t2 = setTimeout(() => setPhase('done'), doneDelay)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [firstName])

  if (phase === 'done') return null

  const open = phase === 'opening'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: open ? 'none' : 'all',
        overflow: 'hidden',
      }}
    >
      {/* ── Left panel ── */}
      <CurtainPanel side="left" open={open} />
      {/* ── Right panel ── */}
      <CurtainPanel side="right" open={open} />

      {/* ── Pelmet / valance bar across the top ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '72px',
          zIndex: 10001,
          background: 'linear-gradient(180deg, #c9827a 0%, #b8726a 60%, #a86058 100%)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
        }}
      >
        {/* Pelmet scallop edge */}
        <svg
          viewBox="0 0 1440 40"
          preserveAspectRatio="none"
          style={{ position: 'absolute', bottom: -1, left: 0, width: '100%', height: '40px' }}
        >
          <path
            d="M0,0 C60,40 120,40 180,0 C240,40 300,40 360,0 C420,40 480,40 540,0 C600,40 660,40 720,0 C780,40 840,40 900,0 C960,40 1020,40 1080,0 C1140,40 1200,40 1260,0 C1320,40 1380,40 1440,0 L1440,40 L0,40 Z"
            fill="#b8726a"
          />
        </svg>
        {/* Gold tassel fringe along the bottom of pelmet */}
        <div style={{ position: 'absolute', bottom: '-22px', left: 0, right: 0, display: 'flex', justifyContent: 'space-around', paddingInline: '12px' }}>
          {Array.from({ length: 28 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#d4a84b' }} />
              <div style={{ width: '1.5px', height: '16px', background: 'linear-gradient(to bottom, #d4a84b, #c09030)' }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Center monogram while closed ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10002,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          opacity: open ? 0 : 1,
          transition: 'opacity 0.5s ease',
        }}
      >
        <div style={{
          width: '72px', height: '72px',
          border: '1px solid rgba(212,168,75,0.6)',
          background: 'rgba(212,168,75,0.12)',
          borderRadius: '2px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '14px',
        }}>
          <span style={{
            fontFamily: 'var(--font-cormorant), serif',
            fontSize: '28px',
            fontWeight: 300,
            color: '#d4a84b',
          }}>♡</span>
        </div>
        <p style={{
          fontFamily: 'var(--font-cormorant), serif',
          fontSize: firstName ? '15px' : '11px',
          letterSpacing: firstName ? '0.2em' : '0.35em',
          textTransform: 'uppercase',
          color: 'rgba(255,240,220,0.85)',
          margin: 0,
        }}>
          {firstName ? `Welcome, ${firstName}` : 'Welcome'}
        </p>
      </div>
    </div>
  )
}

function CurtainPanel({ side, open }: { side: 'left' | 'right'; open: boolean }) {
  const isLeft = side === 'left'

  const transform = open
    ? `translateX(${isLeft ? '-105%' : '105%'})`
    : 'translateX(0)'

  const delay = isLeft ? '0s' : '0.06s'

  const fabricColor = 'linear-gradient(to right, #c47a72 0%, #d4908a 18%, #dfa89e 35%, #d4908a 52%, #c97870 68%, #d4948c 82%, #c47a72 100%)'

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [isLeft ? 'left' : 'right']: 0,
        width: '51%',
        transform,
        transition: `transform 1.8s cubic-bezier(0.4, 0, 0.2, 1) ${delay}`,
        willChange: 'transform',
        zIndex: 10000,
      }}
    >
      {/* Main fabric */}
      <div style={{ position: 'absolute', inset: 0, background: fabricColor }} />

      {/* Vertical fold shading */}
      <Folds side={side} />

      {/* Bottom swag hem */}
      <SwagHem side={side} />

      {/* Inner edge shadow */}
      <div style={{
        position: 'absolute',
        top: 0, bottom: 0,
        [isLeft ? 'right' : 'left']: 0,
        width: '40px',
        background: isLeft
          ? 'linear-gradient(to right, transparent, rgba(0,0,0,0.22))'
          : 'linear-gradient(to left, transparent, rgba(0,0,0,0.22))',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

function Folds({ side }: { side: 'left' | 'right' }) {
  const isLeft = side === 'left'
  const folds = [0.08, 0.22, 0.38, 0.54, 0.68, 0.82]

  return (
    <>
      {folds.map((pos, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: 0, bottom: 0,
            left: `${pos * 100}%`,
            width: '1px',
            background: i % 2 === 0
              ? 'rgba(255,255,255,0.18)'
              : 'rgba(0,0,0,0.14)',
            boxShadow: i % 2 === 0
              ? `${isLeft ? 2 : -2}px 0 8px rgba(255,255,255,0.08)`
              : `${isLeft ? -2 : 2}px 0 8px rgba(0,0,0,0.1)`,
          }}
        />
      ))}
      {[0.15, 0.45, 0.75].map((pos, i) => (
        <div
          key={`broad-${i}`}
          style={{
            position: 'absolute',
            top: 0, bottom: 0,
            left: `${pos * 100}%`,
            width: '12%',
            background: 'rgba(0,0,0,0.07)',
            filter: 'blur(6px)',
          }}
        />
      ))}
    </>
  )
}

function SwagHem({ side }: { side: 'left' | 'right' }) {
  const isLeft = side === 'left'
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '120px', pointerEvents: 'none' }}>
      <svg
        viewBox="0 0 600 120"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%' }}
      >
        <path
          d={isLeft
            ? 'M0,0 Q150,100 300,70 Q450,40 600,80 L600,120 L0,120 Z'
            : 'M0,80 Q150,40 300,70 Q450,100 600,0 L600,120 L0,120 Z'}
          fill="rgba(0,0,0,0.12)"
        />
        <path
          d={isLeft
            ? 'M0,0 Q150,90 300,60 Q450,30 600,70 L600,120 L0,120 Z'
            : 'M0,70 Q150,30 300,60 Q450,90 600,0 L600,120 L0,120 Z'}
          fill="#d4908a"
        />
        <path
          d={isLeft
            ? 'M0,0 Q150,90 300,60 Q450,30 600,70'
            : 'M0,70 Q150,30 300,60 Q450,90 600,0'}
          fill="none"
          stroke="#d4a84b"
          strokeWidth="2.5"
          opacity="0.9"
        />
      </svg>
      <Tassels side={side} />
    </div>
  )
}

function Tassels({ side }: { side: 'left' | 'right' }) {
  const isLeft = side === 'left'
  const positions = isLeft
    ? [6, 22, 40, 58, 76]
    : [24, 42, 60, 78, 94]

  return (
    <>
      {positions.map((pct, i) => {
        const t = pct / 100
        const y = isLeft
          ? Math.sin(t * Math.PI) * 30 + 4
          : Math.sin((1 - t) * Math.PI) * 30 + 4

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${pct}%`,
              top: `${y}px`,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d4a84b', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
            <div style={{ width: '2px', height: '20px', background: 'linear-gradient(to bottom, #d4a84b, #b8860b)' }} />
            <div style={{ width: '10px', height: '10px', borderRadius: '50% 50% 40% 40%', background: 'radial-gradient(circle at 40% 35%, #e0b860, #c09030)', boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }} />
            <div style={{ display: 'flex', gap: '1.5px', marginTop: '1px' }}>
              {[0, 1, 2, 3].map((j) => (
                <div key={j} style={{ width: '1.5px', height: `${14 + j % 2 * 4}px`, background: 'linear-gradient(to bottom, #c09030, rgba(176,128,0,0.4))', borderRadius: '0 0 1px 1px' }} />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}
