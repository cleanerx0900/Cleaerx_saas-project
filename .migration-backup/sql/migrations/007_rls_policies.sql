-- ============================================================
-- Migration 007: Row Level Security Policies
-- Depends on: ALL previous migrations + functions/auth_helpers.sql
-- IMPORTANT: Run auth_helpers.sql FIRST (defines helper functions)
-- ============================================================
-- Design principle:
--   1. RLS is the final security layer — app also enforces company_id.
--   2. Public (anon) access is limited to INSERT for bookings.
--      ALL reads of company data from the booking page are performed
--      server-side via a Next.js API route using the service_role key,
--      which bypasses RLS. This prevents anon enumeration of all tenants.
--   3. Anon booking INSERT is restricted to company_ids that exist and
--      are active — preventing pollution of arbitrary or nonexistent tenants.
-- ============================================================

-- -------------------------------------------------------
-- Enable RLS on all tables
-- -------------------------------------------------------
ALTER TABLE companies              ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invites           ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE services               ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_pricing        ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_discounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_themes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily        ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- companies
-- super_admin: ALL
-- company_owner/staff: SELECT own row only
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_companies"   ON companies;
DROP POLICY IF EXISTS "company_users_select_own"    ON companies;

CREATE POLICY "super_admin_all_companies" ON companies
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "company_users_select_own" ON companies
  FOR SELECT
  USING (id = auth_company_id());

-- -------------------------------------------------------
-- company_settings
-- super_admin: ALL
-- company_owner: SELECT + UPDATE own
-- No public (anon) policy — booking page reads via service_role API route
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_settings"      ON company_settings;
DROP POLICY IF EXISTS "company_owner_manage_settings" ON company_settings;

CREATE POLICY "super_admin_all_settings" ON company_settings
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "company_owner_manage_settings" ON company_settings
  FOR ALL
  USING (company_id = auth_company_id() AND is_company_admin())
  WITH CHECK (company_id = auth_company_id() AND is_company_admin());

-- -------------------------------------------------------
-- users
-- super_admin: ALL
-- company_owner: ALL within own company
-- company_staff: SELECT own row only
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_users"        ON users;
DROP POLICY IF EXISTS "company_owner_manage_users"   ON users;
DROP POLICY IF EXISTS "staff_select_own_row"         ON users;

CREATE POLICY "super_admin_all_users" ON users
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "company_owner_manage_users" ON users
  FOR ALL
  USING (company_id = auth_company_id() AND is_company_admin())
  WITH CHECK (company_id = auth_company_id() AND is_company_admin());

CREATE POLICY "staff_select_own_row" ON users
  FOR SELECT
  USING (id = auth.uid());

-- -------------------------------------------------------
-- user_invites
-- super_admin: ALL
-- company_owner: ALL within own company
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_invites"      ON user_invites;
DROP POLICY IF EXISTS "company_owner_manage_invites" ON user_invites;

CREATE POLICY "super_admin_all_invites" ON user_invites
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "company_owner_manage_invites" ON user_invites
  FOR ALL
  USING (company_id = auth_company_id() AND is_company_admin())
  WITH CHECK (company_id = auth_company_id() AND is_company_admin());

-- -------------------------------------------------------
-- service_categories
-- super_admin: ALL
-- company_owner/staff: ALL within own company
-- No public (anon) read — booking page reads via service_role API route
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_categories"   ON service_categories;
DROP POLICY IF EXISTS "company_users_manage_cats"    ON service_categories;

CREATE POLICY "super_admin_all_categories" ON service_categories
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "company_users_manage_cats" ON service_categories
  FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- -------------------------------------------------------
-- services
-- super_admin: ALL
-- company_owner/staff: ALL within own company
-- No public (anon) read — booking page reads via service_role API route
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_services"      ON services;
DROP POLICY IF EXISTS "company_users_manage_services" ON services;

CREATE POLICY "super_admin_all_services" ON services
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "company_users_manage_services" ON services
  FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- -------------------------------------------------------
-- service_pricing
-- super_admin: ALL
-- company_owner: ALL within own company
-- No public (anon) read — booking page reads via service_role API route
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_pricing"      ON service_pricing;
DROP POLICY IF EXISTS "company_owner_manage_pricing" ON service_pricing;

CREATE POLICY "super_admin_all_pricing" ON service_pricing
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "company_owner_manage_pricing" ON service_pricing
  FOR ALL
  USING (company_id = auth_company_id() AND is_company_admin())
  WITH CHECK (company_id = auth_company_id() AND is_company_admin());

-- -------------------------------------------------------
-- service_discounts
-- super_admin: ALL
-- company_owner: ALL within own company
-- No public (anon) read — booking page reads via service_role API route
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_discounts"    ON service_discounts;
DROP POLICY IF EXISTS "company_owner_discounts"      ON service_discounts;

CREATE POLICY "super_admin_all_discounts" ON service_discounts
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "company_owner_discounts" ON service_discounts
  FOR ALL
  USING (company_id = auth_company_id() AND is_company_admin())
  WITH CHECK (company_id = auth_company_id() AND is_company_admin());

