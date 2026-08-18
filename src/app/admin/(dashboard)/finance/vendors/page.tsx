import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import VendorsClient from './VendorsClient'
import { Payment } from '@prisma/client'

export const dynamic = 'force-dynamic'

function serializePayment(p: Payment) {
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

export default async function VendorsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin')
  const side = session.user.side!

  const [vendors, categories] = await Promise.all([
    prisma.vendor.findMany({
      where: { side },
      include: { payments: { orderBy: { due_date: 'asc' } } },
      orderBy: { name: 'asc' },
    }),
    prisma.budgetCategory.findMany({
      where: { side },
      select: { id: true, name: true },
      orderBy: { sort_order: 'asc' },
    }),
  ])

  const serialized = vendors.map((v) => ({
    ...v,
    contract_amount: v.contract_amount ? Number(v.contract_amount) : null,
    created_at: v.created_at.toISOString(),
    updated_at: v.updated_at.toISOString(),
    payments: v.payments.map(serializePayment),
  }))

  return <VendorsClient initialVendors={serialized} categories={categories} side={side as 'bride' | 'groom'} />
}
