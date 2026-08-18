import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/resend'
import { buildIcs, type IcsEventRow } from '@/lib/ics'

export async function GET(
  request: Request,
  context: { params: Promise<{ guestId: string }> }
) {
  const { guestId } = await context.params
  const { searchParams } = new URL(request.url)
  const tokenParam = searchParams.get('token')

  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      side: true,
      household_group: true,
      arrival_date: true,
      departure_date: true,
      rsvp_token: true,
    },
  })
  if (!guest || guest.rsvp_token !== tokenParam) {
    return NextResponse.json({ error: 'Invalid or missing invite token.' }, { status: 401 })
  }

  const eventSelect = { id: true, name: true, date: true, start_time: true, display_group: true, sort_order: true } as const
  const eventOrder = [{ sort_order: 'asc' as const }, { date: 'asc' as const }]

  const [invitedEvents, rsvpResponses, familyMembers, householdPeers] = await Promise.all([
    prisma.event.findMany({
      where: { guestInvitations: { some: { guest_id: guestId } } },
      select: eventSelect,
      orderBy: eventOrder,
    }),
    prisma.rsvpResponse.findMany({
      where: { guest_id: guestId },
      select: { event_id: true, attending: true, dietary_restrictions: true },
    }),
    prisma.familyMember.findMany({
      where: { guest_id: guestId },
      select: {
        id: true,
        name: true,
        is_child: true,
        rsvps: {
          select: { event_id: true, attending: true, dietary_restrictions: true },
        },
      },
    }),
    guest.household_group
      ? prisma.guest.findMany({
          where: {
            household_group: guest.household_group,
            id: { not: guestId },
            rsvpResponses: { some: {} },
          },
          select: {
            id: true,
            name: true,
            rsvpResponses: {
              select: { event_id: true, attending: true, dietary_restrictions: true },
            },
          },
        })
      : Promise.resolve([]),
  ])

  // Legacy guard: guest has no invitation rows (pre-migration) — fall back to all events
  const events = invitedEvents.length > 0
    ? invitedEvents
    : await prisma.event.findMany({ select: eventSelect, orderBy: eventOrder })

  const householdMembers = householdPeers.map((p) => ({
    id: p.id,
    name: p.name,
    rsvps: p.rsvpResponses,
  }))

  return NextResponse.json({ guest, events, rsvpResponses, familyMembers, householdMembers })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ guestId: string }> }
) {
  const { guestId } = await context.params

  const guest = await prisma.guest.findUnique({ where: { id: guestId }, select: { id: true, name: true, side: true, household_group: true, rsvp_token: true } })
  if (!guest) {
    return NextResponse.json({ error: 'Guest not found.' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { token: bodyToken, name, email, phone, arrival_date, departure_date, guestRsvps, familyMembers } = body as {
    token?: string | null
    name?: string | null
    email: string | null
    phone: string | null
    arrival_date: string | null
    departure_date: string | null
    guestRsvps: { event_id: string; attending: boolean; dietary_restrictions: string | null }[]
    familyMembers: {
      id?: string
      linked_guest_id?: string  // existing guest to link as family member
      name: string
      is_child: boolean
      rsvps: { event_id: string; attending: boolean; dietary_restrictions: string | null }[]
    }[]
  }

  // Guest may correct the spelling of their own name on the RSVP form; apply
  // it to the Guest record and use it in the confirmation email/response so
  // the corrected name shows everywhere. Fall back to the existing name.
  const newName = typeof name === 'string' && name.trim() ? name.trim() : guest.name

  // Token verification
  if (!bodyToken || guest.rsvp_token !== bodyToken) {
    return NextResponse.json({ error: 'Invalid or missing invite token.' }, { status: 401 })
  }

  if (!Array.isArray(guestRsvps)) {
    return NextResponse.json({ error: 'guestRsvps must be an array.' }, { status: 400 })
  }

  // Security: only allow RSVPs for events the guest was actually invited to
  const invitedRows = await prisma.guestEventInvitation.findMany({
    where: { guest_id: guestId },
    select: { event_id: true },
  })
  const invitedIds = new Set(invitedRows.map((r) => r.event_id))
  // invitedIds.size === 0 means legacy guest with no invitation rows — allow all through
  const validGuestRsvps = invitedIds.size === 0
    ? guestRsvps
    : guestRsvps.filter((r) => invitedIds.has(r.event_id))

  const result = await prisma.$transaction(async (tx) => {
    // Update contact info + accommodation dates (and name spelling if corrected)
    await tx.guest.update({
      where: { id: guestId },
      data: {
        ...(newName !== guest.name ? { name: newName } : {}),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        arrival_date: arrival_date?.trim() || null,
        departure_date: departure_date?.trim() || null,
      },
    })

    // Upsert guest RSVPs (only for invited events)
    for (const rsvp of validGuestRsvps) {
      await tx.rsvpResponse.upsert({
        where: { guest_id_event_id: { guest_id: guestId, event_id: rsvp.event_id } },
        create: {
          guest_id: guestId,
          event_id: rsvp.event_id,
          attending: rsvp.attending,
          dietary_restrictions: rsvp.dietary_restrictions ?? null,
        },
        update: {
          attending: rsvp.attending,
          dietary_restrictions: rsvp.dietary_restrictions ?? null,
        },
      })
    }

    const savedFamilyMembers: { id: string; name: string }[] = []

    // Process family-member rows. Three kinds:
    // 1. linked_guest_id → write only to that guest's RsvpResponse (no FamilyMember copy)
    // 2. fm.id → existing dependent: FamilyMember + FamilyMemberRsvp only
    // 3. neither → new dependent: create FamilyMember only (no shadow Guest)
    for (const fm of familyMembers ?? []) {
      const fmName = fm.name.trim()
      if (!fmName) continue

      // Guard: a guest cannot add or link themselves as their own +N — that
      // would double-count them in the Headcount (once as a direct guest and
      // again as a family member). Skip self-links and same-name additions.
      if (fm.linked_guest_id && fm.linked_guest_id === guestId) continue
      if (fmName.toLowerCase() === guest.name.trim().toLowerCase()) continue

      // ─── Linked existing household guest ───────────────────────────────────
      if (fm.linked_guest_id) {
        const linkedGuest = await tx.guest.findUnique({
          where: { id: fm.linked_guest_id },
          select: { id: true, name: true, household_group: true },
        })
        if (!linkedGuest) continue
        // Only allow linking guests within the same household_group
        if (
          !guest.household_group ||
          linkedGuest.household_group !== guest.household_group
        ) continue

        for (const rsvp of fm.rsvps ?? []) {
          // Only write RSVPs for events the caller was invited to (already filtered upstream
          // for guestRsvps; here we still accept the client's event_ids for the linked guest)
          await tx.rsvpResponse.upsert({
            where: {
              guest_id_event_id: {
                guest_id: linkedGuest.id,
                event_id: rsvp.event_id,
              },
            },
            create: {
              guest_id: linkedGuest.id,
              event_id: rsvp.event_id,
              attending: rsvp.attending ?? false,
              dietary_restrictions: rsvp.dietary_restrictions ?? null,
            },
            update: {
              attending: rsvp.attending ?? false,
              dietary_restrictions: rsvp.dietary_restrictions ?? null,
            },
          })
        }

        savedFamilyMembers.push({ id: linkedGuest.id, name: linkedGuest.name })
        continue
      }

      // ─── Existing or new dependent (FamilyMember only) ─────────────────────
      let fmId: string
      let resolvedName = fmName

      if (fm.id) {
        const existing = await tx.familyMember.findUnique({ where: { id: fm.id } })
        if (!existing || existing.guest_id !== guestId) continue
        resolvedName = existing.name // use stored name (don't let client rename here)
        await tx.familyMember.update({
          where: { id: fm.id },
          data: { is_child: fm.is_child },
        })
        fmId = fm.id
      } else {
        const created = await tx.familyMember.create({
          data: { guest_id: guestId, name: fmName, is_child: fm.is_child },
        })
        fmId = created.id
      }

      savedFamilyMembers.push({ id: fmId, name: resolvedName })

      for (const rsvp of fm.rsvps ?? []) {
        const fmAttending = rsvp.attending ?? false
        await tx.familyMemberRsvp.upsert({
          where: {
            family_member_id_event_id: {
              family_member_id: fmId,
              event_id: rsvp.event_id,
            },
          },
          create: {
            family_member_id: fmId,
            event_id: rsvp.event_id,
            attending: fmAttending,
            dietary_restrictions: rsvp.dietary_restrictions ?? null,
          },
          update: {
            attending: fmAttending,
            dietary_restrictions: rsvp.dietary_restrictions ?? null,
          },
        })
      }
    }

    return savedFamilyMembers
  })

  // Fetch event details for confirmation + calendar generation
  const attendingEventIds = validGuestRsvps.filter((r) => r.attending).map((r) => r.event_id)
  const attendingEvents = attendingEventIds.length
    ? await prisma.event.findMany({
        where: { id: { in: attendingEventIds } },
        select: {
          id: true,
          name: true,
          date: true,
          start_time: true,
          end_time: true,
          venue_name: true,
          venue_address: true,
          description: true,
          dress_code: true,
        },
        orderBy: [{ sort_order: 'asc' }, { date: 'asc' }],
      })
    : []

  // Send confirmation email with .ics attachment if guest has an email and is attending events
  const guestEmail = body.email?.trim() || null
  if (guestEmail && attendingEvents.length > 0) {
    const firstName = newName.split(' ')[0]
    const fromEmail = process.env.FROM_EMAIL ?? 'onboarding@resend.dev'

    const icsData = buildIcs(attendingEvents as IcsEventRow[])
    const icsBase64 = Buffer.from(icsData).toString('base64')

    const eventListHtml = attendingEvents
      .map((e) => {
        const dateStr = e.date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
        const time = e.start_time ? ` at ${e.start_time}` : ''
        const venue = e.venue_name ? `<br/><span style="color:#A3B18A;font-size:12px;">${e.venue_name}${e.venue_address ? ', ' + e.venue_address : ''}</span>` : ''
        return `<li style="margin-bottom:12px;"><strong style="color:#2D2D2D;">${e.name}</strong><br/><span style="color:#555;font-size:13px;">${dateStr}${time}</span>${venue}</li>`
      })
      .join('')

    await sendEmail({
      from: fromEmail,
      to: guestEmail,
      subject: "We can't wait to celebrate with you!",
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #FFFDF7;">
          <p style="font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: #A3B18A; margin: 0 0 24px;">
            Aarav &amp; Ananya
          </p>
          <p style="font-size: 15px; color: #2D2D2D; margin: 0 0 16px; line-height: 1.7;">
            As-salamu alaykum wa rahmatullahi wa barakatuh
          </p>
          <h2 style="font-size: 28px; font-weight: 300; color: #2D2D2D; margin: 0 0 16px;">
            Thank you, ${firstName}!
          </h2>
          <p style="color: #555; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">
            We're so happy you'll be joining us to celebrate our wedding. Your RSVP has been received.
          </p>
          <p style="color: #2D2D2D; font-size: 14px; font-weight: 500; margin: 0 0 12px;">
            You're coming to:
          </p>
          <ul style="padding-left: 16px; margin: 0 0 24px; color: #555;">
            ${eventListHtml}
          </ul>
          <p style="color: #555; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">
            We've attached the calendar invites to this email — just open the <strong>.ics</strong> file to add all your events to your calendar.
          </p>
          <p style="color: #A3B18A; font-size: 12px; margin: 28px 0 0;">
            With love,<br/>Aarav &amp; Ananya
          </p>
        </div>
      `,
      attachments: [
        {
          filename: 'wedding-invite.ics',
          content: icsBase64,
        },
      ],
    }).catch(() => {
      // Don't fail the RSVP if email sending fails
    })
  }

  return NextResponse.json({
    success: true,
    guestName: newName,
    attendingEvents: attendingEvents.map((e) => e.name),
    attendingEventDetails: attendingEvents.map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date.toISOString(),
      start_time: e.start_time,
      end_time: e.end_time,
      venue_name: e.venue_name,
      venue_address: e.venue_address,
      description: e.description,
      dress_code: e.dress_code,
    })),
    familyMemberNames: result.map((fm) => fm.name),
  })
}
