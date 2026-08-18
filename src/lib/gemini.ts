import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider } from '@ai-sdk/google'
import { streamText } from 'ai'

// Collect all configured Gemini API keys (GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, …)
function getApiKeys(): string[] {
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

type StreamTextParams = Parameters<typeof streamText>[0]

// Try each key in order; on 429 move to the next. Throws if all keys exhausted.
// paramsBuilder receives the googleAI provider so callers can attach googleSearch tools.
export async function streamTextWithFallback(
  paramsBuilder: (googleAI: GoogleGenerativeAIProvider) => Omit<StreamTextParams, 'model'>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<ReturnType<typeof streamText<any, any>>> {
  const keys = getApiKeys()
  if (keys.length === 0) throw new Error('No Gemini API keys configured.')

  let lastError: unknown
  for (const key of keys) {
    const googleAI = createGoogleGenerativeAI({ apiKey: key })
    try {
      const params = paramsBuilder(googleAI)
      return streamText({
        ...(params as StreamTextParams),
        model: googleAI('gemini-2.5-flash'),
      })
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 429) {
        lastError = err
        continue
      }
      throw err
    }
  }
  throw lastError
}
