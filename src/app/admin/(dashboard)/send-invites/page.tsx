import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import SendInvitesClient from './SendInvitesClient'
import { type WhatsAppTemplate, DEFAULT_TEMPLATE } from '@/app/api/admin/whatsapp-templates/route'

export default async function SendInvitesPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin/login')

  const side = session.user.side!

  const [guests, templateRow] = await Promise.all([
    prisma.guest.findMany({
      where: { side },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        household_group: true,
        invitation_sent: true,
        rsvp_token: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    }),
    prisma.siteSettings.findUnique({
      where: { key: `whatsapp_templates_${side}` },
    }),
  ])

  let initialTemplates: WhatsAppTemplate[] = [DEFAULT_TEMPLATE]
  if (templateRow?.value) {
    try {
      const parsed = JSON.parse(templateRow.value) as { templates: WhatsAppTemplate[] }
      if (Array.isArray(parsed.templates) && parsed.templates.length > 0) {
        initialTemplates = parsed.templates
      }
    } catch {
      // keep default
    }
  }

  return <SendInvitesClient guests={guests} initialTemplates={initialTemplates} side={side} />
}
