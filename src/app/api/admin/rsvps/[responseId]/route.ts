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
  context: { params: Promise<{ responseId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const { responseId } = await context.params
  const side = session.user.side!

  const existing = await prisma.rsvpResponse.findUnique({
    where: { id: responseId },
    include: { guest: { select: { side: true } } },
  })

  if (!existing || existing.guest.side !== side) {
    return NextResponse.json({ error: 'Response not found.' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  const { attending, dietary_restrictions } = body ?? {}

  if (typeof attending !== 'boolean') {
    return NextResponse.json({ error: 'attending (boolean) is required.' }, { status: 400 })
  }

  const rsvp = await prisma.rsvpResponse.update({
    where: { id: responseId },
    data: { attending, dietary_restrictions: dietary_restrictions ?? null },
  })

  return NextResponse.json({ rsvp })
}
