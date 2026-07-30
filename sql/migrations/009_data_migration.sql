-- ============================================================
-- Migration 009: Data Migration — v1 → v2
-- Migrates existing data from legacy quoted tables to new schema.
-- ============================================================
-- RUN ORDER: LAST — after all tables, RLS, and indexes are created.
-- SAFE: all statements are wrapped in a transaction.
--       If anything fails, the entire migration rolls back.
-- VERIFY: Check row counts after running (see verification section).
-- ============================================================
-- PREREQUISITE: Legacy tables must still exist ("Companies", "Users",
--   "Services", "Bookings", "AuthInvites" with quoted names).
--   Do NOT drop them until verification is complete and the app
--   has been running on the new schema for 1–2 weeks.
-- ============================================================

BEGIN;

-- -------------------------------------------------------
-- Step 1: Migrate "Companies" → companies + company_settings
-- Slug is generated deterministically in the SELECT using
-- a window function to resolve collisions before INSERT.
-- This avoids unique constraint failures from sequential inserts.
-- -------------------------------------------------------
-- NOTE: The live legacy "Companies" table only has (id, name, created_at) —
-- no address/contact/logo_url columns exist, so company_settings is seeded
-- with defaults only (no legacy brand/contact data to carry over).
WITH slug_base AS (
  -- Generate a lowercase URL-safe base slug from company name
  SELECT
    id,
    name,
    created_at,
    regexp_replace(
      regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g'),
      '^-+|-+$', '', 'g'
    ) AS base_slug
  FROM "Companies"
),
slug_deduped AS (
  -- Assign row numbers within each slug group ordered by created_at.
  -- Companies created first keep the clean slug; later duplicates get a suffix.
  SELECT
    id, name, created_at, base_slug,
    ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY created_at ASC) AS rn
  FROM slug_base
)
INSERT INTO companies (id, slug, name, is_active, created_at, updated_at)
SELECT
  id,
  CASE
    WHEN rn = 1 THEN base_slug
    -- Suffix with first 6 chars of UUID to guarantee uniqueness
    ELSE base_slug || '-' || substr(replace(id::text, '-', ''), 1, 6)
  END AS slug,
  name,
  true        AS is_active,
  created_at,
  created_at  AS updated_at
FROM slug_deduped
ON CONFLICT (id) DO NOTHING;

-- Insert corresponding company_settings rows (defaults only — legacy table
-- has no address/contact/logo columns to carry over)
INSERT INTO company_settings (
  company_id,
  primary_color,
  secondary_color,
  updated_at
)
SELECT
  id        AS company_id,
  '#0A1F44' AS primary_color,
  '#D4AF37' AS secondary_color,
  created_at AS updated_at
FROM "Companies"
ON CONFLICT (company_id) DO NOTHING;

-- -------------------------------------------------------
-- Step 2: Migrate "Users" → users
-- v1 'admin' → company_owner, v1 'staff' → company_staff.
-- 'customer' role users in v1 had no dashboard login — they
-- are not created in the new users table. Their data is
-- preserved anonymously in bookings (customer_name, customer_phone).
-- IMPORTANT: After migration, manually set the super admin role:
--   UPDATE users SET role = 'super_admin' WHERE email = 'your@email.com';
-- -------------------------------------------------------
INSERT INTO users (
  id,
  company_id,
  email,
  full_name,
  role,
  is_active,
  created_at,
  updated_at
)
SELECT
  id,
  company_id,
  email,
  full_name,
  CASE role
    WHEN 'admin' THEN 'company_owner'
    WHEN 'staff' THEN 'company_staff'
  END               AS role,
  true              AS is_active,
  created_at,
  created_at        AS updated_at
FROM "Users"
WHERE role IN ('admin', 'staff')  -- Only migrate dashboard-capable users; skip 'customer' role
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------
-- Step 3: Migrate "Services" — SKIPPED.
-- The live legacy database has no "Services" table, so there is
-- nothing to migrate. New companies configure services fresh via
-- the (not-yet-built) Service Management module.
-- -------------------------------------------------------

-- -------------------------------------------------------
-- Step 4: Migrate "Bookings" → bookings + booking_items
-- Problem: v1 Bookings have no company_id; 'service' is a plain text string.
-- Resolution:
--   - All bookings are assigned to the same fallback company as services.
--   - One booking_item is created per booking using the text as service_name.
--   - unit_price = 0 (unknown from text summary); super admin reviews.
-- -------------------------------------------------------
DO $$
DECLARE
  v_fallback_company_id uuid;
