import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

const SETTING_KEYS = ['couple_names', 'wedding_date', 'rsvp_deadline', 'wedding_hashtag', 'contact_email', 'bride_contact_email', 'groom_contact_email', 'hero_image', 'wedding_city', 'site_password'] as const

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin/login')

  const side = session.user.side!

  const [events, settingsRows, hotels, galleryPhotos] = await Promise.all([
    prisma.event.findMany({
      where: { managed_by: side },
      orderBy: [{ sort_order: 'asc' }, { date: 'asc' }],
    }),
    prisma.siteSettings.findMany({
      where: { key: { in: [...SETTING_KEYS] } },
    }),
    prisma.hotel.findMany({
      where: { side },
      select: { id: true, name: true, image_url: true, image_alt: true },
      orderBy: { name: 'asc' },
    }),
    prisma.galleryPhoto.findMany({ orderBy: { sort_order: 'asc' } }),
  ])

  const serializedEvents = events.map((e) => ({
    ...e,
    date: e.date.toISOString(),
    created_at: e.created_at.toISOString(),
    updated_at: e.updated_at.toISOString(),
  }))

  const initialSettings = Object.fromEntries(
    SETTING_KEYS.map((k) => [k, settingsRows.find((r) => r.key === k)?.value ?? ''])
  ) as { couple_names: string; wedding_date: string; rsvp_deadline: string; wedding_hashtag: string; contact_email: string; bride_contact_email: string; groom_contact_email: string; hero_image: string; wedding_city: string; site_password: string }

  const serializedGallery = galleryPhotos.map((p) => ({
    ...p,
    uploaded_at: p.uploaded_at.toISOString(),
  }))

  return (
    <SettingsClient
      initialEvents={serializedEvents}
      initialSettings={initialSettings}
      initialHotels={hotels}
      initialGallery={serializedGallery}
      side={side}
    />
  )
}
