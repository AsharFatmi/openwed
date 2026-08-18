import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const side = session.user.side!

  const [
    guests,
    events,
    rsvpResponses,
    familyMemberRsvps,
    recentRsvps,
    budgetCategories,
    expenses,
    upcomingPayments,
  ] = await Promise.all([
    prisma.guest.findMany({
      where: { side },
      select: { id: true, household_group: true },
    }),
    prisma.event.findMany({
      where: { OR: [{ managed_by: side }, { display_group: 'joint' }] },
      select: { id: true, name: true, sort_order: true },
      orderBy: [{ sort_order: 'asc' }, { date: 'asc' }],
    }),
    prisma.rsvpResponse.findMany({
      where: { guest: { side } },
      select: { guest_id: true, event_id: true, attending: true, dietary_restrictions: true },
    }),
    prisma.familyMemberRsvp.findMany({
      where: { familyMember: { guest: { side } } },
      select: { attending: true, familyMember: { select: { is_child: true } } },
    }),
    prisma.rsvpResponse.findMany({
      where: { guest: { side } },
      select: {
        attending: true,
        updated_at: true,
        guest: { select: { name: true } },
        event: { select: { name: true } },
      },
      orderBy: { updated_at: 'desc' },
      take: 10,
    }),
    prisma.budgetCategory.findMany({
      where: { side },
      select: { id: true, name: true, budgeted_amount: true },
    }),
    prisma.expense.findMany({
      where: { side },
      select: { amount: true, amount_paid: true, status: true },
    }),
    prisma.payment.findMany({
      where: {
        vendor: { side },
        status: { in: ['upcoming', 'overdue', 'partially_paid'] },
      },
      select: {
        id: true,
        amount: true,
        amount_paid: true,
        due_date: true,
        status: true,
        vendor: { select: { name: true } },
      },
      orderBy: { due_date: 'asc' },
      take: 3,
    }),
  ])

  // RSVP summary
  const guestIds = new Set(guests.map((g) => g.id))
  const totalInvited = guests.length
  const confirmedGuestIds = new Set(
    rsvpResponses.filter((r) => r.attending === true && guestIds.has(r.guest_id)).map((r) => r.guest_id)
  )
  const declinedGuestIds = new Set(
    rsvpResponses.filter((r) => r.attending === false && guestIds.has(r.guest_id)).map((r) => r.guest_id)
  )
  const respondedIds = new Set(rsvpResponses.filter((r) => guestIds.has(r.guest_id)).map((r) => r.guest_id))
  const guestsConfirmed = confirmedGuestIds.size
  const guestsDeclined = declinedGuestIds.size
  const guestsPending = totalInvited - respondedIds.size
  const responseRate = totalInvited > 0 ? Math.round((respondedIds.size / totalInvited) * 100) : 0

  // Per-event breakdown
  const perEvent = events.map((ev) => {
    const eventResponses = rsvpResponses.filter((r) => r.event_id === ev.id && guestIds.has(r.guest_id))
    const evConfirmed = eventResponses.filter((r) => r.attending === true).length
    const evDeclined = eventResponses.filter((r) => r.attending === false).length
    const evPending = totalInvited - eventResponses.length
    return { name: ev.name, confirmed: evConfirmed, declined: evDeclined, pending: evPending }
  })

  // Headcount
  const confirmedFamilyCount = familyMemberRsvps.filter((f) => f.attending === true).length
  // Guests (RsvpResponse) + true dependents (FamilyMemberRsvp) — non-overlapping after
  // dependents no longer get shadow Guest records
  const totalHeadcount = guestsConfirmed + confirmedFamilyCount
  const childrenAttending = familyMemberRsvps.filter(
    (f) => f.attending === true && f.familyMember.is_child
  ).length

  // Dietary summary (confirmed guests only)
  const dietaryMap = new Map<string, number>()
  for (const r of rsvpResponses) {
    if (r.attending === true && r.dietary_restrictions?.trim()) {
      const key = r.dietary_restrictions.trim().toLowerCase()
      dietaryMap.set(key, (dietaryMap.get(key) ?? 0) + 1)
    }
  }
  const dietarySummary = Array.from(dietaryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([note, count]) => ({ note, count }))

  // Budget snapshot
  const totalBudgeted = budgetCategories.reduce((s, c) => s + Number(c.budgeted_amount), 0)
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount_paid), 0)
  const totalRemaining = totalBudgeted - totalSpent

  return NextResponse.json({
    side,
    rsvp: { totalInvited, guestsConfirmed, guestsDeclined, guestsPending, responseRate },
    perEvent,
    headcount: { total: totalHeadcount, guests: guestsConfirmed, family: confirmedFamilyCount, children: childrenAttending },
    dietarySummary,
    recentActivity: recentRsvps.map((r) => ({
      guestName: r.guest.name,
      eventName: r.event.name,
      attending: r.attending,
      updatedAt: r.updated_at.toISOString(),
    })),
    budget: { totalBudgeted, totalSpent, totalRemaining },
    upcomingPayments: upcomingPayments.map((p) => ({
      id: p.id,
      vendorName: p.vendor.name,
      amount: Number(p.amount),
      amountPaid: Number(p.amount_paid),
      dueDate: p.due_date?.toISOString() ?? null,
      status: p.status,
    })),
  })
}
