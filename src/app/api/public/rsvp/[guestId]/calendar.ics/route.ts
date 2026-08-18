import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildIcs } from '@/lib/ics'

export async function GET(
  _request: Request,
  context: { params: Promise<{ guestId: string }> }
) {
  const { guestId } = await context.params

  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: { id: true },
  })

  if (!guest) {
    return NextResponse.json({ error: 'Guest not found.' }, { status: 404 })
  }

  const responses = await prisma.rsvpResponse.findMany({
    where: { guest_id: guestId, attending: true },
    select: { event_id: true },
  })

  if (responses.length === 0) {
    return NextResponse.json({ error: 'No attending events found.' }, { status: 404 })
  }

  const events = await prisma.event.findMany({
    where: { id: { in: responses.map((r) => r.event_id) } },
    select: {
      id: true,
      name: true,
      date: true,
      start_time: true,
      end_time: true,
      venue_name: true,
      venue_address: true,
      description: true,
      dress_code: true,
    },
    orderBy: [{ sort_order: 'asc' }, { date: 'asc' }],
  })

  return new Response(buildIcs(events), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="events.ics"',
      'Cache-Control': 'no-store',
    },
  })
}
