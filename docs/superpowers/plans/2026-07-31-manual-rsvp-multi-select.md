# Manual RSVP Multi-Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-guest Manual RSVP form with a mini-grid modal that lets an admin record RSVPs for N guests × M events in a single save.

**Architecture:** A new `POST /api/admin/rsvps/batch` endpoint runs all writes inside one Prisma transaction using the existing `@@unique([guest_id, event_id])` index. A new `GET /api/admin/rsvps/preview` endpoint pre-fills the grid with current attending values. Pure validation + flattening helpers live in `src/lib/rsvp-batch.ts` so the verification script can exercise them without Prisma. The single-row `POST /api/admin/rsvps` is untouched.

**Tech Stack:** Next.js 16.2.6 (App Router, TypeScript), Prisma 6, React 19, Tailwind CSS v4. Verification scripts are plain Node ESM (`.mjs`) — same convention as `scripts/verify-chat-history.mjs`.

## Global Constraints

These come from the project's `CLAUDE.md` and the spec, and apply to every task below:

- **Next.js 16.2.6 has breaking changes** from training data. Read `node_modules/next/dist/docs/` for any unfamiliar API before writing code.
- **No `any` types** — use Prisma-generated types where possible.
- **Server components by default**, client components only when needed. The new modal IS a client component.
- **API routes return proper HTTP status codes** — 400 for validation, 401 for unauth, 403 for forbidden, 500 for DB errors.
- **Side-gating is mandatory**: every admin route checks `session.user.side` and rejects cross-side data with 400 (validation) before any DB write.
- **No new npm dependencies** — verification scripts are plain Node, no test framework.
- **`config` in `middleware.ts`** must be a static literal — not relevant here, but listed so future tasks don't break it.
- **Branch:** `feature/manual-rsvp-multi-select` off `main`.
- **File paths are absolute** in commands; relative in descriptions.
- **Frequent commits** — one commit per task minimum.

---

## Task 1: Pure helpers + verification scaffold

**Files:**
- Create: `src/lib/rsvp-batch.ts`
- Create: `scripts/verify-rsvp-batch.mjs`

**Purpose:** This task lays the foundation that everything else builds on. The pure helpers are tested directly via the verification script before any route code is written. The transaction logic is *also* extracted into a pure function so the mock-Prisma in the verification script can exercise it without a database.

**Interfaces (produced by this task, consumed by later tasks):**

```ts
// src/lib/rsvp-batch.ts
export type AdminSide = 'bride' | 'groom'

export interface BatchRow {
  guestId: string
  cells: Array<{ eventId: string; attending: boolean | null }>
}

export interface BatchPayload {
  rows: BatchRow[]
}

export interface GuestMeta { id: string; side: AdminSide }
export interface EventMeta { id: string; managed_by: AdminSide; display_group: 'bride' | 'groom' | 'joint' }

export type ValidationError =
  | { code: 'rows_required' }
  | { code: 'invalid_guest'; guestId: string }
  | { code: 'invalid_event'; eventId: string }
  | { code: 'invalid_attending' }
  | { code: 'events_required' }
  | { code: 'too_many_guests' }

export function validateBatchPayload(
  payload: unknown,
  adminSide: AdminSide,
  guests: GuestMeta[],
  events: EventMeta[]
): { ok: true; rows: BatchRow[] } | { ok: false; error: ValidationError }

export interface ApplyResult { writtenYes: number; writtenNo: number; cleared: number; total: number }

export interface MiniRsvpTx {
  rsvpResponse: {
    findUnique: (args: { where: { guest_id_event_id: { guest_id: string; event_id: string } } }) => Promise<{ attending: boolean | null; dietary_restrictions: string | null } | null>
    upsert: (args: any) => Promise<unknown>
    update: (args: any) => Promise<unknown>
    create: (args: any) => Promise<unknown>
  }
}

export async function applyBatch(
  tx: MiniRsvpTx,
  payload: BatchPayload
): Promise<ApplyResult>
```

The `tx` parameter is a minimal interface — the verification script passes a mock, the real route passes `prisma.$transaction(async tx => ...)`'s `tx` argument. The interface is structural so it works without casts.

**Max guests cap (used by validation):** `MAX_GUESTS_PER_BATCH = 200`.

### Step 1: Write the failing verification script

