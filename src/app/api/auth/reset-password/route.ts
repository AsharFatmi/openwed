import { NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  const body = await request.json()
  const { token, password } = body ?? {}

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400 }
    )
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const tokenRecord = await prisma.passwordResetToken.findUnique({
    where: { token_hash: tokenHash },
  })

  if (!tokenRecord) {
    return NextResponse.json(
      { error: 'Invalid or expired reset link.' },
      { status: 400 }
    )
  }

  if (tokenRecord.used) {
    return NextResponse.json(
      { error: 'This reset link has already been used.' },
      { status: 400 }
    )
  }

  if (tokenRecord.expires_at < new Date()) {
    return NextResponse.json(
      { error: 'This reset link has expired. Please request a new one.' },
      { status: 400 }
    )
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: tokenRecord.admin_user_id },
      data: { password_hash: passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { used: true },
    }),
  ])

  return NextResponse.json({ message: 'Password updated successfully.' })
}
