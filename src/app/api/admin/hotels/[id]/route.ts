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

type Context = { params: Promise<{ id: string }> }

async function getOwnedHotel(id: string, side: string) {
  const hotel = await prisma.hotel.findUnique({ where: { id } })
  if (!hotel || hotel.side !== side) return null
  return hotel
}

const parseDate = (val: unknown): Date | null => {
  if (val === null || val === undefined || val === '') return null
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? null : d
}

export async function PUT(request: Request, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!
  const { id } = await context.params

  const hotel = await getOwnedHotel(id, side)
  if (!hotel) return NextResponse.json({ error: 'Hotel not found.' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

  const updated = await prisma.hotel.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.address !== undefined && { address: body.address?.trim() || null }),
      ...(body.city !== undefined && { city: body.city?.trim() || null }),
      ...(body.map_url !== undefined && { map_url: body.map_url?.trim() || null }),
      ...(body.check_in_date !== undefined && { check_in_date: parseDate(body.check_in_date) }),
      ...(body.check_out_date !== undefined && { check_out_date: parseDate(body.check_out_date) }),
      ...(body.contact_phone !== undefined && { contact_phone: body.contact_phone?.trim() || null }),
      ...(body.total_rooms !== undefined && { total_rooms: Number(body.total_rooms) }),
      ...(body.distance_info !== undefined && { distance_info: body.distance_info?.trim() || null }),
      ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
      ...(body.image_url !== undefined && { image_url: body.image_url?.trim() || null }),
      ...(body.image_alt !== undefined && { image_alt: body.image_alt?.trim() || null }),
    },
  })

  return NextResponse.json({
    hotel: {
      ...updated,
      check_in_date: updated.check_in_date?.toISOString() ?? null,
      check_out_date: updated.check_out_date?.toISOString() ?? null,
      created_at: updated.created_at.toISOString(),
      updated_at: updated.updated_at.toISOString(),
    },
  })
}

export async function DELETE(_request: Request, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!
  const { id } = await context.params

  const hotel = await getOwnedHotel(id, side)
  if (!hotel) return NextResponse.json({ error: 'Hotel not found.' }, { status: 404 })

  await prisma.hotel.delete({ where: { id } })

  return NextResponse.json({ deleted: true })
}
