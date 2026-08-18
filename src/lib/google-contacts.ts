import { prisma } from '@/lib/prisma'
import { type Side } from '@prisma/client'

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

interface PersonName {
  displayName?: string
  givenName?: string
  familyName?: string
}

interface PhoneNumber {
  value?: string
}

interface EmailAddress {
  value?: string
}

interface Person {
  resourceName: string
  names?: PersonName[]
  phoneNumbers?: PhoneNumber[]
  emailAddresses?: EmailAddress[]
}

interface ConnectionsResponse {
  connections?: Person[]
  nextPageToken?: string
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: `${baseUrl}/api/admin/google/callback`,
    grant_type: 'authorization_code',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token exchange failed: ${err}`)
  }

  return res.json() as Promise<TokenResponse>
}

export async function getValidAccessToken(adminUserId: string): Promise<string> {
  console.log('[google-contacts] loading token for user', adminUserId)
  const token = await prisma.googleOAuthToken.findUnique({
    where: { admin_user_id: adminUserId },
  })
  if (!token) throw new Error('No Google token found — please reconnect Google Contacts')

  const msRemaining = token.expires_at.getTime() - Date.now()
  console.log('[google-contacts] token expires_at', token.expires_at, 'ms remaining', msRemaining)

  // If token has > 60 seconds remaining, use it as-is
  if (msRemaining > 60_000) {
    return token.access_token
  }

  console.log('[google-contacts] refreshing token, client_id present:', !!process.env.GOOGLE_CLIENT_ID)

  // Refresh
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token refresh failed: ${err}`)
  }

  const data = (await res.json()) as TokenResponse

  await prisma.googleOAuthToken.update({
    where: { admin_user_id: adminUserId },
    data: {
      access_token: data.access_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000),
    },
  })

  return data.access_token
}

export async function syncGoogleContacts(adminUserId: string, side: Side): Promise<number> {
  const accessToken = await getValidAccessToken(adminUserId)

  const people: Person[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      personFields: 'names,phoneNumbers,emailAddresses',
      pageSize: '1000',
      ...(pageToken ? { pageToken } : {}),
    })

    const res = await fetch(
      `https://people.googleapis.com/v1/people/me/connections?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`People API error: ${err}`)
    }

    const data = (await res.json()) as ConnectionsResponse
    if (data.connections) people.push(...data.connections)
    pageToken = data.nextPageToken
  } while (pageToken)

  // Only keep contacts that have at least a name and a phone number
  const contactsToUpsert = people
    .filter((p) => {
      const name = p.names?.[0]?.displayName
      const phone = p.phoneNumbers?.[0]?.value
      return name && phone
    })
    .map((p) => ({
      side,
      google_id: p.resourceName,
      name: p.names![0].displayName!,
      phone: p.phoneNumbers![0].value ?? null,
      email: p.emailAddresses?.[0]?.value ?? null,
    }))

  // Delete all existing contacts for this side and re-insert — one connection, no pool exhaustion
  await prisma.$transaction([
    prisma.googleContact.deleteMany({ where: { side } }),
    prisma.googleContact.createMany({ data: contactsToUpsert, skipDuplicates: true }),
  ])

  return contactsToUpsert.length
}
