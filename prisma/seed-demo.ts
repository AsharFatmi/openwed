import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const prisma = new PrismaClient()

/**
 * Demo seed — populates a fictional wedding so the app is explorable
 * immediately after `docker compose up` / `npm run dev`.
 *
 * Run with: npm run seed:demo
 * Safe to re-run: skips if demo data already exists.
 */

const DEMO_MARKER = 'Aarav & Ananya'

async function main() {
  const existing = await prisma.siteSettings.findUnique({
    where: { key: 'couple_names' },
  })
  if (existing?.value === DEMO_MARKER) {
    console.log('Demo data already present — skipping.')
    return
  }

  const passwordHash = await bcrypt.hash('DemoPass123!', 12)

  // ─── Admins ────────────────────────────────────────────────────────────────
  await prisma.adminUser.createMany({
    data: [
      {
        email: 'bride@demo.openwed.dev',
        password_hash: passwordHash,
        name: 'Ananya Sharma (Bride)',
        role: 'side_admin',
        side: 'bride',
        active: true,
      },
      {
        email: 'groom@demo.openwed.dev',
        password_hash: passwordHash,
        name: 'Aarav Kapoor (Groom)',
        role: 'side_admin',
        side: 'groom',
        active: true,
      },
    ],
  })

  // ─── Guests ───────────────────────────────────────────────────────────────
  const token = () => crypto.randomBytes(32).toString('hex')
  const guests = [
    {
      name: 'Priya Sharma',
      email: 'priya.sharma@example.com',
      phone: '+91 98100 12345',
      city: 'Mumbai',
      state: 'Maharashtra',
      household_group: 'Sharma Family',
      side: 'bride' as const,
      rsvp_token: token(),
      familyMembers: [
        { name: 'Rohan Sharma', is_child: false },
        { name: 'Aisha Sharma', is_child: true },
      ],
    },
    {
      name: 'Vikram Singh',
      email: 'vikram.singh@example.com',
      phone: '+91 98200 54321',
      city: 'Delhi',
      state: 'Delhi',
      household_group: 'Singh Family',
      side: 'groom' as const,
      rsvp_token: token(),
      familyMembers: [{ name: 'Meera Singh', is_child: false }],
    },
    {
      name: 'Neha Patel',
      email: 'neha.patel@example.com',
      phone: '+91 98300 11111',
      city: 'Ahmedabad',
      state: 'Gujarat',
      household_group: 'Patel Family',
      side: 'bride' as const,
      rsvp_token: token(),
      familyMembers: [],
    },
    {
      name: 'Arjun Mehta',
      email: 'arjun.mehta@example.com',
      phone: '+91 98400 22222',
      city: 'Bengaluru',
      state: 'Karnataka',
      household_group: 'Mehta Family',
      side: 'groom' as const,
      rsvp_token: token(),
      familyMembers: [{ name: 'Kavya Mehta', is_child: true }],
    },
    {
      name: 'Sneha Reddy',
      email: 'sneha.reddy@example.com',
      phone: '+91 98500 33333',
      city: 'Hyderabad',
      state: 'Telangana',
      household_group: 'Reddy Family',
      side: 'bride' as const,
      rsvp_token: token(),
      familyMembers: [],
    },
    {
      name: 'Karan Malhotra',
      email: 'karan.malhotra@example.com',
      phone: '+91 98600 44444',
      city: 'Chandigarh',
      state: 'Punjab',
      household_group: 'Malhotra Family',
      side: 'groom' as const,
      rsvp_token: token(),
      familyMembers: [{ name: 'Simran Malhotra', is_child: false }],
    },
  ]

  for (const g of guests) {
    const { familyMembers, ...guest } = g
    const created = await prisma.guest.create({ data: guest })
    for (const fm of familyMembers) {
      await prisma.familyMember.create({
        data: { ...fm, guest_id: created.id },
      })
    }
  }

  // ─── Events (multi-day Indian wedding) ────────────────────────────────────
  const events = [
    {
      name: 'Mehendi',
      date: new Date('2026-11-20T16:00:00Z'),
      start_time: '4:00 PM',
      end_time: '8:00 PM',
      venue_name: 'The Rose Garden',
      venue_address: '12 Lakeview Road, Udaipur',
      description: 'An afternoon of henna, music and chai for both families.',
      dress_code: 'Casual festive',
      managed_by: 'bride' as const,
      display_group: 'joint' as const,
      sort_order: 1,
    },
    {
      name: 'Sangeet',
      date: new Date('2026-11-21T19:00:00Z'),
      start_time: '7:00 PM',
      end_time: '11:30 PM',
      venue_name: 'The Rose Garden',
      venue_address: '12 Lakeview Road, Udaipur',
      description: 'An evening of dance performances by both families.',
      dress_code: 'Traditional',
      managed_by: 'groom' as const,
      display_group: 'joint' as const,
      sort_order: 2,
    },
    {
      name: 'Haldi',
      date: new Date('2026-11-22T09:00:00Z'),
      start_time: '9:00 AM',
      end_time: '12:00 PM',
      venue_name: 'Lake Palace Courtyard',
      venue_address: 'Lake Pichola, Udaipur',
      description: 'The turmeric ceremony — an intimate morning with close family.',
      dress_code: 'Yellow / casual',
      managed_by: 'bride' as const,
      display_group: 'joint' as const,
      sort_order: 3,
    },
    {
      name: 'Wedding Ceremony',
      date: new Date('2026-11-23T18:00:00Z'),
      start_time: '6:00 PM',
      end_time: '10:00 PM',
      venue_name: 'Lake Palace',
      venue_address: 'Lake Pichola, Udaipur',
      description: 'The main ceremony, followed by dinner and celebrations.',
      dress_code: 'Formal traditional',
      managed_by: 'groom' as const,
      display_group: 'joint' as const,
      sort_order: 4,
    },
  ]

  for (const e of events) {
    await prisma.event.create({ data: e })
  }

  // ─── Hotels & rooms ───────────────────────────────────────────────────────
  const hotel = await prisma.hotel.create({
    data: {
      name: 'The Lake Palace Hotel',
      address: 'Lake Pichola, Udaipur',
      city: 'Udaipur',
      total_rooms: 20,
      check_in_date: new Date('2026-11-20T14:00:00Z'),
      check_out_date: new Date('2026-11-24T11:00:00Z'),
      contact_phone: '+91 294 242 8800',
      distance_info: '10 min from the ceremony venue',
      side: 'bride' as const,
      notes: 'Block booking for out-of-town guests',
    },
  })

  const rooms = [
    { room_number: '101', room_type: 'double' as const, capacity: 2, floor: '1' },
    { room_number: '102', room_type: 'double' as const, capacity: 2, floor: '1' },
    { room_number: '201', room_type: 'suite' as const, capacity: 3, floor: '2' },
    { room_number: '202', room_type: 'single' as const, capacity: 1, floor: '2' },
  ]
  for (const r of rooms) {
    await prisma.room.create({ data: { ...r, hotel_id: hotel.id } })
  }

  // ─── Budget, vendors, expenses, payments ─────────────────────────────────
  const catVenue = await prisma.budgetCategory.create({
    data: { name: 'Venue & Catering', budgeted_amount: 800000, side: 'groom' as const, sort_order: 1 },
  })
  const catDecor = await prisma.budgetCategory.create({
    data: { name: 'Decor & Flowers', budgeted_amount: 200000, side: 'bride' as const, sort_order: 2 },
  })

  const vendorVenue = await prisma.vendor.create({
    data: {
      name: 'Lake Palace Events',
      category: 'Venue',
      contact_name: 'Ramesh Joshi',
      phone: '+91 294 242 8800',
      email: 'events@lakepalace.example.com',
      contract_amount: 750000,
      side: 'groom' as const,
    },
  })
  const vendorFlorist = await prisma.vendor.create({
    data: {
      name: 'Blossom Decor',
      category: 'Decor',
      contact_name: 'Sunita Agarwal',
      phone: '+91 98290 55555',
      email: 'hello@blossomdecor.example.com',
      contract_amount: 180000,
      side: 'bride' as const,
    },
  })

  await prisma.expense.create({
    data: {
      category_id: catVenue.id,
      vendor_id: vendorVenue.id,
      description: 'Venue booking deposit',
      amount: 300000,
      date: new Date('2026-06-15'),
      payment_method: 'Bank transfer',
      status: 'paid',
      amount_paid: 300000,
      side: 'groom' as const,
    },
  })
  await prisma.expense.create({
    data: {
      category_id: catDecor.id,
      vendor_id: vendorFlorist.id,
      description: 'Floral decor for all four events',
      amount: 180000,
      date: new Date('2026-07-01'),
      payment_method: 'UPI',
      status: 'partially_paid',
      amount_paid: 90000,
      side: 'bride' as const,
    },
  })

  await prisma.payment.create({
    data: {
      vendor_id: vendorVenue.id,
      amount: 450000,
      due_date: new Date('2026-10-01'),
      status: 'upcoming',
      amount_paid: 0,
    },
  })
  await prisma.payment.create({
    data: {
      vendor_id: vendorFlorist.id,
      amount: 90000,
      due_date: new Date('2026-11-01'),
      status: 'upcoming',
      amount_paid: 0,
    },
  })

  // ─── Site settings ────────────────────────────────────────────────────────
  const settings: Record<string, string> = {
    couple_names: DEMO_MARKER,
    wedding_date: '2026-11-23T18:00:00.000Z',
    rsvp_deadline: '2026-10-31T23:59:59.000Z',
    wedding_hashtag: '#AaravWedsAnanya',
    contact_email: 'wedding@demo.openwed.dev',
    bride_contact_email: 'ananya@demo.openwed.dev',
    groom_contact_email: 'aarav@demo.openwed.dev',
    hero_image: '',
    wedding_city: 'Udaipur, Rajasthan',
    site_password: '',
    chotu_partner1_bio: 'Ananya Sharma — a paediatrician who loves classical dance and long chai conversations.',
    chotu_partner2_bio: 'Aarav Kapoor — a software engineer who plans the perfect playlist for every occasion.',
    chotu_contact_name: 'Ananya Sharma',
    chotu_contact_email: 'ananya@demo.openwed.dev',
    chotu_contact_whatsapp: '+91 98100 12345',
    chotu_extra_instructions: 'Demo couple — answer questions about the wedding events, venues and travel.',
  }

  for (const [key, value] of Object.entries(settings)) {
    await prisma.siteSettings.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
  }

  // ─── Demo chat history ──────────────────────────────────────────────────
  await prisma.adminChatMessage.createMany({
    data: [
      {
        side: 'bride',
        role: 'user',
        content: 'How many guests have RSVPed for the Sangeet so far?',
      },
      {
        side: 'bride',
        role: 'assistant',
        content: 'So far 4 of 6 invited households have confirmed for the Sangeet. Want me to list who is still pending?',
      },
    ],
  })

  console.log('Demo data seeded:')
  console.log('  Bride admin: bride@demo.openwed.dev / DemoPass123!')
  console.log('  Groom admin: groom@demo.openwed.dev / DemoPass123!')
  console.log('  Couple: Aarav & Ananya — 4 events, 6 guest households, 2 hotels, budget & vendors.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
