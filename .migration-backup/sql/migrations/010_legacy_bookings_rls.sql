-- ============================================================
-- Migration 010: RLS for the legacy "Bookings" table
-- Depends on: functions/auth_helpers.sql, 001_core_tenant_layer (companies)
-- ============================================================
-- WHY THIS MIGRATION EXISTS
-- Security audit finding (2026-07-08): the app has NOT yet migrated off
-- the legacy quoted "Bookings" table — it is still the live table used by
-- pages/company/[slug]/book.js, pages/book-service.js, pages/dashboard.js,
-- pages/dashboard/bookings.js, and pages/admin/index.js. Migration 007
-- only enabled RLS on the NEW lowercase `bookings` table, which nothing in
-- the app currently reads or writes. As a result "Bookings" had NO row
-- level security at all: a direct REST call with the public anon key
-- (e.g. GET .../rest/v1/Bookings) could read every company's bookings —
-- customer name, phone, address, and booking details — with zero
-- tenant isolation. Confirmed live against the project's Supabase
-- instance before writing this fix.
--
-- This migration closes that gap with the same access model already
-- enforced everywhere else: super_admin full access, company
-- owners/staff scoped to their own company_id, and anon limited to
-- INSERT-only for active companies (matching how the public booking page
-- already behaves).
--
-- OUT OF SCOPE (documented, not fixed here): the legacy "Companies" and
-- "Users" tables are also unprotected, but they are only written by
-- standalone, unused demo scripts (backend/index.js, backend/signupFlow.js,
-- lib/signupUser.js) that are not imported by any page or component in the
-- live app. Locking those down was left out to keep this fix minimal and
-- avoid touching code paths outside this audit's scope.
-- ============================================================

ALTER TABLE "Bookings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_legacy_bookings"      ON "Bookings";
DROP POLICY IF EXISTS "company_users_manage_legacy_bookings" ON "Bookings";
DROP POLICY IF EXISTS "public_insert_legacy_booking"         ON "Bookings";

CREATE POLICY "super_admin_all_legacy_bookings" ON "Bookings"
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "company_users_manage_legacy_bookings" ON "Bookings"
  FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- Public (anon) customer booking form: INSERT only, and only into an
-- existing, active company — same restriction already used for the new
-- `bookings` table in migration 007. No anon SELECT/UPDATE/DELETE policy
-- is defined, so those remain denied by default.
CREATE POLICY "public_insert_legacy_booking" ON "Bookings"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM companies
      WHERE id = company_id
        AND is_active = true
    )
  );

-- ============================================================
-- ACTION REQUIRED: run this file against the Supabase project's SQL
-- editor (same manual process used for every prior migration in this
-- folder — there is no automated migration runner in this repo).
-- ============================================================