-- -------------------------------------------------------
-- bookings
-- super_admin: ALL
-- company_owner/staff: ALL within own company
-- Public (anon): INSERT only — but restricted to active companies.
--   The booking form NEVER sends company_id from the browser.
--   The Next.js API route (/api/bookings/create) resolves company_id
--   server-side from the slug, then inserts using the service_role key.
--   This anon INSERT policy is a secondary safety net for cases where
--   a lightweight client posts directly; it prevents insertion of
--   nonexistent or suspended company_ids.
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_bookings"      ON bookings;
DROP POLICY IF EXISTS "company_users_manage_bookings" ON bookings;
DROP POLICY IF EXISTS "public_insert_booking"         ON bookings;

CREATE POLICY "super_admin_all_bookings" ON bookings
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "company_users_manage_bookings" ON bookings
  FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

CREATE POLICY "public_insert_booking" ON bookings
  FOR INSERT
  WITH CHECK (
    -- company_id must reference an existing, active company
    EXISTS (
      SELECT 1 FROM companies
      WHERE id = company_id
        AND is_active = true
    )
  );
-- NOTE: The application always uses the service_role key in the API route.
-- This policy defends against direct anon API abuse only.

-- -------------------------------------------------------
-- booking_items
-- super_admin: ALL
-- company_owner/staff: ALL within own company
-- Public (anon): INSERT only — same active-company restriction as bookings
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_booking_items"      ON booking_items;
DROP POLICY IF EXISTS "company_users_manage_booking_items" ON booking_items;
DROP POLICY IF EXISTS "public_insert_booking_items"        ON booking_items;

CREATE POLICY "super_admin_all_booking_items" ON booking_items
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "company_users_manage_booking_items" ON booking_items
  FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

CREATE POLICY "public_insert_booking_items" ON booking_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM companies
      WHERE id = company_id
        AND is_active = true
    )
  );

-- -------------------------------------------------------
-- booking_status_history
-- Append-only (no UPDATE/DELETE for anyone except super_admin)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_history"      ON booking_status_history;
DROP POLICY IF EXISTS "company_users_read_history"   ON booking_status_history;
DROP POLICY IF EXISTS "company_users_append_history" ON booking_status_history;

CREATE POLICY "super_admin_all_history" ON booking_status_history
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "company_users_read_history" ON booking_status_history
  FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY "company_users_append_history" ON booking_status_history
  FOR INSERT
  WITH CHECK (company_id = auth_company_id());
-- No UPDATE or DELETE policy for non-super_admin — append-only by design.

-- -------------------------------------------------------
-- subscription_plans
-- super_admin: ALL
-- Everyone else: SELECT only (public pricing page reads)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_plans"    ON subscription_plans;
DROP POLICY IF EXISTS "anyone_read_active_plans" ON subscription_plans;

CREATE POLICY "super_admin_all_plans" ON subscription_plans
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "anyone_read_active_plans" ON subscription_plans
  FOR SELECT USING (is_active = true);
-- Pricing page is intentionally public — companies shop plans before signing up.

-- -------------------------------------------------------
-- company_subscriptions
-- super_admin: ALL
-- company_owner: SELECT own only
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_subscriptions"   ON company_subscriptions;
DROP POLICY IF EXISTS "company_owner_read_subscription" ON company_subscriptions;

CREATE POLICY "super_admin_all_subscriptions" ON company_subscriptions
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "company_owner_read_subscription" ON company_subscriptions
  FOR SELECT
  USING (company_id = auth_company_id() AND is_company_admin());

-- -------------------------------------------------------
-- theme_templates
-- super_admin: ALL
-- Authenticated users: SELECT public templates (for theme picker in dashboard)
-- No anon read — prevents enumeration of premium marketplace assets
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_templates"         ON theme_templates;
DROP POLICY IF EXISTS "authenticated_read_theme_templates" ON theme_templates;

CREATE POLICY "super_admin_all_templates" ON theme_templates
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "authenticated_read_theme_templates" ON theme_templates
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_public = true
  );

-- -------------------------------------------------------
-- company_themes
-- super_admin: ALL
-- company_owner: ALL own
-- No public (anon) policy — booking page reads via service_role API route
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_company_themes" ON company_themes;
DROP POLICY IF EXISTS "company_owner_manage_theme"     ON company_themes;

CREATE POLICY "super_admin_all_company_themes" ON company_themes
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "company_owner_manage_theme" ON company_themes
  FOR ALL
  USING (company_id = auth_company_id() AND is_company_admin())
  WITH CHECK (company_id = auth_company_id() AND is_company_admin());

-- -------------------------------------------------------
-- analytics_daily
-- super_admin: ALL
-- company_owner/staff: SELECT own only
-- No INSERT/UPDATE for non-super_admin (written exclusively by trigger)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_analytics"    ON analytics_daily;
DROP POLICY IF EXISTS "company_users_read_analytics" ON analytics_daily;

CREATE POLICY "super_admin_all_analytics" ON analytics_daily
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "company_users_read_analytics" ON analytics_daily
  FOR SELECT USING (company_id = auth_company_id());
-- No write policy for non-super_admin — analytics_daily is trigger-managed only.
