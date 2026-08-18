// Verification script for src/lib/rsvp-batch.ts.
// Run with: node scripts/verify-rsvp-batch.mjs
// Same convention as scripts/verify-chat-history.mjs.

import {
  validateBatchPayload,
  applyBatch,
  MAX_GUESTS_PER_BATCH,
} from '../src/lib/rsvp-batch.ts'

let failures = 0
function expect(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`)
  if (!ok) failures++
}

// ── Test data ──────────────────────────────────────────────────────────────
const brideGuests = [
  { id: 'g1', side: 'bride' }, { id: 'g2', side: 'bride' }, { id: 'g3', side: 'bride' },
]
const groomGuests = [{ id: 'g4', side: 'groom' }]
const brideEvents = [
  { id: 'e1', managed_by: 'bride', display_group: 'bride' },
  { id: 'e2', managed_by: 'bride', display_group: 'joint' },
]
const groomOnlyEvent = { id: 'e3', managed_by: 'groom', display_group: 'groom' }
const allEvents = [...brideEvents, groomOnlyEvent]

// ── 1-9: pure validation ───────────────────────────────────────────────────
expect('1. empty rows → rows_required',
  validateBatchPayload({ rows: [] }, 'bride', brideGuests, brideEvents),
  { ok: false, error: { code: 'rows_required' } })

expect('2. wrong-side guest → invalid_guest',
  validateBatchPayload({ rows: [{ guestId: 'g4', cells: [] }] }, 'bride', brideGuests, brideEvents),
  { ok: false, error: { code: 'invalid_guest', guestId: 'g4' } })

expect('3. event not managed by side and not joint → invalid_event',
  validateBatchPayload(
    { rows: [{ guestId: 'g1', cells: [{ eventId: 'e3', attending: true }] }] },
    'bride', brideGuests, allEvents),
  { ok: false, error: { code: 'invalid_event', eventId: 'e3' } })

expect('4. joint event accepted for any admin',
  validateBatchPayload(
    { rows: [{ guestId: 'g1', cells: [{ eventId: 'e2', attending: true }] }] },
    'bride', brideGuests, allEvents).ok, true)

expect('5. attending missing → invalid_attending',
  validateBatchPayload(
    { rows: [{ guestId: 'g1', cells: [{ eventId: 'e1' }] }] },
    'bride', brideGuests, brideEvents),
  { ok: false, error: { code: 'invalid_attending' } })

expect('6. attending string "true" → invalid_attending',
  validateBatchPayload(
    { rows: [{ guestId: 'g1', cells: [{ eventId: 'e1', attending: 'true' }] }] },
    'bride', brideGuests, brideEvents),
  { ok: false, error: { code: 'invalid_attending' } })

// 7: events_required — detected by applyBatch (no events in payload rows)
//    We test it via validateBatchPayload with rows that have no cells at all:
expect('7. zero events in any row → events_required',
  validateBatchPayload(
    { rows: [{ guestId: 'g1', cells: [] }] },
    'bride', brideGuests, brideEvents),
  { ok: false, error: { code: 'events_required' } })

// 8-9: cap test
const bigGuestList = Array.from({ length: MAX_GUESTS_PER_BATCH }, (_, i) => ({ id: `g${i}`, side: 'bride' }))
expect('8. 201 guests → too_many_guests',
  validateBatchPayload(
    { rows: Array.from({ length: MAX_GUESTS_PER_BATCH + 1 }, (_, i) => ({ guestId: `g${i}`, cells: [{ eventId: 'e1', attending: true }] })) },
    'bride', [...bigGuestList, { id: 'gExtra', side: 'bride' }], brideEvents),
  { ok: false, error: { code: 'too_many_guests' } })

expect('9. exactly 200 guests → accepted',
  validateBatchPayload(
    { rows: Array.from({ length: MAX_GUESTS_PER_BATCH }, (_, i) => ({ guestId: `g${i}`, cells: [{ eventId: 'e1', attending: true }] })) },
    'bride', bigGuestList, brideEvents).ok, true)

// ── 10-16, 18: applyBatch with mock-Prisma ──────────────────────────────────
function makeMockTx(initial = []) {
  // initial = [{ guest_id, event_id, attending, dietary_restrictions }]
  const store = new Map(initial.map(r => [`${r.guest_id}::${r.event_id}`, { ...r }]))
  const calls = { findUnique: 0, upsert: 0, update: 0, create: 0 }
  return {
    calls,
    tx: {
      rsvpResponse: {
        async findUnique({ where }) {
          calls.findUnique++
          const k = `${where.guest_id_event_id.guest_id}::${where.guest_id_event_id.event_id}`
          return store.get(k) ?? null
        },
        async upsert({ where, create, update }) {
          calls.upsert++
          const k = `${where.guest_id_event_id.guest_id}::${where.guest_id_event_id.event_id}`
          const existing = store.get(k)
          // Mirror real Prisma: spread `create`/`update` verbatim. No implicit
          // null defaults — applyBatch is responsible for setting
          // dietary_restrictions explicitly on every create path, mirroring
          // real Prisma's nullable-column behavior at the call site.
          const merged = existing ? { ...existing, ...update } : { ...create }
          store.set(k, merged)
          return merged
        },
        async update({ where, data }) {
          calls.update++
          const k = `${where.guest_id_event_id.guest_id}::${where.guest_id_event_id.event_id}`
          const existing = store.get(k)
          if (!existing) throw new Error('update: row not found')
          const merged = { ...existing, ...data }
          store.set(k, merged)
          return merged
        },
        async create({ data }) {
          calls.create++
          const k = `${data.guest_id}::${data.event_id}`
          if (store.has(k)) throw new Error('create: duplicate key')
          const row = { ...data }
          store.set(k, row)
          return row
        },
      },
    },
    store,
  }
}

const baseInitial = [
  { guest_id: 'g1', event_id: 'e1', attending: true,  dietary_restrictions: 'no nuts' },
  { guest_id: 'g1', event_id: 'e2', attending: false, dietary_restrictions: null },
]

// 10. attending null, no prior RSVP → create with attending=true
{
  const { tx, store } = makeMockTx(baseInitial)
  const result = await applyBatch(tx, {
    rows: [{ guestId: 'g2', cells: [{ eventId: 'e1', attending: null }] }],
  })
  expect('10. null + no prior RSVP → create Yes', result,
    { writtenYes: 1, writtenNo: 0, cleared: 0, total: 1 })
  expect('10. row created with attending=true', store.get('g2::e1').attending, true)
}

// 11. attending null, prior RSVP true → cleared, dietary_restrictions preserved
{
  const { tx, store } = makeMockTx(baseInitial)
  const result = await applyBatch(tx, {
    rows: [{ guestId: 'g1', cells: [{ eventId: 'e1', attending: null }] }],
  })
  expect('11. null + prior true → cleared', result,
    { writtenYes: 0, writtenNo: 0, cleared: 1, total: 1 })
  expect('11. attending now null', store.get('g1::e1').attending, null)
  expect('11. dietary_restrictions preserved', store.get('g1::e1').dietary_restrictions, 'no nuts')
}

// 12. attending true, no prior RSVP → create
{
  const { tx, store } = makeMockTx(baseInitial)
  const result = await applyBatch(tx, {
    rows: [{ guestId: 'g2', cells: [{ eventId: 'e1', attending: true }] }],
  })
  expect('12. true + no prior → create true', result,
    { writtenYes: 1, writtenNo: 0, cleared: 0, total: 1 })
  expect('12. row created with attending=true', store.get('g2::e1').attending, true)
  expect('12. dietary_restrictions default null', store.get('g2::e1').dietary_restrictions, null)
}

// 13. attending false, prior true → update to false, dietary preserved
{
  const { tx, store } = makeMockTx(baseInitial)
  const result = await applyBatch(tx, {
    rows: [{ guestId: 'g1', cells: [{ eventId: 'e1', attending: false }] }],
  })
  expect('13. false + prior true → updated', result,
    { writtenYes: 0, writtenNo: 1, cleared: 0, total: 1 })
  expect('13. attending now false', store.get('g1::e1').attending, false)
  expect('13. dietary_restrictions preserved', store.get('g1::e1').dietary_restrictions, 'no nuts')
}

// 14. attending true, prior false → update to true, dietary preserved
{
  const { tx, store } = makeMockTx(baseInitial)
  const result = await applyBatch(tx, {
    rows: [{ guestId: 'g1', cells: [{ eventId: 'e2', attending: true }] }],
  })
  expect('14. true + prior false → updated', result,
    { writtenYes: 1, writtenNo: 0, cleared: 0, total: 1 })
  expect('14. attending now true', store.get('g1::e2').attending, true)
  expect('14. dietary_restrictions still null', store.get('g1::e2').dietary_restrictions, null)
}

// 15. mixed batch
{
  const { tx } = makeMockTx(baseInitial)
  const result = await applyBatch(tx, {
    rows: [
      { guestId: 'g1', cells: [
        { eventId: 'e1', attending: false },  // writtenNo
        { eventId: 'e2', attending: null },   // cleared
      ]},
      { guestId: 'g2', cells: [
        { eventId: 'e1', attending: null },   // writtenYes (yes-default)
        { eventId: 'e2', attending: true },   // writtenYes
      ]},
    ],
  })
  expect('15. mixed batch counts', result,
    { writtenYes: 2, writtenNo: 1, cleared: 1, total: 4 })
}

// 16. transaction rollback — make upsert throw, prior state unchanged
{
  const { tx, store } = makeMockTx(baseInitial)
  // Make upsert throw on a specific pair
  const realUpsert = tx.rsvpResponse.upsert
  tx.rsvpResponse.upsert = async (args) => {
    if (args.create.guest_id === 'g2') throw new Error('simulated DB error')
    return realUpsert(args)
  }
  let threw = false
  try {
    await applyBatch(tx, {
      rows: [
        { guestId: 'g1', cells: [{ eventId: 'e2', attending: false }] },  // would succeed
        { guestId: 'g2', cells: [{ eventId: 'e1', attending: true }] },   // throws
      ],
    })
  } catch (e) {
    threw = true
  }
  expect('16. applyBatch re-throws on DB error', threw, true)
  // NOTE: real `prisma.$transaction` rolls back automatically; the mock doesn't.
  // The test here only verifies applyBatch propagates errors. The route handler
  // is what wraps applyBatch in `prisma.$transaction` for true rollback.
}

// 17. side-leak attempt (guest from wrong side)
expect('17. side-leak guest rejected',
  validateBatchPayload(
    { rows: [{ guestId: 'g4', cells: [{ eventId: 'e1', attending: true }] }] },
    'bride', [...brideGuests, ...groomGuests], brideEvents),
  { ok: false, error: { code: 'invalid_guest', guestId: 'g4' } })

// 18. dietary_restrictions preserved across writes (true, false, null)
{
  const { tx, store } = makeMockTx(baseInitial)
  await applyBatch(tx, {
    rows: [
      { guestId: 'g1', cells: [
        { eventId: 'e1', attending: true },   // upsert (was true) — diet stays 'no nuts'
        { eventId: 'e2', attending: false },  // upsert (was false) — diet stays null
      ]},
    ],
  })
  expect('18. e1 diet preserved', store.get('g1::e1').dietary_restrictions, 'no nuts')
  expect('18. e2 diet preserved null', store.get('g1::e2').dietary_restrictions, null)
  expect('18. e1 attending now true', store.get('g1::e1').attending, true)
  expect('18. e2 attending now false', store.get('g1::e2').attending, false)
}

console.log(failures === 0 ? '\nAll rsvp-batch checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
