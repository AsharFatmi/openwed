import { prisma } from '@/lib/prisma'
import { format } from 'date-fns'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Navbar from '@/components/public/Navbar'
import ChatBubble from '@/components/public/ChatBubble'
import HeroSection from '@/components/public/HeroSection'
import EventsSection from '@/components/public/EventsSection'
import TravelSection from '@/components/public/TravelSection'
import Footer from '@/components/public/Footer'
import CurtainReveal from '@/components/public/CurtainReveal'

export const dynamic = 'force-dynamic'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams
  const cookieStore = await cookies()

  const paramToken = params.invite?.trim() ?? null
  const cookieToken = cookieStore.get('rsvp_token')?.value ?? null

  // When a new token arrives via URL, bounce through the route handler to set
  // the HttpOnly cookie (cookies().set() is not allowed in Server Components).
  if (paramToken && paramToken !== cookieToken) {
    redirect(`/api/public/set-token?token=${encodeURIComponent(paramToken)}&return=${encodeURIComponent('/')}`)
  }

  const activeToken = paramToken ?? cookieToken

  let invitedGuest: { id: string; name: string } | null = null
  if (activeToken) {
    const g = await prisma.guest.findUnique({
      where: { rsvp_token: activeToken },
      select: { id: true, name: true },
    })
    invitedGuest = g ?? null
  }

  const [events, hotels, siteSettingsRows] = await Promise.all([
    prisma.event.findMany({
      orderBy: [{ sort_order: 'asc' }, { date: 'asc' }],
    }),
    prisma.hotel.findMany({
      orderBy: { name: 'asc' },
    }),
    prisma.siteSettings.findMany(),
  ])

  const settings: Record<string, string> = {}
  for (const row of siteSettingsRows) {
    settings[row.key] = row.value
  }

  const rsvpHref = invitedGuest && activeToken
    ? `/rsvp?invite=${activeToken}`
    : '/rsvp'

  return (
    <>
      <CurtainReveal guestName={invitedGuest?.name ?? null} />
      <Navbar
        coupleName={settings.couple_names}
        overPhoto={Boolean(settings.hero_image)}
        guestName={invitedGuest?.name ?? null}
        token={invitedGuest ? activeToken : null}
      />
      <main>
        <HeroSection settings={settings} />
        <EventsSection events={events} />
        <section
          id="rsvp"
          className="py-24 px-6 text-center"
          style={{ background: 'var(--color-background)' }}
        >
          <div className="max-w-xl mx-auto space-y-6">
            <p className="text-xs tracking-[0.3em] uppercase" style={{ color: 'var(--color-muted)' }}>
              Kindly Reply
            </p>
            <h2
              className="text-4xl sm:text-5xl font-light"
              style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
            >
              RSVP
            </h2>
            <div className="h-px w-16 mx-auto" style={{ background: 'var(--color-highlight)' }} />
            <p className="text-sm pt-2" style={{ color: 'var(--color-muted)' }}>
              We&apos;d love to have you celebrate with us.
            </p>
            {settings.rsvp_deadline && (
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                Please RSVP by{' '}
                <span className="font-medium" style={{ color: 'var(--color-foreground)' }}>
                  {format(new Date(settings.rsvp_deadline), 'MMMM d, yyyy')}
                </span>
              </p>
            )}
            <a
              href={rsvpHref}
              className="inline-block px-8 py-3 text-sm tracking-[0.15em] uppercase text-white"
              style={{ background: 'var(--color-accent)', borderRadius: '2px' }}
            >
              RSVP Now
            </a>
          </div>
        </section>
        <TravelSection hotels={hotels} />
      </main>
      <Footer settings={settings} />
      <ChatBubble guestName={invitedGuest?.name ?? null} />
    </>
  )
}
