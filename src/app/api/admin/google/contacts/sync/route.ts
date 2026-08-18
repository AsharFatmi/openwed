import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { syncGoogleContacts } from '@/lib/google-contacts'
import { type Side } from '@prisma/client'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const count = await syncGoogleContacts(session.user.id, session.user.side as Side)
    return NextResponse.json({ ok: true, count })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    console.error('[google-contacts/sync] error:', message, err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
