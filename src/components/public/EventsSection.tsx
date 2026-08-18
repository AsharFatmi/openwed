import { type Event, type DisplayGroup } from '@prisma/client'
import { format } from 'date-fns'

const GROUP_ORDER: DisplayGroup[] = ['bride', 'groom', 'joint']

const GROUP_LABELS: Record<DisplayGroup, string> = {
  bride: "Bride's Celebrations",
  groom: "Groom's Celebrations",
  joint: 'Wedding Celebrations',
}

const GROUP_ACCENT: Record<DisplayGroup, string> = {
  bride: '#9d174d',
  groom: '#1e40af',
  joint: 'var(--color-accent)',
}

function formatEventDate(date: Date): string {
  return format(date, 'EEEE, MMMM d, yyyy')
}

export default function EventsSection({ events }: { events: Event[] }) {
  const grouped: Record<DisplayGroup, Event[]> = {
    bride: [],
    groom: [],
    joint: [],
  }
  for (const event of events) {
    grouped[event.display_group].push(event)
  }

  const hasAny = events.length > 0

  return (
    <section
      id="events"
      className="py-24 px-6"
      style={{ background: 'var(--color-background)' }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <p className="text-xs tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--color-muted)' }}>
            Join Us
          </p>
          <h2
            className="text-4xl sm:text-5xl font-light"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
          >
            Events
          </h2>
          <div className="mt-4 h-px w-16 mx-auto" style={{ background: 'var(--color-highlight)' }} />
          <p className="mt-3 text-xs" style={{ color: 'var(--color-muted)' }}>
            All times are in Indian Standard Time (IST, UTC+5:30)
          </p>
        </div>

        {!hasAny ? (
          <p className="text-center text-sm" style={{ color: 'var(--color-muted)' }}>
            Events will be announced soon.
          </p>
        ) : (
          <div className="space-y-16">
            {GROUP_ORDER.map((group) => {
              const groupEvents = grouped[group]
              if (groupEvents.length === 0) return null
              return (
                <div key={group}>
                  {/* Group heading */}
                  <div className="flex items-center gap-4 mb-8">
                    <div
                      className="h-px flex-1"
                      style={{ background: 'var(--color-highlight)' }}
                    />
                    <h3
                      className="text-xl sm:text-2xl font-light tracking-wide whitespace-nowrap"
                      style={{
                        fontFamily: 'var(--font-heading)',
                        color: GROUP_ACCENT[group],
                      }}
                    >
                      {GROUP_LABELS[group]}
                    </h3>
                    <div
                      className="h-px flex-1"
                      style={{ background: 'var(--color-highlight)' }}
                    />
                  </div>

                  {/* Event cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {groupEvents.map((event) => (
                      <a
                        key={event.id}
                        href={`/events/${event.id}`}
                        className="rounded-2xl border overflow-hidden space-y-0 block transition-shadow hover:shadow-md"
                        style={{
                          borderColor: 'var(--color-highlight)',
                          background: '#fff',
                          textDecoration: 'none',
                        }}
                      >
                        {event.image_url && (
                          <div className="w-full aspect-video overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={event.image_url}
                              alt={event.image_alt ?? event.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="p-6 space-y-3">
                        <h4
                          className="text-xl font-medium"
                          style={{
                            fontFamily: 'var(--font-heading)',
                            color: 'var(--color-foreground)',
                          }}
                        >
                          {event.name}
                        </h4>

                        <div className="space-y-1 text-sm" style={{ color: 'var(--color-muted)' }}>
                          <p>{formatEventDate(event.date)}</p>
                          {(event.start_time || event.end_time) && (
                            <p>
                              {event.start_time}
                              {event.end_time ? ` – ${event.end_time}` : ''}
                            </p>
                          )}
                          {event.venue_name && <p className="font-medium" style={{ color: 'var(--color-foreground)' }}>{event.venue_name}</p>}
                          {event.venue_address && <p>{event.venue_address}</p>}
                        </div>

                        {event.dress_code && (
                          <p className="text-xs tracking-wide" style={{ color: 'var(--color-muted)' }}>
                            <span className="font-medium" style={{ color: 'var(--color-foreground)' }}>Dress code:</span>{' '}
                            {event.dress_code}
                          </p>
                        )}

                        {event.description && (
                          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                            {event.description}
                          </p>
                        )}

                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide"
                          style={{ color: GROUP_ACCENT[group] }}
                        >
                          View Details
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
