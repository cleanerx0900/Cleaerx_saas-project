-- ============================================================
-- Test Suite: test_025_protect_super_admin_role.sql
-- Purpose:
--   PostgreSQL Integration Test Suite for Migration 025 (RLS-01 Hardening).
--   Validates that public.protect_super_admin_role() strictly enforces authorization
--   across all caller identity permutations, specifically proving that:
--     1. Normal PostgREST service_role requests CANNOT grant, modify, or delete super_admin.
--     2. Documented Direct SQL Administrative Provisioning works for INSERT, UPDATE, and DELETE.
--     3. Authenticated Platform Super Admins can manage and delete super_admin accounts.
--     4. Anonymous callers, Company Owners, and Company Staff are strictly BLOCKED from super_admin operations.
--     5. Legitimate Company Owner staff management and profile updates still work.
--     6. Authorized DELETE operations properly return OLD and allow row deletion.
--     7. Malformed or missing JWT claims safely fail closed.
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
  v_second_admin_id uuid := '44444444-4444-4444-4444-444444444445';
  v_third_admin_id  uuid := '44444444-4444-4444-4444-444444444446';
  v_anon_target_id  uuid := '55555555-5555-5555-5555-555555555555';
  v_service_tgt_id  uuid := '66666666-6666-6666-6666-666666666666';
  v_row_count       integer;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'STARTING POSTGRESQL INTEGRATION TEST SUITE FOR MIGRATION 025';
  RAISE NOTICE '============================================================';

  -- ------------------------------------------------------------
  -- TEST 1: Documented Administrative Provisioning (Direct SQL Session)
  -- Context: session_user = 'postgres' (direct psql / SQL Editor), NO PostgREST JWT claims
  -- Expected: ALLOWED (Succeeds)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);

  INSERT INTO public.users (id, email, full_name, role, is_active)
  VALUES (v_admin_id, 'platform_admin@cleanerx.local', 'Platform Super Admin', 'super_admin', true)
  ON CONFLICT (id) DO UPDATE SET role = 'super_admin';

  INSERT INTO public.users (id, email, full_name, role, is_active)
  VALUES (v_second_admin_id, 'second_admin@cleanerx.local', 'Second Admin', 'super_admin', true)
  ON CONFLICT (id) DO UPDATE SET role = 'super_admin';

  INSERT INTO public.users (id, email, full_name, role, is_active)
  VALUES (v_third_admin_id, 'third_admin@cleanerx.local', 'Third Admin', 'super_admin', true)
  ON CONFLICT (id) DO UPDATE SET role = 'super_admin';

  RAISE NOTICE '✓ TEST 1 PASSED: Documented Direct SQL Admin Provisioning successfully created super_admin.';

  -- ------------------------------------------------------------
  -- TEST 2: Normal PostgREST service_role Request Attempting to Grant super_admin
  -- Context: session_user = 'authenticator', request.jwt.claims role = 'service_role'
  -- Expected: BLOCKED (Raises Access denied exception)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

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
  -- TEST 4: Normal PostgREST service_role Request Attempting to DELETE Existing super_admin
  -- Context: session_user = 'authenticator', request.jwt.claims role = 'service_role'
  -- Expected: BLOCKED (Raises Access denied exception)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  BEGIN
    DELETE FROM public.users WHERE id = v_admin_id;

    RAISE EXCEPTION 'TEST 4 FAILED: Normal service_role request was able to delete super_admin record!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' THEN
        RAISE NOTICE '✓ TEST 4 PASSED: Normal PostgREST service_role request was strictly blocked from deleting existing super_admin.';
      ELSE
        RAISE EXCEPTION 'TEST 4 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  -- ------------------------------------------------------------
  -- TEST 5: PostgREST Anonymous Request (anon)
  -- Context: session_user = 'authenticator', request.jwt.claims role = 'anon'
  -- Expected: BLOCKED (Raises Access denied exception)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  BEGIN
    INSERT INTO public.users (id, email, full_name, role, is_active)
    VALUES (v_anon_target_id, 'anon_exploit@cleanerx.local', 'Anon Exploit', 'super_admin', true);

    RAISE EXCEPTION 'TEST 5 FAILED: Anonymous caller was able to insert super_admin!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' OR SQLERRM LIKE '%permission denied%' OR SQLERRM LIKE '%violates row-level security policy%' THEN
        RAISE NOTICE '✓ TEST 5 PASSED: Anonymous PostgREST request was strictly blocked from creating super_admin.';
      ELSE
        RAISE EXCEPTION 'TEST 5 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  -- ------------------------------------------------------------
  -- TEST 6: Authenticated Company Owner Attempting Role Escalation to super_admin
  -- Context: session_user = 'authenticator', role = 'authenticated', user is owner
  -- Expected: BLOCKED (Raises Access denied or RLS violation)
  -- ------------------------------------------------------------
  -- Provision company owner and staff first via direct SQL session
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  INSERT INTO public.users (id, email, full_name, role, is_active, company_id)
  VALUES (v_owner_id, 'owner@cleanerx.local', 'Company Owner', 'company_owner', true, v_test_company_id)
  ON CONFLICT (id) DO UPDATE SET role = 'company_owner', company_id = v_test_company_id;

  INSERT INTO public.users (id, email, full_name, role, is_active, company_id)
  VALUES (v_staff_id, 'staff@cleanerx.local', 'Company Staff', 'company_staff', true, v_test_company_id)
  ON CONFLICT (id) DO UPDATE SET role = 'company_staff', company_id = v_test_company_id;

  -- Simulate authenticated owner session
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_owner_id)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);

  BEGIN
    UPDATE public.users SET role = 'super_admin' WHERE id = v_owner_id;
    RAISE EXCEPTION 'TEST 6 FAILED: Company owner was able to escalate role to super_admin!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' OR SQLERRM LIKE '%violates row-level security policy%' THEN
        RAISE NOTICE '✓ TEST 6 PASSED: Company owner was strictly blocked from escalating self to super_admin.';
      ELSE
        RAISE EXCEPTION 'TEST 6 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  -- ------------------------------------------------------------
  -- TEST 7: Authenticated Company Owner Attempting to Promote Staff to super_admin
  -- Context: session_user = 'authenticator', role = 'authenticated' (owner)
  -- Expected: BLOCKED (Raises Access denied or RLS violation)
  -- ------------------------------------------------------------
  BEGIN
    UPDATE public.users SET role = 'super_admin' WHERE id = v_staff_id;
    RAISE EXCEPTION 'TEST 7 FAILED: Company owner was able to promote staff to super_admin!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' OR SQLERRM LIKE '%violates row-level security policy%' THEN
        RAISE NOTICE '✓ TEST 7 PASSED: Company owner was strictly blocked from promoting staff to super_admin.';
      ELSE
        RAISE EXCEPTION 'TEST 7 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  -- ------------------------------------------------------------
  -- TEST 8: Authenticated Company Staff Attempting Role Escalation
  -- Context: session_user = 'authenticator', role = 'authenticated', user is staff
  -- Expected: BLOCKED (Raises Access denied or RLS violation)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_staff_id)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_staff_id::text, true);

  BEGIN
    UPDATE public.users SET role = 'super_admin' WHERE id = v_staff_id;
    RAISE EXCEPTION 'TEST 8 FAILED: Company staff was able to escalate role to super_admin!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' OR SQLERRM LIKE '%violates row-level security policy%' THEN
        RAISE NOTICE '✓ TEST 8 PASSED: Company staff was strictly blocked from escalating self to super_admin.';
      ELSE
        RAISE EXCEPTION 'TEST 8 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  -- ------------------------------------------------------------
  -- TEST 9: Authenticated Company Staff Attempting to Modify Existing super_admin
  -- Context: session_user = 'authenticator', role = 'authenticated' (staff)
  -- Expected: BLOCKED (Raises Access denied or RLS violation)
  -- ------------------------------------------------------------
  BEGIN
    UPDATE public.users SET full_name = 'Staff Hijacked Name' WHERE id = v_admin_id;
    RAISE EXCEPTION 'TEST 9 FAILED: Company staff was able to modify super_admin!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' OR SQLERRM LIKE '%violates row-level security policy%' THEN
        RAISE NOTICE '✓ TEST 9 PASSED: Company staff was strictly blocked from modifying super_admin.';
      ELSE
        RAISE EXCEPTION 'TEST 9 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  -- ------------------------------------------------------------
  -- TEST 10: Authenticated Non-Super-Admin Attempting to Delete super_admin
  -- Context: session_user = 'authenticator', role = 'authenticated' (owner)
  -- Expected: BLOCKED (Raises Access denied or RLS violation)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_owner_id)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);

  BEGIN
    DELETE FROM public.users WHERE id = v_admin_id;
    RAISE EXCEPTION 'TEST 10 FAILED: Non-super-admin was able to delete a super_admin user!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' OR SQLERRM LIKE '%violates row-level security policy%' THEN
        RAISE NOTICE '✓ TEST 10 PASSED: Non-super-admin was strictly blocked from deleting super_admin account.';
      ELSE
        RAISE EXCEPTION 'TEST 10 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  -- ------------------------------------------------------------
  -- TEST 11: Authenticated Platform Super Admin Modifying super_admin Account
  -- Context: session_user = 'authenticator', role = 'authenticated', sub = v_admin_id (is_super_admin = true)
  -- Expected: ALLOWED (Succeeds)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_admin_id)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

  UPDATE public.users SET full_name = 'Platform Admin (Updated by Admin)' WHERE id = v_second_admin_id;
  RAISE NOTICE '✓ TEST 11 PASSED: Authenticated Platform Super Admin successfully updated super_admin record.';

  -- ------------------------------------------------------------
  -- TEST 12: Authenticated Platform Super Admin DELETING Existing super_admin
  -- Context: session_user = 'authenticator', role = 'authenticated', sub = v_admin_id
  -- Crucial check: Verifies that BEFORE DELETE returns OLD so PostgreSQL actually deletes the row!
  -- Expected: ALLOWED and Row actually deleted!
  -- ------------------------------------------------------------
  DELETE FROM public.users WHERE id = v_second_admin_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 1 THEN
    RAISE NOTICE '✓ TEST 12 PASSED: Authenticated Super Admin successfully deleted super_admin row (ROW_COUNT = 1; RETURN OLD works).';
  ELSE
    RAISE EXCEPTION 'TEST 12 FAILED: Deletion returned ROW_COUNT = % (trigger likely returned NULL instead of OLD)', v_row_count;
  END IF;

  -- ------------------------------------------------------------
  -- TEST 13: Direct Administrative SQL Session DELETING Existing super_admin
  -- Context: session_user = 'postgres', NO PostgREST JWT claims
  -- Expected: ALLOWED and Row actually deleted!
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);

  DELETE FROM public.users WHERE id = v_third_admin_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 1 THEN
    RAISE NOTICE '✓ TEST 13 PASSED: Direct SQL session successfully deleted super_admin row (ROW_COUNT = 1; RETURN OLD works).';
  ELSE
    RAISE EXCEPTION 'TEST 13 FAILED: Direct SQL deletion returned ROW_COUNT = %', v_row_count;
  END IF;

  -- ------------------------------------------------------------
  -- TEST 14: Legitimate Company Owner Managing Staff & Updating Own Profile
  -- Context: session_user = 'authenticator', role = 'authenticated', sub = v_owner_id
  -- Expected: ALLOWED (Succeeds under RLS without trigger interference)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_owner_id)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);

  -- Owner updates staff full_name
  UPDATE public.users SET full_name = 'Staff Member Updated Name' WHERE id = v_staff_id;

  -- Owner deletes staff member
  DELETE FROM public.users WHERE id = v_staff_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 1 THEN
    RAISE NOTICE '✓ TEST 14 PASSED: Company owner successfully managed and deleted staff user (ROW_COUNT = 1).';
  ELSE
    RAISE EXCEPTION 'TEST 14 FAILED: Company owner staff deletion returned ROW_COUNT = %', v_row_count;
  END IF;

  -- ------------------------------------------------------------
  -- TEST 15: Malformed JSON Claims Payload Handling
  -- Context: session_user = 'authenticator', request.jwt.claims contains invalid JSON
  -- Expected: Fails closed safely (Raises Access denied, does NOT crash with unhandled syntax error)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{INVALID_JSON::MALFORMED', true);
  PERFORM set_config('request.jwt.claim.role', '', true);

  BEGIN
    INSERT INTO public.users (id, email, full_name, role, is_active)
    VALUES (v_anon_target_id, 'malformed_exploit@cleanerx.local', 'Malformed Exploit', 'super_admin', true);

    RAISE EXCEPTION 'TEST 15 FAILED: Request with malformed claims was able to insert super_admin!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Access denied%' THEN
        RAISE NOTICE '✓ TEST 15 PASSED: Malformed claims payload failed closed safely.';
      ELSE
        RAISE EXCEPTION 'TEST 15 FAILED with unexpected error: %', SQLERRM;
      END IF;
  END;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'ALL 15 POSTGRESQL INTEGRATION TEST SCENARIOS PASSED!';
  RAISE NOTICE '============================================================';
END $$;

-- Clean rollback: leaves database state completely untouched
ROLLBACK;
