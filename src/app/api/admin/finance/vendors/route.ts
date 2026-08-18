import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Vendor, Payment } from '@prisma/client'

type VendorWithPayments = Vendor & { payments: Payment[] }

function serializePayment(p: Payment) {
  return {
    ...p,
    amount: Number(p.amount),
    amount_paid: Number(p.amount_paid),
    due_date: p.due_date?.toISOString() ?? null,
    paid_date: p.paid_date?.toISOString() ?? null,
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  }
}

function serializeVendor(v: VendorWithPayments) {
  return {
    ...v,
    contract_amount: v.contract_amount ? Number(v.contract_amount) : null,
    created_at: v.created_at.toISOString(),
    updated_at: v.updated_at.toISOString(),
    payments: v.payments.map(serializePayment),
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!

  const vendors = await prisma.vendor.findMany({
    where: { side },
    include: { payments: { orderBy: { due_date: 'asc' } } },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ vendors: vendors.map(serializeVendor) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!

  const body = await req.json()
  const { name, category, contact_name, phone, email, website, contract_amount, notes } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const vendor = await prisma.vendor.create({
    data: {
      name: name.trim(),
      category: category?.trim() || null,
      contact_name: contact_name?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      website: website?.trim() || null,
      contract_amount: contract_amount != null ? contract_amount : null,
      notes: notes?.trim() || null,
      side,
    },
    include: { payments: true },
  })

  return NextResponse.json({ vendor: serializeVendor(vendor) }, { status: 201 })
}
