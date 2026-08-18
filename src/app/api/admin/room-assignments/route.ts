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

const parseDate = (val: unknown): Date | null => {
  if (!val) return null
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? null : d
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!

  const assignments = await prisma.roomAssignment.findMany({
    where: { guest: { side } },
    include: {
      room: { include: { hotel: { select: { id: true, name: true } } } },
      guest: {
        select: {
          id: true,
          name: true,
          household_group: true,
          familyMembers: { select: { id: true } },
        },
      },
      familyMember: { select: { id: true, name: true, is_child: true } },
    },
    orderBy: { assigned_at: 'desc' },
  })

  return NextResponse.json({
    assignments: assignments.map((a) => ({
      ...a,
      check_in: a.check_in?.toISOString() ?? null,
      check_out: a.check_out?.toISOString() ?? null,
      assigned_at: a.assigned_at.toISOString(),
    })),
  })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!
  const body = await request.json().catch(() => null)

  const { room_id, guest_id, family_member_id, check_in, check_out, notes } = body ?? {}
  if (!room_id || !guest_id) {
    return NextResponse.json({ error: 'room_id and guest_id are required.' }, { status: 400 })
  }
  const familyMemberId = family_member_id || null

  // Verify guest belongs to this side
  const guest = await prisma.guest.findUnique({
    where: { id: guest_id },
    select: { side: true, household_group: true, familyMembers: { select: { id: true } } },
  })
  if (!guest || guest.side !== side) {
    return NextResponse.json({ error: 'Guest not found.' }, { status: 404 })
  }

  // If a family member is specified, verify they belong to this guest (which
  // also guarantees they're on this side, since the guest was just checked).
  if (familyMemberId) {
    const familyMember = await prisma.familyMember.findUnique({
      where: { id: familyMemberId },
      select: { guest_id: true },
    })
    if (!familyMember || familyMember.guest_id !== guest_id) {
      return NextResponse.json({ error: 'Family member not found for this guest.' }, { status: 404 })
    }
  }

  // Verify room belongs to a hotel on this side
  const room = await prisma.room.findUnique({
    where: { id: room_id },
    include: { hotel: { select: { side: true } } },
  })
  if (!room || room.hotel.side !== side) {
    return NextResponse.json({ error: 'Room not found.' }, { status: 404 })
  }

  // Enforce one room per person. A person is identified by (guest_id,
  // family_member_id), where family_member_id is null for a primary guest.
  // Prisma treats a null filter as IS NULL, so primary-guest and family-member
  // rows for the same guest do not collide.
  const existing = await prisma.roomAssignment.findFirst({
    where: { guest_id, family_member_id: familyMemberId },
  })
  if (existing) {
    return NextResponse.json(
      { error: familyMemberId ? 'Family member is already assigned to a room.' : 'Guest is already assigned to a room.' },
      { status: 409 }
    )
  }

  const assignment = await prisma.roomAssignment.create({
    data: {
      room_id,
      guest_id,
      family_member_id: familyMemberId,
      check_in: parseDate(check_in),
      check_out: parseDate(check_out),
      notes: notes?.trim() || null,
    },
    include: {
      guest: {
        select: {
          id: true,
          name: true,
          household_group: true,
          familyMembers: { select: { id: true } },
        },
      },
      familyMember: { select: { id: true, name: true, is_child: true } },
    },
  })

  return NextResponse.json(
    {
      assignment: {
        ...assignment,
        check_in: assignment.check_in?.toISOString() ?? null,
        check_out: assignment.check_out?.toISOString() ?? null,
        assigned_at: assignment.assigned_at.toISOString(),
      },
    },
    { status: 201 }
  )
}
