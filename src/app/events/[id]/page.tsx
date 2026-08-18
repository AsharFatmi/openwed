import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { format } from 'date-fns'
import Navbar from '@/components/public/Navbar'
import Footer from '@/components/public/Footer'
import type { DisplayGroup } from '@prisma/client'

export const dynamic = 'force-dynamic'

// ─── Fetch distances: each hotel → venue ──────────────────────────────────────

async function getHotelDistances(
  hotels: { id: string; name: string; address: string | null; city: string | null }[],
  venueAddress: string,
): Promise<Record<string, string>> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey || hotels.length === 0) return {}

  const origins = hotels
    .map((h) => [h.name, h.address, h.city].filter(Boolean).join(', '))
    .join('|')

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(venueAddress)}&units=metric&key=${apiKey}`

  try {
    const res = await fetch(url)
    const raw = await res.text()
    const data = JSON.parse(raw) as {
      status: string
      rows: Array<{ elements: Array<{ status: string; distance: { text: string } }> }>
    }
    if (data.status !== 'OK') return {}
    const result: Record<string, string> = {}
    hotels.forEach((h, i) => {
      const el = data.rows[i]?.elements[0]
      if (el?.status === 'OK') result[h.id] = el.distance.text
    })
    return result
  } catch {
    return {}
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GROUP_ACCENT: Record<DisplayGroup, string> = {
  bride: '#9d174d',
  groom: '#1e40af',
  joint: 'var(--color-accent)',
}

const GROUP_LABELS: Record<DisplayGroup, string> = {
  bride: "Bride's Celebration",
  groom: "Groom's Celebration",
  joint: 'Wedding Celebration',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = { params: Promise<{ id: string }> }

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params

  const [event, siteSettingsRows] = await Promise.all([
    prisma.event.findUnique({ where: { id } }),
    prisma.siteSettings.findMany(),
  ])

  if (!event) notFound()

  // Fetch hotels based on event's display group
  const hotels = event.display_group === 'joint'
    ? await prisma.hotel.findMany({ orderBy: { name: 'asc' } })
    : await prisma.hotel.findMany({
        where: { side: event.display_group },
        orderBy: { name: 'asc' },
      })

  const settings: Record<string, string> = {}
  for (const row of siteSettingsRows) settings[row.key] = row.value

  const venueAddress = [event.venue_name, event.venue_address].filter(Boolean).join(', ')
  const hotelDistances = venueAddress ? await getHotelDistances(hotels, venueAddress) : {}

  const accent = GROUP_ACCENT[event.display_group]
  const groupLabel = GROUP_LABELS[event.display_group]

  return (
    <>
      <Navbar coupleName={settings.couple_names} overPhoto={Boolean(event.image_url)} />
      <main style={{ background: 'var(--color-background)', minHeight: '100vh' }}>

        {/* ── Hero / Banner ── */}
        {event.image_url ? (
          <div className="relative w-full" style={{ height: 'clamp(240px, 50vh, 480px)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.image_url}
              alt={event.image_alt ?? event.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)' }} />
            <div className="absolute bottom-0 left-0 right-0 px-6 pb-10 text-center text-white">
              <p className="text-xs tracking-[0.3em] uppercase mb-3 opacity-80">{groupLabel}</p>
              <h1 className="text-5xl sm:text-6xl font-light" style={{ fontFamily: 'var(--font-heading)' }}>
                {event.name}
              </h1>
              <div className="mt-4 h-px w-16 mx-auto opacity-50" style={{ background: 'white' }} />
            </div>
          </div>
        ) : (
          <div className="pt-32 pb-16 px-6 text-center">
            <p className="text-xs tracking-[0.3em] uppercase mb-3" style={{ color: accent }}>{groupLabel}</p>
            <h1
              className="text-5xl sm:text-6xl font-light"
              style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
            >
              {event.name}
            </h1>
            <div className="mt-4 h-px w-16 mx-auto" style={{ background: 'var(--color-highlight)' }} />
          </div>
        )}

        {/* ── Content ── */}
        <div className="max-w-3xl mx-auto px-6 py-16 space-y-16">

          {/* Date / time / venue block */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">

            {/* Date & Time */}
            <div className="space-y-3">
              <p className="text-xs tracking-[0.25em] uppercase font-medium" style={{ color: accent }}>
                Date &amp; Time
              </p>
              <div className="space-y-1" style={{ color: 'var(--color-foreground)' }}>
                <p className="text-2xl font-light" style={{ fontFamily: 'var(--font-heading)' }}>
                  {format(event.date, 'EEEE')}
                </p>
                <p className="text-lg" style={{ color: 'var(--color-muted)' }}>
                  {format(event.date, 'MMMM d, yyyy')}
                </p>
                {(event.start_time || event.end_time) && (
                  <p className="text-sm pt-1" style={{ color: 'var(--color-muted)' }}>
                    {event.start_time}{event.end_time ? ` – ${event.end_time}` : ''}{' '}
                    <span className="text-xs opacity-70">IST</span>
                  </p>
                )}
              </div>
            </div>

            {/* Venue */}
            {(event.venue_name || event.venue_address) && (
              <div className="space-y-3">
                <p className="text-xs tracking-[0.25em] uppercase font-medium" style={{ color: accent }}>
                  Venue
                </p>
                <div className="space-y-1">
                  {event.venue_name && (
                    <p className="text-2xl font-light" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                      {event.venue_name}
                    </p>
                  )}
                  {event.venue_address && (
                    <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                      {event.venue_address}
                    </p>
                  )}
                  {event.map_url && (
                    <a
                      href={event.map_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide transition-opacity hover:opacity-70 pt-1"
                      style={{ color: accent }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                      </svg>
                      Get Directions
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Dress code */}
          {event.dress_code && (
            <div className="border-l-2 pl-5 space-y-1" style={{ borderColor: accent }}>
              <p className="text-xs tracking-[0.25em] uppercase font-medium" style={{ color: accent }}>
                Dress Code
              </p>
              <p className="text-lg font-light" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                {event.dress_code}
              </p>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="space-y-3">
              <p className="text-xs tracking-[0.25em] uppercase font-medium" style={{ color: accent }}>
                About This Event
              </p>
              <p className="text-base leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                {event.description}
              </p>
            </div>
          )}

          {/* Map embed */}
          {venueAddress && (
            <div className="space-y-4">
              <p className="text-xs tracking-[0.25em] uppercase font-medium" style={{ color: accent }}>
                Location
              </p>
              <div className="rounded-2xl overflow-hidden border relative w-full aspect-video" style={{ borderColor: 'var(--color-highlight)' }}>
                <iframe
                  title={`Map — ${event.venue_name ?? event.name}`}
                  className="absolute inset-0 w-full h-full"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(venueAddress)}&zoom=15`}
                />
              </div>
            </div>
          )}

          {/* Hotels & distances */}
          {hotels.length > 0 && (
            <div className="space-y-5">
              <div>
                <p className="text-xs tracking-[0.25em] uppercase font-medium" style={{ color: accent }}>
                  Getting Here from Your Hotel
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                  Driving distances from recommended accommodations
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {hotels.map((hotel) => {
                  const dist = hotelDistances[hotel.id]
                  const hotelAddr = [hotel.name, hotel.address, hotel.city].filter(Boolean).join(', ')
                  const mapsUrl = venueAddress
                    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(hotelAddr)}&destination=${encodeURIComponent(venueAddress)}&travelmode=driving`
                    : undefined
                  return (
                    <a
                      key={hotel.id}
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-4 rounded-xl border px-5 py-4 transition-all hover:shadow-sm"
                      style={{ borderColor: 'var(--color-highlight)', background: 'white', textDecoration: 'none' }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--color-foreground)' }}>
                          {hotel.name}
                        </p>
                        {hotel.city && (
                          <p className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>
                            {hotel.city}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {dist && (
                          <span className="text-sm font-medium" style={{ color: accent }}>
                            {dist}
                          </span>
                        )}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: accent, opacity: 0.7 }}>
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                        </svg>
                      </div>
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          {/* Back link */}
          <div className="pt-4 border-t" style={{ borderColor: 'var(--color-highlight)' }}>
            <a
              href="/#events"
              className="inline-flex items-center gap-2 text-xs tracking-[0.15em] uppercase transition-opacity hover:opacity-60"
              style={{ color: 'var(--color-muted)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              All Events
            </a>
          </div>

        </div>
      </main>
      <Footer settings={settings} />
    </>
  )
}
