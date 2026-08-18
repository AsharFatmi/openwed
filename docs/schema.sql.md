# Wedding Database Schema — Raw SQL

Paste this into the CockroachDB SQL Shell to create all tables.
Run `USE wedding;` first, then paste everything below.

---

```sql
-- Enums
CREATE TYPE IF NOT EXISTS "Role" AS ENUM ('super_admin', 'side_admin');
CREATE TYPE IF NOT EXISTS "Side" AS ENUM ('bride', 'groom');
CREATE TYPE IF NOT EXISTS "RoomType" AS ENUM ('single', 'double', 'suite');
CREATE TYPE IF NOT EXISTS "ExpenseStatus" AS ENUM ('paid', 'pending', 'partially_paid', 'overdue');
CREATE TYPE IF NOT EXISTS "PaymentStatus" AS ENUM ('upcoming', 'paid', 'partially_paid', 'overdue');
CREATE TYPE IF NOT EXISTS "DisplayGroup" AS ENUM ('bride', 'groom', 'joint');

-- AdminUser
CREATE TABLE IF NOT EXISTS "admin_users" (
    "id" STRING NOT NULL,
    "email" STRING NOT NULL,
    "password_hash" STRING NOT NULL,
    "name" STRING NOT NULL,
    "role" "Role" NOT NULL,
    "side" "Side",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- PasswordResetToken
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" STRING NOT NULL,
    "admin_user_id" STRING NOT NULL,
    "token_hash" STRING NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOL NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- Guest
CREATE TABLE IF NOT EXISTS "guests" (
    "id" STRING NOT NULL,
    "name" STRING NOT NULL,
    "email" STRING,
    "phone" STRING,
    "address" STRING,
    "city" STRING,
    "state" STRING,
    "zip" STRING,
    "household_group" STRING,
    "side" "Side" NOT NULL,
    "invitation_sent" BOOL NOT NULL DEFAULT false,
    "notes" STRING,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- FamilyMember
CREATE TABLE IF NOT EXISTS "family_members" (
    "id" STRING NOT NULL,
    "guest_id" STRING NOT NULL,
    "name" STRING NOT NULL,
    "is_child" BOOL NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

-- Event
CREATE TABLE IF NOT EXISTS "events" (
    "id" STRING NOT NULL,
    "name" STRING NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "start_time" STRING,
    "end_time" STRING,
    "venue_name" STRING,
    "venue_address" STRING,
    "description" STRING,
    "dress_code" STRING,
    "map_url" STRING,
    "managed_by" "Side" NOT NULL,
    "display_group" "DisplayGroup" NOT NULL,
    "sort_order" INT4 NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- RsvpResponse
CREATE TABLE IF NOT EXISTS "rsvp_responses" (
    "id" STRING NOT NULL,
    "guest_id" STRING NOT NULL,
    "event_id" STRING NOT NULL,
    "attending" BOOL,
    "dietary_restrictions" STRING,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rsvp_responses_pkey" PRIMARY KEY ("id")
);

-- FamilyMemberRsvp
CREATE TABLE IF NOT EXISTS "family_member_rsvps" (
    "id" STRING NOT NULL,
    "family_member_id" STRING NOT NULL,
    "event_id" STRING NOT NULL,
    "attending" BOOL,
    "dietary_restrictions" STRING,
    CONSTRAINT "family_member_rsvps_pkey" PRIMARY KEY ("id")
);

-- Hotel
CREATE TABLE IF NOT EXISTS "hotels" (
    "id" STRING NOT NULL,
    "name" STRING NOT NULL,
    "address" STRING,
    "city" STRING,
    "map_url" STRING,
    "total_rooms" INT4 NOT NULL DEFAULT 0,
    "check_in_date" TIMESTAMP(3),
    "check_out_date" TIMESTAMP(3),
    "contact_phone" STRING,
    "side" "Side" NOT NULL,
    "notes" STRING,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- Room
CREATE TABLE IF NOT EXISTS "rooms" (
    "id" STRING NOT NULL,
    "hotel_id" STRING NOT NULL,
    "room_number" STRING NOT NULL,
    "room_type" "RoomType" NOT NULL,
    "capacity" INT4 NOT NULL DEFAULT 2,
    "floor" STRING,
    "notes" STRING,
    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- RoomAssignment
CREATE TABLE IF NOT EXISTS "room_assignments" (
    "id" STRING NOT NULL,
    "room_id" STRING NOT NULL,
    "guest_id" STRING NOT NULL,
    "check_in" TIMESTAMP(3),
    "check_out" TIMESTAMP(3),
    "notes" STRING,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "room_assignments_pkey" PRIMARY KEY ("id")
);

-- BudgetCategory
CREATE TABLE IF NOT EXISTS "budget_categories" (
    "id" STRING NOT NULL,
    "name" STRING NOT NULL,
    "budgeted_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sort_order" INT4 NOT NULL DEFAULT 0,
    "side" "Side" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- Vendor
CREATE TABLE IF NOT EXISTS "vendors" (
    "id" STRING NOT NULL,
    "name" STRING NOT NULL,
    "category" STRING,
    "contact_name" STRING,
    "phone" STRING,
    "email" STRING,
    "website" STRING,
    "contract_amount" DECIMAL(65,30),
    "side" "Side" NOT NULL,
    "notes" STRING,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- Expense
CREATE TABLE IF NOT EXISTS "expenses" (
    "id" STRING NOT NULL,
    "category_id" STRING,
    "vendor_id" STRING,
    "description" STRING NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3),
    "payment_method" STRING,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'pending',
    "amount_paid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "side" "Side" NOT NULL,
    "notes" STRING,
    "receipt_url" STRING,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- Payment
CREATE TABLE IF NOT EXISTS "payments" (
    "id" STRING NOT NULL,
    "vendor_id" STRING NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "due_date" TIMESTAMP(3),
    "paid_date" TIMESTAMP(3),
    "status" "PaymentStatus" NOT NULL DEFAULT 'upcoming',
    "amount_paid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "method" STRING,
    "notes" STRING,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- SiteImage
CREATE TABLE IF NOT EXISTS "site_images" (
    "id" STRING NOT NULL,
    "slot" STRING NOT NULL,
    "file_path" STRING NOT NULL,
    "alt_text" STRING,
    "original_filename" STRING,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "site_images_pkey" PRIMARY KEY ("id")
);

-- SiteSettings
CREATE TABLE IF NOT EXISTS "site_settings" (
    "id" STRING NOT NULL,
    "key" STRING NOT NULL,
    "value" STRING NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE UNIQUE INDEX "rsvp_responses_guest_id_event_id_key" ON "rsvp_responses"("guest_id", "event_id");
CREATE UNIQUE INDEX "family_member_rsvps_family_member_id_event_id_key" ON "family_member_rsvps"("family_member_id", "event_id");
CREATE UNIQUE INDEX "site_images_slot_key" ON "site_images"("slot");
CREATE UNIQUE INDEX "site_settings_key_key" ON "site_settings"("key");

-- Performance indexes
CREATE INDEX "password_reset_tokens_admin_user_id_idx" ON "password_reset_tokens"("admin_user_id");
CREATE INDEX "family_members_guest_id_idx" ON "family_members"("guest_id");
CREATE INDEX "rsvp_responses_guest_id_idx" ON "rsvp_responses"("guest_id");
CREATE INDEX "rsvp_responses_event_id_idx" ON "rsvp_responses"("event_id");
CREATE INDEX "family_member_rsvps_family_member_id_idx" ON "family_member_rsvps"("family_member_id");
CREATE INDEX "family_member_rsvps_event_id_idx" ON "family_member_rsvps"("event_id");
CREATE INDEX "rooms_hotel_id_idx" ON "rooms"("hotel_id");
CREATE INDEX "room_assignments_room_id_idx" ON "room_assignments"("room_id");
CREATE INDEX "room_assignments_guest_id_idx" ON "room_assignments"("guest_id");
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");
CREATE INDEX "expenses_vendor_id_idx" ON "expenses"("vendor_id");
CREATE INDEX "expenses_side_idx" ON "expenses"("side");
CREATE INDEX "payments_vendor_id_idx" ON "payments"("vendor_id");

-- Foreign keys
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rsvp_responses" ADD CONSTRAINT "rsvp_responses_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rsvp_responses" ADD CONSTRAINT "rsvp_responses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_member_rsvps" ADD CONSTRAINT "family_member_rsvps_family_member_id_fkey" FOREIGN KEY ("family_member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_member_rsvps" ADD CONSTRAINT "family_member_rsvps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_assignments" ADD CONSTRAINT "room_assignments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_assignments" ADD CONSTRAINT "room_assignments_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
