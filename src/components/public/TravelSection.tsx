import { type Hotel } from '@prisma/client'
import { format } from 'date-fns'

function formatDate(d: Date | null): string {
  if (!d) return ''
  return format(d, 'MMMM d, yyyy')
}

export default function TravelSection({ hotels }: { hotels: Hotel[] }) {
  return (
    <section
      id="travel"
      className="py-24 px-6"
      style={{ background: '#faf9f4' }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <p className="text-xs tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--color-muted)' }}>
            Where to Stay
          </p>
          <h2
            className="text-4xl sm:text-5xl font-light"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
          >
            Travel &amp; Accommodations
          </h2>
          <div className="mt-4 h-px w-16 mx-auto" style={{ background: 'var(--color-highlight)' }} />
        </div>

        {hotels.length === 0 ? (
          <p className="text-center text-sm" style={{ color: 'var(--color-muted)' }}>
            Accommodation details coming soon.
          </p>
        ) : (
          <div className={hotels.length === 1 ? 'max-w-md mx-auto' : 'grid grid-cols-1 sm:grid-cols-2 gap-6'}>
            {hotels.map((hotel) => (
              <div
                key={hotel.id}
                className="rounded-2xl border bg-white overflow-hidden"
                style={{ borderColor: 'var(--color-highlight)' }}
              >
                {hotel.image_url && (
                  <div className="w-full aspect-video overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={hotel.image_url}
                      alt={hotel.image_alt ?? hotel.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-6 space-y-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3
                      className="text-xl font-medium"
                      style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
                    >
                      {hotel.name}
                    </h3>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        background: hotel.side === 'bride' ? '#fdf2f8' : '#eff6ff',
                        color: hotel.side === 'bride' ? '#be185d' : '#1d4ed8',
                      }}
                    >
                      {hotel.side === 'bride' ? "Bride's Guests" : "Groom's Guests"}
                    </span>
                  </div>
                  {hotel.address && (
                    <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {hotel.address}{hotel.city ? `, ${hotel.city}` : ''}
                    </p>
                  )}
                </div>

                <div className="space-y-1 text-sm" style={{ color: 'var(--color-muted)' }}>
                  {hotel.check_in_date && (
                    <p>
                      <span className="font-medium" style={{ color: 'var(--color-foreground)' }}>Check-in:</span>{' '}
                      {formatDate(hotel.check_in_date)}
                    </p>
                  )}
                  {hotel.check_out_date && (
                    <p>
                      <span className="font-medium" style={{ color: 'var(--color-foreground)' }}>Check-out:</span>{' '}
                      {formatDate(hotel.check_out_date)}
                    </p>
                  )}
                  {hotel.contact_phone && (
                    <p>
                      <span className="font-medium" style={{ color: 'var(--color-foreground)' }}>Phone:</span>{' '}
                      <a
                        href={`tel:${hotel.contact_phone}`}
                        className="hover:opacity-70 transition-opacity"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        {hotel.contact_phone}
                      </a>
                    </p>
                  )}
                </div>

                {hotel.notes && (
                  <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                    {hotel.notes}
                  </p>
                )}

                {hotel.distance_info && (
                  <div className="space-y-0.5">
                    {hotel.distance_info.split('\n').map((line, i) => {
                      const city = hotel.city ?? ''
                      const origins = city
                        ? [`${city} Airport`, `${city} Railway Station`]
                        : []
                      const destination = [hotel.name, hotel.address, hotel.city].filter(Boolean).join(', ')
                      const origin = origins[i]
                      const mapsUrl = origin
                        ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`
                        : undefined
                      return (
                        <a
                          key={i}
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
                          style={{ color: 'var(--color-muted)' }}
                        >
                          <svg className="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          {line}
                        </a>
                      )
                    })}
                  </div>
                )}

                {(hotel.address || hotel.map_url) && (
                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--color-highlight)' }}>
                    {hotel.address ? (
                      <div className="relative w-full aspect-video">
                      <iframe
                        title={`Map — ${hotel.name}`}
                        className="absolute inset-0 w-full h-full"
                        style={{ border: 0 }}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent([hotel.name, hotel.address, hotel.city].filter(Boolean).join(', '))}&zoom=15`}
                      />
                      </div>
                    ) : (
                      <a
                        href={hotel.map_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center h-12 text-xs font-medium tracking-wide transition-opacity hover:opacity-70"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        <svg className="mr-1.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        View on Map
                      </a>
                    )}
                  </div>
                )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
