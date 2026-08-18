export type Ref = { type: 'guest' | 'family_member'; id: string }
export type PersonRecord = {
  ref: Ref
  name: string
  parentGuestId?: string | null
  householdGroup?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  isChild?: boolean
}
export type Candidate = { a: PersonRecord; b: PersonRecord; confidence: number }

export type RecordDetail = {
  ref: Ref
  name: string
  type: 'guest' | 'family_member'
  parentGuestName: string | null
  householdGroup: string | null
  email: string | null
  phone: string | null
  address: string | null
  isChild: boolean
  rsvps: { event_id: string; attending: boolean | null; dietary: string | null }[]
  invitedEventIds: string[]
  roomId: string | null
  linkState: 'valid' | 'dead'
}

export type DuplicateDetail = { a: RecordDetail; b: RecordDetail; confidence: number }

const TITLES = /\b(mr|mrs|ms|miss|dr|mohd|md|shri|smt|ku?mari)\b\.?/gi

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(TITLES, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n; if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1
  const max = Math.max(a.length, b.length)
  if (max === 0) return 1
  return 1 - levenshtein(a, b) / max
}

export function pairConfidence(aName: string, bName: string): number {
  const a = normalizeName(aName), b = normalizeName(bName)
  if (!a || !b) return 0
  if (a === b) return 1
  const at = a.split(' '), bt = b.split(' ')
  const aLast = at[at.length - 1], bLast = bt[bt.length - 1]
  const aFirst = at[0], bFirst = bt[0]
  let conf = similarity(a, b)
  if (aLast && bLast && aLast === bLast) {
    conf = Math.max(conf, 0.5 + 0.5 * similarity(aFirst, bFirst))
  }
  return conf
}

// Confidence thresholds shared by admin duplicate detection and RSVP-time
// duplicate prevention. Show a fuzzy match as a "similar" suggestion at/above
// FUZZY_THRESHOLD; require an explicit "create anyway?" before adding a new
// family member that looks like an existing guest at/above HIGH_CONFIDENCE.
// Calibrated so "Daniya"/"Dania" (≈0.92) trips the create guard, while
// same-last-name different-first pairs like "Sana"/"Sara Khan" (≈0.89) surface
// as suggestions but do NOT force the guard.
export const FUZZY_THRESHOLD = 0.8
export const HIGH_CONFIDENCE = 0.9

export function findCandidates(people: PersonRecord[], threshold = 0.8): Candidate[] {
  const out: Candidate[] = []
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const c = pairConfidence(people[i].name, people[j].name)
      if (c >= threshold) out.push({ a: people[i], b: people[j], confidence: c })
    }
  }
  return out.sort((x, y) => y.confidence - x.confidence)
}