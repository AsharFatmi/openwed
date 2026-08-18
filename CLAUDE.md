@AGENTS.md

# Wedding Website

## Project Overview
A wedding website for an Indian arranged marriage with multi-day events. 
Two families (bride side and groom side) plan independently through 
separate admin panels. One shared public website for all guests.

## Tech Stack
- **Framework:** Next.js 16.2.6 (App Router, TypeScript)
- **Styling:** Tailwind CSS v4
- **Database:** Aiven PostgreSQL
- **ORM:** Prisma 6 with `@prisma/adapter-pg` (pg.Pool, SSL via CA cert)
- **Auth:** NextAuth.js 4 (credentials provider, JWT sessions)
- **File Storage:** Cloudflare R2 via `@aws-sdk/client-s3` (`src/lib/r2.ts`)
- **Charts:** Recharts
- **Email:** Resend via raw `https.request` (`src/lib/resend.ts`) — works behind Zscaler locally and on Vercel
- **Fonts:** Cormorant Garamond (`--font-cormorant`), DM Sans (`--font-dm-sans`) via Google Fonts

## Architecture
- Public site: single-page scroll layout at /
- Admin panel: /admin/* routes, protected by middleware
- Three admin roles: super_admin, bride side_admin, groom side_admin
- Data isolation: every admin query filters by session.side
- Super admin can only access /admin/accounts (account management)
- Side admins access /admin (dashboard) and all sub-pages

## Middleware
- `src/admin-guard.ts` — JWT enforcement logic, Edge-compatible (no DB calls, no Node.js-only modules)
- `src/middleware.ts` — wires admin-guard as Next.js middleware; `config` must be a static literal here (cannot be re-exported)

## Design
- Background: #FFFDF7 (warm ivory)
- Text: #2D2D2D (charcoal)
- Accent: #B8860B (antique gold)
- Muted: #A3B18A (sage)
- Highlight: #E8D5C4 (blush)
- Bride side admin accent: #be185d (warm pink)
- Groom side admin accent: #1d4ed8 (cool blue)
- Style: elegant, minimal, generous whitespace
- Animations: subtle fade-in on scroll, no bouncing

## Key Patterns
- All admin API routes must read `role` and `side` from the JWT session
- Super admin routes reject side_admin, and vice versa
- New records (guests, vendors, hotels, expenses, categories) auto-tagged 
  with the creating admin's side
- Events have `managed_by` (which admin controls it) and `display_group` 
  (where it appears on public site: bride/groom/joint)
- Partial payments: when status = "partially_paid", store amount_paid and 
  calculate remaining as amount - amount_paid
- Family members (Plus-N RSVP): guests can add unlimited family members, 
  each with per-event attendance, scoped to the same household_group
- Password reset: token-based, 1-hour expiry, one-time use, via Resend
- RSVP magic links: each guest has a unique `rsvp_token`; invite URL is `/?invite=<token>`; token is verified on every RSVP GET/POST
- Cookie persistence: `rsvp_token` HttpOnly cookie set via `/api/public/set-token` Route Handler (cookies cannot be set in Server Components)
- File uploads: always use `uploadToR2` / `deleteFromR2` from `src/lib/r2.ts` — never write to local filesystem
- WhatsApp templates: stored per-side in `SiteSettings` as key `whatsapp_templates_{side}`, JSON value `{ templates: WhatsAppTemplate[] }`; managed via `GET/PUT /api/admin/whatsapp-templates`; `WhatsAppTemplate` type and `DEFAULT_TEMPLATE` constant exported from that route file; `{name}` and `{link}` are personalization placeholders; exactly one template has `active: true` at a time; `{link}` resolves to `/?invite=<rsvp_token>` — unique per guest
- Guest phase grouping: Invitations and Send Invites pages group guests into phases by `created_at` — guests within ±1 day of the earliest un-grouped guest form one phase; implemented client-side with `buildPhases()`; use `React.Fragment` with an explicit `key` prop (NOT the `<>` shorthand) when rendering keyed fragments inside `.map()`
- R2 CORS: Cloudflare R2 bucket requires a CORS policy allowing `https://your-wedding-domain.com` (and `http://localhost:3000` for dev) for browser-direct presigned PUT uploads to work; this is a Cloudflare dashboard setting, not a code change

## Database
- Provider: postgresql (Aiven)
- Connection: DATABASE_URL in .env
- SSL cert: `DB_SSL_CERT_PATH` (local dev file path) or `DB_SSL_CERT` (base64, for Vercel)
- Schema: prisma/schema.prisma
- Schema changes: `npx prisma db push` then `npx prisma generate`

## Commands
- Dev server: `npm run dev`
- Build: `npm run build` (runs `prisma generate && next build`)
- Prisma generate: `npx prisma generate`
- Push schema: `npx prisma db push`
- Seed super admin: `npx prisma db seed`
- Prisma studio: `npx prisma studio`
- Type check: `npx tsc --noEmit --skipLibCheck`

## File Structure Convention
- /src/app — Next.js pages and API routes
- /src/app/admin — admin pages and layouts
- /src/app/api — API routes
- /src/components — shared React components
- /src/components/ui — base UI components (buttons, inputs, cards)
- /src/components/admin — admin-specific components
- /src/components/public — public site components
- /src/lib — utilities (db client, auth config, helpers)
- /src/lib/prisma.ts — Prisma + pg.Pool singleton (both globalThis-guarded)
- /src/lib/auth.ts — NextAuth configuration
- /src/lib/r2.ts — Cloudflare R2 helpers
- /src/lib/resend.ts — Resend email helpers
- /src/lib/ics.ts — RFC 5545 iCalendar builder
- /src/admin-guard.ts — middleware logic (renamed from proxy.ts)
- /src/middleware.ts — Next.js middleware entry point
- /src/app/api/admin/whatsapp-templates/route.ts — GET/PUT WhatsApp message templates per side
- /prisma — schema and seed files
- /scripts — one-time utility scripts (e.g. migrate-images-to-r2.ts)

## Rules
- Never hardcode event names — always pull from the Event table
- Never show cross-side data in admin views
- Always use TypeScript — no `any` types
- Use server components by default, client components only when needed
- API routes return proper HTTP status codes and error messages
- All forms have loading states and error handling
- All tables have empty states when no data exists
- Mobile-first responsive design on every page
- Never write files to local filesystem — use R2 for all uploads
- `config` export in middleware.ts must be a static literal (Next.js parses it at compile time)

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
