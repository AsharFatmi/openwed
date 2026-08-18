import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { type UIMessage } from 'ai'
import AdminChatClient from './AdminChatClient'

export const dynamic = 'force-dynamic'

const CHOTU_KEYS = [
  'chotu_partner1_bio',
  'chotu_partner2_bio',
  'chotu_contact_name',
  'chotu_contact_whatsapp',
  'chotu_contact_email',
  'chotu_extra_instructions',
] as const

type ChotuKey = (typeof CHOTU_KEYS)[number]

export default async function ChotuPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin/login')

  const side = session.user.side!
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [historyRows, settingsRows] = await Promise.all([
    prisma.adminChatMessage.findMany({
      where: { side, created_at: { gte: sevenDaysAgo } },
      orderBy: { created_at: 'asc' },
    }),
    prisma.siteSettings.findMany({
      where: { key: { in: [...CHOTU_KEYS] } },
    }),
  ])

  const initialMessages: UIMessage[] = historyRows.map((row) => ({
    id: row.id,
    role: row.role as 'user' | 'assistant',
    parts: [{ type: 'text' as const, text: row.content }],
    content: row.content,
  }))

  const chotuSettings = Object.fromEntries(
    CHOTU_KEYS.map((k) => [k, settingsRows.find((r) => r.key === k)?.value ?? ''])
  ) as Record<ChotuKey, string>

  return (
    <AdminChatClient
      side={side}
      adminName={session.user.name ?? 'Admin'}
      initialMessages={initialMessages}
      chotuSettings={chotuSettings}
    />
  )
}
