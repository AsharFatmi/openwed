# Manual RSVP — Multi-Select Grid Design

**Date:** 2026-07-31
**Status:** Draft (awaiting user review)
**Branch target:** `feature/manual-rsvp-multi-select` off `main`

## Problem

The admin "Manual RSVP" form (`src/app/admin/(dashboard)/rsvps/RsvpsClient.tsx`) currently lets an admin record exactly **one guest × one event** RSVP per submission. Recording RSVPs for an entire household — say, 6 guests × 4 events — takes 24 separate saves. The form is at the heart of the admin's daily workflow.

The Prisma schema already supports what we need: `RsvpResponse` has a `@@unique([guest_id, event_id])` index, so any number of pairs can be upserted atomically. What is missing is a UI and an API path that lets the admin submit many pairs in one go.

## Goals

- One save = N guests × M events, with a per-cell Yes/No decision.
- Existing RSVPs are pre-filled in the grid so the admin sees the current state.
- Blank cells are meaningful: when the admin explicitly clears a cell to `null` and a prior RSVP exists, that prior RSVP is cleared back to `attending: null`.
- For a guest × event pair with **no prior RSVP**, a cell the admin leaves untouched defaults to **Yes** on save (so "this whole household is in for everything" is the default-friendly action).

## Non-Goals (out of scope for this change)

- Family-member rows (`FamilyMemberRsvp`). The public `/rsvp` flow continues to handle those.
- Household picker / auto-fill from `Guest.household_group`. The user picks guests individually.
- Dietary restrictions in the manual flow. This batch path never writes `dietary_restrictions`; any prior value is preserved.
- Changes to Chotu's single-row RSVP path.

## Approach

A new `POST /api/admin/rsvps/batch` endpoint accepts a flat list of `(guestId, eventId, attending: boolean | null)` pairs, validates them, and runs a single Prisma transaction. The existing single-row `POST /api/admin/rsvps` stays untouched (Chotu and any other callers keep using it). A small `GET /api/admin/rsvps/preview` endpoint serves existing RSVPs so the grid can pre-fill when the modal opens.

The schema is **unchanged** — the composite unique index already supports the upserts we need.

## Architecture

Three units, each independently understandable:

1. **`src/lib/rsvp-batch.ts`** — pure helpers used by both the batch route and the verification script. No Prisma, no React. Exports `validateBatchPayload(rows, adminSide, guests, events)` and `flattenToCells(grid)`. Easy to unit-test.
2. **`POST /api/admin/rsvps/batch`** — server endpoint. Auth + pre-flight validation + Prisma transaction. Uses `flattenToCells` for the validation step, then issues `upsert` / `update` calls inside `prisma.$transaction`.
3. **`ManualRsvpGridModal`** (client component inside `RsvpsClient.tsx`) — the grid UI. Renders event checkboxes, a multi-select guest picker, a per-cell toggle, and a Save button.

A small `flattenToCells()` helper lives in `src/lib/rsvp-batch.ts` and is used by both the route (for the validation pass) and the client (for shaping the submit payload). The Prisma transaction itself is implemented inline in the route — there's no shared helper across single-row and batch paths, because the batch path's logic is meaningfully different (it handles the Yes-default rule and the clear-to-null rule in one pass).

## Data flow

### State in the modal

```ts
type GridCell = { attending: 'yes' | 'no' | null }
type GridState = Record<guestId, Record<eventId, GridCell>>

const [gridSelectedGuestIds, setGridSelectedGuestIds] = useState<string[]>([])
const [gridSelectedEventIds, setGridSelectedEventIds] = useState<string[]>([])
const [grid, setGrid] = useState<GridState>({})
```

Cell toggle cycles `null → 'yes' → 'no' → null`. Three end states match the three write actions: write Yes, write No, or clear.

### Preview fetch

When the modal opens and the admin has picked ≥ 1 guest and ≥ 1 event, the client calls:

