import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Navbar from '@/components/public/Navbar'
import Footer from '@/components/public/Footer'
import RsvpFlow from './RsvpFlow'

export const dynamic = 'force-dynamic'

export default async function RsvpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams
  const cookieStore = await cookies()

  const paramToken = params.invite?.trim() ?? null
  const cookieToken = cookieStore.get('rsvp_token')?.value ?? null

  // Bounce through route handler to persist new token as HttpOnly cookie
  if (paramToken && paramToken !== cookieToken) {
    redirect(`/api/public/set-token?token=${encodeURIComponent(paramToken)}&return=${encodeURIComponent('/rsvp')}`)
  }

  const activeToken = paramToken ?? cookieToken

  let guestId: string | null = null
  let guestName: string | null = null
  let invalidToken = false

  if (activeToken) {
    const g = await prisma.guest.findUnique({
      where: { rsvp_token: activeToken },
      select: { id: true, name: true },
    })
    if (g) {
      guestId = g.id
      guestName = g.name
    } else {
      invalidToken = true
    }
  }

  const siteSettingsRows = await prisma.siteSettings.findMany()
  const settings: Record<string, string> = {}
  for (const row of siteSettingsRows) {
    settings[row.key] = row.value
  }

  return (
    <>
      <Navbar
        coupleName={settings.couple_names}
        overPhoto={false}
        guestName={guestName}
        token={guestId ? activeToken : null}
      />
      <main className="flex-1">
        <RsvpFlow
          contactEmail={settings.contact_email ?? null}
          rsvpDeadline={settings.rsvp_deadline ?? null}
          guestId={guestId}
          token={activeToken}
          invalidToken={invalidToken}
        />
      </main>
      <Footer settings={settings} />
    </>
  )
}
