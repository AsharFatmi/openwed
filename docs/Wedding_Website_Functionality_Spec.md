# Wedding Website — Functionality Specification

**Wedding Type:** Multi-day, multi-event (Indian arranged marriage)  
**Guest Count:** 150–300 (split across bride side and groom side)  
**Event Access:** All guests invited to all events  
**Admin Model:** Two separate admin logins — Bride Side and Groom Side — with complete data isolation  
**Tech Stack:** Next.js + Tailwind CSS + Prisma + CockroachDB + NextAuth.js  
**Hosting:** Replit Core  

---

## Architecture: Two-Sided Admin Isolation

The app has one public website and two completely independent admin panels.

**Core rule: Bride admin sees only bride-side data. Groom admin sees only groom-side data. No exceptions, no combined views, no cross-side visibility.**

Every relevant table carries a `side` column (`bride` or `groom`). When an admin logs in, every database query is automatically filtered by their side. They cannot see, edit, or access the other side's data.

The public website is shared — all guests (both sides) see the same site, the same events, and the same RSVP form.

---

## Database Schema Overview

Before the features — here's what the database needs to hold. Every feature below maps back to these tables.

```
AdminUser       → email, password_hash, name, 
                  role (super_admin/side_admin),
                  side (bride/groom/null for super_admin)

PasswordResetToken → admin_user_id (FK), token_hash, 
                     expires_at, used (boolean), created_at

Guest           → name, email, phone, address, city, state, zip, 
                  household_group, side (bride/groom),
                  invitation_sent, notes, created_at

FamilyMember    → guest_id (FK), name, is_child (boolean),
                  created_at
                  (inherits side from parent guest)

Event           → name, date, start_time, end_time, 
                  venue_name, venue_address, description, 
                  dress_code, map_url,
                  managed_by (bride/groom),
                  display_group (bride/groom/joint),
                  sort_order

RsvpResponse    → guest_id, event_id, attending (yes/no),
                  dietary_restrictions, submitted_at, updated_at
                  (inherits side from parent guest)

FamilyMemberRsvp → family_member_id (FK), event_id, 
                   attending (yes/no), dietary_restrictions
                   (inherits side from parent guest)

Hotel           → name, address, city, map_url, total_rooms,
                  check_in_date, check_out_date, 
                  contact_phone, side (bride/groom), notes

Room            → hotel_id (FK), room_number, room_type 
                  (single/double/suite), capacity, floor, notes
                  (inherits side from parent hotel)

RoomAssignment  → room_id (FK), guest_id (FK), 
                  check_in, check_out, notes, assigned_at
                  (inherits side from parent guest)

BudgetCategory  → name, budgeted_amount, sort_order,
                  side (bride/groom)

Expense         → category_id, vendor_id (nullable), description,
                  amount, date, payment_method, 
                  status (paid/pending/partially_paid/overdue),
                  amount_paid (for partial payments),
                  side (bride/groom), notes, receipt_url

Vendor          → name, category, contact_name, phone, email, 
                  website, contract_amount, 
                  side (bride/groom), notes

Payment         → vendor_id, amount, due_date, paid_date, 
                  status (upcoming/paid/partially_paid/overdue), 
                  amount_paid (for partial payments),
                  method, notes
                  (inherits side from parent vendor)

SiteImage       → slot (hero/event_{event_id}/hotel_{hotel_id}/
                  gallery_1/gallery_2/etc.), 
                  file_path, alt_text, original_filename,
                  uploaded_at

SiteSettings    → key, value (key-value store for hashtag, 
                  contact_email, password_gate_enabled, 
                  rsvp_deadline, site_password, etc.)
```

**Side inheritance rules:** FamilyMember, RsvpResponse, FamilyMemberRsvp, Room, RoomAssignment, and Payment don't need their own `side` column — they inherit it from their parent record (Guest, Hotel, or Vendor). Queries join to the parent table to filter by side.

---

## PHASE 1 — Public Wedding Website

These are the pages your guests see. No login required.

