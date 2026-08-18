// Verification script for src/lib/duplicate-match.ts.
// Run with: node scripts/verify-duplicate-match.mjs
// Same convention as scripts/verify-rsvp-batch.mjs.

import {
  normalizeName,
  pairConfidence,
  findCandidates,
} from '../src/lib/duplicate-match.ts'

let failures = 0
function expect(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`)
  if (!ok) failures++
}

// ── normalizeName ───────────────────────────────────────────────────────────
expect('title strip', normalizeName('Mr. Daniya Saleem'), 'daniya saleem')
expect('case+spaces', normalizeName('  Dania   Saleem '), 'dania saleem')
expect('diacritic', normalizeName('Chloë Núñez'), 'chloe nunez')

// ── pairConfidence ──────────────────────────────────────────────────────────
expect('exact', pairConfidence('Dania Saleem', 'Dania saleem'), 1)
expect('spelling variant', pairConfidence('Daniya Saleem', 'Dania Saleem') >= 0.8, true)
expect('different people', pairConfidence('Sana Khan', 'Ali Rahman') < 0.8, true)

// ── findCandidates ───────────────────────────────────────────────────────────
const people = [
  { ref: { type: 'guest', id: 'g1' }, name: 'Daniya Saleem' },
  { ref: { type: 'family_member', id: 'f1' }, name: 'Dania Saleem', parentGuestId: 'g2' },
  { ref: { type: 'guest', id: 'g3' }, name: 'Ali Rahman' },
]
const cands = findCandidates(people, 0.8)
expect('one candidate', cands.length, 1)
expect('candidate pair', cands[0].a.ref.id === 'g1' || cands[0].b.ref.id === 'g1', true)

console.log(failures === 0 ? '\nAll duplicate-match checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)