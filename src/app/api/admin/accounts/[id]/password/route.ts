import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'super_admin') return forbidden()

  const { id } = await context.params
  const body = await request.json()
  const { password } = body ?? {}

  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400 }
    )
  }

  const user = await prisma.adminUser.findUnique({ where: { id } })
  if (!user || user.role !== 'side_admin') {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.adminUser.update({
    where: { id },
    data: { password_hash: passwordHash },
  })

  return NextResponse.json({ message: 'Password updated.' })
}
