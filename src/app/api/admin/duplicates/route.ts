import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  findCandidates,
  type DuplicateDetail,
  type PersonRecord,
  type RecordDetail,
  type Ref,
} from '@/lib/duplicate-match'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

const keyOf = (r: Ref): string => `${r.type}:${r.id}`

function canonicalPairKey(a: Ref, b: Ref): string {
  const ka = keyOf(a)
  const kb = keyOf(b)
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const side = session.user.side!

  const [guests, familyMembers, dismissed] = await Promise.all([
    prisma.guest.findMany({
      where: { side },
      select: {
        id: true,
        name: true,
        household_group: true,
        email: true,
        phone: true,
        address: true,
        rsvpResponses: {
          select: { event_id: true, attending: true, dietary_restrictions: true },
        },
        eventInvitations: { select: { event_id: true } },
        roomAssignments: { select: { id: true, room_id: true } },
        familyMembers: { select: { id: true, name: true, is_child: true } },
      },
    }),
    prisma.familyMember.findMany({
      where: { guest: { side } },
      select: {
        id: true,
        name: true,
        is_child: true,
        guest: { select: { id: true, household_group: true, name: true } },
        rsvps: {
          select: { event_id: true, attending: true, dietary_restrictions: true },
        },
        roomAssignments: { select: { id: true, room_id: true } },
      },
    }),
    prisma.duplicateDismissal.findMany({
      where: { side },
      select: { a_key: true, b_key: true },
    }),
  ])

  const people: PersonRecord[] = []

  for (const g of guests) {
    people.push({
      ref: { type: 'guest', id: g.id },
      name: g.name,
      householdGroup: g.household_group,
      email: g.email,
      phone: g.phone,
      address: g.address,
      isChild: false,
    })
  }

  for (const fm of familyMembers) {
    people.push({
      ref: { type: 'family_member', id: fm.id },
      name: fm.name,
      parentGuestId: fm.guest.id,
      householdGroup: fm.guest.household_group,
      isChild: fm.is_child,
    })
  }

  // Stored a_key/b_key are full canonical keys in "type:id" form. Reconstruct Refs
  // and re-sort defensively (brief: storage is canonical, but sort to be safe).
  const dismissedSet = new Set(
    dismissed.map((d) => {
      const [aType, aId] = d.a_key.split(':')
      const [bType, bId] = d.b_key.split(':')
      return canonicalPairKey(
        { type: aType as 'guest' | 'family_member', id: aId },
        { type: bType as 'guest' | 'family_member', id: bId },
      )
    }),
  )

  const candidates = findCandidates(people, 0.8)

  const surviving = candidates.filter(
    (c) => !dismissedSet.has(canonicalPairKey(c.a.ref, c.b.ref)),
  )

  const guestById = new Map(guests.map((g) => [g.id, g]))
  const fmById = new Map(familyMembers.map((fm) => [fm.id, fm]))

  function buildDetail(
    ref: Ref,
    name: string,
    householdGroup: string | null,
    email: string | null,
    phone: string | null,
    address: string | null,
    isChild: boolean,
    parentGuestName: string | null,
    rsvps: { event_id: string; attending: boolean | null; dietary_restrictions: string | null }[],
    invitedEventIds: string[],
    roomId: string | null,
    linkState: 'valid' | 'dead',
  ): RecordDetail {
    return {
      ref,
      name,
      type: ref.type,
      parentGuestName,
      householdGroup,
      email,
      phone,
      address,
      isChild,
      rsvps: rsvps.map((r) => ({
        event_id: r.event_id,
        attending: r.attending,
        dietary: r.dietary_restrictions,
      })),
      invitedEventIds,
      roomId,
      linkState,
    }
  }

  const duplicates: DuplicateDetail[] = surviving.map((c) => {
    const aRef = c.a.ref
    const bRef = c.b.ref

    let aDetail: RecordDetail
    let bDetail: RecordDetail

    if (aRef.type === 'guest') {
      const g = guestById.get(aRef.id)
      if (!g) throw new Error(`Guest ${aRef.id} not found`)
      aDetail = buildDetail(
        aRef,
        g.name,
        g.household_group,
        g.email,
        g.phone,
        g.address,
        false,
        null,
        g.rsvpResponses,
        g.eventInvitations.map((e) => e.event_id),
        g.roomAssignments.length > 0 ? g.roomAssignments[0].room_id : null,
        'valid',
      )
    } else {
      const fm = fmById.get(aRef.id)
      if (!fm) throw new Error(`FamilyMember ${aRef.id} not found`)
      aDetail = buildDetail(
        aRef,
        fm.name,
        fm.guest.household_group,
        null,
        null,
        null,
        fm.is_child,
        fm.guest.name,
        fm.rsvps,
        [],
        fm.roomAssignments.length > 0 ? fm.roomAssignments[0].room_id : null,
        'dead',
      )
    }

    if (bRef.type === 'guest') {
      const g = guestById.get(bRef.id)
      if (!g) throw new Error(`Guest ${bRef.id} not found`)
      bDetail = buildDetail(
        bRef,
        g.name,
        g.household_group,
        g.email,
        g.phone,
        g.address,
        false,
        null,
        g.rsvpResponses,
        g.eventInvitations.map((e) => e.event_id),
        g.roomAssignments.length > 0 ? g.roomAssignments[0].room_id : null,
        'valid',
      )
    } else {
      const fm = fmById.get(bRef.id)
      if (!fm) throw new Error(`FamilyMember ${bRef.id} not found`)
      bDetail = buildDetail(
        bRef,
        fm.name,
        fm.guest.household_group,
        null,
        null,
        null,
        fm.is_child,
        fm.guest.name,
        fm.rsvps,
        [],
        fm.roomAssignments.length > 0 ? fm.roomAssignments[0].room_id : null,
        'dead',
      )
    }

    return { a: aDetail, b: bDetail, confidence: c.confidence }
  })

  return NextResponse.json({ duplicates })
}