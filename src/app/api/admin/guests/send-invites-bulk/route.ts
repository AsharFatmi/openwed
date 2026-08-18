import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmailBatch } from '@/lib/resend'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

function buildHtml(firstName: string, inviteUrl: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #FFFDF7;">
      <p style="font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: #A3B18A; margin: 0 0 24px;">
        Aarav &amp; Ananya
      </p>
      <h2 style="font-size: 28px; font-weight: 300; color: #2D2D2D; margin: 0 0 16px;">
        Dear ${firstName},
      </h2>
      <p style="color: #555; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
        We are delighted to invite you to celebrate our wedding. Please use the link below to view your personal invitation and RSVP at your convenience.
      </p>
      <a
        href="${inviteUrl}"
        style="display: inline-block; padding: 14px 28px; background: #B8860B; color: white; text-decoration: none; border-radius: 2px; font-size: 13px; letter-spacing: 0.1em;"
      >
        View Invitation &amp; RSVP
      </a>
      <p style="color: #A3B18A; font-size: 12px; margin: 28px 0 0;">
        This is your personal link — please keep it safe.
      </p>
    </div>
  `
}

const BATCH_SIZE = 100

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const body = await request.json().catch(() => null)
  const { guestIds } = (body ?? {}) as { guestIds?: string[] }

  if (!Array.isArray(guestIds) || guestIds.length === 0) {
    return NextResponse.json({ error: 'guestIds must be a non-empty array.' }, { status: 400 })
  }

  const guests = await prisma.guest.findMany({
    where: {
      id: { in: guestIds },
      side: session.user.side!,
      email: { not: null },
      rsvp_token: { not: null },
    },
    select: { id: true, name: true, email: true, rsvp_token: true },
  })

  if (guests.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? ''
  const fromEmail = process.env.FROM_EMAIL ?? 'onboarding@resend.dev'

  const sentIds: string[] = []
  for (let i = 0; i < guests.length; i += BATCH_SIZE) {
    const chunk = guests.slice(i, i + BATCH_SIZE)
    const emails = chunk.map((g) => ({
      from: fromEmail,
      to: g.email!,
      subject: "You're invited — Aarav & Ananya's Wedding",
      html: buildHtml(g.name.split(' ')[0], `${baseUrl}/?invite=${g.rsvp_token!}`),
    }))

    const { ok } = await sendEmailBatch(emails)
    if (ok) {
      sentIds.push(...chunk.map((g) => g.id))
    }
  }

  if (sentIds.length > 0) {
    await prisma.guest.updateMany({
      where: { id: { in: sentIds } },
      data: { invitation_sent: true },
    })
  }

  return NextResponse.json({ sent: sentIds.length })
}