```
GET /api/admin/rsvps/preview?guestIds=g1,g2,g3&eventIds=e1,e2,e3
```

Response:

```ts
{
  guests: { id: string; name: string; household_group: string | null }[],
  events: { id: string; name: string; date: string }[],
  cells: Record<guestId, Record<eventId, attending: boolean | null>>
}
```

`attending` is `null` when no `RsvpResponse` row exists for that pair; `true` or `false` when one does. The grid seeds itself from `cells`. The request is debounced 250 ms and cached by `(sortedGuestIds, sortedEventIds)` for the lifetime of the modal.

### Submit payload

```ts
{
  rows: Array<{
    guestId: string
    cells: Array<{ eventId: string; attending: boolean | null }>
  }>
}
```

For every `(guest, event)` pair in the current grid selection (regardless of whether the admin clicked the cell), the client sends one entry: `attending: 'yes' | 'no'` if the cell was clicked, `attending: null` if the cell was untouched. This is how the "Yes default" rule is implemented — the client sends the blanks, and the server decides what to do with them based on prior state.

### Server-side rule (the "Yes default" + "clear to null")

For every `(guestId, eventId)` pair in the request:

| Admin sent `attending` | Prior RSVP exists? | Result |
|---|---|---|
| `true` | — | Upsert with `attending: true`, **preserve** existing `dietary_restrictions` |
| `false` | — | Upsert with `attending: false`, **preserve** existing `dietary_restrictions` |
| `null` | yes | Update only `attending: null`, preserve `dietary_restrictions` |
| `null` | no | **Create** with `attending: true` (the "Yes default" rule) |

This pair-rule produces three observable count buckets:

```ts
{ ok: true, writtenYes: number, writtenNo: number, cleared: number, total: number }
```

where `total = writtenYes + writtenNo + cleared`. Every pair the client sent maps to exactly one bucket.

## Validation

All validation runs **before** the transaction starts. A failed validation returns 400 with no partial writes:

| Check | Error code | HTTP |
|---|---|---|
| `rows` is array, non-empty | `rows_required` | 400 |
| Every `guestId` belongs to admin's `side` | `invalid_guest:<id>` | 400 |
| Every `eventId` is `managed_by === side` OR `display_group === 'joint'` | `invalid_event:<id>` | 400 |
| `cells[].attending` is `boolean \| null` | `invalid_attending` | 400 |
| ≥ 1 event selected | `events_required` | 400 |
| ≤ 200 guests selected | `too_many_guests` | 400 |

Side-gating happens before the transaction so a single cross-side guest never gets near a write.

## Server transaction

```ts
await prisma.$transaction(async (tx) => {
  for (const row of payload.rows) {
    for (const cell of row.cells) {
      const existing = await tx.rsvpResponse.findUnique({
        where: { guest_id_event_id: { guest_id: row.guestId, event_id: cell.eventId } },
      })

      if (cell.attending === null) {
        if (existing) {
          await tx.rsvpResponse.update({
            where: { guest_id_event_id: { guest_id: row.guestId, event_id: cell.eventId } },
            data: { attending: null }, // keep dietary_restrictions
          })
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
        where:  { guest_id_event_id: { guest_id: row.guestId, event_id: cell.eventId } },
        create: { guest_id: row.guestId, event_id: cell.eventId, attending: cell.attending },
        update: { attending: cell.attending }, // never touches dietary_restrictions
      })

      if (cell.attending) writtenYes++
      else                writtenNo++
    }
  }
})
```

Any throw inside the transaction rolls the whole batch back; the admin sees a single 500 with retry advice.

## Error handling & UX

| Situation | UX |
|---|---|
| Network failure on preview | Inline "Could not load existing RSVPs. Try again?" with a retry button; grid stays empty |
| 400 from batch (validation) | Toast with the error code; grid stays open, no rows lost |
| 500 from batch (DB) | Modal closes after confirm: "Save failed. Retry?" with the payload preserved in component state |
| Successful save | Existing `refreshNonResponders()` and `refreshCurrentEvent()` run once; success toast shows `writtenYes + writtenNo + cleared` count |

