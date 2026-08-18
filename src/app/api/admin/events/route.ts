import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DisplayGroup } from '@prisma/client'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!

  const events = await prisma.event.findMany({
    where: { managed_by: side },
    orderBy: [{ sort_order: 'asc' }, { date: 'asc' }],
  })

  return NextResponse.json({
    events: events.map((e) => ({
      ...e,
      date: e.date.toISOString(),
      created_at: e.created_at.toISOString(),
      updated_at: e.updated_at.toISOString(),
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!

  const body = await req.json()
  const { name, date, start_time, end_time, venue_name, venue_address, description, dress_code, map_url, display_group, sort_order } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 })
  const parsedDate = new Date(`${date}T12:00:00`)
  if (isNaN(parsedDate.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  if (!Object.values(DisplayGroup).includes(display_group)) return NextResponse.json({ error: 'Invalid display_group' }, { status: 400 })

  const event = await prisma.event.create({
    data: {
      name: name.trim(),
      date: parsedDate,
      start_time: start_time?.trim() || null,
      end_time: end_time?.trim() || null,
      venue_name: venue_name?.trim() || null,
      venue_address: venue_address?.trim() || null,
      description: description?.trim() || null,
      dress_code: dress_code?.trim() || null,
      map_url: map_url?.trim() || null,
      display_group: display_group as DisplayGroup,
      sort_order: sort_order !== undefined ? Number(sort_order) : 0,
      managed_by: display_group === 'joint' ? side : display_group as 'bride' | 'groom',
    },
  })

  return NextResponse.json(
    {
      event: {
        ...event,
        date: event.date.toISOString(),
        created_at: event.created_at.toISOString(),
        updated_at: event.updated_at.toISOString(),
      },
    },
    { status: 201 }
  )
}
