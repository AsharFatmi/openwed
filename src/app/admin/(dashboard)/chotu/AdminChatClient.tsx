'use client'

import { useState, useRef, useEffect, Fragment, useCallback } from 'react'
import { useChat, type UIMessage } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { type Side } from '@prisma/client'
import { trimMessagesForRequest, MAX_ADMIN_HISTORY_MESSAGES } from '@/lib/chat-history'
import ChotuSettingsClient from './ChotuSettingsClient'

// ─── Types ─────────────────────────────────────────────────────────────────────

type ChotuKey =
  | 'chotu_partner1_bio'
  | 'chotu_partner2_bio'
  | 'chotu_contact_name'
  | 'chotu_contact_whatsapp'
  | 'chotu_contact_email'
  | 'chotu_extra_instructions'

type ActionCard = {
  actionType: 'add_guests' | 'add_expense' | 'record_payment' | 'add_vendor' | 'allocate_room'
  preview: string
  payload: object
}

type ActionCardState = 'pending' | 'executing' | 'done' | 'discarded'

type Props = {
  side: Side
  adminName: string
  initialMessages: UIMessage[]
  chotuSettings: Record<ChotuKey, string>
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const SIDE_CONFIG = {
  bride: { accent: '#be185d', accentBg: 'rgba(190,24,93,0.08)', label: 'Bride Side' },
  groom: { accent: '#1d4ed8', accentBg: 'rgba(29,78,216,0.08)', label: 'Groom Side' },
}

const ACTION_LABELS: Record<string, string> = {
  add_guests: 'Add Guests',
  add_expense: 'Add Expense',
  record_payment: 'Record Payment',
  add_vendor: 'Add Vendor',
  allocate_room: 'Allocate Room',
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

type ParsedAction = { cleanText: string; card: ActionCard | null; parseError: string | null }

// Extracts an <!--ACTION_CARD:{...}--> block from the assistant text.
//
// Three cases:
//  1. Complete comment + valid JSON → return the card, strip the comment from
//     the visible text.
//  2. Complete comment + INVALID JSON → strip the raw markup so it never leaks
//     into the chat bubble, and surface a parseError note (plus console.error
//     the raw payload for debugging). Previously this silently returned the
//     whole comment as plain text, which looked like "the card didn't load".
//  3. Unclosed comment (still streaming, or the response was truncated mid-card)
//     → strip the partial `<!--ACTION_CARD:` onward so raw markup doesn't flash
//     while tokens arrive. When the closing `-->` lands on a later render, the
//     complete-comment branch above handles it.
// Invisible Unicode characters some models/tokenizers insert mid-payload.
// They render invisibly in the console (and are dropped on copy-paste) but
// can break JSON.parse. Stripping them is safe: they have no structural
// role in JSON. (The defect we actually hit was a missing trailing brace —
// see closeOpenStructures below — but stripping is cheap insurance.)
const INVISIBLE_CHARS = /[​‌‍﻿­]/g

// The model routinely drops the ACTION_CARD payload's final closing brace(s)
// — it emits `<!--ACTION_CARD:{...}}-->` with one too few `}`, so JSON.parse
// throws "Expected ',' or '}' after property value" at EOF. Rather than fail
// the card, append the minimum closers needed to balance still-open `{`/`[`.
// This is string-literal-aware (skips chars inside JSON strings) and only
// ever ADDS closers — it never alters content — so the repaired JSON is the
// model's intended payload, structurally completed.
function closeOpenStructures(s: string): string {
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}') { if (stack[stack.length - 1] === '{') stack.pop() }
    else if (ch === ']') { if (stack[stack.length - 1] === '[') stack.pop() }
  }
  let out = s
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === '{' ? '}' : ']'
  return out
}

// Guard: only accept a parsed object that looks like a real ActionCard. This
// is the safety gate on the lenient-repair path — if brace-balancing produced
// something with an unknown actionType or missing payload, we still reject.
function isActionCard(c: unknown): c is ActionCard {
  if (typeof c !== 'object' || c === null) return false
  const obj = c as Record<string, unknown>
  return (
    typeof obj.actionType === 'string' &&
    obj.actionType in ACTION_LABELS &&
    typeof obj.payload === 'object' &&
    obj.payload !== null
  )
}

function parseActionCard(text: string): ParsedAction {
  const match = text.match(/<!--ACTION_CARD:([\s\S]+?)-->/)
  if (match) {
    const cleanText = text.replace(match[0], '').trim()
    const sanitized = match[1].replace(INVISIBLE_CHARS, '').trim()

    // 1. Strict parse.
    let card: ActionCard | null = null
    try {
      const parsed = JSON.parse(sanitized)
      if (isActionCard(parsed)) card = parsed
    } catch {
      // 2. Lenient repair: close any unclosed {/[ and retry. Handles the
      //    model's dropped-trailing-brace case.
      const balanced = closeOpenStructures(sanitized)
      if (balanced !== sanitized) {
        try {
          const parsed = JSON.parse(balanced)
          if (isActionCard(parsed)) card = parsed
        } catch {
          /* fall through to error logging */
        }
      }
    }

    if (card) return { cleanText, card, parseError: null }

    console.error(
      '[Chotu] Failed to parse ACTION_CARD payload.',
      '\nLength:',
      match[1].length,
      '\nRaw (stringified):',
      JSON.stringify(match[1]),
    )
    return { cleanText, card: null, parseError: 'Action card failed to parse' }
  }

  const start = text.indexOf('<!--ACTION_CARD:')
  if (start !== -1) {
    return { cleanText: text.slice(0, start).trim(), card: null, parseError: null }
  }
  return { cleanText: text, card: null, parseError: null }
}

function renderText(text: string) {
  return text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={j}>{part.slice(2, -2)}</strong>
        ) : (
          part
        )
      )}
    </Fragment>
  ))
}

