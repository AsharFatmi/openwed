import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

  const hotels = await prisma.hotel.findMany({
    where: { side },
    include: { _count: { select: { rooms: true } } },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({
    hotels: hotels.map((h) => ({
      ...h,
      check_in_date: h.check_in_date?.toISOString() ?? null,
      check_out_date: h.check_out_date?.toISOString() ?? null,
      created_at: h.created_at.toISOString(),
      updated_at: h.updated_at.toISOString(),
      _roomCount: h._count.rooms,
    })),
  })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!
  const body = await request.json().catch(() => null)

  if (!body?.name?.trim()) {
    return NextResponse.json({ error: 'Hotel name is required.' }, { status: 400 })
  }

  const parseDate = (val: unknown): Date | null => {
    if (!val) return null
    const d = new Date(val as string)
    return isNaN(d.getTime()) ? null : d
  }

  const hotel = await prisma.hotel.create({
    data: {
      name: body.name.trim(),
      address: body.address?.trim() || null,
      city: body.city?.trim() || null,
      map_url: body.map_url?.trim() || null,
      check_in_date: parseDate(body.check_in_date),
      check_out_date: parseDate(body.check_out_date),
      contact_phone: body.contact_phone?.trim() || null,
      distance_info: body.distance_info?.trim() || null,
      total_rooms: body.total_rooms ? Number(body.total_rooms) : 0,
      notes: body.notes?.trim() || null,
      side,
    },
  })

  return NextResponse.json(
    {
      hotel: {
        ...hotel,
        check_in_date: hotel.check_in_date?.toISOString() ?? null,
        check_out_date: hotel.check_out_date?.toISOString() ?? null,
        created_at: hotel.created_at.toISOString(),
        updated_at: hotel.updated_at.toISOString(),
        _roomCount: 0,
      },
    },
    { status: 201 }
  )
}
