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

type RsvpWhere = { guest_id_event_id: { guest_id: string; event_id: string } }

export interface MiniRsvpTx {
  rsvpResponse: {
    // Args are typed to the exact shapes applyBatch passes, so typos at the
    // call sites (e.g. `guestId` instead of `guest_id`, a missing
    // `dietary_restrictions`) are caught at compile time. Prisma's generated
    // arg types are wider, so its `tx` is still assignable through the
    // `as unknown as MiniRsvpTx` cast at the route boundary. Runtime behavior
    // is verified by scripts/verify-rsvp-batch.mjs (18 assertions).
    findUnique: (args: {
      where: RsvpWhere;
      [k: string]: unknown;
    }) => Promise<{ attending: boolean | null; dietary_restrictions: string | null } | null>
    upsert: (args: {
      where: RsvpWhere
      create: { guest_id: string; event_id: string; attending: boolean; dietary_restrictions: string | null }
      update: { attending: boolean }
    }) => Promise<unknown>
    update: (args: { where: RsvpWhere; data: { attending: boolean | null } }) => Promise<unknown>
    create: (args: { data: { guest_id: string; event_id: string; attending: boolean; dietary_restrictions: string | null } }) => Promise<unknown>
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
            data: {
              guest_id: row.guestId,
              event_id: cell.eventId,
              attending: true,
              dietary_restrictions: null, // explicit: a default-null column
            },
          })
          writtenYes++
        }
        continue
      }

      await tx.rsvpResponse.upsert({
        where,
        create: {
          guest_id: row.guestId,
          event_id: cell.eventId,
          attending: cell.attending,
          dietary_restrictions: null, // explicit: new row, default-null column
        },
        // update never touches dietary_restrictions — manual flow preserves prior value
        update: { attending: cell.attending },
      })
      if (cell.attending) writtenYes++
      else writtenNo++
    }
  }

  return { writtenYes, writtenNo, cleared, total: writtenYes + writtenNo + cleared }
}
