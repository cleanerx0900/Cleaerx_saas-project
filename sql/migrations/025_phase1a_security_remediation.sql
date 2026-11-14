-- ============================================================
-- Migration 025: Phase 1A Critical Security Remediation
-- Fixes:
--   1. RLS-01: Prevent company owners/staff from escalating role to super_admin
--   2. RLS-02: Block direct anonymous PostgREST INSERT into bookings and booking_items
-- Depends on: 001_core_tenant_layer, 007_rls_policies, functions/auth_helpers.sql
-- Safe to re-run: All statements are idempotent (DROP IF EXISTS + CREATE OR REPLACE)
-- ============================================================
--
-- ------------------------------------------------------------
-- CRITICAL SECURITY NOTICE ON ROLLBACKS:
-- ------------------------------------------------------------
-- DO NOT re-create the legacy `public_insert_booking`, `public_insert_booking_items`,
-- or the unconstrained blanket `company_owner_manage_users` policy. Re-enabling those
-- legacy policies directly resurrects:
--   1. RLS-01: Privilege Escalation (allows any tenant owner to set role='super_admin').
--   2. RLS-02: Anonymous Booking Tampering (allows anyone with the public anon key to
--      insert fake, zero-price, or pre-completed bookings directly via PostgREST).
--
-- All legitimate public customer bookings are handled server-side through
-- /api/create-pricing-booking (which uses supabaseAdmin/service_role), so public anon
-- direct INSERT policies are NEVER required for normal operations.
--
-- SAFE ROLLBACK PROCEDURE (Standard Maintenance):
-- If you need to revert or re-tune the Phase 1A database policies without weakening security:
--   -- A. Drop the trigger temporarily if debugging user table modifications:
--   DROP TRIGGER IF EXISTS trg_protect_super_admin_role ON public.users;
--   DROP FUNCTION IF EXISTS public.protect_super_admin_role();
--
--   -- B. Keep granular role constraints on users table in place (NEVER remove role IN check):
--   -- The granular policies (company_owner_select_users, company_owner_insert_users,
--   -- company_owner_update_users, company_owner_delete_users) safely maintain tenant isolation.
--
-- DOCUMENTED ADMINISTRATIVE PROVISIONING PROCESS:
-- To provision or promote a platform super_admin user:
--   1. Direct Administrative SQL Session (DBA / Infrastructure):
--      Execute via Supabase Dashboard SQL Editor, direct psql console, or migration runner:
--      INSERT INTO public.users (id, email, full_name, role, is_active)
--      VALUES ('<uuid>', 'admin@cleanerx.com', 'Platform Admin', 'super_admin', true)
--      ON CONFLICT (id) DO UPDATE SET role = 'super_admin';
--      (Direct SQL sessions run with session_user IN ('postgres', 'supabase_admin') and no
--       PostgREST JWT context, which is authorized by the trigger).
--   2. Platform Super Admin UI:
--      An authenticated platform operator holding super_admin role can manage admins via the
--      platform console (auth.role() = 'authenticated' AND public.is_super_admin() = true).
--   Notice: Generic service_role PostgREST requests from ordinary backend API routes are strictly
--   BLOCKED from creating, modifying, or deleting super_admin accounts.
-- ------------------------------------------------------------


-- ============================================================
-- SECTION 1: RLS-01 — Super Admin Role Protection (public.users)
-- ============================================================

-- 1.1 Remove the blanket FOR ALL policy that allowed company owners to update the role column
DROP POLICY IF EXISTS "company_owner_manage_users" ON public.users;
DROP POLICY IF EXISTS "company_owner_select_users" ON public.users;
DROP POLICY IF EXISTS "company_owner_insert_users" ON public.users;
DROP POLICY IF EXISTS "company_owner_update_users" ON public.users;
DROP POLICY IF EXISTS "company_owner_delete_users" ON public.users;

