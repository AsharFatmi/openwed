import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')?.trim()
  const raw = searchParams.get('return') ?? '/'
  // Only allow same-origin relative paths — block open redirect
  const returnTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'

  // Only set the cookie if the token resolves to a real guest
  if (token) {
    const guest = await prisma.guest.findUnique({
      where: { rsvp_token: token },
      select: { id: true },
    })
    if (guest) {
      const response = NextResponse.redirect(new URL(returnTo, request.url))
      response.cookies.set('rsvp_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1 year
      })
      return response
    }
  }

  // Token missing or invalid — redirect without setting cookie
  return NextResponse.redirect(new URL(returnTo, request.url))
}
