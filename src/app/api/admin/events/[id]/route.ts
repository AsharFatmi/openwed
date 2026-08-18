import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DisplayGroup } from '@prisma/client'

type Context = { params: Promise<{ id: string }> }

async function getOwnedEvent(id: string, side: string) {
  const event = await prisma.event.findUnique({ where: { id } })
  if (!event || event.managed_by !== side) return null
  return event
}

export async function PUT(req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!
  const { id } = await context.params

  const existing = await getOwnedEvent(id, side)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.name !== undefined) {
    if (!body.name?.trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    data.name = body.name.trim()
  }
  if (body.date !== undefined) {
    const d = new Date(`${body.date}T12:00:00`)
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    data.date = d
  }
  if (body.display_group !== undefined) {
    if (!Object.values(DisplayGroup).includes(body.display_group)) return NextResponse.json({ error: 'Invalid display_group' }, { status: 400 })
    data.display_group = body.display_group
    data.managed_by = body.display_group === 'joint' ? side : body.display_group
  }
  if (body.sort_order !== undefined) data.sort_order = Number(body.sort_order)
  if (body.start_time !== undefined) data.start_time = body.start_time?.trim() || null
  if (body.end_time !== undefined) data.end_time = body.end_time?.trim() || null
  if (body.venue_name !== undefined) data.venue_name = body.venue_name?.trim() || null
  if (body.venue_address !== undefined) data.venue_address = body.venue_address?.trim() || null
  if (body.description !== undefined) data.description = body.description?.trim() || null
  if (body.dress_code !== undefined) data.dress_code = body.dress_code?.trim() || null
  if (body.map_url !== undefined) data.map_url = body.map_url?.trim() || null
  if (body.image_url !== undefined) data.image_url = body.image_url?.trim() || null
  if (body.image_alt !== undefined) data.image_alt = body.image_alt?.trim() || null

  const updated = await prisma.event.update({ where: { id }, data })
  return NextResponse.json({
    event: {
      ...updated,
      date: updated.date.toISOString(),
      created_at: updated.created_at.toISOString(),
      updated_at: updated.updated_at.toISOString(),
    },
  })
}

export async function DELETE(_req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!
  const { id } = await context.params

  const existing = await getOwnedEvent(id, side)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.event.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
