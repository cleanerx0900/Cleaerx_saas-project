-- ============================================================
-- Test Suite: test_025_protect_super_admin_role.sql
-- Purpose:
--   PostgreSQL Integration Test Suite for Migration 025 (RLS-01 Hardening).
--   Validates that public.protect_super_admin_role() strictly enforces authorization
--   across all caller identity permutations, specifically proving that:
--     1. Normal PostgREST service_role requests CANNOT grant super_admin.
--     2. Documented Administrative Provisioning (Direct SQL or explicit override) works.
--     3. Authenticated Platform Super Admins can manage super_admin accounts.
--     4. Anonymous callers, Company Owners, and Company Staff are strictly BLOCKED.
--
-- Execution:
--   Can be safely executed in a Staging / Local PostgreSQL or Supabase SQL Editor.
--   Enclosed in an explicit transaction block that rolls back at the end, leaving no test data.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_test_company_id uuid := '11111111-1111-1111-1111-111111111111';
  v_owner_id        uuid := '22222222-2222-2222-2222-222222222222';
  v_staff_id        uuid := '33333333-3333-3333-3333-333333333333';
  v_admin_id        uuid := '44444444-4444-4444-4444-444444444444';
  v_anon_target_id  uuid := '55555555-5555-5555-5555-555555555555';
  v_service_tgt_id  uuid := '66666666-6666-6666-6666-666666666666';
  v_override_tgt_id uuid := '77777777-7777-7777-7777-777777777777';
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'STARTING POSTGRESQL INTEGRATION TEST SUITE FOR MIGRATION 025';
  RAISE NOTICE '============================================================';

  -- ------------------------------------------------------------
  -- TEST 1: Documented Administrative Provisioning Process (Direct SQL Session)
  -- Context: session_user = 'postgres' (direct psql / SQL Editor), NO PostgREST JWT claims
  -- Expected: ALLOWED (Succeeds)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('cleanerx.admin_provisioning_authorized', '', true);

  INSERT INTO public.users (id, email, full_name, role, is_active)
  VALUES (v_admin_id, 'platform_admin@cleanerx.local', 'Platform Super Admin', 'super_admin', true)
  ON CONFLICT (id) DO UPDATE SET role = 'super_admin';

  RAISE NOTICE '✓ TEST 1 PASSED: Documented Direct SQL Admin Provisioning successfully created super_admin.';

  -- ------------------------------------------------------------
  -- TEST 2: Normal PostgREST service_role Request Attempting to Grant super_admin
  -- Context: session_user = 'authenticator', request.jwt.claims role = 'service_role'
  -- Notice: Generic service_role exception is REMOVED. Ordinary backend service-role API
  -- calls MUST NOT be able to grant or escalate to super_admin.
  -- Expected: BLOCKED (Raises Access denied exception)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('cleanerx.admin_provisioning_authorized', '', true);

  BEGIN
    INSERT INTO public.users (id, email, full_name, role, is_active)
    VALUES (v_service_tgt_id, 'service_exploit@cleanerx.local', 'Service Role Exploit', 'super_admin', true);

    RAISE EXCEPTION 'TEST 2 FAILED: Normal service_role request was able to insert super_admin!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' THEN
        RAISE NOTICE '✓ TEST 2 PASSED: Normal PostgREST service_role request was strictly blocked from granting super_admin.';
      ELSE
        RAISE EXCEPTION 'TEST 2 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  -- ------------------------------------------------------------
  -- TEST 3: Normal PostgREST service_role Request Attempting to Modify Existing super_admin
  -- Context: session_user = 'authenticator', request.jwt.claims role = 'service_role'
  -- Expected: BLOCKED (Raises Access denied exception)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('cleanerx.admin_provisioning_authorized', '', true);

  BEGIN
    UPDATE public.users SET full_name = 'Compromised Name' WHERE id = v_admin_id;

    RAISE EXCEPTION 'TEST 3 FAILED: Normal service_role request was able to modify super_admin record!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' THEN
        RAISE NOTICE '✓ TEST 3 PASSED: Normal PostgREST service_role request was strictly blocked from modifying existing super_admin.';
      ELSE
        RAISE EXCEPTION 'TEST 3 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  -- ------------------------------------------------------------
  -- TEST 4: PostgREST Anonymous Request (anon)
  -- Context: session_user = 'authenticator', request.jwt.claims role = 'anon'
  -- Expected: BLOCKED (Raises Access denied exception)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  BEGIN
    INSERT INTO public.users (id, email, full_name, role, is_active)
    VALUES (v_anon_target_id, 'anon_exploit@cleanerx.local', 'Anon Exploit', 'super_admin', true);

    RAISE EXCEPTION 'TEST 4 FAILED: Anonymous caller was able to insert super_admin!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' THEN
        RAISE NOTICE '✓ TEST 4 PASSED: Anonymous PostgREST request was strictly blocked from creating super_admin.';
      ELSE
        RAISE EXCEPTION 'TEST 4 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  -- ------------------------------------------------------------
  -- TEST 5: Authenticated Company Owner Attempting Role Escalation to super_admin
  -- Context: session_user = 'authenticator', role = 'authenticated', user is owner
  -- Expected: BLOCKED (Raises Access denied or RLS violation)
  -- ------------------------------------------------------------
  -- Provision company owner first via direct SQL session
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  INSERT INTO public.users (id, email, full_name, role, is_active)
  VALUES (v_owner_id, 'owner@cleanerx.local', 'Company Owner', 'company_owner', true)
  ON CONFLICT (id) DO UPDATE SET role = 'company_owner';

  -- Simulate authenticated owner session
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_owner_id)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);

  BEGIN
    UPDATE public.users SET role = 'super_admin' WHERE id = v_owner_id;
    RAISE EXCEPTION 'TEST 5 FAILED: Company owner was able to escalate role to super_admin!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' OR SQLERRM LIKE '%violates row-level security policy%' THEN
        RAISE NOTICE '✓ TEST 5 PASSED: Company owner was strictly blocked from escalating role to super_admin.';
      ELSE
        RAISE EXCEPTION 'TEST 5 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  -- ------------------------------------------------------------
  -- TEST 6: Authenticated Company Staff Attempting Role Escalation
  -- Context: session_user = 'authenticator', role = 'authenticated', user is staff
  -- Expected: BLOCKED (Raises Access denied or RLS violation)
  -- ------------------------------------------------------------
  -- Provision staff first via direct SQL session
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  INSERT INTO public.users (id, email, full_name, role, is_active)
  VALUES (v_staff_id, 'staff@cleanerx.local', 'Company Staff', 'company_staff', true)
  ON CONFLICT (id) DO UPDATE SET role = 'company_staff';

  -- Simulate authenticated staff session
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_staff_id)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_staff_id::text, true);

  BEGIN
    UPDATE public.users SET role = 'super_admin' WHERE id = v_staff_id;
    RAISE EXCEPTION 'TEST 6 FAILED: Company staff was able to escalate role to super_admin!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' OR SQLERRM LIKE '%violates row-level security policy%' THEN
        RAISE NOTICE '✓ TEST 6 PASSED: Company staff was strictly blocked from escalating role to super_admin.';
      ELSE
        RAISE EXCEPTION 'TEST 6 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  -- ------------------------------------------------------------
  -- TEST 7: Authenticated Non-Super-Admin Attempting to Delete super_admin
  -- Context: session_user = 'authenticator', role = 'authenticated' (owner)
  -- Expected: BLOCKED (Raises Access denied or RLS violation)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_owner_id)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);

  BEGIN
    DELETE FROM public.users WHERE id = v_admin_id;
    RAISE EXCEPTION 'TEST 7 FAILED: Non-super-admin was able to delete a super_admin user!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' OR SQLERRM LIKE '%violates row-level security policy%' THEN
        RAISE NOTICE '✓ TEST 7 PASSED: Non-super-admin was strictly blocked from deleting super_admin account.';
      ELSE
        RAISE EXCEPTION 'TEST 7 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  -- ------------------------------------------------------------
  -- TEST 8: Authenticated Platform Super Admin Managing super_admin Account
  -- Context: session_user = 'authenticator', role = 'authenticated', sub = v_admin_id (is_super_admin = true)
  -- Expected: ALLOWED (Succeeds)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_admin_id)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

  UPDATE public.users SET full_name = 'Platform Admin (Updated by Admin)' WHERE id = v_admin_id;
  RAISE NOTICE '✓ TEST 8 PASSED: Authenticated Platform Super Admin successfully updated super_admin record.';

  -- ------------------------------------------------------------
  -- TEST 9: Explicit Administrative Provisioning Override (Audited Tooling)
  -- Context: role = 'service_role' AND cleanerx.admin_provisioning_authorized = 'true'
  -- Expected: ALLOWED (Succeeds)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('cleanerx.admin_provisioning_authorized', 'true', true);

  INSERT INTO public.users (id, email, full_name, role, is_active)
  VALUES (v_override_tgt_id, 'override_admin@cleanerx.local', 'Override Admin', 'super_admin', true)
  ON CONFLICT (id) DO UPDATE SET role = 'super_admin';

  RAISE NOTICE '✓ TEST 9 PASSED: Explicit Administrative Override successfully provisioned super_admin.';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'ALL 9 POSTGRESQL INTEGRATION TEST SCENARIOS PASSED!';
  RAISE NOTICE '============================================================';
END $$;

-- Clean rollback: leaves database state completely untouched
ROLLBACK;
