import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { streamText } from 'ai'

type StreamTextParams = Parameters<typeof streamText>[0]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStreamResult = ReturnType<typeof streamText<any, any>>

export type ParamsBuilder = (
  provider: GoogleGenerativeAIProvider | ReturnType<typeof createGroq>,
  isGemini: boolean
) => Omit<StreamTextParams, 'model'>

function getGeminiKeys(): string[] {
  const keys: string[] = []
  const base = process.env.GEMINI_API_KEY
  if (base) keys.push(base)
  let i = 2
  while (true) {
    const k = process.env[`GEMINI_API_KEY_${i}`]
    if (!k) break
    keys.push(k)
    i++
  }
  return keys
}

function getGroqKey(): string | null {
  return process.env.GROQ_API_KEY ?? null
}

function is429(err: unknown): boolean {
  return (err as { statusCode?: number })?.statusCode === 429
}

function tryGroq(paramsBuilder: ParamsBuilder): AnyStreamResult {
  const groqKey = getGroqKey()
  if (!groqKey) throw new Error('No Groq API key configured.')
  const groq = createGroq({ apiKey: groqKey })
  const params = paramsBuilder(groq, false)
  // Strip tools — Groq does not support googleSearch or other provider tools
  const { tools: _tools, ...safeParams } = params as StreamTextParams & { tools?: unknown }
  return streamText({
    ...(safeParams as StreamTextParams),
    model: groq('llama-3.3-70b-versatile'),
  })
}

async function tryGeminiKeys(paramsBuilder: ParamsBuilder): Promise<AnyStreamResult> {
  const keys = getGeminiKeys()
  let lastError: unknown
  for (const key of keys) {
    const googleAI = createGoogleGenerativeAI({ apiKey: key })
    try {
      const params = paramsBuilder(googleAI, true)
      return streamText({
        ...(params as StreamTextParams),
        model: googleAI('gemini-2.5-flash'),
      })
    } catch (err) {
      if (is429(err)) { lastError = err; continue }
      throw err
    }
  }
  throw lastError
}

// Groq primary (1,000 RPD free), Gemini fallback on 429
// Used by both public and admin Chotu
export async function streamChat(paramsBuilder: ParamsBuilder): Promise<AnyStreamResult> {
  const groqKey = getGroqKey()

  if (groqKey) {
    try {
      return tryGroq(paramsBuilder)
    } catch (err) {
      if (!is429(err)) throw err
      // Groq rate-limited — fall through to Gemini
    }
  }

  const geminiKeys = getGeminiKeys()
  if (geminiKeys.length === 0) throw new Error('No AI provider keys configured.')
  return tryGeminiKeys(paramsBuilder)
}

// Keep named exports for backwards compat with existing route imports
export const streamPublicChat = streamChat
export const streamAdminChat = (paramsBuilder: ParamsBuilder, _hasImage?: boolean) => streamChat(paramsBuilder)
