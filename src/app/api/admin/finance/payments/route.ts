import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Payment, PaymentStatus } from '@prisma/client'
import { Vendor } from '@prisma/client'

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

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!

  const [payments, vendors] = await Promise.all([
    prisma.payment.findMany({
      where: { vendor: { side } },
      include: { vendor: { select: { id: true, name: true } } },
      orderBy: { due_date: 'asc' },
    }),
    prisma.vendor.findMany({
      where: { side },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return NextResponse.json({
    payments: payments.map(serializePayment),
    vendors,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!

  const body = await req.json()
  const { vendor_id, amount, due_date, paid_date, status, amount_paid, method, notes, exchange_rate } = body

  if (!vendor_id) return NextResponse.json({ error: 'Vendor is required' }, { status: 400 })
  if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  if (status && !VALID_STATUSES.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  if (amount_paid != null && Number(amount_paid) > Number(amount)) {
    return NextResponse.json({ error: 'Amount paid cannot exceed total amount' }, { status: 400 })
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: vendor_id } })
  if (!vendor || vendor.side !== side) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })

  const payment = await prisma.payment.create({
    data: {
      vendor_id,
      amount: Number(amount),
      due_date: due_date ? new Date(`${due_date}T12:00:00`) : null,
      paid_date: paid_date ? new Date(`${paid_date}T12:00:00`) : null,
      status: status ?? 'upcoming',
      amount_paid: amount_paid != null ? Number(amount_paid) : 0,
      method: method?.trim() || null,
      notes: notes?.trim() || null,
      exchange_rate: exchange_rate != null ? Number(exchange_rate) : null,
    },
    include: { vendor: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ payment: serializePayment(payment) }, { status: 201 })
}
