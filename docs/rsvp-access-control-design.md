# RSVP Access-Control & Personalized-Invite Design — Handoff Brief

> **Status:** Design agreed with the user. **No code written yet.**
> **Your job (the session reading this):** Produce a detailed, file-by-file
> **implementation plan for the user's approval. PLAN ONLY — do not write or
> edit any code until the user approves the plan.**
>
> This brief is self-contained: it captures the problem, every decision the
> user made (with rationale), and the grounded code context so you don't have
> to re-derive anything. Verify file paths/line numbers still hold before
> planning against them — they were accurate at authoring time.

---

## 1. The problem being solved

The public RSVP flow currently lets **anyone RSVP as anyone**. There are two
independent leaks:

1. **Impersonation (door #1).** `LookupStep` → `POST /api/public/rsvp/lookup`
   returns any guest matching a typed name, and `GET/POST
   /api/public/rsvp/[guestId]` trusts the `guestId` with **zero verification**.
   Type a name, click the match, submit — you've RSVP'd as them. The `guestId`
   is a `cuid()` (unguessable), but the lookup endpoint hands it to you, so
   unguessability buys nothing today.

2. **Guest-list enumeration + silent overwrite (door #2).** `GET
   /api/public/guests/search` (used by `FamilyMemberCombobox`) lets anyone type
   2 chars and enumerate the entire guest list by name + side. Worse, the
   "add family member" POST path can (a) **create** new guest records
   (`newGuest` branch) and (b) find a guest by name+side and **mirror RSVPs onto
   that guest's record** — so an attacker can add "your name" as a family member
   and silently overwrite *your* attendance. This is a data-integrity hole, not
   just a privacy one.

**Constraint from the user:** keep the "add family member" functionality
working. So door #2 can't simply be deleted.

---

## 2. Decisions made (all locked)

Every item below was explicitly chosen by the user during brainstorming.

### 2.1 Front door: per-guest reusable magic link
- Each **guest** gets a **long-lived, reusable** RSVP token. The URL is the
  identity. **Per-guest**, not per-household (see rationale).
- No name-search front door → door #1 is closed **by removing the search**, not
  patching it.
- **Reusable + long-lived** (NOT one-time / 1-hour like the password-reset
  tokens) so guests can return and **edit** their RSVP.
- **Rationale for per-guest over per-household:** `household_group` is nullable
  free-text (`schema.prisma:87`), not a first-class entity — fragile as a
  credential. The existing "add family member" flow already does the household
  job: the primary invitee adds spouse/kids/parents, who become linked guests
  sharing `household_group`. So: send one link to the primary person per family;
  family members are handled by the existing add-member flow.
- **Rejected alternatives (and why):**
  - *Google/OAuth login for guests:* only yields a verified email; you'd still
    need every guest's exact email on file to map to a `Guest` row (email is
    `String?`, frequently null). Excludes non-Gmail / WhatsApp-only / elderly
    guests. Doesn't fit the household add-member model. **Note:** OAuth SSO would
    be a legitimately good upgrade for the **admin panel** (small known set of
    accounts) — out of scope here, but worth flagging to the user later.
  - *Per-guest shared code (name + code):* adds a typing step over a pasted link
    with no benefit when distributing by chat/email.

### 2.2 Link behavior: full "Option 3" personalization
The link lands on the **homepage** (not straight to the RSVP form) and
personalizes the experience:
- Link format: **`/?invite=<token>`**. Homepage is already `force-dynamic`
  (`src/app/page.tsx:10`), so a per-request DB lookup of token → guest is fine.
  (Chosen over `/rsvp/<token>` → cookie → redirect, which is heavier.)
- **Closed curtains show a personalized welcome:** `CurtainReveal`
  (`src/components/public/CurtainReveal.tsx`) currently shows a ♡ monogram +
  the word "Welcome" while closed (lines 68–108). Change it to
  **"Welcome, {First name}"** when a guest is resolved; fall back to plain
  **"Welcome"** for non-invited visitors (so the normal homepage is unchanged).
- **Hold the curtains closed longer (~2.5s) so the welcome is readable.**
  Current timing (`CurtainReveal.tsx:8-12`): `closed`→`opening` at **600ms**,
  `opening`→`done` at **3200ms**. Bump the open trigger to **~2.5s ONLY when a
  guestName is present**; non-invited visitors keep the fast 600ms reveal.
  (Adjust the `done` timer accordingly so it still unmounts after the 1.8s
  slide completes.)
- **Personalization carries into the site (full Option 3):**
  - Token captured (cookie/session) so identity persists as the guest browses.
  - A "Welcome back, {Name}" affordance in the nav (`Navbar`).
  - The homepage RSVP CTA (`page.tsx`, the `#rsvp` section) takes the guest
    **straight to their pre-filled RSVP form** — no re-identifying.
- **Welcome text:** "Welcome, {First name}" (first name only; falls back to
  plain "Welcome").
- **Hold time:** ~2.5s (user picked the recommended option).

### 2.3 Door #2: family-member search scoped to the caller's household
- `GET /api/public/guests/search` becomes **authenticated** (requires the
  caller's valid RSVP token) **and** returns **only guests in the caller's own
  `household_group`**. Free-typing brand-new people still works.
- This closes both the enumeration leak and the silent-RSVP-overwrite hole while
  preserving "add family member."
- Also review the POST family-member linking logic in
  `src/app/api/public/rsvp/[guestId]/route.ts` (the `findFirst` by name+side
  that mirrors RSVPs, lines ~146–223) so a caller can only affect people in
  their own household.

### 2.4 Distribution
The user does NOT want to manually message everyone. Two channels:

- **Email via Resend (automated).** Reuse the existing setup in
  `src/app/api/auth/forgot-password/route.ts`:
  - `new Resend(process.env.RESEND_API_KEY)`
  - `from: process.env.FROM_EMAIL ?? 'onboarding@resend.dev'`
  - URLs from `${process.env.NEXTAUTH_URL}` → link is
    `${process.env.NEXTAUTH_URL}/?invite=${token}`
  - Match the inline-styled HTML palette (gold `#B8860B`, charcoal `#2D2D2D`).
  - **Bulk send:** use `resend.batch.send` (up to 100/call), not a loop of
    single sends.
  - **Design defensively for the free-tier cap** (~100 emails/day, 3,000/month):
    chunk, track sent status, allow resuming the blast across days.
  - Use the existing unused `Guest.invitation_sent` field (`schema.prisma:89`)
    to track who's been emailed and avoid double-sends.
  - **Send-day note (not a blocker):** `onboarding@resend.dev` lands in spam /
    is rate-limited; the user should verify a sending domain before the real
    blast. Keep `FROM_EMAIL` configurable.
  - **Send-mode UI:** default to building BOTH a bulk "Send to all un-emailed
    guests" button AND a per-guest "Email link" button (user said "skip" on
    picking one — take this sensible default).

- **WhatsApp via `wa.me` tap-to-send (NOT automated).**
  - Admin generates, per guest, a `https://wa.me/<number>?text=<url-encoded
    personalized message with their /?invite=<token> link>`.
  - The user (or helpers) taps each to open WhatsApp with the message pre-filled
    to the right person, then hits send.
  - **No WhatsApp automation** — the user explicitly rejected both the official
    Cloud API (too much setup/approval for a one-time send) and the unofficial
    `whatsapp-web.js`/Baileys route (ToS violation, risks getting their personal
    number banned; delays reduce but do not remove the ban risk because the real
    trigger is identical-messages-to-non-contacts, not just velocity).

- **Admin per-guest actions:** `[Copy link] · [Email it] · [WhatsApp it]`, with
  `invitation_sent` tracking so the user can see who still needs a WhatsApp tap.

### 2.5 Editing
- Guests can return and edit after submitting → the token/link is **reusable and
  long-lived** (already reflected in 2.1).

---

## 3. Supporting work implied by the design
- **Schema:** add a unique, indexed `rsvp_token` to `Guest` (generate per
  guest). Note from project memory: `prisma db push` DOES work for this project.
- **Backfill:** existing guests need tokens generated (one-time script — same
  pattern as the prior `GuestEventInvitation` backfill mentioned in project
  memory).
- **Token capture + resolution:** homepage reads `?invite=<token>`, resolves to
  guest, sets cookie/session for Option 3 persistence.
- **API refactor:** `GET/POST /api/public/rsvp/[guestId]` must verify the token
  rather than trust a bare `guestId`. Consider keying the RSVP routes off the
  token itself so a bare `guestId` is never sufficient.
- **Remove** `POST /api/public/rsvp/lookup` (the impersonation door) and the
  `LookupStep` UI in `src/app/rsvp/RsvpFlow.tsx`.
- **Graceful fallback** for missing/invalid/mistyped tokens (not a raw 404):
  e.g. "This link isn't valid — please use the link we sent you, or contact us
  at {contact_email}".

---

## 4. Grounded code context (verify before relying on)

- `src/app/rsvp/page.tsx` — server component; loads `siteSettings`, renders
  `<RsvpFlow contactEmail rsvpDeadline />`.
- `src/app/rsvp/RsvpFlow.tsx` — client. Steps: `lookup | form | confirmation`.
  - `LookupStep` calls `POST /api/public/rsvp/lookup` (REMOVE).
  - `FamilyMemberCombobox` calls `GET /api/public/guests/search` (SCOPE +
    AUTH).
  - `RsvpFormStep` POSTs to `/api/public/rsvp/${guestId}`.
- `src/app/api/public/rsvp/lookup/route.ts` — name search returning any guest
  (REMOVE).
- `src/app/api/public/rsvp/[guestId]/route.ts` — GET builds the form payload
  (guest + invited events + existing RSVPs + family members); POST upserts
  everything. **No token check today.** Family-member linking mirrors RSVPs onto
  matched guests (the overwrite hole).
- `src/app/api/public/guests/search/route.ts` — open, unauthenticated,
  returns `{ id, name, side }` for any name match (SCOPE + AUTH).
- `src/app/page.tsx` — homepage, `force-dynamic`, renders `<CurtainReveal />`
  then `<Navbar>` + sections incl. the `#rsvp` CTA section.
- `src/components/public/CurtainReveal.tsx` — the curtain animation. Phases at
  lines 8–12; the closed-state "Welcome" block at lines 68–108.
- `src/app/api/auth/forgot-password/route.ts` — the Resend usage pattern to
  mirror for invite emails.
- `prisma/schema.prisma`:
  - `Guest` (line 78): has `email String?` (81), `household_group String?` (87),
    `invitation_sent Boolean @default(false)` (89, currently unused).
  - `FamilyMember` (103), `FamilyMemberRsvp` (160), `GuestEventInvitation` (175).

### Relevant project conventions (from CLAUDE.md / project memory)
- Next.js 16 (App Router), TS, Tailwind v4, CockroachDB, Prisma 6, NextAuth 4.
- `src/proxy.ts` is the middleware replacement; it handles admin route auth.
- Dynamic route params: `const { id } = await context.params`.
- Server component fetches data → passes to a `*Client.tsx` (`'use client'`).
- Design tokens: bg `#FFFDF7`, fg `#2D2D2D`, accent `#B8860B`, muted `#A3B18A`,
  highlight `#E8D5C4`; bride `#be185d`, groom `#1d4ed8`.
- Admin data isolation: every admin query filters by `session.side`; new records
  auto-tagged with the creating admin's side. Any admin invite UI must respect
  this (a side_admin should only send links to their own side's guests).

---

## 5. What to produce
A concrete implementation plan the user can approve, covering at least:
1. Schema change + generation strategy for `rsvp_token` + backfill script.
2. Token capture/resolution flow (`/?invite=` → guest → cookie/session) and how
   the homepage passes `guestName` into `CurtainReveal`.
3. `CurtainReveal` changes (personalized text + conditional ~2.5s hold).
4. Full Option 3 site personalization (nav "Welcome back", RSVP CTA → pre-filled
   form).
5. Token verification refactor of `/api/public/rsvp/[guestId]` (GET + POST),
   including fixing the family-member overwrite path.
6. Scoping + auth on `/api/public/guests/search`.
7. Removal of `lookup` route + `LookupStep`.
8. Admin invite UI: per-guest Copy/Email/WhatsApp + bulk email, with
   `invitation_sent` tracking, respecting side isolation.
9. Resend invite email (batch, free-tier-aware, configurable sender).
10. `wa.me` link generation.
11. Invalid/missing-token UX.
12. Edge cases: guests without a token yet, guests without a phone (no WhatsApp
    link), guests without an email (no email send), re-send behavior.

**Reminder: plan only. Get the user's approval before implementing.**
