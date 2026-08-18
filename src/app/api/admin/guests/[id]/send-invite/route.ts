import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/resend'

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
      <p style="font-size: 15px; color: #2D2D2D; margin: 0 0 16px; line-height: 1.7;">
        As-salamu alaykum wa rahmatullahi wa barakatuh
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

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'side_admin') return forbidden()

  const { id } = await context.params

  const guest = await prisma.guest.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, rsvp_token: true, side: true },
  })
  if (!guest || guest.side !== session.user.side) {
    return NextResponse.json({ error: 'Guest not found.' }, { status: 404 })
  }
  if (!guest.email) {
    return NextResponse.json({ error: 'No email on file for this guest.' }, { status: 400 })
  }
  if (!guest.rsvp_token) {
    return NextResponse.json({ error: 'No invite token generated yet.' }, { status: 400 })
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? ''
  const inviteUrl = `${baseUrl}/?invite=${guest.rsvp_token}`
  const firstName = guest.name.split(' ')[0]
  const fromEmail = process.env.FROM_EMAIL ?? 'onboarding@resend.dev'

  const { ok, error } = await sendEmail({
    from: fromEmail,
    to: guest.email,
    subject: "You're invited — Aarav & Ananya's Wedding",
    html: buildHtml(firstName, inviteUrl),
  })

  if (!ok) {
    return NextResponse.json({ error: error ?? 'Failed to send email.' }, { status: 502 })
  }

  await prisma.guest.update({
    where: { id },
    data: { invitation_sent: true },
  })

  return NextResponse.json({ ok: true })
}
