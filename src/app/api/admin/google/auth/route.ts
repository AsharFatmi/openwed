import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const clientId = process.env.GOOGLE_CLIENT_ID
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const redirectUri = `${baseUrl}/api/admin/google/callback`

  if (!clientId) return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 503 })

  const state = crypto.randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/contacts.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  const cookieStore = await cookies()
  cookieStore.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}
