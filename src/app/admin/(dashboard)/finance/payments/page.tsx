import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PaymentsClient from './PaymentsClient'
import { Payment } from '@prisma/client'

export const dynamic = 'force-dynamic'

function serializePayment(p: Payment & { vendor: { id: string; name: string } }) {
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

export default async function PaymentsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin')
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

  return (
    <PaymentsClient
      initialPayments={payments.map(serializePayment)}
      vendors={vendors}
      side={side as 'bride' | 'groom'}
    />
  )
}