---

### 1.1 Navigation

| Feature | Details |
|---------|---------|
| Fixed top navbar | Stays visible on scroll, semi-transparent background |
| Menu items | Home, Events, RSVP, Travel & Stay |
| Mobile hamburger | Slide-out menu on screens under 768px |
| RSVP highlight button | Accent-colored CTA button in navbar, always visible |

---

### 1.2 Hero Section (Landing)

| Feature | Details |
|---------|---------|
| Couple's names | Large display font, centered |
| Wedding date | Formatted elegantly (e.g., "November Twenty-Second, Two Thousand Twenty-Six") |
| City / venue teaser | Short line like "Celebrating in Chicago, Illinois" |
| Countdown timer | Days, hours, minutes, seconds until ceremony date — live ticking |
| Hero image/illustration | Full-viewport background or large centered photo |
| Scroll indicator | Subtle down-arrow animation to hint at content below |
| RSVP call-to-action | Button linking to RSVP section |

---

### 1.3 Event Details

Events displayed in groups, then chronologically within each group. All configurable from admin.

| Feature | Details |
|---------|---------|
| Display groups | Events grouped under headings: "Bride's Celebrations", "Groom's Celebrations", "Wedding Celebrations" |
| Group assignment | Each event has a `display_group` (bride/groom/joint) set in admin — controls which heading it appears under |
| Example layout | **Bride's Celebrations:** Bride's Haldi, Mehendi → **Groom's Celebrations:** Groom's Haldi, Baraat → **Wedding Celebrations:** Wedding Ceremony, Reception |
| Per-event card | Event name, date, time (start–end), venue name, address |
| Dress code | Shown per event (e.g., "Traditional attire" for Haldi, "Black tie" for Reception) |
| Map link | "Get Directions" button linking to Google Maps |
| Visual distinction | Each group could have a distinct accent color or decorative element |
| Fully configurable | Admin can create any event, assign it to any display group, and set sort order. Not hardcoded to specific event names |

---

### 1.4 RSVP System

This is the most complex public-facing feature.

**Step 1 — Guest Lookup**

| Feature | Details |
|---------|---------|
| Name search | Guest types their name into a search field |
| Fuzzy matching | Match against Guest table — handle partial names, typos (e.g., "Rob" finds "Robert Smith") |
| Multiple results | If multiple matches, show a list for guest to select themselves |
| Not found handling | "Can't find your name? Contact us at [email]" message |
| Household grouping | If guest belongs to a household, load all members for group RSVP |

**Step 2 — RSVP Form**

| Feature | Details |
|---------|---------|
| All events shown | Guest sees all events from all display groups — they don't know or care about "sides." Grouped under the same headings as the public events page |
| Per-event toggle | Yes / No for each event (radio buttons or toggle) |
| Dietary restrictions | Free-text field: "Any allergies or dietary needs?" |
| Contact info update | Pre-filled email and phone from Guest table, editable by guest |
| **Family members (Plus-N)** | Section to add additional family members attending with this guest |
| Add family member button | "Add a family member" — dynamically adds a row |
| Per family member fields | Name, is this a child? (checkbox), per-event attending toggle (yes/no), dietary restrictions |
| Remove family member | "×" button to remove an added member |
| No limit enforced | Guest can add as many family members as needed |
| Family data saved | Each added person saved to FamilyMember table + FamilyMemberRsvp per event |

**Step 3 — Confirmation**

| Feature | Details |
|---------|---------|
| Success screen | "Thank you, [Name]! We can't wait to celebrate with you." |
| Summary | Show what they submitted (events attending, family members added) |
| Edit link | "Need to change your response? Click here" — reopens form with pre-filled data |
| Duplicate prevention | If guest has already submitted, go straight to edit mode |

---

### 1.5 Travel & Accommodations

