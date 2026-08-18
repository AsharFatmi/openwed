// Verification script for the RSVP duplicate-prevention thresholds and the
// pairConfidence boundary cases the RSVP flow relies on. The matching logic
// itself lives in src/lib/duplicate-match.ts (shared with the admin duplicate
// tool); this script pins the RSVP-specific assumptions:
//   - "Daniya"/"Dania" is fuzzy AND high-confidence (trips the create guard)
//   - "Sana"/"Sara Khan" is fuzzy but NOT high (suggests, no guard)
//   - different people are not fuzzy
//   - empty inputs return 0
// Run with: node scripts/verify-name-match.mjs
// Same convention as scripts/verify-rsvp-batch.mjs.

import {
  normalizeName,
  pairConfidence,
  FUZZY_THRESHOLD,
  HIGH_CONFIDENCE,
} from '../src/lib/duplicate-match.ts'

let failures = 0
function expect(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`)
  if (!ok) failures++
}

// ── thresholds ──────────────────────────────────────────────────────────────
expect('FUZZY_THRESHOLD is 0.8', FUZZY_THRESHOLD, 0.8)
expect('HIGH_CONFIDENCE is 0.9', HIGH_CONFIDENCE, 0.9)

// ── normalizeName ───────────────────────────────────────────────────────────
expect('title strip', normalizeName('Mr. Daniya Saleem'), 'daniya saleem')
expect('case+spaces', normalizeName('  Dania   Saleem '), 'dania saleem')
expect('diacritic', normalizeName('Chloë Núñez'), 'chloe nunez')
expect('empty', normalizeName(''), '')

// ── pairConfidence ──────────────────────────────────────────────────────────
expect('exact (case-insensitive)', pairConfidence('Dania Saleem', 'Dania saleem'), 1)
expect('spelling variant is fuzzy', pairConfidence('Daniya Saleem', 'Dania Saleem') >= FUZZY_THRESHOLD, true)
expect('spelling variant is high-confidence', pairConfidence('Daniya Saleem', 'Dania Saleem') >= HIGH_CONFIDENCE, true)
expect('different people not fuzzy', pairConfidence('Sana Khan', 'Ali Rahman') < FUZZY_THRESHOLD, true)
expect('same-last-name different-first is fuzzy but not high', pairConfidence('Sana Khan', 'Sara Khan') >= FUZZY_THRESHOLD && pairConfidence('Sana Khan', 'Sara Khan') < HIGH_CONFIDENCE, true)
expect('both empty', pairConfidence('', ''), 0)
expect('one empty', pairConfidence('Dania', ''), 0)

console.log(failures === 0 ? '\nAll name-match checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)