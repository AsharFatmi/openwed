// Verification script for the chat-history trim helper.
// Run with: node scripts/verify-chat-history.mjs
// Not a unit test framework — just a quick behavioral sanity check.

import {
  trimMessagesForRequest,
  MAX_PUBLIC_HISTORY_MESSAGES,
  MAX_ADMIN_HISTORY_MESSAGES,
} from '../src/lib/chat-history.ts'

let failures = 0
function expect(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`)
  if (!ok) failures++
}

const makeMsg = (role, id) => ({ id: `m${id}`, role, parts: [{ type: 'text', text: `msg ${id}` }] })

// 1. Empty array
expect('empty input → empty output',
  trimMessagesForRequest([]).length, 0)

// 2. Under the cap — unchanged count, content matches
{
  const small = Array.from({ length: 5 }, (_, i) => makeMsg(i % 2 === 0 ? 'user' : 'assistant', i))
  const out = trimMessagesForRequest(small)
  expect('5 messages unchanged', out.length, 5)
  expect('first id preserved', out[0].id, 'm0')
}

// 3. Over the public cap — keeps last 10
{
  const big = Array.from({ length: 23 }, (_, i) => makeMsg(i % 2 === 0 ? 'user' : 'assistant', i))
  const out = trimMessagesForRequest(big, MAX_PUBLIC_HISTORY_MESSAGES)
  expect('trims to 10 (public)', out.length, MAX_PUBLIC_HISTORY_MESSAGES)
  expect('keeps last 10 starting at m13', out[0].id, 'm13')
  expect('keeps last 10 ending at m22', out[out.length - 1].id, 'm22')
  expect('last user message preserved',
    out[out.length - 1].role === 'user'
      || out[out.length - 2]?.role === 'user',
    true)
}

// 4. Tail has no user — defensive widening by `cap + 5`
{
  const assistantOnly = Array.from({ length: 25 }, (_, i) => makeMsg('assistant', i))
  const out = trimMessagesForRequest(assistantOnly, MAX_PUBLIC_HISTORY_MESSAGES)
  const widened = MAX_PUBLIC_HISTORY_MESSAGES + 5
  expect(`widens to ${widened} when no user in tail`, out.length, widened)
  expect('widened tail keeps the most recent messages', out[out.length - 1].id, 'm24')
}

// 4b. Admin cap — drops to 3, the recent user message is still kept
{
  const big = Array.from({ length: 23 }, (_, i) => makeMsg(i % 2 === 0 ? 'user' : 'assistant', i))
  const out = trimMessagesForRequest(big, MAX_ADMIN_HISTORY_MESSAGES)
  expect('admin trims to 3', out.length, 3)
  expect('admin keeps m20, m21, m22', out.map((m) => m.id), ['m20', 'm21', 'm22'])
  expect('admin drops user message from m22 turns ago', out.find((m) => m.id === 'm0'), undefined)
}

// 5. Realistic 23-message scenario (the original Groq failure) — public cap
{
  const chat = Array.from({ length: 23 }, (_, i) => makeMsg(i % 2 === 0 ? 'user' : 'assistant', i))
  const out = trimMessagesForRequest(chat)
  expect(`23 → ${MAX_PUBLIC_HISTORY_MESSAGES} (public default)`, out.length, MAX_PUBLIC_HISTORY_MESSAGES)
  expect('drops oldest 13 (m0…m12)', out.find((m) => m.id === 'm0'), undefined)
  expect('keeps m13 onward', out[0].id, 'm13')
}

console.log(failures === 0 ? '\nAll chat-history checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
