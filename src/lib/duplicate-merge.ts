import type { Prisma, Side } from '@prisma/client'
import type { Ref } from './duplicate-match'

export type MergePayload = {
  pair: { a: Ref; b: Ref }
  keep: 'a' | 'b'
  joinHousehold?: boolean
  fields: { name: string; email: string | null; phone: string | null; address: string | null }
  rsvps: { event_id: string; attending: boolean; dietary: string | null }[]
  roomChoice: 'a' | 'b' | 'none'
  invitedEventIds: string[]
}

export async function performMerge(
  tx: Prisma.TransactionClient,
  side: Side,
  payload: MergePayload,
): Promise<{ kept: Ref; deleted: Ref }> {
  const { pair, keep, fields, rsvps, roomChoice: payloadRoomChoice, invitedEventIds } = payload
  const winner: Ref = keep === 'a' ? pair.a : pair.b
  const loser: Ref = keep === 'a' ? pair.b : pair.a
  // The UI sends roomChoice record-centric ('a' = pair.a's room, 'b' = pair.b's,
  // 'none' = no room). The helpers below are winner-centric ('a' = keep winner's
  // room, 'b' = keep loser's room re-pointed to winner). Remap so that picking
  // the WINNER's record keeps the winner's room, and picking the LOSER's record
  // keeps the loser's room re-pointed onto the winner.
  const roomChoice: 'a' | 'b' | 'none' =
    payloadRoomChoice === 'none' ? 'none' : payloadRoomChoice === keep ? 'a' : 'b'

  // Fetch each ref's full record with relations; verify side ownership.
  type GuestRow = {
    id: string
    name: string
    side: Side
    household_group: string | null
    email: string | null
    phone: string | null
    address: string | null
    familyMembers: { id: string; guest_id: string }[]
    rsvpResponses: { guest_id: string; event_id: string; attending: boolean | null; dietary_restrictions: string | null }[]
    eventInvitations: { guest_id: string; event_id: string }[]
    roomAssignments: { id: string; guest_id: string; family_member_id: string | null }[]
  }
  type FamilyRow = {
    id: string
    guest_id: string
    name: string
    guest: { id: string; side: Side; household_group: string | null }
    rsvps: { family_member_id: string; event_id: string; attending: boolean | null; dietary_restrictions: string | null }[]
    roomAssignments: { id: string; guest_id: string; family_member_id: string | null }[]
  }

  async function fetchGuest(ref: Ref): Promise<GuestRow> {
    if (ref.type !== 'guest') throw new Error('Record not found')
    const g = await tx.guest.findUnique({
      where: { id: ref.id },
      include: { familyMembers: true, rsvpResponses: true, eventInvitations: true, roomAssignments: true },
    })
    if (!g) throw new Error('Record not found')
    if ((g as GuestRow).side !== side) throw new Error('Record not found')
    return g as GuestRow
  }

  async function fetchFamily(ref: Ref): Promise<FamilyRow> {
    if (ref.type !== 'family_member') throw new Error('Record not found')
    const f = await tx.familyMember.findUnique({
      where: { id: ref.id },
      include: {
        guest: { select: { id: true, side: true, household_group: true } },
        rsvps: true,
        roomAssignments: true,
      },
    })
    if (!f) throw new Error('Record not found')
    const fr = f as FamilyRow
    if (!fr.guest || fr.guest.side !== side) throw new Error('Record not found')
    return fr
  }

  // Helper: sync guest RsvpResponses to a reconciled set.
  async function syncGuestRsvps(guestId: string) {
    for (const r of rsvps) {
      await tx.rsvpResponse.upsert({
        where: { guest_id_event_id: { guest_id: guestId, event_id: r.event_id } },
        create: {
          guest_id: guestId,
          event_id: r.event_id,
          attending: r.attending,
          dietary_restrictions: r.dietary,
        },
        update: { attending: r.attending, dietary_restrictions: r.dietary },
      })
    }
    if (rsvps.length === 0) {
      await tx.rsvpResponse.deleteMany({ where: { guest_id: guestId } })
    } else {
      await tx.rsvpResponse.deleteMany({
        where: { guest_id: guestId, event_id: { notIn: rsvps.map(r => r.event_id) } },
      })
    }
  }

  // Helper: sync family-member Rsvps to a reconciled set.
  async function syncFamilyRsvps(fmId: string) {
    for (const r of rsvps) {
      await tx.familyMemberRsvp.upsert({
        where: { family_member_id_event_id: { family_member_id: fmId, event_id: r.event_id } },
        create: {
          family_member_id: fmId,
          event_id: r.event_id,
          attending: r.attending,
          dietary_restrictions: r.dietary,
        },
        update: { attending: r.attending, dietary_restrictions: r.dietary },
      })
    }
    if (rsvps.length === 0) {
      await tx.familyMemberRsvp.deleteMany({ where: { family_member_id: fmId } })
    } else {
      await tx.familyMemberRsvp.deleteMany({
        where: { family_member_id: fmId, event_id: { notIn: rsvps.map(r => r.event_id) } },
      })
    }
  }

  // Helper: sync guest event invitations to a union set.
  async function syncGuestInvitations(guestId: string) {
    await tx.guestEventInvitation.deleteMany({ where: { guest_id: guestId } })
    if (invitedEventIds.length > 0) {
      await tx.guestEventInvitation.createMany({
        data: invitedEventIds.map(event_id => ({ guest_id: guestId, event_id })),
        skipDuplicates: true,
      })
    }
  }

  // Helper: apply roomChoice for a guest-winner where the loser's room is the
  // "primary guest" room (family_member_id null) and the winner's room is also
  // primary. Returns nothing; mutates state via tx.
  async function resolveRoomsGuestWinner(
    loserGuestId: string,
    winnerGuestId: string,
  ) {
    const loserRoom = await tx.roomAssignment.findFirst({
      where: { guest_id: loserGuestId, family_member_id: null },
    })
    const winnerRoom = await tx.roomAssignment.findFirst({
      where: { guest_id: winnerGuestId, family_member_id: null },
    })
    if (roomChoice === 'none') {
      if (loserRoom) await tx.roomAssignment.delete({ where: { id: loserRoom.id } })
      if (winnerRoom) await tx.roomAssignment.delete({ where: { id: winnerRoom.id } })
    } else if (roomChoice === 'a') {
      if (loserRoom) await tx.roomAssignment.delete({ where: { id: loserRoom.id } })
    } else if (roomChoice === 'b') {
      if (winnerRoom) await tx.roomAssignment.delete({ where: { id: winnerRoom.id } })
      if (loserRoom) {
        await tx.roomAssignment.update({
          where: { id: loserRoom.id },
          data: { guest_id: winnerGuestId, family_member_id: null },
        })
      }
    }
  }

  // Helper: apply roomChoice when the winner is a Guest and the loser is a
  // FamilyMember — the loser's room is keyed on family_member_id = loser.id.
  async function resolveRoomsGuestWinnerFmLoser(
    loserFmId: string,
    winnerGuestId: string,
  ) {
    const loserRoom = await tx.roomAssignment.findFirst({
      where: { family_member_id: loserFmId },
    })
    const winnerRoom = await tx.roomAssignment.findFirst({
      where: { guest_id: winnerGuestId, family_member_id: null },
    })
    if (roomChoice === 'none') {
      if (loserRoom) await tx.roomAssignment.delete({ where: { id: loserRoom.id } })
      if (winnerRoom) await tx.roomAssignment.delete({ where: { id: winnerRoom.id } })
    } else if (roomChoice === 'a') {
      if (loserRoom) await tx.roomAssignment.delete({ where: { id: loserRoom.id } })
    } else if (roomChoice === 'b') {
      if (winnerRoom) await tx.roomAssignment.delete({ where: { id: winnerRoom.id } })
      if (loserRoom) {
        await tx.roomAssignment.update({
          where: { id: loserRoom.id },
          data: { guest_id: winnerGuestId, family_member_id: null },
        })
      }
    }
  }

  // Helper: apply roomChoice when the winner is a FamilyMember and the loser is
  // a Guest — loser's room is primary (family_member_id null); winner's room is
  // keyed on family_member_id = winner.id.
  async function resolveRoomsFmWinnerGuestLoser(
    loserGuestId: string,
    winnerFmId: string,
    winnerParentGuestId: string,
  ) {
    const loserRoom = await tx.roomAssignment.findFirst({
      where: { guest_id: loserGuestId, family_member_id: null },
    })
    const winnerRoom = await tx.roomAssignment.findFirst({
      where: { family_member_id: winnerFmId },
    })
    if (roomChoice === 'none') {
      if (loserRoom) await tx.roomAssignment.delete({ where: { id: loserRoom.id } })
      if (winnerRoom) await tx.roomAssignment.delete({ where: { id: winnerRoom.id } })
    } else if (roomChoice === 'a') {
      if (loserRoom) await tx.roomAssignment.delete({ where: { id: loserRoom.id } })
    } else if (roomChoice === 'b') {
      if (winnerRoom) await tx.roomAssignment.delete({ where: { id: winnerRoom.id } })
      if (loserRoom) {
        await tx.roomAssignment.update({
          where: { id: loserRoom.id },
          data: { guest_id: winnerParentGuestId, family_member_id: winnerFmId },
        })
      }
    }
  }

  // Helper: apply roomChoice when both winner and loser are FamilyMembers.
  async function resolveRoomsFmWinnerFmLoser(
    loserFmId: string,
    winnerFmId: string,
    winnerParentGuestId: string,
  ) {
    const loserRoom = await tx.roomAssignment.findFirst({
      where: { family_member_id: loserFmId },
    })
    const winnerRoom = await tx.roomAssignment.findFirst({
      where: { family_member_id: winnerFmId },
    })
    if (roomChoice === 'none') {
      if (loserRoom) await tx.roomAssignment.delete({ where: { id: loserRoom.id } })
      if (winnerRoom) await tx.roomAssignment.delete({ where: { id: winnerRoom.id } })
    } else if (roomChoice === 'a') {
      if (loserRoom) await tx.roomAssignment.delete({ where: { id: loserRoom.id } })
    } else if (roomChoice === 'b') {
      if (winnerRoom) await tx.roomAssignment.delete({ where: { id: winnerRoom.id } })
      if (loserRoom) {
        await tx.roomAssignment.update({
          where: { id: loserRoom.id },
          data: { guest_id: winnerParentGuestId, family_member_id: winnerFmId },
        })
      }
    }
  }

  const winnerType = winner.type
  const loserType = loser.type

  if (winnerType === 'guest' && loserType === 'guest') {
    // A. winner=Guest, loser=Guest
    const winnerGuest = await fetchGuest(winner)
    const loserGuest = await fetchGuest(loser)
    void loserGuest

    await tx.guest.update({
      where: { id: winnerGuest.id },
      data: { name: fields.name, email: fields.email, phone: fields.phone, address: fields.address },
    })
    await syncGuestRsvps(winnerGuest.id)
    await syncGuestInvitations(winnerGuest.id)
    // re-parent loser family members onto winner
    await tx.familyMember.updateMany({
      where: { guest_id: loser.id },
      data: { guest_id: winner.id },
    })
    // re-point re-parented family members' OWN room rows (guest_id was loser.id,
    // family_member_id non-null) to the winner — required BEFORE guest.delete
    // because RoomAssignment.guest is onDelete: Restrict.
    await tx.roomAssignment.updateMany({
      where: { guest_id: loser.id, family_member_id: { not: null } },
      data: { guest_id: winner.id },
    })
    await resolveRoomsGuestWinner(loser.id, winner.id)
    await tx.guest.delete({ where: { id: loser.id } })
  } else if (winnerType === 'guest' && loserType === 'family_member') {
    // B. winner=Guest, loser=FamilyMember
    const winnerGuest = await fetchGuest(winner)
    const loserFm = await fetchFamily(loser)

    await tx.guest.update({
      where: { id: winnerGuest.id },
      data: {
        name: fields.name,
        email: fields.email,
        phone: fields.phone,
        address: fields.address,
        ...(payload.joinHousehold ? { household_group: loserFm.guest.household_group } : {}),
      },
    })
    await syncGuestRsvps(winnerGuest.id)
    await syncGuestInvitations(winnerGuest.id)
    await resolveRoomsGuestWinnerFmLoser(loser.id, winner.id)
    await tx.familyMember.delete({ where: { id: loser.id } })
  } else if (winnerType === 'family_member' && loserType === 'guest') {
    // C. winner=FamilyMember, loser=Guest (collapse)
    const winnerFm = await fetchFamily(winner)
    const loserGuest = await fetchGuest(loser)
    void loserGuest

    await tx.familyMember.update({
      where: { id: winnerFm.id },
      data: { name: fields.name },
    })
    await syncFamilyRsvps(winnerFm.id)
    // re-parent loser's family members onto winner's parent guest
    await tx.familyMember.updateMany({
      where: { guest_id: loser.id },
      data: { guest_id: winnerFm.guest.id },
    })
    // re-point re-parented family members' OWN room rows (guest_id was loser.id,
    // family_member_id non-null) to the winner's parent guest — required BEFORE
    // guest.delete because RoomAssignment.guest is onDelete: Restrict.
    await tx.roomAssignment.updateMany({
      where: { guest_id: loser.id, family_member_id: { not: null } },
      data: { guest_id: winnerFm.guest.id },
    })
    await resolveRoomsFmWinnerGuestLoser(loser.id, winnerFm.id, winnerFm.guest.id)
    await tx.guest.delete({ where: { id: loser.id } })
  } else if (winnerType === 'family_member' && loserType === 'family_member') {
    // D. winner=FamilyMember, loser=FamilyMember
    const winnerFm = await fetchFamily(winner)
    await fetchFamily(loser)

    await tx.familyMember.update({
      where: { id: winnerFm.id },
      data: { name: fields.name },
    })
    await syncFamilyRsvps(winnerFm.id)
    await resolveRoomsFmWinnerFmLoser(loser.id, winnerFm.id, winnerFm.guest.id)
    await tx.familyMember.delete({ where: { id: loser.id } })
  } else {
    throw new Error('Unsupported merge case')
  }

  return { kept: winner, deleted: loser }
}