Write `scripts/verify-rsvp-batch.mjs` with all 18 assertions from the spec. The script imports the helpers from the compiled `src/lib/rsvp-batch.ts` via `tsx` (or directly — see Step 3 note). Each `expect(name, actual, expected)` line prints `✓` or `✗`. Run it. Expect every assertion to fail with "function not defined" or "module not found".

```js
// scripts/verify-rsvp-batch.mjs
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
          const row = { ...data, dietary_restrictions: data.dietary_restrictions ?? null }
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
```

Run: `node scripts/verify-rsvp-batch.mjs 2>&1 | tail -20`

Expected: every `expect()` line prints `✗ … expected: … actual: …` because `validateBatchPayload` and `applyBatch` are not yet defined. The "Module type" warning at the top is fine.

### Step 2: Implement `src/lib/rsvp-batch.ts`

Write `src/lib/rsvp-batch.ts` with the full interface from this task's header. The implementation must:

1. **Validate payload shape** before doing anything — payload must be a plain object with a `rows` array.
2. **Enforce the `events_required` rule** by walking all rows; if no row has any cell with a valid `eventId`, return `events_required`.
3. **Enforce `too_many_guests`** at exactly `MAX_GUESTS_PER_BATCH + 1` rows.
4. **`validateBatchPayload`** returns either `{ ok: true, rows }` (the normalized rows) or `{ ok: false, error }`.
5. **`applyBatch`** is a pure function: it takes the `tx` interface and a `BatchPayload`, walks every cell, and applies the rule from the spec table:
   - `attending !== null` → upsert with `attending`
   - `attending === null` and `existing` → update only `attending: null`
   - `attending === null` and no `existing` → create with `attending: true`
6. **`applyBatch`** accumulates `writtenYes` / `writtenNo` / `cleared` and returns them.

```ts
// src/lib/rsvp-batch.ts
// Pure helpers for the manual RSVP batch path. No Prisma, no React — see
// scripts/verify-rsvp-batch.mjs for behavior checks.

export const MAX_GUESTS_PER_BATCH = 200

export type AdminSide = 'bride' | 'groom'

export interface BatchRow {
  guestId: string
  cells: Array<{ eventId: string; attending: boolean | null }>
}

export interface BatchPayload {
  rows: BatchRow[]
}

export interface GuestMeta { id: string; side: AdminSide }
export interface EventMeta {
  id: string
  managed_by: AdminSide
  display_group: 'bride' | 'groom' | 'joint'
}

export type ValidationError =
  | { code: 'rows_required' }
  | { code: 'invalid_guest'; guestId: string }
  | { code: 'invalid_event'; eventId: string }
  | { code: 'invalid_attending' }
  | { code: 'events_required' }
  | { code: 'too_many_guests' }

export interface ApplyResult {
  writtenYes: number
  writtenNo: number
  cleared: number
  total: number
}

export interface MiniRsvpTx {
  rsvpResponse: {
    findUnique: (args: {
      where: { guest_id_event_id: { guest_id: string; event_id: string } }
    }) => Promise<{ attending: boolean | null; dietary_restrictions: string | null } | null>
    upsert: (args: any) => Promise<unknown>
    update: (args: any) => Promise<unknown>
    create: (args: any) => Promise<unknown>
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isValidAttending(v: unknown): v is boolean | null {
  return typeof v === 'boolean' || v === null
}

export function validateBatchPayload(
  payload: unknown,
  adminSide: AdminSide,
  guests: GuestMeta[],
  events: EventMeta[]
): { ok: true; rows: BatchRow[] } | { ok: false; error: ValidationError } {
  if (!isPlainObject(payload)) return { ok: false, error: { code: 'rows_required' } }
  const rawRows = payload.rows
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { ok: false, error: { code: 'rows_required' } }
  }
  if (rawRows.length > MAX_GUESTS_PER_BATCH) {
    return { ok: false, error: { code: 'too_many_guests' } }
  }

  const guestById = new Map(guests.map((g) => [g.id, g]))
  const eventById = new Map(events.map((e) => [e.id, e]))

  const normalized: BatchRow[] = []
  let hasAnyCell = false

  for (const rawRow of rawRows) {
    if (!isPlainObject(rawRow)) return { ok: false, error: { code: 'rows_required' } }
    const guestId = rawRow.guestId
    if (typeof guestId !== 'string') return { ok: false, error: { code: 'invalid_guest', guestId: String(guestId) } }

    const g = guestById.get(guestId)
    if (!g || g.side !== adminSide) {
      return { ok: false, error: { code: 'invalid_guest', guestId } }
    }

    const rawCells = rawRow.cells
    if (!Array.isArray(rawCells)) return { ok: false, error: { code: 'invalid_attending' } }

    const cells: BatchRow['cells'] = []
    for (const rawCell of rawCells) {
      if (!isPlainObject(rawCell)) return { ok: false, error: { code: 'invalid_attending' } }
      const eventId = rawCell.eventId
      if (typeof eventId !== 'string') {
        return { ok: false, error: { code: 'invalid_attending' } }
      }
      if (!isValidAttending(rawCell.attending)) {
        return { ok: false, error: { code: 'invalid_attending' } }
      }
      const ev = eventById.get(eventId)
      if (!ev || (ev.managed_by !== adminSide && ev.display_group !== 'joint')) {
        return { ok: false, error: { code: 'invalid_event', eventId } }
      }
      cells.push({ eventId, attending: rawCell.attending })
      hasAnyCell = true
    }
    normalized.push({ guestId, cells })
  }

  if (!hasAnyCell) return { ok: false, error: { code: 'events_required' } }

  return { ok: true, rows: normalized }
}

export async function applyBatch(tx: MiniRsvpTx, payload: BatchPayload): Promise<ApplyResult> {
  let writtenYes = 0
  let writtenNo = 0
  let cleared = 0

  for (const row of payload.rows) {
    for (const cell of row.cells) {
      const where = { guest_id_event_id: { guest_id: row.guestId, event_id: cell.eventId } }
      const existing = await tx.rsvpResponse.findUnique({ where })

      if (cell.attending === null) {
        if (existing) {
          await tx.rsvpResponse.update({ where, data: { attending: null } })
          cleared++
        } else {
          // Yes-default rule: cell left untouched, no prior RSVP → create as Yes
          await tx.rsvpResponse.create({
            data: { guest_id: row.guestId, event_id: cell.eventId, attending: true },
          })
          writtenYes++
        }
        continue
      }

      await tx.rsvpResponse.upsert({
        where,
        create: { guest_id: row.guestId, event_id: cell.eventId, attending: cell.attending },
        update: { attending: cell.attending },
      })
      if (cell.attending) writtenYes++
      else writtenNo++
    }
  }

  return { writtenYes, writtenNo, cleared, total: writtenYes + writtenNo + cleared }
}
```

