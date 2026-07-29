-- ============================================================
-- Migration 023: Fix company_settings RLS for super_admin
-- ============================================================
-- Problem:
--   Creating (or editing) a company fails with:
--     "new row violates row-level security policy for table company_settings"
--
--   Root causes:
--   1. sql/functions/auth_helpers.sql defines is_super_admin() as a
--      separate non-migration script that may not have been applied to
--      the database. If the function is missing, every WITH CHECK that
--      calls it throws, blocking all writes on company_settings.
--   2. The original "super_admin_all_settings" policy (migration 007)
--      has no TO authenticated clause, meaning it targets ALL roles
--      including anon. Modern policies (migration 014 onward) scope
--      explicitly to authenticated. This inconsistency can cause
--      unexpected evaluation order issues.
--
-- Fix:
--   1. CREATE OR REPLACE the is_super_admin() function so it
--      definitely exists regardless of whether auth_helpers.sql
--      was run.
--   2. Drop and recreate both company_settings policies with an
--      explicit TO authenticated scope — matching the style used in
--      migrations 011, 014, and later.
--   3. Keep tenant isolation identical to the original policies:
--      super_admin → ALL rows unrestricted
--      company_owner/admin → own company rows only
--
-- Safe to re-run: CREATE OR REPLACE + DROP POLICY IF EXISTS are idempotent.
-- ============================================================

-- -------------------------------------------------------
-- 1. Ensure is_super_admin() exists (inline, idempotent)
--    Mirrors sql/functions/auth_helpers.sql exactly.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
  );
$$;

-- Also ensure auth_company_id() and is_company_admin() exist,
-- since they are referenced by the second policy below.
CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM users
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_company_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('company_owner', 'super_admin')
  );
$$;

-- -------------------------------------------------------
-- 2. Rebuild company_settings RLS policies
--    Scoped TO authenticated (consistent with migration 014+).
--    super_admin gets unrestricted ALL — no company_id check,
--    so creating settings for ANY (new) company is always allowed.
-- -------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_settings"      ON company_settings;
DROP POLICY IF EXISTS "company_owner_manage_settings" ON company_settings;

-- super_admin: full access to every row in company_settings
CREATE POLICY "super_admin_all_settings" ON company_settings
  FOR ALL TO authenticated
  USING     (is_super_admin())
  WITH CHECK (is_super_admin());

-- company_owner / admin: read + write own company's settings only
CREATE POLICY "company_owner_manage_settings" ON company_settings
  FOR ALL TO authenticated
  USING     (company_id = auth_company_id() AND is_company_admin())
  WITH CHECK (company_id = auth_company_id() AND is_company_admin());
