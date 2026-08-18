import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/resend'

export async function POST(request: Request) {
  const body = await request.json()
  const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : null

  // Always return the same response to prevent email enumeration
  const success = NextResponse.json({
    message: 'If that email is associated with an account, a reset link has been sent.',
  })

  if (!email) return success

  const user = await prisma.adminUser.findUnique({ where: { email } })
  if (!user || !user.active) return success

  // Generate a raw token and its hash
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  // Delete any existing unused tokens for this user, then create a new one
  await prisma.passwordResetToken.deleteMany({
    where: { admin_user_id: user.id, used: false },
  })

  await prisma.passwordResetToken.create({
    data: {
      admin_user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      used: false,
    },
  })

  const resetUrl = `${process.env.NEXTAUTH_URL}/admin/reset-password?token=${rawToken}`
  const fromEmail = process.env.FROM_EMAIL ?? 'onboarding@resend.dev'

  await sendEmail({
    from: fromEmail,
    to: user.email,
    subject: 'Reset your admin password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2D2D2D;">Reset your password</h2>
        <p style="color: #555;">Click the link below to set a new password. This link expires in 1 hour.</p>
        <a
          href="${resetUrl}"
          style="display: inline-block; margin: 16px 0; padding: 12px 24px; background: #B8860B; color: white; text-decoration: none; border-radius: 8px; font-size: 14px;"
        >
          Reset password
        </a>
        <p style="color: #999; font-size: 12px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  })

  return success
}