-- 1.2 SELECT: Company owners can view all users within their assigned company
CREATE POLICY "company_owner_select_users" ON public.users
  FOR SELECT TO authenticated
  USING (
    company_id = public.auth_company_id()
    AND public.is_company_admin()
  );

-- 1.3 INSERT: Company owners can add staff or secondary owners to their own company only.
-- Role MUST NOT be 'super_admin'.
CREATE POLICY "company_owner_insert_users" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.auth_company_id()
    AND public.is_company_admin()
    AND role IN ('company_owner', 'company_staff')
  );

-- 1.4 UPDATE: Company owners can manage profiles and staff within their own company only.
-- Target row role MUST NOT be changed to or from 'super_admin'.
CREATE POLICY "company_owner_update_users" ON public.users
  FOR UPDATE TO authenticated
  USING (
    company_id = public.auth_company_id()
    AND public.is_company_admin()
    AND role IN ('company_owner', 'company_staff')
  )
  WITH CHECK (
    company_id = public.auth_company_id()
    AND public.is_company_admin()
    AND role IN ('company_owner', 'company_staff')
  );

-- 1.5 DELETE: Company owners can remove staff within their own company (never super_admin).
CREATE POLICY "company_owner_delete_users" ON public.users
  FOR DELETE TO authenticated
  USING (
    company_id = public.auth_company_id()
    AND public.is_company_admin()
    AND role IN ('company_owner', 'company_staff')
  );

-- 1.6 Database-level Trigger for Defense-in-Depth against Role Escalation
-- Prevents any non-super-admin actor from assuming or assigning the super_admin role.
--
-- CRITICAL SECURITY ARCHITECTURE & HARDENING:
-- 1. Safe search_path: SET search_path = '' eliminates search-path hijacking attacks.
--    All catalog objects, functions, and tables are strictly schema-qualified.
-- 2. No current_user Reliance: Inside a SECURITY DEFINER function, current_user automatically
--    switches to the function owner ('postgres'). Using current_user for authorization would
--    create a critical bypass. Therefore, current_user is NEVER used for caller verification.
-- 3. Robust PostgREST/Supabase JWT Claim Extraction:
--    - Queries auth.role() first.
--    - Falls back to request.jwt.claims JSON (modern PostgREST v9+ standard).
--    - Falls back to request.jwt.claim.role (legacy PostgREST individual setting).
--    - Safely handles missing, empty, or malformed JSON payloads without throwing uncaught exceptions.
-- 4. No Generic service_role Exemption & No Insecure Custom GUC Overrides:
--    Standard backend API routes using SUPABASE_SERVICE_ROLE_KEY cannot grant or modify super_admin.
--    Only authorized administrative processes (Direct SQL sessions or authenticated super admins)
--    are permitted.
-- 5. Strict TG_OP Branching & Correct Return Values:
--    - TG_OP = 'INSERT': Validates NEW.role, returns NEW.
--    - TG_OP = 'UPDATE': Validates NEW.role & OLD.role, returns NEW.
--    - TG_OP = 'DELETE': Validates OLD.role only (NEW is NULL on DELETE), and returns OLD.
--      (Returning NULL on BEFORE DELETE would cancel the delete operation; returning OLD allows it).
CREATE OR REPLACE FUNCTION public.protect_super_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_jwt_role text;
  v_is_direct_admin boolean;
  v_is_caller_super_admin boolean;
