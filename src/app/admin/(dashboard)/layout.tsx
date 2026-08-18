import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import Sidebar from '@/components/admin/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin/login')

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-background)' }}>
      <Sidebar side={session.user.side!} adminName={session.user.name} />
      <main className="flex-1 min-w-0 pt-14 md:pt-0">{children}</main>
    </div>
  )
}
