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

type Context = { params: Promise<{ id: string }> }

const parseDate = (val: unknown): Date | null => {
  if (val === null || val === undefined || val === '') return null
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? null : d
}

export async function PUT(request: Request, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!
  const { id } = await context.params

  const assignment = await prisma.roomAssignment.findUnique({
    where: { id },
    include: { guest: { select: { side: true } } },
  })
  if (!assignment || assignment.guest.side !== side) {
    return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

  const updated = await prisma.roomAssignment.update({
    where: { id },
    data: {
      ...(body.check_in !== undefined && { check_in: parseDate(body.check_in) }),
      ...(body.check_out !== undefined && { check_out: parseDate(body.check_out) }),
      ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
    },
    include: {
      guest: { select: { id: true, name: true, household_group: true, familyMembers: { select: { id: true } } } },
      familyMember: { select: { id: true, name: true, is_child: true } },
    },
  })

  return NextResponse.json({
    assignment: {
      ...updated,
      check_in: updated.check_in?.toISOString() ?? null,
      check_out: updated.check_out?.toISOString() ?? null,
      assigned_at: updated.assigned_at.toISOString(),
    },
  })
}

export async function DELETE(_request: Request, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!
  const { id } = await context.params

  const assignment = await prisma.roomAssignment.findUnique({
    where: { id },
    include: { guest: { select: { side: true } } },
  })
  if (!assignment || assignment.guest.side !== side) {
    return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 })
  }

  await prisma.roomAssignment.delete({ where: { id } })

  return NextResponse.json({ deleted: true })
}
