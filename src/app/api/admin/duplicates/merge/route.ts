import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { performMerge, type MergePayload } from '@/lib/duplicate-merge'
import type { Ref } from '@/lib/duplicate-match'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

function isRef(value: unknown): value is Ref {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    (v.type === 'guest' || v.type === 'family_member') &&
    typeof v.id === 'string' &&
    v.id.trim().length > 0
  )
}

const keyOf = (r: Ref): string => `${r.type}:${r.id}`

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!

  // 1. Parse JSON body.
  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  // 2. Destructure payload fields.
  const {
    pair,
    keep,
    joinHousehold,
    fields,
    rsvps,
    roomChoice,
    invitedEventIds,
  } = body ?? {}

  // 3. Validate pair.a / pair.b.
  if (!pair || !isRef(pair.a) || !isRef(pair.b)) {
    return NextResponse.json(
      { error: 'Body must include `pair.a` and `pair.b` refs with valid `type` and non-empty `id`.' },
      { status: 400 },
    )
  }
  if (keyOf(pair.a) === keyOf(pair.b)) {
    return NextResponse.json(
      { error: '`pair.a` and `pair.b` must refer to different records.' },
      { status: 400 },
    )
  }

  // 4. keep in ['a','b'].
  if (keep !== 'a' && keep !== 'b') {
    return NextResponse.json(
      { error: '`keep` must be either "a" or "b".' },
      { status: 400 },
    )
  }

  // 5. fields.name non-empty after trim.
  if (!fields || typeof fields.name !== 'string' || fields.name.trim().length === 0) {
    return NextResponse.json(
      { error: '`fields.name` is required and must be a non-empty string.' },
      { status: 400 },
    )
  }

  // 6. roomChoice in ['a','b','none'].
  if (roomChoice !== 'a' && roomChoice !== 'b' && roomChoice !== 'none') {
    return NextResponse.json(
      { error: '`roomChoice` must be one of "a", "b", or "none".' },
      { status: 400 },
    )
  }

  // 7. rsvps and invitedEventIds are arrays.
  if (!Array.isArray(rsvps)) {
    return NextResponse.json(
      { error: '`rsvps` must be an array.' },
      { status: 400 },
    )
  }
  if (!Array.isArray(invitedEventIds)) {
    return NextResponse.json(
      { error: '`invitedEventIds` must be an array.' },
      { status: 400 },
    )
  }

  // Event ownership: filter invitedEventIds to those the side owns (managed_by
  // = side OR display_group = 'joint'). Mirrors
  // src/app/api/admin/guests/[id]/route.ts:57-65.
  let safeEventIds: string[] = []
  if (invitedEventIds.length > 0) {
    const ownedEvents = await prisma.event.findMany({
      where: {
        id: { in: invitedEventIds as string[] },
        OR: [{ managed_by: side }, { display_group: 'joint' }],
      },
      select: { id: true },
    })
    safeEventIds = ownedEvents.map((e) => e.id)
  }

  // Build the MergePayload with normalized fields.
  const payload: MergePayload = {
    pair: { a: pair.a, b: pair.b },
    keep,
    ...(typeof joinHousehold === 'boolean' ? { joinHousehold } : {}),
    fields: {
      name: fields.name.trim(),
      email: typeof fields.email === 'string' && fields.email.trim() ? fields.email.trim() : null,
      phone: typeof fields.phone === 'string' && fields.phone.trim() ? fields.phone.trim() : null,
      address: typeof fields.address === 'string' && fields.address.trim() ? fields.address.trim() : null,
    },
    rsvps: rsvps as MergePayload['rsvps'],
    roomChoice,
    invitedEventIds: safeEventIds,
  }

  try {
    const result = await prisma.$transaction((tx) => performMerge(tx, side, payload))
    return NextResponse.json({ merged: true, ...result })
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'Record not found') {
      return NextResponse.json({ error: 'Record not found.' }, { status: 404 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}