import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const SETTING_KEYS = ['couple_names', 'wedding_date', 'rsvp_deadline', 'wedding_hashtag', 'contact_email', 'bride_contact_email', 'groom_contact_email', 'hero_image', 'wedding_city', 'site_password'] as const
type SettingKey = (typeof SETTING_KEYS)[number]

function buildMap(rows: { key: string; value: string }[]): Record<SettingKey, string> {
  return Object.fromEntries(SETTING_KEYS.map((k) => [k, rows.find((r) => r.key === k)?.value ?? ''])) as Record<SettingKey, string>
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await prisma.siteSettings.findMany({ where: { key: { in: [...SETTING_KEYS] } } })
  return NextResponse.json({ settings: buildMap(rows) })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  await Promise.all(
    SETTING_KEYS.filter((k) => k in body).map((k) =>
      prisma.siteSettings.upsert({
        where: { key: k },
        create: { key: k, value: String(body[k] ?? '') },
        update: { value: String(body[k] ?? '') },
      })
    )
  )

  const rows = await prisma.siteSettings.findMany({ where: { key: { in: [...SETTING_KEYS] } } })
  return NextResponse.json({ settings: buildMap(rows) })
}
