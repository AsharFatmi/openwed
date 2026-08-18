import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
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
  const { name, email } = body ?? {}

  const user = await prisma.adminUser.findUnique({ where: { id } })
  if (!user || user.role !== 'side_admin') {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
  }

  if (email && email !== user.email) {
    const conflict = await prisma.adminUser.findUnique({ where: { email } })
    if (conflict) {
      return NextResponse.json(
        { error: 'An account with that email already exists.' },
        { status: 409 }
      )
    }
  }

  const updated = await prisma.adminUser.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
    },
    select: { id: true, name: true, email: true, side: true, active: true, created_at: true },
  })

  return NextResponse.json({ account: updated })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'super_admin') return forbidden()

  const { id } = await context.params

  const user = await prisma.adminUser.findUnique({ where: { id } })
  if (!user || user.role !== 'side_admin') {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
  }

  await prisma.adminUser.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'super_admin') return forbidden()

  const { id } = await context.params

  const user = await prisma.adminUser.findUnique({ where: { id } })
  if (!user || user.role !== 'side_admin') {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
  }

  const updated = await prisma.adminUser.update({
    where: { id },
    data: { active: !user.active },
    select: { id: true, active: true },
  })

  return NextResponse.json({ active: updated.active })
}
