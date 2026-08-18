# OpenWed

A full-stack wedding website platform for multi-day celebrations. Two families (bride side and groom side) manage their own content through separate admin panels. One shared public website for all guests.

> **OpenWed** is the open-source core of a wedding website platform. Self-host it for your own wedding, or use the managed hosting service.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

## Features

### Public Site
- Hero section with theatrical curtain reveal animation — personalized "Welcome, {Name}" for invited guests
- Events listing grouped by bride / groom / joint celebrations
- Individual event pages with venue map, dress code, and hotel-to-venue distances
- Travel & accommodations with Google Maps embeds and landmark distances
- RSVP flow via personal magic links — no name lookup, token-verified, pre-filled form
- Family member management with per-event attendance and household scoping
- RSVP confirmation email with `.ics` calendar attachment for all attending events
- Password protection gate (optional, configured via admin settings)

### Admin Panel
- **Super admin** — account management only (create/deactivate side admins)
- **Side admins** (bride & groom) — fully isolated, each sees only their own data
  - Guest list manager with bulk CSV import and per-guest event invitations
  - **Send Invites** — copy magic link, send email invite, or open WhatsApp per guest; bulk email all un-sent guests
  - RSVP response tracker with per-event headcounts and non-responder list
  - Rooms & hotels with Google Maps distance calculator
  - Finance tracker — vendors, expenses, payments, categories, reports
  - Site settings — events, gallery, hero image, RSVP deadline, site password

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| Database | Aiven PostgreSQL |
| ORM | Prisma 6 with `@prisma/adapter-pg` |
| Auth | NextAuth.js 4 — credentials provider, JWT sessions |
| File Storage | Cloudflare R2 (S3-compatible) |
| Maps | Google Maps Distance Matrix API + Embed API |
| Email | Resend — invite emails, password reset, RSVP confirmation |
| Fonts | Cormorant Garamond + DM Sans via Google Fonts |
| Deployment | Vercel |

## Getting Started

### Prerequisites
- Node.js 18+
- Aiven PostgreSQL (or any PostgreSQL instance) — download the CA cert
- Google Maps API key
- Resend API key + verified sending domain
- Cloudflare R2 bucket (for image uploads)

### Environment Variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL="postgresql://..."
DB_SSL_CERT_PATH="/path/to/ca.pem"        # local dev: file path to CA cert
DB_SSL_CERT=""                             # Vercel: base64-encoded CA cert (base64 -i ca.pem | tr -d '\n')

# Auth
NEXTAUTH_URL="http://localhost:3000"       # production: https://yourdomain.com
NEXTAUTH_SECRET="your-secret-here"
SUPER_ADMIN_EMAIL="admin@example.com"
SUPER_ADMIN_PASSWORD="strongpassword"

# Email
RESEND_API_KEY="re_..."
FROM_EMAIL="invites@yourdomain.com"

# Google Maps
GOOGLE_MAPS_API_KEY="your-server-side-key"
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="your-public-key"

# Cloudflare R2
R2_ACCOUNT_ID="your-account-id"
R2_BUCKET_NAME="your-bucket-name"
R2_ACCESS_KEY_ID="your-access-key"
R2_SECRET_ACCESS_KEY="your-secret-key"
R2_PUBLIC_URL="https://pub-xxx.r2.dev"
```

### Setup

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Seed the super admin account
npx prisma db seed

# (Optional) Seed demo data — a fictional couple with events, guests, hotels, budget
npm run seed:demo

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the public site.  
Open [http://localhost:3000/admin](http://localhost:3000/admin) for the admin panel.

### Demo Data

`npm run seed:demo` populates a fictional wedding (Aarav & Ananya) so you can explore every feature immediately:

| Role | Email | Password |
|---|---|---|
| Bride admin | `bride@demo.openwed.dev` | `DemoPass123!` |
| Groom admin | `groom@demo.openwed.dev` | `DemoPass123!` |

The demo includes 4 events (mehendi → sangeet → haldi → ceremony), 6 guest households with RSVP tokens, hotel rooms, budget categories, vendors, expenses and payments. Safe to re-run — it skips if demo data already exists. Delete the rows (or the whole database) when you're ready to set up your own wedding.

### Default Super Admin

After seeding, log in at `/admin/login` with the credentials from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` in your `.env`. The super admin creates bride-side and groom-side admin accounts at `/admin/accounts`.

## Project Structure

```
src/
├── app/
│   ├── admin/                  # Admin panel pages (sidebar layout)
│   │   ├── (dashboard)/        # Side-admin pages (guests, rsvps, finance, etc.)
│   │   ├── accounts/           # Super-admin only
│   │   ├── login/
│   │   ├── forgot-password/
│   │   └── reset-password/
│   ├── api/
│   │   ├── admin/              # Protected admin API routes
│   │   ├── auth/               # NextAuth + password reset
│   │   └── public/             # Public RSVP + token API routes
│   ├── enter/                  # Password gate page
│   ├── events/[id]/            # Individual event detail pages
│   └── rsvp/                   # RSVP flow (token-gated)
├── components/
│   ├── admin/                  # Sidebar, admin UI components
│   ├── public/                 # Hero, Navbar, Footer, CurtainReveal, etc.
│   └── ui/                     # Base UI components
├── lib/
│   ├── auth.ts                 # NextAuth configuration
│   ├── ics.ts                  # RFC 5545 iCalendar builder
│   ├── prisma.ts               # Prisma + pg.Pool singleton
│   ├── r2.ts                   # Cloudflare R2 upload/delete helpers
│   └── resend.ts               # Email via Resend API
├── admin-guard.ts              # JWT middleware logic (Edge-compatible)
└── middleware.ts               # Wires admin-guard as Next.js middleware
prisma/
├── schema.prisma
└── seed.ts
scripts/
└── migrate-images-to-r2.ts    # One-time script: move local uploads → R2
```

## Useful Commands

```bash
npm run dev                      # Start dev server
npm run build                    # Production build (runs prisma generate first)
npx prisma generate              # Regenerate Prisma client after schema changes
npx prisma db push               # Push schema changes to database
npx prisma studio                # Open Prisma Studio GUI
npx prisma db seed               # Re-seed super admin
npx tsc --noEmit --skipLibCheck  # Type check without building
```

## Deployment (Vercel)

1. Push to GitHub and import the repo in Vercel
2. Set all environment variables listed above in the Vercel dashboard
   - `DB_SSL_CERT`: run `base64 -i ca.pem | tr -d '\n'` and paste the output
   - `NEXTAUTH_URL`: set to your production domain (e.g. `https://wedding.example.com`)
3. Build command is pre-configured: `prisma generate && next build`
4. Before first deploy, run `scripts/migrate-images-to-r2.ts` locally to upload any existing images to R2

## Notes

- **RSVP magic links**: each guest has a unique `rsvp_token`. Invite links are `/?invite=<token>`. The homepage and RSVP page personalize based on this token — no name lookup required.
- **Side isolation**: every admin query filters by `session.user.side` — bride and groom admins never see each other's data.
- **Email**: uses raw `https.request` (not the Resend SDK) to work behind corporate proxies. Works on Vercel without any extra configuration.
- **File uploads**: images go to Cloudflare R2. `public/uploads/` is no longer used in production.
- **Corporate proxy (Zscaler)**: set `NODE_EXTRA_CA_CERTS=/path/to/zscaler-ca.pem` in your local `.env` — email and R2 clients pick it up automatically.
