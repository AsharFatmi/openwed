import https from 'https'
import fs from 'fs'

function getCA(): Buffer | undefined {
  const certPath = process.env.NODE_EXTRA_CA_CERTS
  if (!certPath) return undefined
  try {
    return fs.readFileSync(certPath)
  } catch {
    return undefined
  }
}

const ca = getCA()

function httpsPost(url: string, body: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        ca,
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

type Attachment = {
  filename: string
  content: string  // base64-encoded
}

type EmailPayload = {
  from: string
  to: string
  subject: string
  html: string
  attachments?: Attachment[]
}

export async function sendEmail(payload: EmailPayload): Promise<{ ok: boolean; error?: string }> {
  const { status, body } = await httpsPost(
    'https://api.resend.com/emails',
    JSON.stringify(payload),
    {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    }
  )
  if (status < 200 || status >= 300) {
    let msg = `Resend error ${status}`
    try { msg = JSON.parse(body)?.message ?? msg } catch { /* ignore */ }
    return { ok: false, error: msg }
  }
  return { ok: true }
}

export async function sendEmailBatch(payloads: EmailPayload[]): Promise<{ ok: boolean; error?: string }> {
  const { status, body } = await httpsPost(
    'https://api.resend.com/emails/batch',
    JSON.stringify(payloads),
    {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    }
  )
  if (status < 200 || status >= 300) {
    let msg = `Resend error ${status}`
    try { msg = JSON.parse(body)?.message ?? msg } catch { /* ignore */ }
    return { ok: false, error: msg }
  }
  return { ok: true }
}
