// src/app/api/admin/rsvps/batch/route.ts
// Bulk RSVP entry. Accepts a flat list of (guestId, eventId, attending)
// pairs and applies them in one Prisma transaction. The single-row
// POST /api/admin/rsvps handler is intentionally untouched — Chotu and
// other callers keep using it.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  validateBatchPayload,
  applyBatch,
  type AdminSide,
} from '@/lib/rsvp-batch'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'side_admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Guard explicitly rather than `as AdminSide`: session.user.side is
  // `Side | null` at the type layer, and a null side_admin (data corruption)
  // must be rejected with 403 — not silently cast and used to filter guests.
  if (!session.user.side) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const adminSide: AdminSide = session.user.side
  const body = await request.json().catch(() => null)

  // Pre-flight: fetch only what's needed for validation (no full guests/rooms/etc.)
  const [allGuests, allEvents] = await Promise.all([
    prisma.guest.findMany({ where: { side: adminSide }, select: { id: true, side: true } }),
    prisma.event.findMany({
      where: { OR: [{ managed_by: adminSide }, { display_group: 'joint' }] },
      select: { id: true, managed_by: true, display_group: true },
    }),
  ])

  const validation = validateBatchPayload(body, adminSide, allGuests, allEvents)
  if (!validation.ok) {
    return Response.json({ error: validation.error.code, ...validation.error }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      return applyBatch(tx as unknown as Parameters<typeof applyBatch>[0], { rows: validation.rows })
    })
    return Response.json({ ok: true, ...result })
  } catch (err) {
    console.error('[rsvps/batch] transaction failed', err)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
