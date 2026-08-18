// src/app/api/admin/rsvps/preview/route.ts
// Returns existing RSVP attending values for the cross-product of given
// guests and events, used to pre-fill the Manual RSVP grid modal.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Side } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Guard explicitly rather than `as Side`: session.user.side is `Side | null`
  // at the type layer; a null side_admin (data corruption) must be rejected,
  // not silently cast.
  if (!session.user.side) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const adminSide: Side = session.user.side
  const url = new URL(request.url)
  const guestIdsParam = url.searchParams.get('guestIds') ?? ''
  const eventIdsParam = url.searchParams.get('eventIds') ?? ''

  const guestIds = guestIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
  const eventIds = eventIdsParam.split(',').map((s) => s.trim()).filter(Boolean)

  if (guestIds.length === 0 || eventIds.length === 0) {
    return Response.json({
      guests: [],
      events: [],
      cells: {},
    })
  }

  // Side-gate: only fetch guests/events the admin is allowed to see.
  // Responses are queried against the side-filtered ID sets (NOT the raw URL
  // params) so a caller cannot read another side's RSVP attendance by passing
  // a cross-side guestId/eventId in the query string.
  const [guests, events] = await Promise.all([
    prisma.guest.findMany({
      where: { id: { in: guestIds }, side: adminSide },
      select: { id: true, name: true, household_group: true },
      orderBy: { name: 'asc' },
    }),
    prisma.event.findMany({
      where: {
        id: { in: eventIds },
        OR: [{ managed_by: adminSide }, { display_group: 'joint' }],
      },
      select: { id: true, name: true, date: true },
      orderBy: { sort_order: 'asc' },
    }),
  ])

  const allowedGuestIds = guests.map((g) => g.id)
  const allowedEventIds = events.map((e) => e.id)

  const responses = await prisma.rsvpResponse.findMany({
    where: {
      guest_id: { in: allowedGuestIds },
      event_id: { in: allowedEventIds },
    },
    select: { guest_id: true, event_id: true, attending: true },
  })

  // Build the nested cells map, scoped to the side-filtered guests/events.
  const cells: Record<string, Record<string, boolean | null>> = {}
  for (const g of guests) cells[g.id] = {}
  for (const r of responses) {
    // Defense in depth: the query above already scopes responses to the
    // side-filtered IDs, but never create a cells entry for a guest that
    // was filtered out (cells[g.id] is only initialised for allowed guests).
    if (!cells[r.guest_id]) continue
    cells[r.guest_id][r.event_id] = r.attending
  }
  // Fill missing event slots with null
  for (const g of guests) {
    for (const e of events) {
      if (!(e.id in cells[g.id])) cells[g.id][e.id] = null
    }
  }

  return Response.json({
    guests,
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date.toISOString().split('T')[0],
    })),
    cells,
  })
}