BEGIN
  -- 1. Multi-layer JWT role resolution (handles Supabase auth.role(), PostgREST v9+ JSON claims, and legacy GUCs)
  BEGIN
    v_jwt_role := auth.role();
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF v_jwt_role IS NULL OR v_jwt_role = '' THEN
    BEGIN
      v_jwt_role := (NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
    EXCEPTION WHEN OTHERS THEN
      v_jwt_role := NULL;
    END;
  END IF;

  IF v_jwt_role IS NULL OR v_jwt_role = '' THEN
    BEGIN
      v_jwt_role := NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), '');
    EXCEPTION WHEN OTHERS THEN
      v_jwt_role := NULL;
    END;
  END IF;

  -- 2. Trusted Caller Identification:
  -- A. Direct administrative database session (psql / Supabase SQL Editor / migrations)
  --    session_user is the physical database connection user ('postgres' or 'supabase_admin')
  --    and does NOT change inside SECURITY DEFINER functions. PostgREST always connects as 'authenticator'.
  v_is_direct_admin := (pg_catalog.session_user IN ('postgres', 'supabase_admin') AND v_jwt_role IS NULL);

  -- B. Platform Super Admin (authenticated web user holding super_admin role)
  v_is_caller_super_admin := (v_jwt_role = 'authenticated' AND public.is_super_admin());

  -- 3. Operation-specific guards and return value handling
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'super_admin' THEN
      IF NOT (v_is_direct_admin OR v_is_caller_super_admin) THEN
        RAISE EXCEPTION 'Access denied: ordinary service_role API requests and tenant users cannot grant or assume the super_admin role. Use the documented direct administrative SQL provisioning process or platform super_admin account.';
      END IF;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Prevent unauthorized promotion to super_admin
    IF NEW.role = 'super_admin' AND OLD.role IS DISTINCT FROM NEW.role THEN
      IF NOT (v_is_direct_admin OR v_is_caller_super_admin) THEN
        RAISE EXCEPTION 'Access denied: ordinary service_role API requests and tenant users cannot grant or assume the super_admin role. Use the documented direct administrative SQL provisioning process or platform super_admin account.';
      END IF;
    END IF;

    -- Prevent unauthorized modification or demotion of existing super_admin accounts
    IF OLD.role = 'super_admin' THEN
      IF NOT (v_is_direct_admin OR v_is_caller_super_admin) THEN
        RAISE EXCEPTION 'Access denied: cannot modify or demote a super_admin user without direct administrative SQL provisioning or platform super_admin authorization.';
      END IF;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- Prevent unauthorized deletion of existing super_admin accounts
    -- (Notice: NEW is NULL on DELETE; only OLD.role is inspected)
    IF OLD.role = 'super_admin' THEN
      IF NOT (v_is_direct_admin OR v_is_caller_super_admin) THEN
        RAISE EXCEPTION 'Access denied: cannot delete a super_admin user without direct administrative SQL provisioning or platform super_admin authorization.';
      END IF;
    END IF;
    -- In PostgreSQL BEFORE DELETE triggers, returning OLD allows the deletion to proceed.
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- Explicit ownership and execution privilege hardening
ALTER FUNCTION public.protect_super_admin_role() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_super_admin_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_super_admin_role() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_protect_super_admin_role ON public.users;

CREATE TRIGGER trg_protect_super_admin_role
  BEFORE INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_super_admin_role();

COMMENT ON FUNCTION public.protect_super_admin_role() IS
  'Guards the super_admin role against unauthorized promotion, tampering, or deletion by non-super-admin callers or ordinary service_role requests.';


-- ============================================================
-- SECTION 2: RLS-02 — Block Direct Anonymous PostgREST Booking Inserts
-- ============================================================
-- All legitimate public booking submissions are handled server-side
-- (/api/create-pricing-booking and /api/create-booking) using the
-- service_role key (supabaseAdmin), which bypasses RLS and authoritatively
-- computes pricing, rules, and discounts.
--
-- Direct anonymous PostgREST INSERT access on bookings and booking_items
-- is an unnecessary exposure that allows attackers to insert fake, zero-price,
-- or pre-completed bookings. We drop those anonymous INSERT policies here.

-- 2.1 Drop anon direct INSERT on modern bookings table
DROP POLICY IF EXISTS "public_insert_booking" ON public.bookings;

-- 2.2 Drop anon direct INSERT on modern booking_items table
DROP POLICY IF EXISTS "public_insert_booking_items" ON public.booking_items;

-- 2.3 Safely drop anon direct INSERT on legacy quoted "Bookings" table if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'Bookings'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "public_insert_legacy_booking" ON public."Bookings"';
  END IF;
END $$;
