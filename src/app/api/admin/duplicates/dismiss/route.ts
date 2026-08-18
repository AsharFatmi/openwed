import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
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

  const body = await request.json().catch(() => null)
  if (!body || !isRef(body.a) || !isRef(body.b)) {
    return NextResponse.json(
      { error: 'Body must include `a` and `b` refs with valid `type` and non-empty `id`.' },
      { status: 400 },
    )
  }

  const [aKey, bKey] = [keyOf(body.a), keyOf(body.b)].sort()

  await prisma.duplicateDismissal.upsert({
    where: { side_a_key_b_key: { side: session.user.side!, a_key: aKey, b_key: bKey } },
    create: {
      side: session.user.side!,
      a_key: aKey,
      b_key: bKey,
      dismissed_by: session.user.id,
    },
    update: {},
  })

  return NextResponse.json({ dismissed: true })
}