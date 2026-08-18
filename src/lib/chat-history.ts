import type { UIMessage } from '@ai-sdk/react'

/**
 * Maximum number of messages sent to the chat API in a single request.
 *
 * `useChat` (default transport) resends the FULL conversation history on every
 * POST. For Chotu, the system prompt + a long history can exceed Groq's
 * 12,000 TPM on-demand cap, causing HTTP 413 Request Too Large.
 *
 * Public uses 10 messages (≈5 turns) — the system prompt already includes
 * full event/hotel data, so each question is largely stateless. Admin uses 3
 * for the same reason (system prompt carries full DB state).
 *
 * Tune via the *_HISTORY_MESSAGES constants if needed.
 */
export const MAX_PUBLIC_HISTORY_MESSAGES = 10
export const MAX_ADMIN_HISTORY_MESSAGES = 3

/** @deprecated Use MAX_PUBLIC_HISTORY_MESSAGES instead. */
export const MAX_HISTORY_MESSAGES = MAX_PUBLIC_HISTORY_MESSAGES

/**
 * Trim a client-side `useChat` message array so it stays small enough to
 * fit within Groq's per-minute token cap. Always preserves the final user
 * message (the current turn's question) and any messages that aren't user
 * or assistant (e.g. system-tool messages).
 *
 * Returns a new array; never mutates the input.
 */
export function trimMessagesForRequest(
  messages: readonly UIMessage[],
  maxMessages: number = MAX_PUBLIC_HISTORY_MESSAGES
): UIMessage[] {
  if (messages.length <= maxMessages) return messages.slice()

  const tail = messages.slice(-maxMessages)
  const lastUserIndex = (() => {
    for (let i = tail.length - 1; i >= 0; i--) {
      if (tail[i].role === 'user') return i
    }
    return -1
  })()

  // Defensive: if for some reason the tail contains no user message, widen the
  // window so we always send whatever the user just asked.
  if (lastUserIndex === -1) {
    return messages.slice(-(maxMessages + 5))
  }

  return tail
}