BEGIN
  SELECT id INTO v_fallback_company_id
  FROM companies
  ORDER BY slug ASC
  LIMIT 1;

  IF v_fallback_company_id IS NULL THEN
    RAISE EXCEPTION 'No companies found. Run Step 1 first.';
  END IF;

  -- Insert bookings
  INSERT INTO bookings (
    id,
    company_id,
    customer_name,
    customer_phone,
    property_address,
    booking_date,
    subtotal,
    discount_amount,
    total_amount,
    status,
    source,
    created_at,
    updated_at
  )
  SELECT
    b.id,
    v_fallback_company_id            AS company_id,
    COALESCE(b.customer_name, 'Unknown Customer') AS customer_name,
    COALESCE(b.customer_phone, '0000000000')       AS customer_phone,
    b.customer_address               AS property_address,
    COALESCE(b.booking_date, CURRENT_DATE)         AS booking_date,
    0                                AS subtotal,
    0                                AS discount_amount,
    0                                AS total_amount,    -- total = subtotal - discount
    CASE
      WHEN b.status IN ('pending','confirmed','in_progress','completed','cancelled')
      THEN b.status
      ELSE 'pending'
    END                              AS status,
    'web'                            AS source,
    b.created_at,
    b.created_at                     AS updated_at
  FROM "Bookings" b
  ON CONFLICT (id) DO NOTHING;

  -- Insert one booking_item per booking using the text service summary
  INSERT INTO booking_items (
    booking_id,
    company_id,
    service_name,
    service_unit,
    quantity,
    unit_price,
    subtotal
  )
  SELECT
    b.id                          AS booking_id,
    v_fallback_company_id         AS company_id,
    COALESCE(
      NULLIF(trim(b.service), ''),
      'Service (migrated from v1)'
    )                             AS service_name,
    'item'                        AS service_unit,
    1                             AS quantity,
    0                             AS unit_price,
    0                             AS subtotal
  FROM "Bookings" b
  WHERE b.service IS NOT NULL
    AND trim(b.service) != ''
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Bookings migrated to company: %', v_fallback_company_id;
  RAISE NOTICE 'ACTION REQUIRED: Review booking_items.unit_price — all set to 0 after migration.';
END;
$$;

-- -------------------------------------------------------
-- Step 5: Migrate "AuthInvites" → user_invites
-- All old pending invites are treated as expired (they are stale).
-- Only accepted invites are preserved as accepted.
-- -------------------------------------------------------
DO $$
DECLARE
  v_fallback_company_id uuid;
BEGIN
  SELECT id INTO v_fallback_company_id
  FROM companies
  ORDER BY slug ASC
  LIMIT 1;

  INSERT INTO user_invites (
    id,
    company_id,
    email,
    role,
    token,
    status,
    expires_at,
    created_at
  )
  SELECT
    ai.id,
    v_fallback_company_id AS company_id,
    ai.email,
    'company_staff'       AS role,
    ai.invite_token       AS token,
    CASE ai.status
      WHEN 'accepted' THEN 'accepted'
      ELSE 'expired'      -- All old pending invites expire after migration
    END                   AS status,
    ai.created_at         AS expires_at,  -- Already expired (past timestamp)
    ai.created_at
  FROM "AuthInvites" ai
  ON CONFLICT DO NOTHING;
END;
$$;

-- -------------------------------------------------------
-- Verification: Row count checks
-- -------------------------------------------------------
DO $$
DECLARE
  v1_companies int; v2_companies int;
  v1_dash_users int; v2_users    int;
  v1_bookings  int; v2_bookings  int;
BEGIN
  SELECT COUNT(*)              INTO v1_companies FROM "Companies";
  SELECT COUNT(*)              INTO v2_companies FROM companies;
  SELECT COUNT(*) FILTER (WHERE role IN ('admin','staff')) INTO v1_dash_users FROM "Users";
  SELECT COUNT(*)              INTO v2_users     FROM users;
  SELECT COUNT(*)              INTO v1_bookings  FROM "Bookings";
  SELECT COUNT(*)              INTO v2_bookings  FROM bookings;

  RAISE NOTICE '=== Migration 009 Verification ===';
  RAISE NOTICE 'Companies:        v1=% → v2=% %', v1_companies, v2_companies,
    CASE WHEN v1_companies = v2_companies THEN '✓' ELSE '✗ MISMATCH' END;
  RAISE NOTICE 'Dashboard Users:  v1=% → v2=% %', v1_dash_users, v2_users,
    CASE WHEN v1_dash_users = v2_users THEN '✓' ELSE '✗ MISMATCH' END;
  RAISE NOTICE 'Bookings:         v1=% → v2=% %', v1_bookings, v2_bookings,
    CASE WHEN v1_bookings = v2_bookings THEN '✓' ELSE '✗ MISMATCH' END;
  RAISE NOTICE '=================================';
  RAISE NOTICE 'MANDATORY MANUAL STEPS AFTER MIGRATION:';
  RAISE NOTICE '1. UPDATE users SET role = ''super_admin'' WHERE email = ''your@email.com'';';
  RAISE NOTICE '2. SELECT id, slug, name FROM companies; — verify slugs look correct';
  RAISE NOTICE '3. Review migrated bookings (unit_price = 0) and update totals';
  RAISE NOTICE '4. After 1-2 weeks on new schema, drop legacy tables:';
  RAISE NOTICE '   DROP TABLE "Companies","Users","Bookings","AuthInvites";';
END;
$$;

COMMIT;
