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

export async function PUT(request: Request, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!
  const { id } = await context.params

  const room = await prisma.room.findUnique({
    where: { id },
    include: { hotel: { select: { side: true } } },
  })
  if (!room || room.hotel.side !== side) {
    return NextResponse.json({ error: 'Room not found.' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

  if (body.room_type !== undefined && !VALID_ROOM_TYPES.includes(body.room_type as RoomType)) {
    return NextResponse.json({ error: `Invalid room_type: ${body.room_type}` }, { status: 400 })
  }

  const updated = await prisma.room.update({
    where: { id },
    data: {
      ...(body.room_number !== undefined && { room_number: body.room_number.trim() }),
      ...(body.room_type !== undefined && { room_type: body.room_type as RoomType }),
      ...(body.capacity !== undefined && { capacity: Number(body.capacity) }),
      ...(body.floor !== undefined && { floor: body.floor?.trim() || null }),
      ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
    },
    include: {
      assignments: { include: { guest: { select: { id: true, name: true, household_group: true } } } },
    },
  })

  return NextResponse.json({
    room: {
      ...updated,
      assignments: updated.assignments.map((a) => ({
        ...a,
        check_in: a.check_in?.toISOString() ?? null,
        check_out: a.check_out?.toISOString() ?? null,
        assigned_at: a.assigned_at.toISOString(),
      })),
    },
  })
}

export async function DELETE(_request: Request, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!
  const { id } = await context.params

  const room = await prisma.room.findUnique({
    where: { id },
    include: { hotel: { select: { side: true } } },
  })
  if (!room || room.hotel.side !== side) {
    return NextResponse.json({ error: 'Room not found.' }, { status: 404 })
  }

  await prisma.room.delete({ where: { id } })

  return NextResponse.json({ deleted: true })
}
