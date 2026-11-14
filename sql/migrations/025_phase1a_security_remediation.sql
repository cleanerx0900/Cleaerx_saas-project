-- ============================================================
-- Migration 025: Phase 1A Critical Security Remediation
-- Fixes:
--   1. RLS-01: Prevent company owners/staff from escalating role to super_admin or company_owner
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
--   DROP TRIGGER IF EXISTS trg_protect_super_admin_role ON public.users;
--   DROP FUNCTION IF EXISTS public.protect_super_admin_role();
-- (Keep granular role constraints on public.users in place).
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
-- SECTION 1: RLS-01 — Role Protection & Tenant Isolation (public.users)
-- ============================================================

-- 1.1 Remove blanket and legacy policies on public.users
DROP POLICY IF EXISTS "company_owner_manage_users" ON public.users;
DROP POLICY IF EXISTS "company_owner_select_users" ON public.users;
DROP POLICY IF EXISTS "company_owner_insert_users" ON public.users;
DROP POLICY IF EXISTS "company_owner_update_users" ON public.users;
DROP POLICY IF EXISTS "company_owner_delete_users" ON public.users;
DROP POLICY IF EXISTS "company_owner_update_staff" ON public.users;
DROP POLICY IF EXISTS "company_owner_update_self"  ON public.users;

-- 1.2 SELECT: Company owners can view all users within their assigned company
CREATE POLICY "company_owner_select_users" ON public.users
  FOR SELECT TO authenticated
  USING (
    company_id = public.auth_company_id()
    AND public.is_company_admin()
  );

-- 1.3 INSERT: Company owners can add staff to their own company only.
-- Role MUST strictly be 'company_staff'. Only Super Admin provisions 'company_owner' or 'super_admin'.
CREATE POLICY "company_owner_insert_users" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.auth_company_id()
    AND public.is_company_admin()
    AND role = 'company_staff'
  );

-- 1.4 UPDATE: Granular policies preventing role escalation while allowing legitimate profile updates:
-- A. Owner managing company staff: target role must be 'company_staff', and must remain 'company_staff'.
CREATE POLICY "company_owner_update_staff" ON public.users
  FOR UPDATE TO authenticated
  USING (
    company_id = public.auth_company_id()
    AND public.is_company_admin()
    AND role = 'company_staff'
  )
  WITH CHECK (
    company_id = public.auth_company_id()
    AND public.is_company_admin()
    AND role = 'company_staff'
  );

-- B. Owner managing their own profile: can update name/profile, but role MUST remain 'company_owner'.
CREATE POLICY "company_owner_update_self" ON public.users
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    AND company_id = public.auth_company_id()
    AND public.is_company_admin()
    AND role = 'company_owner'
  )
  WITH CHECK (
    id = auth.uid()
    AND company_id = public.auth_company_id()
    AND public.is_company_admin()
    AND role = 'company_owner'
  );

-- 1.5 DELETE: Company owners can ONLY remove company_staff within their own company.
-- They CANNOT delete other company owners or super_admin accounts.
CREATE POLICY "company_owner_delete_users" ON public.users
  FOR DELETE TO authenticated
  USING (
    company_id = public.auth_company_id()
    AND public.is_company_admin()
    AND role = 'company_staff'
  );

-- 1.6 Database-level Trigger for Defense-in-Depth against Role Escalation
-- Prevents any non-super-admin actor from assuming or assigning the super_admin role,
-- and prevents non-super-admins from changing existing user roles.
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
  --    session_user is the SQL standard keyword for the physical connection user
  --    ('postgres' or 'supabase_admin') and does NOT change inside SECURITY DEFINER functions.
  --    PostgREST always connects as 'authenticator'.
  v_is_direct_admin := (session_user IN ('postgres', 'supabase_admin') AND v_jwt_role IS NULL);

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
    -- Prevent unauthorized promotion to super_admin or unauthorized role modification
    IF NEW.role = 'super_admin' AND OLD.role IS DISTINCT FROM NEW.role THEN
      IF NOT (v_is_direct_admin OR v_is_caller_super_admin) THEN
        RAISE EXCEPTION 'Access denied: ordinary service_role API requests and tenant users cannot grant or assume the super_admin role. Use the documented direct administrative SQL provisioning process or platform super_admin account.';
      END IF;
    END IF;

    -- Prevent non-super-admins from changing any user's role
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      IF NOT (v_is_direct_admin OR v_is_caller_super_admin) THEN
        RAISE EXCEPTION 'Access denied: user role changes can only be performed by platform administrators.';
      END IF;
    END IF;

    -- Prevent unauthorized modification of existing super_admin accounts
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

-- 1.7 Explicit ownership and execution privilege hardening
ALTER FUNCTION public.protect_super_admin_role() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_super_admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_super_admin_role() FROM anon;
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

-- 2.1 Ensure RLS is enabled and forced on bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings FORCE ROW LEVEL SECURITY;

-- 2.2 Ensure RLS is enabled and forced on booking_items
ALTER TABLE public.booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_items FORCE ROW LEVEL SECURITY;

-- 2.3 Drop all public/anonymous insert policies on modern tables
DROP POLICY IF EXISTS "public_insert_booking" ON public.bookings;
DROP POLICY IF EXISTS "Public can insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "public_insert_booking_items" ON public.booking_items;

-- 2.4 Revoke table-level INSERT from anon for defense-in-depth
REVOKE INSERT ON public.bookings FROM anon;
REVOKE INSERT ON public.booking_items FROM anon;

-- 2.5 Safely handle legacy quoted "Bookings" table if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'Bookings'
  ) THEN
    EXECUTE 'ALTER TABLE public."Bookings" ENABLE ROW LEVEL SECURITY;';
    EXECUTE 'ALTER TABLE public."Bookings" FORCE ROW LEVEL SECURITY;';
    EXECUTE 'DROP POLICY IF EXISTS "public_insert_legacy_booking" ON public."Bookings";';
    EXECUTE 'DROP POLICY IF EXISTS "Public can insert bookings" ON public."Bookings";';
    EXECUTE 'REVOKE INSERT ON public."Bookings" FROM anon;';
  END IF;
END $$;
