import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export type WhatsAppTemplate = {
  id: string
  name: string
  body: string
  active: boolean
}

export const DEFAULT_TEMPLATE: WhatsAppTemplate = {
  id: 'default',
  name: 'Default',
  body: "Hi {name}! You're invited to the wedding celebrations. Here's your personal link to RSVP and view event details: {link}",
  active: true,
}

function settingKey(side: string) {
  return `whatsapp_templates_${side}`
}

function parseTemplates(value: string | null | undefined): WhatsAppTemplate[] {
  if (!value) return [DEFAULT_TEMPLATE]
  try {
    const parsed = JSON.parse(value) as { templates: WhatsAppTemplate[] }
    if (Array.isArray(parsed.templates) && parsed.templates.length > 0) {
      return parsed.templates
    }
  } catch {
    // fall through to default
  }
  return [DEFAULT_TEMPLATE]
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!
  const row = await prisma.siteSettings.findUnique({ where: { key: settingKey(side) } })
  return NextResponse.json({ templates: parseTemplates(row?.value) })
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.templates)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const templates = body.templates as WhatsAppTemplate[]

  if (templates.length === 0) {
    return NextResponse.json({ error: 'At least one template is required' }, { status: 400 })
  }
  const activeCount = templates.filter((t) => t.active).length
  if (activeCount !== 1) {
    return NextResponse.json({ error: 'Exactly one template must be active' }, { status: 400 })
  }
  for (const t of templates) {
    if (!t.body.includes('{link}')) {
      return NextResponse.json({ error: `Template "${t.name}" must include {link}` }, { status: 400 })
    }
  }

  const side = session.user.side!
  const key = settingKey(side)
  const value = JSON.stringify({ templates })

  await prisma.siteSettings.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })

  return NextResponse.json({ templates })
}
