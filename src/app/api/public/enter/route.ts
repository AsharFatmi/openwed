import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const password = body?.password as string | undefined

  const row = await prisma.siteSettings.findUnique({ where: { key: 'site_password' } })
  const sitePassword = row?.value ?? ''

  if (!sitePassword) {
    // No gate set — always allow
    return NextResponse.json({ ok: true })
  }

  if (!password || password !== sitePassword) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('site_auth', sitePassword, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return res
}
