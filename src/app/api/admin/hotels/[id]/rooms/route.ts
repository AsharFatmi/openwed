import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { type RoomType } from '@prisma/client'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

type Context = { params: Promise<{ id: string }> }

const VALID_ROOM_TYPES: RoomType[] = ['single', 'double', 'suite']

function serializeRoom(room: {
  id: string
  hotel_id: string
  room_number: string
  room_type: RoomType
  capacity: number
  floor: string | null
  notes: string | null
  assignments: {
    id: string
    room_id: string
    guest_id: string
    check_in: Date | null
    check_out: Date | null
    notes: string | null
    assigned_at: Date
    guest: { id: string; name: string; household_group: string | null }
  }[]
}) {
  return {
    ...room,
    assignments: room.assignments.map((a) => ({
      ...a,
      check_in: a.check_in?.toISOString() ?? null,
      check_out: a.check_out?.toISOString() ?? null,
      assigned_at: a.assigned_at.toISOString(),
    })),
  }
}

export async function GET(request: Request, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!
  const { id: hotelId } = await context.params

  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { side: true } })
  if (!hotel || hotel.side !== side) {
    return NextResponse.json({ error: 'Hotel not found.' }, { status: 404 })
  }

  const rooms = await prisma.room.findMany({
    where: { hotel_id: hotelId },
    include: {
      assignments: {
        include: { guest: { select: { id: true, name: true, household_group: true } } },
      },
    },
    orderBy: { room_number: 'asc' },
  })

  return NextResponse.json({ rooms: rooms.map(serializeRoom) })
}

export async function POST(request: Request, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!
  const { id: hotelId } = await context.params

  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { side: true } })
  if (!hotel || hotel.side !== side) {
    return NextResponse.json({ error: 'Hotel not found.' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

  // Bulk create
  if (Array.isArray(body.rooms)) {
    const items = body.rooms as { room_number: string; room_type: string; capacity?: number; floor?: string; notes?: string }[]
    for (const item of items) {
      if (!item.room_number?.trim()) {
        return NextResponse.json({ error: 'Each room must have a room_number.' }, { status: 400 })
      }
      if (!VALID_ROOM_TYPES.includes(item.room_type as RoomType)) {
        return NextResponse.json({ error: `Invalid room_type: ${item.room_type}` }, { status: 400 })
      }
    }

    await prisma.room.createMany({
      data: items.map((r) => ({
        hotel_id: hotelId,
        room_number: r.room_number.trim(),
        room_type: r.room_type as RoomType,
        capacity: r.capacity ?? 2,
        floor: r.floor?.trim() || null,
        notes: r.notes?.trim() || null,
      })),
    })

    // Fetch created rooms to return them
    const created = await prisma.room.findMany({
      where: { hotel_id: hotelId },
      include: { assignments: { include: { guest: { select: { id: true, name: true, household_group: true } } } } },
      orderBy: { room_number: 'asc' },
    })

    return NextResponse.json({ rooms: created.map(serializeRoom), count: items.length }, { status: 201 })
  }

  // Single create
  if (!body.room_number?.trim()) {
    return NextResponse.json({ error: 'room_number is required.' }, { status: 400 })
  }
  if (!VALID_ROOM_TYPES.includes(body.room_type as RoomType)) {
    return NextResponse.json({ error: `Invalid room_type: ${body.room_type}` }, { status: 400 })
  }

  const room = await prisma.room.create({
    data: {
      hotel_id: hotelId,
      room_number: body.room_number.trim(),
      room_type: body.room_type as RoomType,
      capacity: body.capacity ?? 2,
      floor: body.floor?.trim() || null,
      notes: body.notes?.trim() || null,
    },
    include: {
      assignments: { include: { guest: { select: { id: true, name: true, household_group: true } } } },
    },
  })

  return NextResponse.json({ room: serializeRoom(room) }, { status: 201 })
}