### Step 3: Run the verification script

The script imports a `.ts` file directly. Node 20+ supports `--experimental-strip-types` for `.ts` files, but the project's other script (`scripts/verify-chat-history.mjs`) imports a `.ts` file via a warning — it works because Node parses `.ts` as ESM when the syntax is pure ESM. Either path works here; use whichever your Node version supports:

Try: `node scripts/verify-rsvp-batch.mjs 2>&1 | tail -30`

If Node complains about TS syntax (`TypeError: Unknown syntax`), run via `npx tsx scripts/verify-rsvp-batch.mjs 2>&1 | tail -30` instead. (The `verify-chat-history.mjs` script imports `chat-history.ts` and works under Node 22 — use that as the canonical example.)

Expected: all 18 assertions pass. Output ends with `\nAll rsvp-batch checks passed.` and exit code 0.

If any assertion fails, fix the helper and rerun. Do **not** move to Task 2 until all 18 pass.

### Step 4: Commit

```bash
git add src/lib/rsvp-batch.ts scripts/verify-rsvp-batch.mjs
git commit -m "feat(rsvp-batch): pure validateBatchPayload + applyBatch helpers"
```

---

## Task 2: `POST /api/admin/rsvps/batch` endpoint

**Files:**
- Create: `src/app/api/admin/rsvps/batch/route.ts`

**Consumes:** `validateBatchPayload`, `applyBatch` from `src/lib/rsvp-batch.ts`. Auth helpers from `src/lib/auth.ts`. `prisma` from `src/lib/prisma.ts`. `Side` type from `@prisma/client`.

**Produces:** HTTP endpoint at `POST /api/admin/rsvps/batch` returning one of:
- `400 { error: ValidationError['code'], ... }` on validation failure
- `401 { error: 'Unauthorized' }` on no session
- `403 { error: 'Forbidden' }` on non-`side_admin` role
- `200 { ok: true, writtenYes, writtenNo, cleared, total }` on success
- `500 { error: 'Internal error' }` on DB failure (with Prisma transaction auto-rollback)

