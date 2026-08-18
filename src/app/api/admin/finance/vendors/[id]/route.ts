import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Vendor, Payment } from '@prisma/client'

type Context = { params: Promise<{ id: string }> }
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

export async function PUT(req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!
  const { id } = await context.params

  const existing = await prisma.vendor.findUnique({ where: { id } })
  if (!existing || existing.side !== side) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.category !== undefined) updates.category = body.category?.trim() || null
  if (body.contact_name !== undefined) updates.contact_name = body.contact_name?.trim() || null
  if (body.phone !== undefined) updates.phone = body.phone?.trim() || null
  if (body.email !== undefined) updates.email = body.email?.trim() || null
  if (body.website !== undefined) updates.website = body.website?.trim() || null
  if (body.contract_amount !== undefined) updates.contract_amount = body.contract_amount != null ? Number(body.contract_amount) : null
  if (body.notes !== undefined) updates.notes = body.notes?.trim() || null

  if (updates.name !== undefined && !(updates.name as string).trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const vendor = await prisma.vendor.update({
    where: { id },
    data: updates,
    include: { payments: { orderBy: { due_date: 'asc' } } },
  })

  return NextResponse.json({ vendor: serializeVendor(vendor) })
}

export async function DELETE(_req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const side = session.user.side!
  const { id } = await context.params

  const existing = await prisma.vendor.findUnique({ where: { id } })
  if (!existing || existing.side !== side) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.vendor.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
