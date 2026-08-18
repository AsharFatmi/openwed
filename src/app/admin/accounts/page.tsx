import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AccountsClient from './AccountsClient'

export default async function AccountsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'super_admin') {
    redirect('/admin/login')
  }

  const accounts = await prisma.adminUser.findMany({
    where: { role: 'side_admin' },
    select: { id: true, name: true, email: true, side: true, active: true, created_at: true },
    orderBy: { created_at: 'asc' },
  })

  return <AccountsClient initialAccounts={accounts} />
}
