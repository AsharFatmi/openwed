'use client'

import { useState, useRef, useEffect, Fragment } from 'react'
import { useChat, type UIMessage } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { trimMessagesForRequest } from '@/lib/chat-history'

function renderText(text: string) {
  return text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={j}>{part.slice(2, -2)}</strong>
          : part
      )}
    </Fragment>
  ))
}

export default function ChatBubble({ guestName }: { guestName?: string | null }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/public/chat',
      // Cap how much history goes to the model on each send — keeps Groq's
      // 12k TPM on-demand tier from rejecting long chats with HTTP 413.
      prepareSendMessagesRequest({ messages }) {
        return { body: { messages: trimMessagesForRequest(messages) } }
      },
    }),
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open])

  const firstName = guestName ? guestName.split(' ')[0] : null
  const greeting = firstName
    ? `As-salamu alaykum, ${firstName}! Ji, I'm Chotu 🤖 — your personal wedding assistant. Ask me anything about the events, hotels, local food, distances — anything wedding-related! 😊`
    : `As-salamu alaykum! Ji, I'm Chotu 🤖 — the wedding assistant for the celebration. Ask me about events, hotels, local food, or travel — anything wedding-related! 😊`

  function handleSend() {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    sendMessage({ text })
  }

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{
            width: '440px',
            maxWidth: 'calc(100vw - 2rem)',
            height: '700px',
            background: 'var(--color-background)',
            border: '1px solid var(--color-highlight)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ background: 'var(--color-accent)' }}
          >
            <div className="flex items-center gap-2.5">
              <img src="https://pub-74c1930734de47e3b761432163e9a8b8.r2.dev/chotu-avatar.png" alt="Chotu" className="w-8 h-8 rounded-full object-cover object-top bg-white" />
              <div>
                <p className="text-sm font-semibold text-white leading-tight">Chotu</p>
                <p className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Wedding Assistant
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="p-1 rounded-full transition-colors hover:bg-white/20"
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {/* Static greeting */}
            <div className="flex justify-start">
              <div
                className="max-w-[82%] px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
                style={{ background: 'var(--color-highlight)', color: 'var(--color-foreground)' }}
              >
                {greeting}
              </div>
            </div>

            {/* Dynamic messages */}
            {messages.map((m: UIMessage) => {
              const text = m.parts
                .filter((p) => p.type === 'text')
                .map((p) => (p as { type: 'text'; text: string }).text)
                .join('')
              if (!text) return null
              return (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[82%] px-3.5 py-2.5 text-sm leading-relaxed"
                    style={
                      m.role === 'user'
                        ? {
                            background: 'var(--color-accent)',
                            color: 'white',
                            borderRadius: '18px 18px 4px 18px',
                          }
                        : {
                            background: 'var(--color-highlight)',
                            color: 'var(--color-foreground)',
                            borderRadius: '18px 18px 18px 4px',
                          }
                    }
                  >
                    {renderText(text)}
                  </div>
                </div>
              )
            })}

            {/* Loading dots */}
            {isLoading && (
              <div className="flex justify-start">
                <div
                  className="px-4 py-3 text-sm"
                  style={{
                    background: 'var(--color-highlight)',
                    borderRadius: '18px 18px 18px 4px',
                    color: 'var(--color-muted)',
                  }}
                >
                  <span className="inline-flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-muted)', animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-muted)', animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-muted)', animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex justify-start">
                <div
                  className="max-w-[82%] px-3.5 py-2.5 text-sm"
                  style={{ background: '#fef2f2', color: '#dc2626', borderRadius: '18px 18px 18px 4px' }}
                >
                  Something went wrong Ji — please try again 🙏
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            className="flex items-end gap-2 px-3 py-3 border-t flex-shrink-0"
            style={{ borderColor: 'var(--color-highlight)' }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Ask about events, local food, hotels…"
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
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-opacity disabled:opacity-40"
              style={{ background: 'var(--color-accent)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chat' : 'Chat with Chotu'}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{ background: 'var(--color-accent)' }}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <img src="https://pub-74c1930734de47e3b761432163e9a8b8.r2.dev/chotu-avatar.png" alt="Chotu" className="w-10 h-10 rounded-full object-cover object-top bg-white" />
        )}
      </button>
    </>
  )
}