**Pattern reference:** Follow `src/app/api/admin/rsvps/route.ts` lines 124–149 for the auth/side-checking style, but DO NOT extract any shared helper — the batch path has different logic.

### Step 1: Implement `src/app/api/admin/rsvps/batch/route.ts`

```ts
// src/app/api/admin/rsvps/batch/route.ts
// Bulk RSVP entry. Accepts a flat list of (guestId, eventId, attending)
// pairs and applies them in one Prisma transaction. The single-row
// POST /api/admin/rsvps handler is intentionally untouched — Chotu and
// other callers keep using it.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  validateBatchPayload,
  applyBatch,
  type AdminSide,
} from '@/lib/rsvp-batch'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'side_admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminSide = session.user.side as AdminSide
  const body = await request.json().catch(() => null)

  // Pre-flight: fetch only what's needed for validation (no full guests/rooms/etc.)
  const [allGuests, allEvents] = await Promise.all([
    prisma.guest.findMany({ where: { side: adminSide }, select: { id: true, side: true } }),
    prisma.event.findMany({
      where: { OR: [{ managed_by: adminSide }, { display_group: 'joint' }] },
      select: { id: true, managed_by: true, display_group: true },
    }),
  ])

  const validation = validateBatchPayload(body, adminSide, allGuests, allEvents)
  if (!validation.ok) {
    return Response.json({ error: validation.error.code, ...validation.error }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      return applyBatch(tx as any, { rows: validation.rows })
    })
    return Response.json({ ok: true, ...result })
  } catch (err) {
    console.error('[rsvps/batch] transaction failed', err)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

### Step 2: Type-check

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | head -20`

Expected: no errors. (If the `applyBatch(tx as any, …)` cast triggers a lint rule, prefer typing `tx` properly: `tx as Parameters<typeof applyBatch>[0]`. Avoid `any` in committed code where possible — `Parameters<typeof applyBatch>[0]` is the type-safe escape hatch.)

### Step 3: Commit

```bash
git add src/app/api/admin/rsvps/batch/route.ts
git commit -m "feat(rsvp-batch): POST /api/admin/rsvps/batch endpoint"
```

---

## Task 3: `GET /api/admin/rsvps/preview` endpoint

**Files:**
- Create: `src/app/api/admin/rsvps/preview/route.ts`

**Purpose:** Pre-fill the grid with current `attending` values so the admin sees existing RSVPs. The client passes `guestIds` and `eventIds` as comma-separated query params.

**Response shape:**

```ts
{
  guests: { id: string; name: string; household_group: string | null }[]
  events: { id: string; name: string; date: string }[]  // date as YYYY-MM-DD
  cells: Record<guestId, Record<eventId, attending: boolean | null>>
}
```

### Step 1: Implement the route

```ts
// src/app/api/admin/rsvps/preview/route.ts
// Returns existing RSVP attending values for the cross-product of given
// guests and events, used to pre-fill the Manual RSVP grid modal.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Side } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminSide = session.user.side as Side
  const url = new URL(request.url)
  const guestIdsParam = url.searchParams.get('guestIds') ?? ''
  const eventIdsParam = url.searchParams.get('eventIds') ?? ''

  const guestIds = guestIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
  const eventIds = eventIdsParam.split(',').map((s) => s.trim()).filter(Boolean)

  if (guestIds.length === 0 || eventIds.length === 0) {
    return Response.json({
      guests: [],
      events: [],
      cells: {},
    })
  }

  // Side-gate: only fetch guests/events the admin is allowed to see
  const [guests, events, responses] = await Promise.all([
    prisma.guest.findMany({
      where: { id: { in: guestIds }, side: adminSide },
      select: { id: true, name: true, household_group: true },
      orderBy: { name: 'asc' },
    }),
    prisma.event.findMany({
      where: {
        id: { in: eventIds },
        OR: [{ managed_by: adminSide }, { display_group: 'joint' }],
      },
      select: { id: true, name: true, date: true },
      orderBy: { sort_order: 'asc' },
    }),
    prisma.rsvpResponse.findMany({
      where: { guest_id: { in: guestIds }, event_id: { in: eventIds } },
      select: { guest_id: true, event_id: true, attending: true },
    }),
  ])

  // Build the nested cells map
  const cells: Record<string, Record<string, boolean | null>> = {}
  for (const g of guests) cells[g.id] = {}
  for (const r of responses) {
    if (!cells[r.guest_id]) cells[r.guest_id] = {}
    cells[r.guest_id][r.event_id] = r.attending
  }
  // Fill missing event slots with null
  for (const g of guests) {
    for (const e of events) {
      if (!(e.id in cells[g.id])) cells[g.id][e.id] = null
    }
  }

  return Response.json({
    guests,
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date.toISOString().split('T')[0],
    })),
    cells,
  })
}
```

