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

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const { id } = await context.params

  const guest = await prisma.guest.findUnique({
    where: { id },
    select: { id: true, side: true },
  })
  if (!guest) {
    return NextResponse.json({ error: 'Guest not found.' }, { status: 404 })
  }
  if (guest.side !== session.user.side) return forbidden()

  const body = await request.json().catch(() => null)
  if (!body || typeof body.eventId !== 'string' || typeof body.invited !== 'boolean') {
    return NextResponse.json({ error: 'Body must be { eventId: string; invited: boolean }.' }, { status: 400 })
  }
  const { eventId, invited } = body as { eventId: string; invited: boolean }

  // Verify the event belongs to this admin's side
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      OR: [{ managed_by: session.user.side! }, { display_group: 'joint' }],
    },
    select: { id: true },
  })
  if (!event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  }

  if (invited) {
    await prisma.guestEventInvitation.upsert({
      where: { guest_id_event_id: { guest_id: id, event_id: eventId } },
      create: { guest_id: id, event_id: eventId },
      update: {},
    })
  } else {
    await prisma.guestEventInvitation.deleteMany({
      where: { guest_id: id, event_id: eventId },
    })
  }

  return NextResponse.json({ ok: true })
}
