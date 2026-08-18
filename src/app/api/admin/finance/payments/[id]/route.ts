import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Payment, PaymentStatus, Vendor } from '@prisma/client'

type Context = { params: Promise<{ id: string }> }
type PaymentWithVendor = Payment & { vendor: Pick<Vendor, 'id' | 'name'> }

function serializePayment(p: PaymentWithVendor) {
  return {
    ...p,
    amount: Number(p.amount),
    amount_paid: Number(p.amount_paid),
    exchange_rate: p.exchange_rate != null ? Number(p.exchange_rate) : null,
    due_date: p.due_date?.toISOString() ?? null,
    paid_date: p.paid_date?.toISOString() ?? null,
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  }
}

const VALID_STATUSES: PaymentStatus[] = ['upcoming', 'paid', 'partially_paid', 'overdue']

export async function PUT(req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!
  const { id } = await context.params

  const existing = await prisma.payment.findUnique({ where: { id }, include: { vendor: true } })
  if (!existing || existing.vendor.side !== side) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (body.amount !== undefined) {
    if (Number(body.amount) <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    updates.amount = Number(body.amount)
  }
  if (body.due_date !== undefined) updates.due_date = body.due_date ? new Date(`${body.due_date}T12:00:00`) : null
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    updates.status = body.status
    if (body.status === 'paid' && body.paid_date === undefined) {
      updates.paid_date = new Date()
    }
  }
  if (body.paid_date !== undefined) updates.paid_date = body.paid_date ? new Date(`${body.paid_date}T12:00:00`) : null
  if (body.amount_paid !== undefined) {
    const newAmount = updates.amount != null ? Number(updates.amount) : Number(existing.amount)
    if (Number(body.amount_paid) > newAmount) {
      return NextResponse.json({ error: 'Amount paid cannot exceed total amount' }, { status: 400 })
    }
    updates.amount_paid = Number(body.amount_paid)
  }
  if (body.method !== undefined) updates.method = body.method?.trim() || null
  if (body.notes !== undefined) updates.notes = body.notes?.trim() || null
  if (body.exchange_rate !== undefined) updates.exchange_rate = body.exchange_rate != null ? Number(body.exchange_rate) : null

  const payment = await prisma.payment.update({
    where: { id },
    data: updates,
    include: { vendor: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ payment: serializePayment(payment) })
}

export async function DELETE(_req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!
  const { id } = await context.params

  const existing = await prisma.payment.findUnique({ where: { id }, include: { vendor: true } })
  if (!existing || existing.vendor.side !== side) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.payment.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