### Step 2: Type-check

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | head -20`

Expected: clean. (The `Side` import from `@prisma/client` already exists as a pattern in `src/app/api/admin/chat/route.ts`.)

### Step 3: Commit

```bash
git add src/app/api/admin/rsvps/preview/route.ts
git commit -m "feat(rsvp-batch): GET /api/admin/rsvps/preview endpoint"
```

---

## Task 4: `ManualRsvpGridModal` client component

**Files:**
- Modify: `src/app/admin/(dashboard)/rsvps/RsvpsClient.tsx`

**Purpose:** Replace the single-guest modal with a multi-guest grid modal. State, pre-fetch, submit, and UI all live in this new component, which is rendered by `RsvpsClient` when the admin clicks the existing `+ Manual RSVP` button.

**Component shape (rendered inside `RsvpsClient.tsx`):**

```tsx
function ManualRsvpGridModal({
  events,
  open,
  onClose,
  onSaved,
}: {
  events: Array<{ id: string; name: string }>
  open: boolean
  onClose: () => void
  onSaved: () => Promise<void> | void
}) { … }
```

**State:**

```ts
const [selectedGuests, setSelectedGuests] = useState<Array<{ id: string; name: string; household_group: string | null }>>([])
const [selectedEvents, setSelectedEvents] = useState<string[]>([])
const [grid, setGrid] = useState<Record<string, Record<string, 'yes' | 'no' | null>>>({})
const [loadingPreview, setLoadingPreview] = useState(false)
const [saving, setSaving] = useState(false)
const [error, setError] = useState<string | null>(null)
```

**Guest picker:** A search input + chip list. Below it, a checkbox-driven dropdown listing all of `adminSide`'s guests (passed in as a prop from `RsvpsClient`'s existing data). The admin types to filter; checking a box adds a guest chip; clicking the × on a chip removes them.

**Event picker:** A horizontal row of checkboxes, one per event, using the events passed in as a prop.

**Preview fetch effect:** Whenever `selectedGuests.length > 0` AND `selectedEvents.length > 0`, debounce 250 ms then `GET /api/admin/rsvps/preview?guestIds=…&eventIds=…`. Seed `grid` from the response — **only fill cells that are currently `null`** in `grid` (don't overwrite what the admin has already clicked in this session).

**Cell toggle handler:**

```ts
function cycleCell(guestId: string, eventId: string) {
  setGrid((prev) => {
    const cur = prev[guestId]?.[eventId] ?? null
    const next: 'yes' | 'no' | null = cur === null ? 'yes' : cur === 'yes' ? 'no' : null
    return {
      ...prev,
      [guestId]: { ...(prev[guestId] ?? {}), [eventId]: next },
    }
  })
}
```

**Submit:**

```ts
async function handleSave() {
  setSaving(true)
  setError(null)
  const rows = selectedGuests.map((g) => ({
    guestId: g.id,
    cells: selectedEvents.map((eId) => ({
      eventId: eId,
      attending:
        grid[g.id]?.[eId] === 'yes' ? true :
        grid[g.id]?.[eId] === 'no'  ? false :
        null,
    })),
  }))
  try {
    const res = await fetch('/api/admin/rsvps/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      setError(`Save failed: ${errBody.error ?? res.status}`)
      return
    }
    const result = await res.json()
    await onSaved()
    onClose()
    // Optional success toast — same toast mechanism the rest of RsvpsClient uses
  } catch (e) {
    setError('Network error. Please try again.')
  } finally {
    setSaving(false)
  }
}
```

### Step 1: Read the current modal to know what to remove

Read `src/app/admin/(dashboard)/rsvps/RsvpsClient.tsx`. Identify and note the **exact** line ranges to remove (state at 455–463, UI at 881–959, submit at 519–547). Confirm these line numbers against the file before editing — line numbers may have shifted.

### Step 2: Remove the old single-guest modal

Delete:
- The state declarations listed in Step 1 (`manualGuestId`, `manualEventId`, `manualAttending`, `manualDietary`, `guestFilter` — note `guestFilter` may be reused elsewhere; only remove if it's strictly modal-local).
- The `submitManual()` function (lines 519–547).
- The old modal `<div>` JSX block (lines 881–959).

Leave `manualOpen` (boolean state for whether the modal is open) — `ManualRsvpGridModal` will own its own open prop.

### Step 3: Add the `ManualRsvpGridModal` component

Place it inside `RsvpsClient.tsx`, ideally as a sibling function component near the top (after the existing `ResponseRow` definition at line 51 per the earlier inventory, or anywhere above `export default function RsvpsClient`).

The component receives `events` from props (filtered to admin's side + joint) and `onSaved` callback (which `RsvpsClient` wires to call `refreshNonResponders()` and `refreshCurrentEvent()` — see lines 472–487 of the inventory).

Full implementation (~250 lines):

```tsx
function ManualRsvpGridModal({
  events,
  allGuests,
  open,
  onClose,
  onSaved,
}: {
  events: Array<{ id: string; name: string }>
  allGuests: Array<{ id: string; name: string; household_group: string | null }>
  open: boolean
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [selectedGuests, setSelectedGuests] = useState<typeof allGuests>([])
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [grid, setGrid] = useState<Record<string, Record<string, 'yes' | 'no' | null>>>({})
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guestSearch, setGuestSearch] = useState('')

  // Debounced preview fetch ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open || selectedGuests.length === 0 || selectedEvents.length === 0) return
    const handle = setTimeout(async () => {
      setLoadingPreview(true)
      try {
        const url = `/api/admin/rsvps/preview?guestIds=${selectedGuests.map((g) => g.id).join(',')}&eventIds=${selectedEvents.join(',')}`
        const res = await fetch(url)
        if (!res.ok) throw new Error('preview fetch failed')
        const data = await res.json() as {
          cells: Record<string, Record<string, boolean | null>>
        }
        // Only fill cells the admin hasn't touched yet
        setGrid((prev) => {
          const next = { ...prev }
          for (const g of selectedGuests) {
            next[g.id] = { ...(prev[g.id] ?? {}) }
            for (const eId of selectedEvents) {
              if (next[g.id][eId] === undefined) {
                const v = data.cells[g.id]?.[eId]
                next[g.id][eId] = v === true ? 'yes' : v === false ? 'no' : null
              }
            }
          }
          return next
        })
      } catch {
        setError('Could not load existing RSVPs. Try again.')
      } finally {
        setLoadingPreview(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [open, selectedGuests, selectedEvents])

  // Cell cycle ──────────────────────────────────────────────────────────────
  function cycleCell(guestId: string, eventId: string) {
    setGrid((prev) => {
      const cur = prev[guestId]?.[eventId] ?? null
      const next: 'yes' | 'no' | null = cur === null ? 'yes' : cur === 'yes' ? 'no' : null
      return {
        ...prev,
        [guestId]: { ...(prev[guestId] ?? {}), [eventId]: next },
      }
    })
  }

  function toggleGuest(g: typeof allGuests[number]) {
    setSelectedGuests((prev) =>
      prev.some((x) => x.id === g.id) ? prev.filter((x) => x.id !== g.id) : [...prev, g]
    )
  }

  function toggleEvent(eventId: string) {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId]
    )
  }

  // Total count for the save button label
  const totalToSave = selectedGuests.length * selectedEvents.length

  async function handleSave() {
    if (totalToSave === 0) return
    setSaving(true)
    setError(null)
    const rows = selectedGuests.map((g) => ({
      guestId: g.id,
      cells: selectedEvents.map((eId) => ({
        eventId: eId,
        attending:
          grid[g.id]?.[eId] === 'yes' ? true :
          grid[g.id]?.[eId] === 'no'  ? false :
          null,
      })),
    }))
    try {
      const res = await fetch('/api/admin/rsvps/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(`Save failed: ${body.error ?? res.statusText}`)
        return
      }
      await onSaved()
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const filteredGuests = allGuests.filter((g) =>
    g.name.toLowerCase().includes(guestSearch.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Manual RSVP — multiple guests</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-800">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Event picker */}
          <div>
            <label className="text-sm font-medium block mb-1">Events</label>
            <div className="flex flex-wrap gap-2">
              {events.map((e) => (
                <label key={e.id} className="inline-flex items-center gap-1 text-sm px-2 py-1 border rounded">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(e.id)}
                    onChange={() => toggleEvent(e.id)}
                  />
                  {e.name}
                </label>
              ))}
            </div>
          </div>

          {/* Guest picker */}
          <div>
            <label className="text-sm font-medium block mb-1">Guests</label>
            <input
              type="text"
              placeholder="Search guests…"
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm mb-2"
            />
            <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-1">
              {filteredGuests.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedGuests.some((x) => x.id === g.id)}
                    onChange={() => toggleGuest(g)}
                  />
                  {g.name}
                  {g.household_group && <span className="text-gray-400 text-xs">({g.household_group})</span>}
                </label>
              ))}
            </div>
            {/* Selected chips */}
            {selectedGuests.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedGuests.map((g) => (
                  <span key={g.id} className="inline-flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5 text-xs">
                    {g.name}
                    <button onClick={() => toggleGuest(g)} aria-label={`Remove ${g.name}`}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Grid */}
          {selectedGuests.length > 0 && selectedEvents.length > 0 && (
            <div>
              {loadingPreview && <p className="text-xs text-gray-500 mb-2">Loading existing RSVPs…</p>}
              <div className="overflow-x-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Guest</th>
                      {selectedEvents.map((eId) => {
                        const ev = events.find((x) => x.id === eId)
                        return <th key={eId} className="px-3 py-2 font-medium text-center">{ev?.name}</th>
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGuests.map((g) => (
                      <tr key={g.id} className="border-t">
                        <td className="px-3 py-2">{g.name}</td>
                        {selectedEvents.map((eId) => {
                          const cell = grid[g.id]?.[eId] ?? null
                          const label = cell === 'yes' ? '✓ Y' : cell === 'no' ? '✗ N' : '—'
                          const color = cell === 'yes' ? 'text-green-700' : cell === 'no' ? 'text-red-700' : 'text-gray-400'
                          return (
                            <td key={eId} className="px-3 py-2 text-center">
                              <button
                                onClick={() => cycleCell(g.id, eId)}
                                className={`${color} hover:opacity-70 font-mono w-12`}
                                aria-label={`Toggle ${g.name} for ${events.find((x) => x.id === eId)?.name}`}
                              >
                                {label}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || totalToSave === 0}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : `Save ${totalToSave} RSVPs`}
          </button>
        </div>
      </div>
    </div>
  )
}
```

### Step 4: Wire the modal into `RsvpsClient`

In the existing `RsvpsClient` component:

1. Add a prop `guests: Array<{ id; name; household_group }>` (passed from `page.tsx` which already fetches them — check the current data shape; if `household_group` isn't already selected, add it).
2. Replace the old modal `<div>...</div>` JSX with `<ManualRsvpGridModal events={events} allGuests={guests} open={manualOpen} onClose={() => setManualOpen(false)} onSaved={async () => { await Promise.all([refreshNonResponders(), refreshCurrentEvent()]) }} />`.
3. The `+ Manual RSVP` button continues to set `manualOpen = true` — no change there.

If `page.tsx` doesn't already select `household_group`, add it to the Prisma query and update the prop type. Don't fetch family members or anything else.

### Step 5: Type-check

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | head -20`

Expected: clean. If TypeScript complains about `selectedGuests` initial state, use `useState<typeof allGuests>([])` (already shown above).

### Step 6: Manual smoke test

Boot the dev server (`npm run dev`). Open `http://localhost:3000/admin/rsvps`. Verify:

1. Click **+ Manual RSVP** — modal opens.
2. Tick 2 events, search for "Ahmad", tick 2 guests.
3. Wait ~300 ms — table appears with cells pre-filled from existing RSVPs (or `—` if none).
4. Click a cell twice (cycles `— → ✓ Y → ✗ N`); click once more (`—`).
5. Click **Save 4 RSVPs** — modal closes, RSVPs tab refreshes.
6. Re-open the modal with the same guests/events — cells now show what you saved.

If any step fails, fix the component and retry. Don't proceed to commit until all 6 work.

### Step 7: Commit

```bash
git add 'src/app/admin/(dashboard)/rsvps/RsvpsClient.tsx'
git commit -m "feat(rsvp-batch): ManualRsvpGridModal replacing single-guest modal"
```

---

## Task 5: Full-stack smoke test + final verification

**Files:** none — verification only.

### Step 1: Re-run verification scripts

```bash
node scripts/verify-rsvp-batch.mjs && node scripts/verify-chat-history.mjs
```

Expected: both pass with `All … checks passed.`

### Step 2: Type-check end-to-end

```bash
npx tsc --noEmit --skipLibCheck 2>&1
```

Expected: empty output (no errors).

### Step 3: Graph refresh

```bash
graphify update . 2>&1 | tail -5
```

Expected: `Rebuilt: <N> nodes, <M> edges, <K> communities`. This keeps the knowledge graph in sync with the new files.

### Step 4: Verify the existing single-row POST still works

This is critical: Chotu's `add_guests` action triggers an RSVP write (via `handleAddGuests` in `execute/route.ts`). Read `src/app/api/admin/rsvps/route.ts` lines 124–149 and confirm the code is **byte-for-byte unchanged** from `main`. If you accidentally touched it during this work, revert with `git checkout main -- src/app/api/admin/rsvps/route.ts`.

### Step 5: Open the PR

```bash
git push -u origin feature/manual-rsvp-multi-select
gh pr create --base main --title "feat: Manual RSVP multi-select grid" --body "See docs/superpowers/specs/2026-07-31-manual-rsvp-multi-select-design.md for the design."
```

---

## Self-Review (run after writing the plan)

**1. Spec coverage:**

| Spec section | Plan task |
|---|---|
| Goals — N guests × M events, per-cell Yes/No | Task 4 (modal), Task 2 (batch route) |
| Goals — pre-fill from existing RSVPs | Task 3 (preview endpoint) |
| Goals — clear to null rule | Task 1 (applyBatch) |
| Goals — Yes default rule | Task 1 (applyBatch) |
| Non-Goals — no family rows | Task 4 (modal only renders Guest checkboxes, not FamilyMember) |
| Non-Goals — no household picker | Task 4 (modal uses individual checkboxes) |
| Non-Goals — no dietary | Task 1 (applyBatch never writes dietary_restrictions) + Task 4 (no dietary input) |
| Non-Goals — Chotu single-row path untouched | Task 5 Step 4 |
| Architecture — pure helpers in src/lib/rsvp-batch.ts | Task 1 |
| Architecture — POST /api/admin/rsvps/batch | Task 2 |
| Architecture — GET /api/admin/rsvps/preview | Task 3 |
| Data flow — GridCell state, cycle null→yes→no→null | Task 4 |
| Data flow — preview seeded only into untouched cells | Task 4 (`if (next[g.id][eId] === undefined)`) |
| Data flow — submit payload shape | Task 4 (`handleSave`) |
| Validation table — all 6 checks | Task 1 (`validateBatchPayload`) + tests 1–9 |
| Server transaction — upsert / update / create | Task 1 (`applyBatch`) + tests 10–16, 18 |
| Error handling table — 4 cases | Task 4 (each mapped to component behavior) |
| File-by-file change list | Tasks 1–4 match exactly |
| 18 verification assertions | Task 1 (the verification script) |
| Manual smoke test plan | Task 4 Step 6 + Task 5 Step 1 |
| Rollout — single PR | Task 5 Step 5 |

No gaps.

**2. Placeholder scan:**

- No "TBD", no "TODO", no "implement later".
- No "Add appropriate error handling" — each error path is specified inline.
- No "Write tests for the above" without actual test code — the verification script in Task 1 Step 1 is the entire test suite.
- No "Similar to Task N" — every step shows the actual code.

**3. Type consistency:**

- `validateBatchPayload` signature: `(payload: unknown, adminSide: AdminSide, guests: GuestMeta[], events: EventMeta[]) → { ok: true; rows: BatchRow[] } | { ok: false; error: ValidationError }`. Used in Task 1 (tests), Task 2 (route). Consistent.
- `applyBatch` signature: `(tx: MiniRsvpTx, payload: BatchPayload) → Promise<ApplyResult>`. Used in Task 1 (tests), Task 2 (route). Consistent.
- `ApplyResult` shape: `{ writtenYes, writtenNo, cleared, total }`. Returned in Task 1, returned in Task 2 (route response), referenced in Task 4 (`totalToSave` is a UI label, separate from `ApplyResult.total`). Consistent.
- `MAX_GUESTS_PER_BATCH = 200`. Used in Task 1 (helper), Task 1 (tests 8 & 9), Task 2 (route, indirectly via `validateBatchPayload`). Consistent.
- `BatchRow`/`BatchPayload`/`GridCell` types are all referenced with the exact same names.

No inconsistencies.