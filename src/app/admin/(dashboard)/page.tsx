import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'side_admin') redirect('/admin/login')

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
    roomAssignments,
    totalRoomsResult,
    totalCapacityResult,
    invitations,
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
      select: { attending: true, familyMember: { select: { id: true, is_child: true } } },
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
    prisma.roomAssignment.findMany({
      where: { guest: { side } },
      select: { guest_id: true, family_member_id: true },
    }),
    prisma.room.count({
      where: { hotel: { side } },
    }),
    prisma.room.aggregate({
      _sum: { capacity: true },
      where: { hotel: { side } },
    }),
    prisma.guestEventInvitation.findMany({
      where: { guest: { side } },
      select: { guest_id: true, event_id: true },
    }),
  ])

  // RSVP summary — Confirmed / Declined / Pending are mutually exclusive and
  // always sum to totalInvited. A guest who says yes to one event and no to
  // another counts as Confirmed only (not both), so the cards reconcile.
  const guestIds = new Set(guests.map((g) => g.id))
  const totalInvited = guests.length
  const confirmedGuestIds = new Set(
    rsvpResponses.filter((r) => r.attending === true && guestIds.has(r.guest_id)).map((r) => r.guest_id)
  )
  const respondedIds = new Set(rsvpResponses.filter((r) => guestIds.has(r.guest_id)).map((r) => r.guest_id))
  const guestsConfirmed = confirmedGuestIds.size
  // Declined = responded but not confirmed (no "yes" to any event).
  const guestsDeclined = respondedIds.size - confirmedGuestIds.size
  const guestsPending = totalInvited - respondedIds.size
  const responseRate = totalInvited > 0 ? Math.round((respondedIds.size / totalInvited) * 100) : 0

  // Per-event breakdown — "pending" is counted against the guests actually
  // invited to that event (via GuestEventInvitation), not every guest on the
  // side. Guests with a response but no invitation row (legacy fallback) are
  // included so they're never dropped from the count.
  const invitedByEvent = new Map<string, Set<string>>()
  for (const inv of invitations) {
    let s = invitedByEvent.get(inv.event_id)
    if (!s) {
      s = new Set()
      invitedByEvent.set(inv.event_id, s)
    }
    s.add(inv.guest_id)
  }
  const perEvent = events.map((ev) => {
    const evResponses = rsvpResponses.filter((r) => r.event_id === ev.id && guestIds.has(r.guest_id))
    const evInvited = new Set(invitedByEvent.get(ev.id) ?? [])
    for (const r of evResponses) evInvited.add(r.guest_id)
    const confirmed = evResponses.filter((r) => r.attending === true).length
    const declined = evResponses.filter((r) => r.attending === false).length
    return {
      name: ev.name,
      confirmed,
      declined,
      pending: evInvited.size - confirmed - declined,
    }
  })

  // Headcount — count DISTINCT family members attending >=1 event, not
  // per-event response rows (a member attending 4 events is one person).
  const confirmedFamilyMemberIds = new Set(
    familyMemberRsvps.filter((f) => f.attending === true).map((f) => f.familyMember.id)
  )
  const confirmedFamilyCount = confirmedFamilyMemberIds.size
  const childrenAttending = new Set(
    familyMemberRsvps
      .filter((f) => f.attending === true && f.familyMember.is_child)
      .map((f) => f.familyMember.id)
  ).size

  // Dietary summary (confirmed only)
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

  // Room assignments — counted per person (primary guest or family member),
  // so the Rooms cards reconcile with the Headcount total. A person is
  // "assigned" if they have a room-assignment row; family members are keyed
  // by family_member_id, primary guests by a null family_member_id.
  const peopleConfirmed = guestsConfirmed + confirmedFamilyMemberIds.size
  const peopleAssigned = roomAssignments.filter((a) =>
    a.family_member_id == null
      ? confirmedGuestIds.has(a.guest_id)
      : confirmedFamilyMemberIds.has(a.family_member_id)
  ).length
  const roomsUnassigned = peopleConfirmed - peopleAssigned
  const totalCapacity = totalCapacityResult._sum.capacity ?? 0

  // Budget
  const totalBudgeted = budgetCategories.reduce((s, c) => s + Number(c.budgeted_amount), 0)
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount_paid), 0)

  return (
    <DashboardClient
      side={side}
      rsvp={{ totalInvited, guestsConfirmed, guestsDeclined, guestsPending, responseRate }}
      perEvent={perEvent}
      headcount={{ total: guestsConfirmed + confirmedFamilyCount, guests: guestsConfirmed, family: confirmedFamilyCount, children: childrenAttending }}
      dietarySummary={dietarySummary}
      recentActivity={recentRsvps.map((r) => ({
        guestName: r.guest.name,
        eventName: r.event.name,
        attending: r.attending,
        updatedAt: r.updated_at.toISOString(),
      }))}
      rooms={{ totalRooms: totalRoomsResult, assigned: peopleAssigned, unassigned: roomsUnassigned, totalCapacity }}
      budget={{ totalBudgeted, totalSpent, totalRemaining: totalBudgeted - totalSpent }}
      upcomingPayments={upcomingPayments.map((p) => ({
        id: p.id,
        vendorName: p.vendor.name,
        amount: Number(p.amount),
        amountPaid: Number(p.amount_paid),
        dueDate: p.due_date?.toISOString() ?? null,
        status: p.status,
      }))}
    />
  )
}
