import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith('/admin')) return NextResponse.next()

  const publicPaths = ['/admin/login', '/admin/forgot-password', '/admin/reset-password']
  if (publicPaths.some((p) => pathname.startsWith(p))) return NextResponse.next()

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })

  if (!token) {
    const loginUrl = new URL('/admin/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const role = token.role as string
  if (role === 'super_admin' && !pathname.startsWith('/admin/accounts'))
    return NextResponse.redirect(new URL('/admin/accounts', request.url))
  if (role === 'side_admin' && pathname.startsWith('/admin/accounts'))
    return NextResponse.redirect(new URL('/admin', request.url))

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
