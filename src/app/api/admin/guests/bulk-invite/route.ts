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

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const body = await request.json()
  const { guestIds, eventIds, mode } = body ?? {}

  if (!Array.isArray(guestIds) || guestIds.length === 0) {
    return NextResponse.json({ error: 'guestIds must be a non-empty array.' }, { status: 400 })
  }
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return NextResponse.json({ error: 'eventIds must be a non-empty array.' }, { status: 400 })
  }
  if (mode !== 'add' && mode !== 'remove') {
    return NextResponse.json({ error: 'mode must be "add" or "remove".' }, { status: 400 })
  }

  // Verify all guestIds belong to this admin's side
  const owned = await prisma.guest.findMany({
    where: { id: { in: guestIds as string[] }, side: session.user.side! },
    select: { id: true },
  })
  if (owned.length !== (guestIds as string[]).length) {
    return forbidden()
  }

  if (mode === 'add') {
    await prisma.guestEventInvitation.createMany({
      data: (guestIds as string[]).flatMap((guest_id) =>
        (eventIds as string[]).map((event_id) => ({ guest_id, event_id }))
      ),
      skipDuplicates: true,
    })
  } else {
    await prisma.guestEventInvitation.deleteMany({
      where: {
        guest_id: { in: guestIds as string[] },
        event_id: { in: eventIds as string[] },
      },
    })
  }

  return NextResponse.json({ updated: (guestIds as string[]).length })
}