| Feature | Details |
|---------|---------|
| Pre-booked hotel info | Card per hotel: name, address, photo (optional), check-in/check-out dates |
| Google Maps link | "View on Google Maps" button per hotel — opens map_url |
| Hotel amenities | Brief notes about what's included (breakfast, parking, wifi, etc.) |
| Contact info | Hotel phone number for guest inquiries |
| Airport info | Nearest airport(s) with name, code, and distance to venue/hotel |
| Embedded map | Interactive map with venue(s) and hotel(s) pinned |

---

### 1.6 Footer

| Feature | Details |
|---------|---------|
| Couple's names | Smaller version of the hero treatment |
| Wedding hashtag | e.g., #SmithAndJones2026 |
| Contact email | For guest questions |
| Back to top | Smooth scroll button |

---

### 1.7 Site-Wide Features

| Feature | Details |
|---------|---------|
| Password protection | Optional site-wide password gate before the site goes live |
| Mobile responsive | Every section must work perfectly on phone screens |
| Smooth scroll | Clicking nav items scrolls smoothly to sections (single-page layout) |
| Page load animations | Subtle fade-in on scroll for content sections |
| SEO basics | Meta title, description, Open Graph image for link sharing previews |
| Favicon | Custom favicon (couple's initials or wedding monogram) |

---

## PHASE 2 — Admin Dashboard

Three admin roles with strict access boundaries:

**Super admin** — created once during initial setup via seed script. Can only access the Account Management page (`/admin/accounts`) to create, edit, and reset passwords for bride and groom admins. Cannot see any wedding data — no guests, no budget, no RSVPs, no rooms. Redirected to `/admin/accounts` on login.

**Bride admin** — created by the super admin. Logs into `/admin` and sees only bride-side data: bride-side guests, bride-managed events, bride budget, bride vendors, bride hotel rooms. The admin sidebar/header shows a visual indicator (e.g., "Bride Side" label with an accent color).

**Groom admin** — created by the super admin. Logs into the same `/admin` URL and sees only groom-side data. Different visual indicator (e.g., different accent color + "Groom Side" label).

Both side admins can edit shared site settings (couple names, hero image, site password) since the public website is shared. But all operational data (guests, budget, vendors, rooms) is fully isolated.

---

### 2.1 Admin Authentication

| Feature | Details |
|---------|---------|
| Login page | /admin/login — email + password form (same page for all three roles) |
| Auth provider | NextAuth.js with credentials provider |
| Role + side in session | JWT includes `role` (super_admin or side_admin) and `side` (bride, groom, or null) |
| Session management | Auto-expire after 24 hours |
| Route protection | Middleware checks role: super_admin → redirected to /admin/accounts only. side_admin → redirected to /admin dashboard. Unauthenticated → redirected to login |
| Data filtering | Every API route reads `role` and `side` from session. Super admin has no `side` and cannot access data routes. Side admins can only access data matching their side |
| Super admin seed | One-time CLI command: `npx prisma db seed` creates the super admin account from environment variables (`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` in `.env`) |
| Visual indicator | Side admins see their side label + accent color. Super admin sees a neutral "Account Management" header |
| Forgot password link | "Forgot your password?" link on the login page — available to all admin roles |
| Password reset flow | Admin enters their email → system sends a reset link (valid for 1 hour) to that email → admin clicks link → lands on /admin/reset-password?token=xxx → sets a new password → redirected to login |
| Reset token | One-time use, expires after 1 hour. Stored as hashed token in PasswordResetToken table. Invalidated after use |
| Email delivery | Uses a transactional email service (Resend, SendGrid, or AWS SES free tier) — only for password reset emails, not bulk messaging |

---

### 2.2 Account Management (/admin/accounts) — Super Admin Only

Only accessible by the super admin. This is the only page super admin can access.

| Feature | Details |
|---------|---------|
| Create admin account | Form: name, email, password, side (bride or groom dropdown) |
| Account list | Table showing all admin accounts: name, email, side, created date, last login |
| Edit account | Change name or email for any side admin |
| Reset password | Generate a new password for a side admin (shown once, then hashed) |
| Deactivate account | Disable a side admin's login without deleting their data |
| Limit | Maximum 2 side admin accounts (one bride, one groom). Form disables the side dropdown option once that side has an account |
| Self-management | Super admin can change their own email and password from this page |

---

### 2.3 Dashboard Home (/admin)

Shows only data for the logged-in admin's side.

| Feature | Details |
|---------|---------|
| Side label | Clear heading: "Bride Side Dashboard" or "Groom Side Dashboard" |
| Total invited | Count of guests on this side only |
| Confirmed attending | This side's guests who said "Yes" to at least one event |
| Declined | This side's guests who said "No" to all events |
| Pending / No response | This side's guests who haven't submitted an RSVP |
| Response rate | Percentage bar: (confirmed + declined) / total invited for this side |
| Per-event breakdown | Mini table: each event with yes/no/pending counts — **only this side's guests' responses** |
| Total headcount | Confirmed guests + their confirmed family members (this side only) |
| Children count | Total children attending from this side |
| Dietary summary | Aggregated dietary restrictions from this side's guests and family members |
| Recent activity | Last 10 RSVP submissions from this side's guests |
| Budget snapshot | This side's total budget, total spent, remaining |
| Upcoming payments | Next 3 vendor payments due for this side's vendors |

---

### 2.4 Guest List Manager (/admin/guests)

Shows only guests belonging to the logged-in admin's side. Bride admin adds bride-side guests, groom admin adds groom-side guests. New guests are automatically tagged with the admin's side.

| Feature | Details |
|---------|---------|
| Guest table | Sortable, searchable table of all guests |
| Columns | Name, email, phone, RSVP status, family members count, dietary notes, household group |
| Add guest | Modal form to add a single guest with all fields |
| Edit guest | Click row to edit any field inline or in a modal |
| Delete guest | With confirmation dialog |
| Bulk CSV import | Upload a CSV with columns: name, email, phone, address, household_group |
| CSV export | Download the full guest list with all data as CSV |
| Filters | By RSVP status (confirmed / declined / pending), by household group |
| Search | Search by name, email, or phone |
| Household management | Group guests into households so families RSVP together |
| Pagination | 25/50/100 guests per page for large lists |

---

### 2.5 RSVP Manager (/admin/rsvps)

Shows only RSVP responses from the logged-in admin's side's guests — even for cross-side events. If a bride-side guest RSVPs to the Reception (managed by groom side), only the bride admin sees that response.

| Feature | Details |
|---------|---------|
| Response feed | Chronological list of all RSVP submissions |
| Per-event view | Dynamic tabs/filters generated from all events in the database. Shows every event (including cross-side events) so admin can see their guests' responses to any event. Tabs populated from Event table, not hardcoded |
| Head count per event | This side's attending count per event = confirmed guests + their confirmed family members |
| Family members view | Expandable row per guest showing their added family members and per-event attendance |
| Dietary flags | List of all guests and family members with dietary restrictions and their notes |
| Children count | Total children attending (from family members marked is_child = true) |
| Non-responders list | Guests who haven't RSVP'd, with days since invitation sent |
| Manual RSVP entry | Admin can submit an RSVP on behalf of a guest (for phone/in-person responses) |
| Edit responses | Admin can modify any guest's RSVP or their family members' attendance |

---

### 2.6 Website Settings (/admin/settings)

Site settings are shared — both admins can edit the public website's content. However, event management is side-scoped: each admin can only create/edit events where `managed_by` matches their side.

**General Settings (shared — both admins can edit)**

| Feature | Details |
|---------|---------|
| Edit couple info | Names, wedding date, venue details |
| Edit travel info | Hotels, airport details |
| Password gate toggle | Enable/disable site-wide password protection |
| RSVP deadline | Set a cutoff date after which RSVP form shows "RSVPs are now closed" |
| Wedding hashtag | Edit the hashtag shown in the footer |
| Contact email | Edit the contact email shown on the site |

**Event Management (side-scoped)**

| Feature | Details |
|---------|---------|
| Create event | Admin creates an event — `managed_by` auto-set to their side |
| Display group | Admin chooses where the event appears on the public site: "Bride's Celebrations", "Groom's Celebrations", or "Wedding Celebrations" (joint) |
| Joint events | Either admin can create a joint event — but once created, only the admin whose `managed_by` matches can edit it |
| Edit own events | Admin can edit name, date, time, venue, dress code, map link, display group, sort order for events they manage |
| Delete own events | Admin can only delete events where managed_by = their side |
| Example | Bride admin creates "Bride's Haldi" (managed_by=bride, display_group=bride), "Wedding Ceremony" (managed_by=bride, display_group=joint). Groom admin creates "Groom's Haldi" (managed_by=groom, display_group=groom), "Reception" (managed_by=groom, display_group=joint) |

**Image Manager (shared + side-scoped)**

Every image on the public website is manageable from here — no code changes needed. Hero and gallery images are shared (both admins can edit). Event and hotel images follow side rules.

| Feature | Details |
|---------|---------|
| Hero image | Upload / replace the main hero background photo. Shared — both admins can edit. Preview shown beside the upload button |
| Event images | Per-event image upload — admin can only upload/edit images for events they manage (managed_by = their side) |
| Hotel images | Per-hotel photo upload — admin can only upload/edit images for hotels on their side |
| Gallery section | Upload multiple photos displayed in a gallery/carousel on the homepage. Shared — both admins can contribute |
| Upload interface | Drag-and-drop zone or file picker. Accepts JPG, PNG, WebP. Max 5MB per image |
| Image preview | After upload, show a thumbnail preview of the current image with a "Replace" button |
| Auto-optimization | Images auto-resized and compressed on upload for fast page loads (store original + optimized versions) |
| Alt text field | Each image has an editable alt text field for accessibility |
| Delete image | Remove an image — section falls back to a default/placeholder or hides gracefully |
| Image storage | Uploaded to Replit object storage or a cloud bucket (e.g., Cloudflare R2, S3). Stored path saved in DB |

---

### 2.7 Room Assignment Manager (/admin/rooms)

Each side manages their own hotel rooms independently. Bride admin adds hotels/rooms for bride-side guests, groom admin for theirs. Hotels are tagged with the admin's side on creation. No cross-side visibility.

**Hotel & Room Setup**

| Feature | Details |
|---------|---------|
| Add hotel | Name, address, city, Google Maps URL, total rooms, check-in/check-out dates, contact phone, notes — auto-tagged with admin's side |
| Add rooms to hotel | Room number, room type (Single / Double / Suite / Family), capacity (max occupants), floor, notes |
| Bulk room add | "Add 10 rooms" — auto-generates room numbers (e.g., 101–110) for a given floor and type |
| Edit / delete | Modify or remove hotels and rooms |

**Guest-to-Room Assignment**

| Feature | Details |
|---------|---------|
| Assignment interface | Two-panel layout: unassigned guests on the left, rooms on the right |
| Drag-and-drop | Drag a guest (or guest + family members) into a room |
| Or dropdown assign | Select a room from a dropdown on each guest's row |
| Capacity check | Warn if room is over capacity (guest count + family members > room capacity) |
| Room occupancy view | Each room card shows: room number, type, capacity, assigned guests with family member count |
| Unassigned guests list | Guests who confirmed attendance but have no room assignment yet |
| Filter by hotel | If multiple hotels, filter the room view by hotel |
| Assignment summary | Total rooms: X, Assigned: Y, Available: Z, Overbooked: W |
| Check-in/out dates | Per-assignment check-in and check-out dates (defaults to hotel dates, editable per guest) |
| Notes per assignment | Free text for special requests (e.g., "needs ground floor", "adjacent to family") |
| Export | Download room assignment sheet as CSV (for sharing with hotel) |

---

## PHASE 3 — Finance Management

All under /admin/finance. Each side has their own completely independent financial world — their own budget total, their own categories, their own expenses, their own vendors, their own payments. Bride admin's finance pages show zero groom-side data and vice versa.

---

### 3.1 Budget Overview (/admin/finance)

| Feature | Details |
|---------|---------|
| Total budget | Editable total — this side's budget only |
| Total spent | Sum of this side's fully paid expenses + amount_paid from partially paid |
| Total committed | Sum of all vendor contract amounts |
| Total outstanding | Sum of remaining balances on partially paid + pending + overdue items |
| Remaining | Total budget − total spent |
| Progress bar | Visual percentage of budget consumed |
| Pie chart | Spending breakdown by category (Recharts) |
| Bar chart | Budget vs. actual per category — highlights overspending in red |
| Per-guest cost | This side's total spent ÷ this side's confirmed guest count |

---

### 3.2 Budget Categories (/admin/finance/categories)

| Feature | Details |
|---------|---------|
| Pre-set categories | Venue, Catering & Bar, Photography, Videography, Decor & Flowers, Music & DJ, Mehendi Artist, Wedding Attire, Hair & Makeup, Invitations & Stationery, Transportation, Favors & Gifts, Cake & Desserts, Officiant, Rentals & Equipment, Miscellaneous |
| Custom categories | Add your own (e.g., "Sangeet choreographer", "Fireworks") |
| Budgeted amount | Set a target per category |
| Actual amount | Auto-summed from expenses in that category |
| Variance | Budgeted − actual, color-coded green (under) or red (over) |
| Reorder | Drag to reorder categories by priority |

---

### 3.3 Expense Tracker (/admin/finance/expenses)

| Feature | Details |
|---------|---------|
| Add expense | Form: description, amount, category (dropdown), vendor (dropdown, optional), date, payment method, status |
| Payment methods | Cash, Credit Card, Bank Transfer, Check, Venmo/Zelle, Other |
| Status options | Paid, Pending, Partially Paid, Overdue |
| Partial payment amount | When status = "Partially Paid", a required field appears: "Amount paid so far" — saved to amount_paid column. Remaining auto-calculated as amount − amount_paid |
| Edit / delete | Modify or remove any expense |
| Filter | By category, by vendor, by status, by date range |
| Sort | By date, by amount, by category |
| Running totals | Per-category subtotals shown at bottom or sidebar |
| Search | Search by description or vendor name |

---

### 3.4 Vendor Manager (/admin/finance/vendors)

| Feature | Details |
|---------|---------|
| Add vendor | Name, category, contact person, phone, email, website, contract amount, notes |
| Vendor list | Table with all vendors, sortable by category or contract amount |
| Edit / delete | Modify or remove vendors |
| Payment schedule | Each vendor has a list of payments: deposit, installments, final |
| Vendor status | Indicator: All Paid ✓, Partially Paid ◐ (shows total paid / contract amount), Payment Due !, Overdue ✗ |
| Quick view | Click vendor to see full details + payment history in a slide-out panel |
| Category filter | Filter vendors by category (Photography, Catering, etc.) |
| Total contracts | Sum of all vendor contract amounts vs. total budget |

---

### 3.5 Payment Tracker (/admin/finance/payments)

| Feature | Details |
|---------|---------|
| Payment list | All payments across all vendors in one view |
| Columns | Vendor name, total amount, amount paid, remaining, due date, status, paid date |
| Status badges | Green = Paid, Blue = Partially Paid (shows amount paid / total), Yellow = Due within 7 days, Orange = Due within 3 days, Red = Overdue |
| Sort by due date | Default sort: next payment due at top |
| Mark as paid | One-click button to mark a payment as fully paid with today's date |
| Mark as partial | Button to record a partial payment — prompts for amount paid, updates remaining balance |
| Calendar view | Monthly calendar showing payment due dates |
| Upcoming summary | "You have 3 payments totaling $4,250 due in the next 30 days" |

---

### 3.6 Financial Reports (/admin/finance/reports)

| Feature | Details |
|---------|---------|
| Spending by category | Pie/donut chart |
| Budget vs. actual | Horizontal bar chart per category |
| Cash flow timeline | Line chart showing cumulative spending over time |
| Monthly breakdown | Bar chart of spending by month over the planning period |
| Per-guest cost | This side's total spent ÷ this side's confirmed guests, updated as RSVPs come in |
| Export | Download full financial report as CSV |

---

## PHASE 4 — Nice-to-Have (Post-Launch)

Build these after the core site is live and working.

| Feature | Details |
|---------|---------|
| Communication tools | Side-scoped email system: RSVP reminders, custom announcements, message templates, email preview, send log. Each admin can only email their side's guests. Use Mailchimp or WhatsApp broadcast as a manual workaround until this is built |
| Email notifications | Auto-email the couple when a new RSVP comes in |
| Payment reminders | Auto-email the couple X days before a payment is due |
| QR code generator | Generate a QR code linking to the RSVP page — print on physical invitations |
| Seating chart | Drag-and-drop table assignment tool with capacity limits |
| Guest photo sharing | Post-wedding: QR code at reception → upload page → admin-approved gallery |
| Wedding day timeline | Minute-by-minute schedule for the wedding party (private, admin-only) |
| Checklist | To-do list with due dates and completion tracking |

---

## Page Map Summary

```
PUBLIC (shared — all guests see the same site)
├── / .......................... Home (hero, events grouped by bride/groom/joint, travel & stay, footer)
└── /rsvp ..................... RSVP lookup + form (all events shown to all guests)

ADMIN (same URLs — data filtered by logged-in admin's side)
├── /admin/login .............. Authentication (super admin, bride admin, or groom admin)
├── /admin/accounts ........... Account management (super admin only — create/edit/reset side admins)
├── /admin .................... Dashboard home (this side's summary cards, charts, activity)
├── /admin/guests ............. Guest list manager (this side's guests only)
├── /admin/rsvps .............. RSVP response manager (this side's guests' responses only)
├── /admin/rooms .............. Room assignment manager (this side's hotels and guests only)
├── /admin/settings ........... Website content editor (shared) + event management (side-scoped)
├── /admin/finance ............ Budget overview + charts (this side's finances only)
├── /admin/finance/categories . Budget category management (this side only)
├── /admin/finance/expenses ... Expense tracker (this side only)
├── /admin/finance/vendors .... Vendor manager + payment schedules (this side only)
├── /admin/finance/payments ... All payments timeline (this side only)
└── /admin/finance/reports .... Financial reports + export (this side only)
```

---

## Build Order (Recommended)

| Order | What | Why |
|-------|------|-----|
| 1 | Database schema + Prisma setup | Everything depends on this — includes `side` column on all relevant tables |
| 2 | Admin auth + super admin seed + account management page | Super admin created via seed script, then creates bride/groom accounts via /admin/accounts |
| 3 | Public website (hero, grouped events, travel & stay) | Gets the site visually ready — events pull from DB grouped by display_group |
| 4 | Guest list manager (admin, side-filtered) | Must exist before RSVP can work — new guests auto-tagged with admin's side |
| 5 | RSVP system (public + admin view) | Public form shows all events; admin RSVP view shows only their side's guests |
| 6 | Dashboard home (admin, side-filtered) | Summary of this side's guest + RSVP + headcount data |
| 7 | Room assignment manager (admin, side-filtered) | Each side manages their own hotel rooms for their own guests |
| 8 | Event management in settings (side-scoped) | Each admin creates/edits events they manage, assigns display groups |
| 9 | Budget categories + expense tracker (side-filtered) | Each side's independent budget — includes partial payment tracking |
| 10 | Vendor manager + payment tracker (side-filtered) | Each side's vendors and payments — includes partial payment amounts |
| 11 | Financial reports + charts (side-filtered) | Visual layer on this side's finance data only |
| 12 | Image manager + site settings (shared) | Both admins can edit shared public site content |
| 13 | Polish + Phase 4 extras | Nice-to-haves including communication tools |
