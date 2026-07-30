-- ============================================================
-- Migration 015: Auto-create public.users on Supabase Auth signup
-- ============================================================
-- PROBLEM: public.users has no row created automatically when a new
--   Supabase Auth user is created (via the public /signup page, the
--   Supabase dashboard, a magic link, or any other Auth flow). Until a
--   row exists, AuthContext.login() cannot find a profile and rejects
--   the session with "Your account is not set up on this platform."
--
-- FIX: A trigger on auth.users that inserts a matching public.users row
--   immediately after signup. This covers every signup path uniformly
--   (not just the app's own /signup form), so no future Auth flow can
--   create an orphaned account.
--
-- DEFAULTS ASSIGNED:
--   role       = 'company_owner' (existing column default; matches the
--                table's own DEFAULT — see 001_core_tenant_layer.sql)
--   company_id = NULL (no company yet — assigned later by a super_admin,
--                e.g. via the "Add Company" flow, or by the company_owner
--                completing setup)
--   is_active  = true
--   full_name  = raw_user_meta_data->>'full_name' if the signup call
--                supplied it (e.g. pages/signup.js), otherwise NULL
--
-- Elevated privileges to write into public.users despite RLS come from
-- SECURITY DEFINER — the same pattern already used by auth_company_id(),
-- is_super_admin(), and is_company_admin() in sql/functions/auth_helpers.sql.
-- RLS itself is untouched: this only adds one more privileged write path,
-- exactly like those existing helper functions.
--
-- IDEMPOTENT: ON CONFLICT (id) DO NOTHING means this trigger is safe to
-- coexist with code paths that insert the row themselves right after
-- creating the Auth user (see pages/api/admin/create-company.js, which
-- now upserts instead of inserting for this exact reason).
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    'company_owner',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION handle_new_auth_user() IS
  'Auto-creates a public.users row for every new Supabase Auth user so no signup path can leave an account without a profile row.';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
