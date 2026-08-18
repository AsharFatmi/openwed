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

const guestIncludes = {
  familyMembers: { select: { id: true } },
  rsvpResponses: { select: { attending: true, dietary_restrictions: true } },
  eventInvitations: { select: { event_id: true } },
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const { id } = await context.params
  const body = await request.json()
  const { name, email, phone, address, household_group, notes, invitation_sent, invitedEventIds } = body ?? {}

  const existing = await prisma.guest.findUnique({ where: { id } })
  if (!existing || existing.side !== session.user.side) {
    return NextResponse.json({ error: 'Guest not found.' }, { status: 404 })
  }

  if (name !== undefined && (!name || !name.trim())) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  }

  const guest = await prisma.$transaction(async (tx) => {
    const g = await tx.guest.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(email !== undefined ? { email: email?.trim() || null } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(address !== undefined ? { address: address?.trim() || null } : {}),
        ...(household_group !== undefined ? { household_group: household_group?.trim() || null } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        ...(invitation_sent !== undefined ? { invitation_sent: Boolean(invitation_sent) } : {}),
      },
    })
    if (Array.isArray(invitedEventIds)) {
      // Only allow events owned by this admin's side
      let safeEventIds: string[] = []
      if ((invitedEventIds as string[]).length > 0) {
        const ownedEvents = await tx.event.findMany({
          where: {
            id: { in: invitedEventIds as string[] },
            OR: [{ managed_by: existing.side }, { display_group: 'joint' }],
          },
          select: { id: true },
        })
        safeEventIds = ownedEvents.map((e) => e.id)
      }
      await tx.guestEventInvitation.deleteMany({ where: { guest_id: id } })
      if (safeEventIds.length > 0) {
        await tx.guestEventInvitation.createMany({
          data: safeEventIds.map((event_id) => ({ guest_id: id, event_id })),
          skipDuplicates: true,
        })
      }
    }
    return tx.guest.findUnique({ where: { id: g.id }, include: guestIncludes })
  })

  return NextResponse.json({ guest })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const { id } = await context.params

  const existing = await prisma.guest.findUnique({ where: { id } })
  if (!existing || existing.side !== session.user.side) {
    return NextResponse.json({ error: 'Guest not found.' }, { status: 404 })
  }

  await prisma.guest.delete({ where: { id } })

  return NextResponse.json({ deleted: true })
}
