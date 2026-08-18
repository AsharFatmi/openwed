import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CHOTU_KEYS = [
  'chotu_partner1_bio',
  'chotu_partner2_bio',
  'chotu_contact_name',
  'chotu_contact_whatsapp',
  'chotu_contact_email',
  'chotu_extra_instructions',
] as const

type ChotuKey = (typeof CHOTU_KEYS)[number]

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

function buildMap(rows: { key: string; value: string }[]): Record<ChotuKey, string> {
  const map = Object.fromEntries(CHOTU_KEYS.map((k) => [k, ''])) as Record<ChotuKey, string>
  for (const row of rows) {
    if (CHOTU_KEYS.includes(row.key as ChotuKey)) {
      map[row.key as ChotuKey] = row.value
    }
  }
  return map
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const rows = await prisma.siteSettings.findMany({
    where: { key: { in: [...CHOTU_KEYS] } },
  })

  return NextResponse.json({ settings: buildMap(rows) })
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

  await Promise.all(
    CHOTU_KEYS.filter((k) => k in body).map((k) =>
      prisma.siteSettings.upsert({
        where: { key: k },
        create: { key: k, value: String(body[k] ?? '') },
        update: { value: String(body[k] ?? '') },
      })
    )
  )

  const rows = await prisma.siteSettings.findMany({
    where: { key: { in: [...CHOTU_KEYS] } },
  })

  return NextResponse.json({ settings: buildMap(rows) })
}
