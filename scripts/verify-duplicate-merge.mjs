// Verification script for src/lib/duplicate-merge.ts.
// Run with: node scripts/verify-duplicate-merge.mjs
// Same convention as scripts/verify-rsvp-batch.mjs.
//
// NOTE: The mock tx does NOT replicate real FK `Restrict`/cascade behavior —
// that is owned by the real `prisma.$transaction` in the route handler.
// This script validates the *logic/ordering* of operations performMerge
// issues against an in-memory store.

import { performMerge } from '../src/lib/duplicate-merge.ts'

let failures = 0
function expect(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`)
  if (!ok) failures++
}

// ── Mock Prisma transaction client ─────────────────────────────────────────
// Backs the six models performMerge touches with in-memory Map stores.
// `include` resolution is implemented for the relation sets performMerge reads.
function makeMockTx(seed) {
  const guests = new Map(seed.guests?.map(g => [g.id, { ...g }]) ?? [])
  const familyMembers = new Map(seed.familyMembers?.map(f => [f.id, { ...f }]) ?? [])
  const rsvpResponses = new Map(seed.rsvpResponses?.map(r => [`${r.guest_id}::${r.event_id}`, { ...r }]) ?? [])
  const familyMemberRsvps = new Map(seed.familyMemberRsvps?.map(r => [`${r.family_member_id}::${r.event_id}`, { ...r }]) ?? [])
  const guestEventInvitations = new Map(seed.guestEventInvitations?.map(i => [`${i.guest_id}::${i.event_id}`, { ...i }]) ?? [])
  const roomAssignments = new Map(seed.roomAssignments?.map(r => [r.id, { ...r }]) ?? [])

  // Helper: materialize a guest with the include shape performMerge reads.
  function guestWithIncludes(g) {
    if (!g) return null
    return {
      ...g,
      familyMembers: [...familyMembers.values()].filter(f => f.guest_id === g.id),
      rsvpResponses: [...rsvpResponses.values()].filter(r => r.guest_id === g.id),
      eventInvitations: [...guestEventInvitations.values()].filter(i => i.guest_id === g.id),
      roomAssignments: [...roomAssignments.values()].filter(r => r.guest_id === g.id),
    }
  }
  function fmWithIncludes(f) {
    if (!f) return null
    const parent = guests.get(f.guest_id) ?? null
    return {
      ...f,
      guest: parent ? { id: parent.id, side: parent.side, household_group: parent.household_group } : null,
      rsvps: [...familyMemberRsvps.values()].filter(r => r.family_member_id === f.id),
      roomAssignments: [...roomAssignments.values()].filter(r => r.family_member_id === f.id),
    }
  }

  const tx = {
    guest: {
      async findUnique({ where, include }) {
        const g = guests.get(where.id) ?? null
        return include ? guestWithIncludes(g) : (g ? { ...g } : null)
      },
      async update({ where, data }) {
        const g = guests.get(where.id)
        if (!g) throw new Error('guest.update: not found')
        const merged = { ...g, ...data }
        guests.set(where.id, merged)
        return merged
      },
      async delete({ where }) {
        const g = guests.get(where.id)
        if (!g) throw new Error('guest.delete: not found')
        guests.delete(where.id)
        // cascade-ish: remove rsvpResponses, eventInvitations (real Prisma does this)
        for (const [k, r] of rsvpResponses) if (r.guest_id === where.id) rsvpResponses.delete(k)
        for (const [k, i] of guestEventInvitations) if (i.guest_id === where.id) guestEventInvitations.delete(k)
        return g
      },
    },
    familyMember: {
      async findUnique({ where, include }) {
        const f = familyMembers.get(where.id) ?? null
        return include ? fmWithIncludes(f) : (f ? { ...f } : null)
      },
      async update({ where, data }) {
        const f = familyMembers.get(where.id)
        if (!f) throw new Error('familyMember.update: not found')
        const merged = { ...f, ...data }
        familyMembers.set(where.id, merged)
        return merged
      },
      async updateMany({ where, data }) {
        let count = 0
        for (const f of familyMembers.values()) {
          if (where.guest_id !== undefined && f.guest_id !== where.guest_id) continue
          Object.assign(f, data)
          count++
        }
        return { count }
      },
      async delete({ where }) {
        const f = familyMembers.get(where.id)
        if (!f) throw new Error('familyMember.delete: not found')
        familyMembers.delete(where.id)
        for (const [k, r] of familyMemberRsvps) if (r.family_member_id === where.id) familyMemberRsvps.delete(k)
        return f
      },
    },
    rsvpResponse: {
      async upsert({ where, create, update }) {
        const k = `${where.guest_id_event_id.guest_id}::${where.guest_id_event_id.event_id}`
        const existing = rsvpResponses.get(k)
        const merged = existing ? { ...existing, ...update } : { ...create }
        rsvpResponses.set(k, merged)
        return merged
      },
      async deleteMany({ where }) {
        let count = 0
        for (const [k, r] of rsvpResponses) {
          if (where.guest_id !== undefined && r.guest_id !== where.guest_id) continue
          if (where.event_id?.notIn) {
            if (where.event_id.notIn.includes(r.event_id)) continue
          }
          rsvpResponses.delete(k)
          count++
        }
        return { count }
      },
    },
    familyMemberRsvp: {
      async upsert({ where, create, update }) {
        const k = `${where.family_member_id_event_id.family_member_id}::${where.family_member_id_event_id.event_id}`
        const existing = familyMemberRsvps.get(k)
        const merged = existing ? { ...existing, ...update } : { ...create }
        familyMemberRsvps.set(k, merged)
        return merged
      },
      async deleteMany({ where }) {
        let count = 0
        for (const [k, r] of familyMemberRsvps) {
          if (where.family_member_id !== undefined && r.family_member_id !== where.family_member_id) continue
          if (where.event_id?.notIn) {
            if (where.event_id.notIn.includes(r.event_id)) continue
          }
          familyMemberRsvps.delete(k)
          count++
        }
        return { count }
      },
    },
    guestEventInvitation: {
      async deleteMany({ where }) {
        let count = 0
        for (const [k, i] of guestEventInvitations) {
          if (where.guest_id !== undefined && i.guest_id !== where.guest_id) continue
          guestEventInvitations.delete(k)
          count++
        }
        return { count }
      },
      async createMany({ data, skipDuplicates }) {
        let count = 0
        for (const d of data) {
          const k = `${d.guest_id}::${d.event_id}`
          if (skipDuplicates && guestEventInvitations.has(k)) continue
          guestEventInvitations.set(k, { ...d })
          count++
        }
        return { count }
      },
    },
    roomAssignment: {
      async findFirst({ where }) {
        for (const r of roomAssignments.values()) {
          if (where.guest_id !== undefined && r.guest_id !== where.guest_id) continue
          if (Object.prototype.hasOwnProperty.call(where, 'family_member_id')) {
            if (where.family_member_id === null) {
              if (r.family_member_id !== null && r.family_member_id !== undefined) continue
            } else {
              if (r.family_member_id !== where.family_member_id) continue
            }
          }
          return { ...r }
        }
        return null
      },
      async delete({ where }) {
        const r = roomAssignments.get(where.id)
        if (!r) throw new Error('roomAssignment.delete: not found')
        roomAssignments.delete(where.id)
        return r
      },
      async update({ where, data }) {
        const r = roomAssignments.get(where.id)
        if (!r) throw new Error('roomAssignment.update: not found')
        const merged = { ...r, ...data }
        roomAssignments.set(where.id, merged)
        return merged
      },
      async updateMany({ where, data }) {
        let count = 0
        for (const r of roomAssignments.values()) {
          if (where.guest_id !== undefined && r.guest_id !== where.guest_id) continue
          if (where.family_member_id?.not !== undefined) {
            // Prisma `{ not: null }` means "not null"
            if (where.family_member_id.not === null) {
              if (r.family_member_id === null || r.family_member_id === undefined) continue
            } else {
              if (r.family_member_id === where.family_member_id.not) continue
            }
          }
          Object.assign(r, data)
          count++
        }
        return { count }
      },
    },
  }

  return { tx, stores: { guests, familyMembers, rsvpResponses, familyMemberRsvps, guestEventInvitations, roomAssignments } }
}

// ── Case A: Guest↔Guest keep-a ────────────────────────────────────────────
{
  console.log('Case A: Guest↔Guest keep-a, roomChoice=b')
  const seed = {
    guests: [
      { id: 'a', name: 'A', side: 'bride', household_group: null, email: null, phone: null, address: null },
      { id: 'b', name: 'B', side: 'bride', household_group: null, email: null, phone: null, address: null },
    ],
    familyMembers: [
      { id: 'fm_b', guest_id: 'b', name: 'FM-B', is_child: false },
    ],
    rsvpResponses: [
      { id: 'r_a_e1', guest_id: 'a', event_id: 'e1', attending: false, dietary_restrictions: null },
    ],
    guestEventInvitations: [
      { id: 'i_a_e1', guest_id: 'a', event_id: 'e1' },
    ],
    roomAssignments: [
      { id: 'ra_b', room_id: 'room1', guest_id: 'b', family_member_id: null, notes: null },
      { id: 'rb_fm_b', room_id: 'room2', guest_id: 'b', family_member_id: 'fm_b', notes: null },
    ],
  }
  const { tx, stores } = makeMockTx(seed)
  const result = await performMerge(tx, 'bride', {
    pair: { a: { type: 'guest', id: 'a' }, b: { type: 'guest', id: 'b' } },
    keep: 'a',
    fields: { name: 'A Merged', email: 'a@x.com', phone: null, address: null },
    rsvps: [{ event_id: 'e1', attending: true, dietary: null }],
    roomChoice: 'b',
    invitedEventIds: ['e1'],
  })
  expect('A. kept ref', result.kept, { type: 'guest', id: 'a' })
  expect('A. deleted ref', result.deleted, { type: 'guest', id: 'b' })
  expect('A. loser guest b deleted', stores.guests.has('b'), false)
  expect('A. winner name updated', stores.guests.get('a').name, 'A Merged')
  expect('A. winner rsvp e1 attending true',
    stores.rsvpResponses.get('a::e1').attending, true)
  expect('A. fm_b re-parented to a', stores.familyMembers.get('fm_b').guest_id, 'a')
  expect('A. room ra_b re-pointed to a',
    stores.roomAssignments.get('ra_b'), { id: 'ra_b', room_id: 'room1', guest_id: 'a', family_member_id: null, notes: null })
  expect('A. fm_b room rb_fm_b re-pointed to (a, fm_b)',
    stores.roomAssignments.get('rb_fm_b'), { id: 'rb_fm_b', room_id: 'room2', guest_id: 'a', family_member_id: 'fm_b', notes: null })
}

// ── Case A2: Guest↔Guest roomChoice='none' ───────────────────────────────
{
  console.log('Case A2: Guest↔Guest keep-a, roomChoice=none')
  const seed = {
    guests: [
      { id: 'a', name: 'A', side: 'bride', household_group: null, email: null, phone: null, address: null },
      { id: 'b', name: 'B', side: 'bride', household_group: null, email: null, phone: null, address: null },
    ],
    roomAssignments: [
      { id: 'ra_b', room_id: 'room1', guest_id: 'b', family_member_id: null, notes: null },
    ],
  }
  const { tx, stores } = makeMockTx(seed)
  await performMerge(tx, 'bride', {
    pair: { a: { type: 'guest', id: 'a' }, b: { type: 'guest', id: 'b' } },
    keep: 'a',
    fields: { name: 'A', email: null, phone: null, address: null },
    rsvps: [],
    roomChoice: 'none',
    invitedEventIds: [],
  })
  expect('A2. loser primary room deleted (none)', stores.roomAssignments.has('ra_b'), false)
  expect('A2. loser guest deleted', stores.guests.has('b'), false)
}

// ── Case A3: Guest↔Guest roomChoice='a' (keep winner's room) ──────────────
{
  console.log('Case A3: Guest↔Guest keep-a, roomChoice=a')
  const seed = {
    guests: [
      { id: 'a', name: 'A', side: 'bride', household_group: null, email: null, phone: null, address: null },
      { id: 'b', name: 'B', side: 'bride', household_group: null, email: null, phone: null, address: null },
    ],
    roomAssignments: [
      { id: 'ra_a', room_id: 'room1', guest_id: 'a', family_member_id: null, notes: null },
      { id: 'ra_b', room_id: 'room2', guest_id: 'b', family_member_id: null, notes: null },
    ],
  }
  const { tx, stores } = makeMockTx(seed)
  await performMerge(tx, 'bride', {
    pair: { a: { type: 'guest', id: 'a' }, b: { type: 'guest', id: 'b' } },
    keep: 'a',
    fields: { name: 'A', email: null, phone: null, address: null },
    rsvps: [],
    roomChoice: 'a',
    invitedEventIds: [],
  })
  expect('A3. loser primary room deleted (a)', stores.roomAssignments.has('ra_b'), false)
  expect('A3. winner room kept (a)', stores.roomAssignments.get('ra_a').guest_id, 'a')
  expect('A3. loser guest deleted', stores.guests.has('b'), false)
}

// ── Case B: Guest↔FamilyMember keep-guest + joinHousehold ──────────────────
{
  console.log('Case B: Guest↔FamilyMember keep-guest + joinHousehold, roomChoice=b')
  const seed = {
    guests: [
      { id: 'a', name: 'A', side: 'bride', household_group: null, email: null, phone: null, address: null },
      { id: 'p', name: 'Parent', side: 'bride', household_group: 'H1', email: null, phone: null, address: null },
    ],
    familyMembers: [
      { id: 'fm', guest_id: 'p', name: 'FM', is_child: false },
    ],
    familyMemberRsvps: [
      { id: 'fmr_e1', family_member_id: 'fm', event_id: 'e1', attending: true, dietary_restrictions: null },
    ],
    roomAssignments: [
      { id: 'rf', room_id: 'room1', guest_id: 'p', family_member_id: 'fm', notes: null },
    ],
  }
  const { tx, stores } = makeMockTx(seed)
  const result = await performMerge(tx, 'bride', {
    pair: { a: { type: 'guest', id: 'a' }, b: { type: 'family_member', id: 'fm' } },
    keep: 'a',
    joinHousehold: true,
    fields: { name: 'A Merged', email: null, phone: null, address: null },
    rsvps: [{ event_id: 'e1', attending: true, dietary: null }],
    roomChoice: 'b',
    invitedEventIds: [],
  })
  expect('B. kept ref', result.kept, { type: 'guest', id: 'a' })
  expect('B. deleted ref', result.deleted, { type: 'family_member', id: 'fm' })
  expect('B. a household_group H1', stores.guests.get('a').household_group, 'H1')
  expect('B. a has RsvpResponse e1 attending true',
    stores.rsvpResponses.get('a::e1').attending, true)
  expect('B. fm deleted', stores.familyMembers.has('fm'), false)
  expect('B. room rf re-pointed to (a, null)',
    stores.roomAssignments.get('rf'), { id: 'rf', room_id: 'room1', guest_id: 'a', family_member_id: null, notes: null })
}

// ── Case C: Guest↔FamilyMember keep-family (collapse) ─────────────────────
//  keep='b' (winner = Record B = FM 'w'); roomChoice='a' = Record A's room
//  (g's primary room rg). Record-centric 'a' with keep='b' remaps to
//  winner-centric 'b' → re-point loser's room (rg) onto the winner (p, w).
{
  console.log('Case C: Guest↔FamilyMember keep-family collapse, roomChoice=a (Record A room re-pointed)')
  const seed = {
    guests: [
      { id: 'g', name: 'G', side: 'bride', household_group: null, email: null, phone: null, address: null },
      { id: 'p', name: 'Parent', side: 'bride', household_group: null, email: null, phone: null, address: null },
    ],
    familyMembers: [
      { id: 'fm_g', guest_id: 'g', name: 'FM-G', is_child: false },
      { id: 'w', guest_id: 'p', name: 'W', is_child: false },
    ],
    rsvpResponses: [
      { id: 'r_g_e1', guest_id: 'g', event_id: 'e1', attending: false, dietary_restrictions: null },
    ],
    roomAssignments: [
      { id: 'rg', room_id: 'room1', guest_id: 'g', family_member_id: null, notes: null },
      { id: 'rg2', room_id: 'room2', guest_id: 'g', family_member_id: 'fm_g', notes: null },
    ],
  }
  const { tx, stores } = makeMockTx(seed)
  const result = await performMerge(tx, 'bride', {
    pair: { a: { type: 'guest', id: 'g' }, b: { type: 'family_member', id: 'w' } },
    keep: 'b',
    fields: { name: 'W Merged', email: null, phone: null, address: null },
    rsvps: [{ event_id: 'e1', attending: true, dietary: null }],
    roomChoice: 'a',
    invitedEventIds: [],
  })
  expect('C. kept ref', result.kept, { type: 'family_member', id: 'w' })
  expect('C. deleted ref', result.deleted, { type: 'guest', id: 'g' })
  expect('C. w has FamilyMemberRsvp e1 attending true',
    stores.familyMemberRsvps.get('w::e1').attending, true)
  expect('C. g deleted', stores.guests.has('g'), false)
  expect('C. fm_g re-parented to p', stores.familyMembers.get('fm_g').guest_id, 'p')
  expect('C. room rg re-pointed to (p, w)',
    stores.roomAssignments.get('rg'), { id: 'rg', room_id: 'room1', guest_id: 'p', family_member_id: 'w', notes: null })
  expect('C. fm_g room rg2 re-pointed to (p, fm_g)',
    stores.roomAssignments.get('rg2'), { id: 'rg2', room_id: 'room2', guest_id: 'p', family_member_id: 'fm_g', notes: null })
}

// ── Case D: Guest↔Guest keep='b', roomChoice='a' (INVERSION case) ──────────
//  Record A = guest 'a' (room R1), Record B = guest 'b' (room R2).
//  keep='b' → winner = b. roomChoice='a' = Record A's room (R1).
//  Record-centric 'a' with keep='b' remaps to winner-centric 'b' → re-point
//  loser's room (R1) onto the winner (b), delete winner's own room (R2).
//  This is the inversion bug case: would fail before the fix (helper would
//  delete R1 and keep R2).
{
  console.log('Case D: Guest↔Guest keep=b, roomChoice=a (Record A room survives on winner)')
  const seed = {
    guests: [
      { id: 'a', name: 'A', side: 'bride', household_group: null, email: null, phone: null, address: null },
      { id: 'b', name: 'B', side: 'bride', household_group: null, email: null, phone: null, address: null },
    ],
    roomAssignments: [
      { id: 'R1', room_id: 'room1', guest_id: 'a', family_member_id: null, notes: null },
      { id: 'R2', room_id: 'room2', guest_id: 'b', family_member_id: null, notes: null },
    ],
  }
  const { tx, stores } = makeMockTx(seed)
  const result = await performMerge(tx, 'bride', {
    pair: { a: { type: 'guest', id: 'a' }, b: { type: 'guest', id: 'b' } },
    keep: 'b',
    fields: { name: 'B Merged', email: null, phone: null, address: null },
    rsvps: [],
    roomChoice: 'a',
    invitedEventIds: [],
  })
  expect('D. kept ref', result.kept, { type: 'guest', id: 'b' })
  expect('D. deleted ref', result.deleted, { type: 'guest', id: 'a' })
  expect('D. R1 survives re-pointed to winner b',
    stores.roomAssignments.get('R1'), { id: 'R1', room_id: 'room1', guest_id: 'b', family_member_id: null, notes: null })
  expect('D. R2 (winner own room) deleted', stores.roomAssignments.has('R2'), false)
  expect('D. loser guest a deleted', stores.guests.has('a'), false)
}

// ── Case E: Guest↔Guest keep='b', roomChoice='b' (winner's own room kept) ──
//  Record A = guest 'a' (room R1), Record B = guest 'b' (room R2).
//  keep='b' → winner = b. roomChoice='b' = Record B's room (R2).
//  Record-centric 'b' with keep='b' remaps to winner-centric 'a' → keep winner's
//  room (R2), delete loser's room (R1).
{
  console.log('Case E: Guest↔Guest keep=b, roomChoice=b (Record B = winner room kept)')
  const seed = {
    guests: [
      { id: 'a', name: 'A', side: 'bride', household_group: null, email: null, phone: null, address: null },
      { id: 'b', name: 'B', side: 'bride', household_group: null, email: null, phone: null, address: null },
    ],
    roomAssignments: [
      { id: 'R1', room_id: 'room1', guest_id: 'a', family_member_id: null, notes: null },
      { id: 'R2', room_id: 'room2', guest_id: 'b', family_member_id: null, notes: null },
    ],
  }
  const { tx, stores } = makeMockTx(seed)
  const result = await performMerge(tx, 'bride', {
    pair: { a: { type: 'guest', id: 'a' }, b: { type: 'guest', id: 'b' } },
    keep: 'b',
    fields: { name: 'B Merged', email: null, phone: null, address: null },
    rsvps: [],
    roomChoice: 'b',
    invitedEventIds: [],
  })
  expect('E. kept ref', result.kept, { type: 'guest', id: 'b' })
  expect('E. deleted ref', result.deleted, { type: 'guest', id: 'a' })
  expect('E. R2 (winner room) kept on b',
    stores.roomAssignments.get('R2'), { id: 'R2', room_id: 'room2', guest_id: 'b', family_member_id: null, notes: null })
  expect('E. R1 (loser room) deleted', stores.roomAssignments.has('R1'), false)
  expect('E. loser guest a deleted', stores.guests.has('a'), false)
}

// ── Case F: Guest↔Guest keep='a', roomChoice='none' WITH a WINNER room seeded ─
//  Bug 2: 'none' must delete BOTH loser and winner rooms. Existing Case A2
//  only seeded a loser room, so the winner-room leak was masked.
{
  console.log('Case F: Guest↔Guest keep=a, roomChoice=none, both rooms seeded')
  const seed = {
    guests: [
      { id: 'a', name: 'A', side: 'bride', household_group: null, email: null, phone: null, address: null },
      { id: 'b', name: 'B', side: 'bride', household_group: null, email: null, phone: null, address: null },
    ],
    roomAssignments: [
      { id: 'R1', room_id: 'room1', guest_id: 'a', family_member_id: null, notes: null },
      { id: 'R2', room_id: 'room2', guest_id: 'b', family_member_id: null, notes: null },
    ],
  }
  const { tx, stores } = makeMockTx(seed)
  await performMerge(tx, 'bride', {
    pair: { a: { type: 'guest', id: 'a' }, b: { type: 'guest', id: 'b' } },
    keep: 'a',
    fields: { name: 'A', email: null, phone: null, address: null },
    rsvps: [],
    roomChoice: 'none',
    invitedEventIds: [],
  })
  expect('F. winner room R1 deleted (none)', stores.roomAssignments.has('R1'), false)
  expect('F. loser room R2 deleted (none)', stores.roomAssignments.has('R2'), false)
  expect('F. loser guest deleted', stores.guests.has('b'), false)
}

// ── Case G: Guest↔FamilyMember keep='b' (FM winner), roomChoice='a' ──────────
//  Cross-case-type remap check. Record A = guest 'g' (room Rg), Record B = FM 'w'.
//  keep='b' → winner = w (FM). roomChoice='a' = Record A's room (Rg).
//  Remap: 'a' !== 'b', not none → winner-centric 'b' → re-point loser's room
//  (Rg) onto the winner's parent guest (p, w). Confirms remap holds for
//  Guest↔FM collapse case.
{
  console.log('Case G: Guest↔FamilyMember keep=b, roomChoice=a (Record A room re-pointed to FM winner)')
  const seed = {
    guests: [
      { id: 'g', name: 'G', side: 'bride', household_group: null, email: null, phone: null, address: null },
      { id: 'p', name: 'Parent', side: 'bride', household_group: null, email: null, phone: null, address: null },
    ],
    familyMembers: [
      { id: 'w', guest_id: 'p', name: 'W', is_child: false },
    ],
    roomAssignments: [
      { id: 'Rg', room_id: 'room1', guest_id: 'g', family_member_id: null, notes: null },
      { id: 'Rw', room_id: 'room2', guest_id: 'p', family_member_id: 'w', notes: null },
    ],
  }
  const { tx, stores } = makeMockTx(seed)
  const result = await performMerge(tx, 'bride', {
    pair: { a: { type: 'guest', id: 'g' }, b: { type: 'family_member', id: 'w' } },
    keep: 'b',
    fields: { name: 'W Merged', email: null, phone: null, address: null },
    rsvps: [],
    roomChoice: 'a',
    invitedEventIds: [],
  })
  expect('G. kept ref', result.kept, { type: 'family_member', id: 'w' })
  expect('G. deleted ref', result.deleted, { type: 'guest', id: 'g' })
  expect('G. Rg (Record A room) re-pointed to (p, w)',
    stores.roomAssignments.get('Rg'), { id: 'Rg', room_id: 'room1', guest_id: 'p', family_member_id: 'w', notes: null })
  expect('G. Rw (winner room) deleted', stores.roomAssignments.has('Rw'), false)
  expect('G. loser guest g deleted', stores.guests.has('g'), false)
}

// ── Side-ownership guard ──────────────────────────────────────────────────
{
  console.log('Side guard: wrong-side guest throws Record not found')
  const seed = {
    guests: [
      { id: 'a', name: 'A', side: 'groom', household_group: null, email: null, phone: null, address: null },
      { id: 'b', name: 'B', side: 'groom', household_group: null, email: null, phone: null, address: null },
    ],
  }
  const { tx } = makeMockTx(seed)
  let threw = false
  try {
    await performMerge(tx, 'bride', {
      pair: { a: { type: 'guest', id: 'a' }, b: { type: 'guest', id: 'b' } },
      keep: 'a',
      fields: { name: 'A', email: null, phone: null, address: null },
      rsvps: [],
      roomChoice: 'none',
      invitedEventIds: [],
    })
  } catch (e) {
    threw = true
    expect('C-side. error message', e.message, 'Record not found')
  }
  expect('C-side. wrong-side throws', threw, true)
}

console.log(failures === 0 ? '\nAll duplicate-merge checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)