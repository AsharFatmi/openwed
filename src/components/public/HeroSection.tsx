import Countdown from './Countdown'

const NUMBER_WORDS: Record<number, string> = {
  1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', 5: 'Fifth',
  6: 'Sixth', 7: 'Seventh', 8: 'Eighth', 9: 'Ninth', 10: 'Tenth',
  11: 'Eleventh', 12: 'Twelfth', 13: 'Thirteenth', 14: 'Fourteenth',
  15: 'Fifteenth', 16: 'Sixteenth', 17: 'Seventeenth', 18: 'Eighteenth',
  19: 'Nineteenth', 20: 'Twentieth', 21: 'Twenty-First', 22: 'Twenty-Second',
  23: 'Twenty-Third', 24: 'Twenty-Fourth', 25: 'Twenty-Fifth', 26: 'Twenty-Sixth',
  27: 'Twenty-Seventh', 28: 'Twenty-Eighth', 29: 'Twenty-Ninth', 30: 'Thirtieth',
  31: 'Thirty-First',
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const PLAIN_TENS: Record<number, string> = { 20: 'Twenty', 30: 'Thirty' }
const PLAIN_ONES: Record<number, string> = {
  1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five',
  6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten',
  11: 'Eleven', 12: 'Twelve', 13: 'Thirteen', 14: 'Fourteen', 15: 'Fifteen',
  16: 'Sixteen', 17: 'Seventeen', 18: 'Eighteen', 19: 'Nineteen',
}

function yearToWords(year: number): string {
  if (year >= 2000 && year < 3000) {
    const rem = year - 2000
    if (rem === 0) return 'Two Thousand'
    if (rem <= 19) return `Two Thousand ${PLAIN_ONES[rem]}`
    const tens = Math.floor(rem / 10) * 10
    const ones = rem % 10
    return `Two Thousand ${PLAIN_TENS[tens] ?? ''}${ones ? `-${PLAIN_ONES[ones]}` : ''}`
  }
  return String(year)
}

function formatDateElegantly(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const month = MONTHS[d.getUTCMonth()]
  const day = NUMBER_WORDS[d.getUTCDate()] ?? String(d.getUTCDate())
  return `${month} ${day}, ${yearToWords(d.getUTCFullYear())}`
}

// Split "Fatima & Ahmed" → ["Fatima", "Ahmed"]
function splitNames(coupleName: string): [string, string] {
  const parts = coupleName.split(/\s*&\s*|\s+and\s+/i).map((s) => s.trim())
  return [parts[0] ?? coupleName, parts[1] ?? '']
}

export default function HeroSection({ settings }: { settings: Record<string, string> }) {
  const coupleName = settings.couple_names ?? ''
  const weddingDate = settings.wedding_date
  const weddingCity = settings.wedding_city ?? ''
  const heroImage = settings.hero_image ?? ''
  const formattedDate = weddingDate ? formatDateElegantly(weddingDate) : ''
  const [firstName, secondName] = splitNames(coupleName || 'Your Name & Their Name')

  const hasPhoto = Boolean(heroImage)

  return (
    <section
      id="hero"
      className="relative min-h-screen flex flex-col items-center justify-center text-center overflow-hidden"
    >
      {/* Background: photo if available, else warm ivory gradient */}
      {hasPhoto ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImage}
            alt="Wedding photo"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          {/* Gradient overlay for text legibility */}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, rgba(10,8,5,0.35) 0%, rgba(10,8,5,0.60) 40%, rgba(10,8,5,0.65) 100%)' }}
          />
        </>
      ) : (
        /* No photo yet — elegant warm gradient placeholder */
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, #f5ede0 0%, #fffdf7 40%, #f0e8d8 100%)' }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-5 px-6 py-24">

        {/* "perfect wedding story" italic script line */}
        <p
          className="text-base sm:text-xl italic font-light tracking-wide"
          style={{
            fontFamily: 'var(--font-heading)',
            color: hasPhoto ? 'rgba(255,255,255,0.92)' : 'var(--color-muted)',
            textShadow: hasPhoto ? '0 1px 12px rgba(0,0,0,0.5)' : 'none',
          }}
        >
          {weddingCity ? `Celebrating in ${weddingCity}` : 'a perfect wedding story'}
        </p>

        {/* First name — large */}
        <h1
          className="text-6xl sm:text-8xl md:text-9xl font-light tracking-widest leading-none uppercase"
          style={{
            fontFamily: 'var(--font-heading)',
            color: hasPhoto ? 'white' : 'var(--color-foreground)',
            textShadow: hasPhoto ? '0 2px 32px rgba(0,0,0,0.6), 0 1px 8px rgba(0,0,0,0.4)' : 'none',
          }}
        >
          {firstName}
        </h1>

        {/* "and & and" script connector */}
        <div className="flex items-center gap-4">
          <div className="h-px w-8 sm:w-12" style={{ background: hasPhoto ? 'rgba(255,255,255,0.4)' : 'var(--color-highlight)' }} />
          <p
            className="text-base sm:text-lg italic font-light tracking-widest"
            style={{
              fontFamily: 'var(--font-heading)',
              color: hasPhoto ? 'rgba(255,255,255,0.8)' : 'var(--color-accent)',
            }}
          >
            &amp;
          </p>
          <div className="h-px w-8 sm:w-12" style={{ background: hasPhoto ? 'rgba(255,255,255,0.4)' : 'var(--color-highlight)' }} />
        </div>

        {/* Second name — large */}
        {secondName && (
          <h2
            className="text-6xl sm:text-8xl md:text-9xl font-light tracking-widest leading-none uppercase"
            style={{
              fontFamily: 'var(--font-heading)',
              color: hasPhoto ? 'white' : 'var(--color-foreground)',
              textShadow: hasPhoto ? '0 2px 32px rgba(0,0,0,0.6), 0 1px 8px rgba(0,0,0,0.4)' : 'none',
            }}
          >
            {secondName}
          </h2>
        )}

        {/* Tagline */}
        <p
          className="text-sm sm:text-lg italic font-light tracking-[0.2em] mt-1"
          style={{
            fontFamily: 'var(--font-heading)',
            color: hasPhoto ? 'rgba(255,255,255,0.88)' : 'var(--color-muted)',
            textShadow: hasPhoto ? '0 1px 10px rgba(0,0,0,0.5)' : 'none',
          }}
        >
          hope you&apos;ll join us
        </p>

        {/* Leaf / floral divider */}
        <svg width="60" height="18" viewBox="0 0 60 18" fill="none" className="my-1" style={{ opacity: hasPhoto ? 0.6 : 0.35 }}>
          <path d="M2 9 C10 3, 20 3, 30 9 C40 15, 50 15, 58 9" stroke={hasPhoto ? 'white' : 'var(--color-accent)'} strokeWidth="1" fill="none" />
          <circle cx="15" cy="6" r="1.5" fill={hasPhoto ? 'white' : 'var(--color-accent)'} />
          <circle cx="30" cy="9" r="1.5" fill={hasPhoto ? 'white' : 'var(--color-accent)'} />
          <circle cx="45" cy="12" r="1.5" fill={hasPhoto ? 'white' : 'var(--color-accent)'} />
        </svg>

        {/* Date */}
        {formattedDate && (
          <p
            className="text-xs sm:text-sm tracking-[0.25em] uppercase font-light"
            style={{ color: hasPhoto ? 'rgba(255,255,255,0.9)' : 'var(--color-muted)', textShadow: hasPhoto ? '0 1px 10px rgba(0,0,0,0.5)' : 'none' }}
          >
            {formattedDate}
          </p>
        )}

        {/* Countdown */}
        {weddingDate && (
          <div className="mt-4">
            <Countdown targetDate={weddingDate} overPhoto={hasPhoto} />
          </div>
        )}

        {/* RSVP CTA */}
        <div className="mt-4">
          <a
            href="#rsvp"
            className="inline-block px-8 py-3 text-xs tracking-[0.25em] uppercase font-medium transition-opacity hover:opacity-80"
            style={{
              background: hasPhoto ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: hasPhoto ? 'white' : 'var(--color-accent)',
              border: `1px solid ${hasPhoto ? 'rgba(255,255,255,0.5)' : 'var(--color-accent)'}`,
              borderRadius: '2px',
              backdropFilter: hasPhoto ? 'blur(4px)' : 'none',
            }}
          >
            RSVP Now
          </a>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ color: hasPhoto ? 'rgba(255,255,255,0.6)' : 'var(--color-muted)' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </section>
  )
}
