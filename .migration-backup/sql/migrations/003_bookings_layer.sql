-- ============================================================
-- Migration 003: Bookings Layer
-- Tables: bookings, booking_items, booking_status_history
-- Depends on: 001_core_tenant_layer, 002_services_layer
-- ============================================================

-- -------------------------------------------------------
-- 1. bookings
-- Core booking record. Inserted by the public booking form
-- via a server-side API route (never directly from browser).
-- company_id is resolved server-side from the URL slug.
--
-- Composite UNIQUE on (id, company_id) enables booking_items and
-- booking_status_history to enforce same-tenant integrity via FK.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  -- RESTRICT: never orphan a booking — must reassign before deleting a company

  -- Customer information
  customer_name         text        NOT NULL,
  customer_phone        text        NOT NULL,
  customer_whatsapp     text,                -- May differ from phone
  customer_email        text,

  -- Property information
  property_address      text,
  property_city         text,
  property_type         text,               -- 'home' | 'office' | 'villa'

  -- Booking details
  booking_date          date        NOT NULL,
  booking_time          text,               -- e.g. '09:00 AM'
  special_instructions  text,

  -- Pricing summary (detail in booking_items)
  subtotal              numeric(10,2) NOT NULL DEFAULT 0,
  discount_amount       numeric(10,2) NOT NULL DEFAULT 0,
  total_amount          numeric(10,2) NOT NULL DEFAULT 0,
  currency              text          NOT NULL DEFAULT 'PKR',

  -- Lifecycle
  status     text  NOT NULL DEFAULT 'pending',
  -- 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'

  source     text  NOT NULL DEFAULT 'web',
  -- 'web' | 'whatsapp' | 'admin'

  notes      text,  -- Internal staff notes; never shown to customer

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookings_status_check CHECK (
    status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')
  ),
  CONSTRAINT bookings_source_check CHECK (
    source IN ('web', 'whatsapp', 'admin')
  ),
  CONSTRAINT bookings_total_check CHECK (
    total_amount = subtotal - discount_amount
  ),

  -- Composite unique required so booking_items and booking_status_history
  -- can declare cross-table same-tenant integrity constraints.
  CONSTRAINT bookings_id_company_unique UNIQUE (id, company_id)
);

COMMENT ON TABLE  bookings            IS 'Core booking record. Inserted server-side with company_id set from slug.';
COMMENT ON COLUMN bookings.company_id IS 'RESTRICT delete — a company with bookings cannot be deleted without reassigning them first.';
COMMENT ON COLUMN bookings.source     IS 'Origin channel. Used to calculate which channel drives the most bookings.';
COMMENT ON COLUMN bookings.notes      IS 'Internal staff notes. Never displayed to the customer.';

-- -------------------------------------------------------
-- 2. booking_items
-- Line items for a booking. Pricing is SNAPSHOTTED at booking time.
-- Composite FK (booking_id, company_id) ensures an item cannot
-- belong to a booking from a different company.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  company_id   uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Composite FK enforcing same-tenant integrity between booking_items and bookings.
  -- Prevents inserting a booking_item with a company_id that doesn't match
  -- the referenced booking's company_id.
  CONSTRAINT fk_booking_items_same_tenant
    FOREIGN KEY (booking_id, company_id)
    REFERENCES bookings(id, company_id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,

  service_id   uuid        REFERENCES services(id) ON DELETE SET NULL,
  -- SET NULL: if a service is deleted, historical line items are preserved

  -- Snapshotted values — immutable after insert
  service_name text        NOT NULL,   -- Name at booking time
  service_unit text,                   -- Unit at booking time
  quantity     int         NOT NULL DEFAULT 1,
  variant      text,                   -- e.g. 'large', '101-300sqft', 'deep_small'
  unit_price   numeric(10,2) NOT NULL, -- Price per unit at booking time
  subtotal     numeric(10,2) NOT NULL, -- quantity * unit_price

  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT booking_items_subtotal_check CHECK (
    subtotal = quantity * unit_price
  ),
  CONSTRAINT booking_items_quantity_positive CHECK (
    quantity > 0
  )
);

COMMENT ON TABLE  booking_items             IS 'Itemized line items per booking with snapshotted pricing.';
COMMENT ON COLUMN booking_items.service_id  IS 'SET NULL on service delete — preserves historical records.';
COMMENT ON COLUMN booking_items.unit_price  IS 'Snapshotted at booking time. Never recalculated from current service_pricing.';
COMMENT ON COLUMN booking_items.company_id  IS 'Denormalized + composite FK-enforced to match bookings.company_id exactly.';

-- -------------------------------------------------------
-- 3. booking_status_history
-- Immutable audit log of every status change.
-- Append-only — no UPDATE or DELETE.
-- Composite FK ensures history rows stay in the same tenant
-- as the booking they reference.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_status_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Same-tenant integrity: history row's company_id must match booking's company_id
  CONSTRAINT fk_status_history_same_tenant
    FOREIGN KEY (booking_id, company_id)
    REFERENCES bookings(id, company_id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,

  changed_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
  from_status text,       -- NULL on first record (booking creation)
  to_status   text        NOT NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
  -- Intentionally NO updated_at — this table is append-only
);

COMMENT ON TABLE  booking_status_history           IS 'Immutable audit log of booking status changes. Append-only.';
COMMENT ON COLUMN booking_status_history.from_status IS 'NULL on the creation record (initial status assignment).';
COMMENT ON COLUMN booking_status_history.changed_by  IS 'NULL if changed by system/automation; user UUID if changed by staff.';
COMMENT ON COLUMN booking_status_history.company_id  IS 'Enforced via composite FK to match the booking — prevents cross-tenant drift.';
