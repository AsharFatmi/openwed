import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/resend'
import { type Side } from '@prisma/client'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'super_admin') return forbidden()

  const accounts = await prisma.adminUser.findMany({
    where: { role: 'side_admin' },
    select: { id: true, name: true, email: true, side: true, active: true, created_at: true },
    orderBy: { created_at: 'asc' },
  })

  return NextResponse.json({ accounts })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if (session.user.role !== 'super_admin') return forbidden()

  const body = await request.json()
  const { name, email, password, side } = body ?? {}

  if (!name || !email || !password || !side) {
    return NextResponse.json({ error: 'All fields are required.' }, { status: 400 })
  }

  if (!['bride', 'groom'].includes(side)) {
    return NextResponse.json({ error: 'Side must be bride or groom.' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400 }
    )
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const account = await prisma.adminUser.create({
    data: {
      name,
      email,
      password_hash: passwordHash,
      role: 'side_admin',
      side: side as Side,
      active: true,
    },
    select: { id: true, name: true, email: true, side: true, active: true, created_at: true },
  })

  const loginUrl = `${process.env.NEXTAUTH_URL}/admin/login`
  const sideLabel = side === 'bride' ? 'Bride Side' : 'Groom Side'
  await sendEmail({
    from: process.env.FROM_EMAIL!,
    to: email,
    subject: 'Your wedding admin account is ready',
    html: `
      <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;background:#FFFDF7;padding:40px 32px;border:1px solid #E8D5C4;border-radius:12px;">
        <h1 style="font-size:24px;font-weight:400;color:#2D2D2D;margin:0 0 8px;">Welcome, ${name}</h1>
        <p style="font-size:14px;color:#A3B18A;margin:0 0 32px;">You have been added as the <strong>${sideLabel}</strong> admin.</p>

        <p style="font-size:14px;color:#2D2D2D;margin:0 0 16px;">Here are your login credentials:</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:32px;">
          <tr>
            <td style="padding:10px 14px;background:#f5f0e8;border-radius:8px 8px 0 0;font-size:13px;color:#A3B18A;font-family:sans-serif;">Email</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #E8D5C4;border-top:none;border-radius:0;font-size:14px;color:#2D2D2D;font-family:monospace;">${email}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#f5f0e8;border:1px solid #E8D5C4;border-top:none;font-size:13px;color:#A3B18A;font-family:sans-serif;">Password</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #E8D5C4;border-top:none;border-radius:0 0 8px 8px;font-size:14px;color:#2D2D2D;font-family:monospace;">${password}</td>
          </tr>
        </table>

        <a href="${loginUrl}" style="display:inline-block;background:#B8860B;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-family:sans-serif;">Log in to Admin Panel</a>

        <p style="font-size:12px;color:#A3B18A;margin-top:32px;">We recommend changing your password after your first login.</p>
      </div>
    `,
  })

  return NextResponse.json({ account }, { status: 201 })
}
