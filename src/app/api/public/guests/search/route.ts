import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pairConfidence, FUZZY_THRESHOLD } from '@/lib/duplicate-match'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const token = searchParams.get('token')?.trim() ?? ''

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve caller from token
  const caller = await prisma.guest.findUnique({
    where: { rsvp_token: token },
    select: { id: true, household_group: true },
  })
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (q.length < 2) {
    return NextResponse.json({ guests: [] })
  }

  // Scope to caller's household only — no cross-household enumeration.
  // If household_group is null, return empty so free-typing still works.
  if (!caller.household_group) {
    return NextResponse.json({ guests: [] })
  }

  // Fetch household peers (households are small — cap 100) and score both
  // substring (exact-ish) and fuzzy (spelling-variant) matches. Substring
  // matches rank first; fuzzy-only matches follow by confidence. This
  // surfaces "did you mean Dania?" when the user types "Daniya", so they
  // link the existing guest instead of creating a duplicate family member.
  const peers = await prisma.guest.findMany({
    where: { household_group: caller.household_group, id: { not: caller.id } },
    select: { id: true, name: true },
    take: 100,
  })

  const lowerQ = q.toLowerCase()
  const tokens = q.split(/\s+/).filter(Boolean)
  const scored = peers.map((p) => {
    const lowerName = p.name.toLowerCase()
    const isSubstring =
      lowerName.includes(lowerQ) || tokens.some((t) => lowerName.includes(t.toLowerCase()))
    const confidence = pairConfidence(q, p.name)
    return { id: p.id, name: p.name, isSubstring, confidence }
  })

  const substringMatches = scored
    .filter((p) => p.isSubstring)
    .sort((a, b) => a.name.localeCompare(b.name))
  const fuzzyOnly = scored
    .filter((p) => !p.isSubstring && p.confidence >= FUZZY_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence)

  const guests = [
    ...substringMatches.map(({ id, name }) => ({ id, name, fuzzy: false })),
    ...fuzzyOnly.map(({ id, name, confidence }) => ({ id, name, fuzzy: true, confidence })),
  ].slice(0, 10)

  return NextResponse.json({ guests })
}