Save button is disabled until ≥ 1 guest AND ≥ 1 event are picked. The label is dynamic: `Save 14 RSVPs`.

## File-by-file change list

**NEW files (4):**

| File | Purpose | Approx. lines |
|---|---|---|
| `src/lib/rsvp-batch.ts` | Pure validation + flattening helpers | ~80 |
| `src/app/api/admin/rsvps/batch/route.ts` | `POST` batch endpoint | ~110 |
| `src/app/api/admin/rsvps/preview/route.ts` | `GET` preview endpoint | ~50 |
| `scripts/verify-rsvp-batch.mjs` | 18 assertions, mock-Prisma | ~150 |

**MODIFIED files (2):**

| File | Change |
|---|---|
| `src/app/admin/(dashboard)/rsvps/RsvpsClient.tsx` | Replace single-guest modal (state at 455–463, UI at 881–959, submit at 519–547) with `ManualRsvpGridModal` |
| `src/app/api/admin/rsvps/route.ts` | No behavioral change; the inline upsert stays in place. Single-row path is untouched. |

**UNCHANGED (explicit):**

- `prisma/schema.prisma`
- `src/app/api/admin/rsvps/[responseId]/route.ts`
- `src/app/api/admin/rsvps/non-responders/route.ts`
- `src/app/api/admin/chat/route.ts` (Chotu)

## Testing

`scripts/verify-rsvp-batch.mjs` exercises the validation, default-cell, and clear-to-null logic. Same convention as `scripts/verify-chat-history.mjs` — no test framework, just behavior checks. 18 assertions:

1. Empty `rows` → `rows_required`
2. Guest from wrong side → `invalid_guest:<id>`
3. Event `managed_by !== side` and not joint → `invalid_event:<id>`
4. Event `display_group === 'joint'` → accepted
5. `attending` missing → `invalid_attending`
6. `attending` is string `"true"` → `invalid_attending`
7. 0 events selected → `events_required`
8. 201 guests selected → `too_many_guests`
9. 200 guests selected → accepted
10. `attending: null`, no prior RSVP → row created with `attending: true` (Yes-default rule)
11. `attending: null`, prior RSVP `{ attending: true }` → cleared, dietary_restrictions untouched
12. `attending: true`, no prior RSVP → row created with `attending: true`
13. `attending: false`, prior RSVP `{ attending: true }` → updated to `attending: false`, dietary_restrictions untouched
14. `attending: true` (explicit Yes), prior RSVP `{ attending: false }` → updated to `attending: true`, dietary_restrictions untouched
15. Mixed batch → counts add up exactly
16. Transaction rollback on mid-batch error → no rows persisted
17. Side-leak attempt → 400 before any DB write
18. `dietary_restrictions` preserved across admin writes (true, false, null)

Tests 1–9 and 17 are pure validation; 10–16 and 18 use a small mocked Prisma (the script defines a `findUnique` / `upsert` / `update` / `create` stub).

## Manual smoke test plan

1. Pick 2 guests × 2 events, mark all 4 cells Yes, save → reload the RSVPs tab → confirm 4 rows with `attending: true`.
2. Re-open modal with the same guests × events → confirm pre-fill shows Yes for all 4 cells (the `RsvpResponse` rows have `attending: true`).
3. Clear one cell to `null`, save → confirm the row still exists with `attending: null`, `dietary_restrictions` from any prior public RSVP preserved.
4. Pick a 3rd guest, leave all its cells blank, save → confirm a new Yes row appears (Yes-default rule).
5. Try the picker for guests from the other side → picker only shows own-side guests; the API rejects any cross-side guest with 400 even if the picker is bypassed.

## Rollout

- Single PR, single branch off `main`. No data migration; no schema backfill.
- Single-row path stays working throughout — no flag-gating needed.
- After deploy, the **+ Manual RSVP** button opens the new grid modal.