function extractText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('')
}

function previewPayload(card: ActionCard): string[] {
  if (card.actionType === 'add_guests') {
    const { guests } = card.payload as { guests?: { name?: string; household_group?: string }[] }
    return (guests ?? []).map((g) => `${g.name ?? '?'} (${g.household_group ?? '?'})`)
  }
  if (card.actionType === 'add_expense') {
    const p = card.payload as { description?: string; amount?: number; status?: string }
    return [`${p.description ?? '?'} — ₹${p.amount ?? 0} (${p.status ?? 'pending'})`]
  }
  if (card.actionType === 'record_payment') {
    const p = card.payload as { amount?: number; due_date?: string; method?: string }
    return [`₹${p.amount ?? 0}${p.due_date ? ` due ${p.due_date}` : ''}${p.method ? ` via ${p.method}` : ''}`]
  }
  if (card.actionType === 'add_vendor') {
    const p = card.payload as { name?: string; category?: string }
    return [`${p.name ?? '?'}${p.category ? ` (${p.category})` : ''}`]
  }
  if (card.actionType === 'allocate_room') {
    const p = card.payload as { check_in?: string; check_out?: string }
    return [`Check-in: ${p.check_in ?? '?'} → Check-out: ${p.check_out ?? '?'}`]
  }
  return []
}

// ─── Action Card Component ──────────────────────────────────────────────────────

