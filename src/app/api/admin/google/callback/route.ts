import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { exchangeCodeForTokens, syncGoogleContacts } from '@/lib/google-contacts'
import { type Side } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.redirect(new URL('/admin/login', request.url))
  if (session.user.role !== 'side_admin') {
    return NextResponse.redirect(new URL('/admin/guests?contacts=error', request.url))
  }

  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !state) {
    return NextResponse.redirect(new URL('/admin/guests?contacts=denied', request.url))
  }

  // Verify CSRF state
  const cookieStore = await cookies()
  const savedState = cookieStore.get('google_oauth_state')?.value
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(new URL('/admin/guests?contacts=error', request.url))
  }

  // Clear state cookie
  cookieStore.delete('google_oauth_state')

  try {
    const tokens = await exchangeCodeForTokens(code)

    await prisma.googleOAuthToken.upsert({
      where: { admin_user_id: session.user.id },
      update: {
        access_token: tokens.access_token,
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
        expires_at: new Date(Date.now() + tokens.expires_in * 1000),
      },
      create: {
        admin_user_id: session.user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? '',
        expires_at: new Date(Date.now() + tokens.expires_in * 1000),
      },
    })

    const count = await syncGoogleContacts(session.user.id, session.user.side as Side)

    return NextResponse.redirect(
      new URL(`/admin/guests?contacts=synced&count=${count}`, request.url)
    )
  } catch {
    return NextResponse.redirect(new URL('/admin/guests?contacts=error', request.url))
  }
}