function ActionCardUI({
  messageId,
  card,
  cleanText,
  accent,
  onConfirm,
  onDiscard,
  state,
  resultMessage,
}: {
  messageId: string
  card: ActionCard
  cleanText: string
  accent: string
  onConfirm: (messageId: string, card: ActionCard) => void
  onDiscard: (messageId: string) => void
  state: ActionCardState
  resultMessage?: string
}) {
  if (state === 'discarded') return null

  return (
    <div
      className="rounded-lg p-3.5 text-sm"
      style={{ border: `1px solid ${accent}`, background: 'rgba(255,255,255,0.6)' }}
    >
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-base">📋</span>
        <span className="font-semibold" style={{ color: accent }}>
          {ACTION_LABELS[card.actionType] ?? card.actionType}
        </span>
      </div>

      {cleanText && (
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--color-foreground)' }}>
          {renderText(cleanText)}
        </p>
      )}

      {state === 'pending' && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => onConfirm(messageId, card)}
            className="px-3 py-1 text-xs text-white rounded transition-opacity hover:opacity-80"
            style={{ background: accent }}
          >
            Confirm ✓
          </button>
          <button
            onClick={() => onDiscard(messageId)}
            className="px-3 py-1 text-xs rounded border transition-opacity hover:opacity-70"
            style={{
              borderColor: 'var(--color-highlight)',
              color: 'var(--color-muted)',
            }}
          >
            Discard ✗
          </button>
        </div>
      )}

      {state === 'executing' && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
          Executing…
        </p>
      )}

      {state === 'done' && (
        <p className="text-xs mt-1 font-medium" style={{ color: accent }}>
          ✓ {resultMessage ?? 'Done'}
        </p>
      )}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function AdminChatClient({
  side,
  adminName,
  initialMessages,
  chotuSettings,
}: Props) {
  const { accent, accentBg } = SIDE_CONFIG[side]

  const [activeTab, setActiveTab] = useState<'chat' | 'settings'>('chat')
  const [input, setInput] = useState('')
  const [cardStates, setCardStates] = useState<Record<string, ActionCardState>>({})
  const [cardResults, setCardResults] = useState<Record<string, string>>({})

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/admin/chat',
      // Cap history so long admin chats don't blow through Groq's 12k TPM
      // limit (this component seeds `initialMessages` from prior sessions).
      prepareSendMessagesRequest({ messages }) {
        return { body: { messages: trimMessagesForRequest(messages, MAX_ADMIN_HISTORY_MESSAGES) } }
      },
    }),
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    sendMessage({ text })
  }

  const handleConfirm = useCallback(
    async (messageId: string, card: ActionCard) => {
      setCardStates((prev) => ({ ...prev, [messageId]: 'executing' }))
      try {
        const res = await fetch('/api/admin/chat/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionType: card.actionType, payload: card.payload }),
        })
        const data = await res.json() as { ok: boolean; error?: string; result?: Record<string, unknown> }
        if (data.ok) {
          setCardStates((prev) => ({ ...prev, [messageId]: 'done' }))
          let resultMsg = 'Done!'
          if (card.actionType === 'add_guests') {
            const r = data.result as { guests?: unknown[] } | undefined
            const count = r?.guests?.length ?? 0
            resultMsg = `Added ${count} guest${count !== 1 ? 's' : ''} successfully`
          } else if (card.actionType === 'add_expense') {
            resultMsg = 'Expense recorded'
          } else if (card.actionType === 'record_payment') {
            resultMsg = 'Payment recorded'
          } else if (card.actionType === 'add_vendor') {
            resultMsg = 'Vendor added'
          } else if (card.actionType === 'allocate_room') {
            resultMsg = 'Room allocated'
          }
          setCardResults((prev) => ({ ...prev, [messageId]: resultMsg }))
        } else {
          setCardStates((prev) => ({ ...prev, [messageId]: 'pending' }))
          setCardResults((prev) => ({ ...prev, [messageId]: data.error ?? 'Error' }))
          alert(`Error: ${data.error ?? 'Something went wrong.'}`)
        }
      } catch {
        setCardStates((prev) => ({ ...prev, [messageId]: 'pending' }))
        alert('Network error — please try again.')
      }
    },
    []
  )

  const handleDiscard = useCallback((messageId: string) => {
    setCardStates((prev) => ({ ...prev, [messageId]: 'discarded' }))
  }, [])

  return (
    <div className="flex flex-col h-screen md:h-screen" style={{ maxHeight: '100vh' }}>
      {/* Tab bar */}
      <div
        className="flex items-center gap-1 px-6 pt-5 pb-0 flex-shrink-0"
        style={{ borderBottom: `1px solid var(--color-highlight)` }}
      >
        {(['chat', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-2 text-sm capitalize rounded-t transition-colors"
            style={
              activeTab === tab
                ? {
                    background: accentBg,
                    color: accent,
                    fontWeight: 600,
                    borderBottom: `2px solid ${accent}`,
                  }
                : { color: 'var(--color-muted)' }
            }
          >
            {tab === 'chat' ? 'Chat' : 'Settings'}
          </button>
        ))}
      </div>

      {/* Settings tab */}
      {activeTab === 'settings' && (
        <div className="flex-1 overflow-y-auto">
          <ChotuSettingsClient initialSettings={chotuSettings} side={side} />
        </div>
      )}

      {/* Chat tab */}
      {activeTab === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Welcome */}
            {messages.length === 0 && (
              <div className="flex justify-start">
                <div
                  className="max-w-[80%] px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
                  style={{ background: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
                >
                  Salaam {adminName.split(' ')[0]}! I&apos;m Chotu — your admin assistant for the {side} side.
                  Ask me about guests, RSVPs, finances, rooms, or I can help you add data from an image or message.
                </div>
              </div>
            )}

            {/* Dynamic messages */}
            {messages.map((m: UIMessage) => {
              const rawText = extractText(m)
              if (!rawText && m.role !== 'user') return null

              const isUser = m.role === 'user'

              if (isUser) {
                return (
                  <div key={m.id} className="flex justify-end">
                    <div
                      className="max-w-[80%] px-4 py-2.5 text-sm leading-relaxed"
                      style={{
                        background: accent,
                        color: 'white',
                        borderRadius: '18px 18px 4px 18px',
                      }}
                    >
                      {renderText(rawText)}
                    </div>
                  </div>
                )
              }

              // Assistant message — parse action card
              const { cleanText, card, parseError } = parseActionCard(rawText)
              const cardState = card ? (cardStates[m.id] ?? 'pending') : 'pending'

              return (
                <div key={m.id} className="flex justify-start">
                  <div className="max-w-[80%]">
                    {/* If no card, show normal bubble. If card, cleanText goes inside the card. */}
                    {!card && cleanText && (
                      <div
                        className="px-4 py-2.5 text-sm leading-relaxed"
                        style={{
                          background: 'var(--color-highlight)',
                          color: 'var(--color-foreground)',
                          borderRadius: '18px 18px 18px 4px',
                        }}
                      >
                        {renderText(cleanText)}
                      </div>
                    )}
                    {card && (
                      <ActionCardUI
                        messageId={m.id}
                        card={card}
                        cleanText={cleanText}
                        accent={accent}
                        onConfirm={handleConfirm}
                        onDiscard={handleDiscard}
                        state={cardState}
                        resultMessage={cardResults[m.id]}
                      />
                    )}
                    {/* Malformed card: the comment was stripped, so show a small
                        note instead of letting the action fail silently. */}
                    {parseError && (
                      <div
                        className="mt-1.5 px-3 py-1.5 text-xs"
                        style={{
                          color: 'var(--color-muted)',
                          background: 'var(--color-highlight)',
                          borderRadius: '12px',
                        }}
                      >
                        ⚠️ {parseError} — see console for details.
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Loading dots */}
            {isLoading && (
              <div className="flex justify-start">
                <div
                  className="px-4 py-3"
                  style={{
                    background: 'var(--color-highlight)',
                    borderRadius: '18px 18px 18px 4px',
                    color: 'var(--color-muted)',
                  }}
                >
                  <span className="inline-flex gap-1 items-center">
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: 'var(--color-muted)', animationDelay: '0ms' }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: 'var(--color-muted)', animationDelay: '150ms' }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: 'var(--color-muted)', animationDelay: '300ms' }}
                    />
                  </span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex justify-start">
                <div
                  className="max-w-[80%] px-4 py-2.5 text-sm"
                  style={{ background: '#fef2f2', color: '#dc2626', borderRadius: '18px 18px 18px 4px' }}
                >
                  Something went wrong — please try again.
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div
            className="flex items-end gap-2 px-4 py-3 flex-shrink-0"
            style={{ borderTop: '1px solid var(--color-highlight)' }}
          >
            {/* Textarea */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Ask about guests, finances, rooms…"
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none text-sm px-3 py-2 rounded-xl border focus:outline-none transition-colors disabled:opacity-60"
              style={{
                borderColor: 'var(--color-highlight)',
                background: 'var(--color-background)',
                color: 'var(--color-foreground)',
                maxHeight: '96px',
                overflowY: 'auto',
              }}
            />

            {/* Send button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-opacity disabled:opacity-40 hover:opacity-80"
              style={{ background: accent }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
