-- ============================================================
-- CleanerX SaaS — RLS Auth Helper Functions
-- Run BEFORE migration 007_rls_policies.sql
-- ============================================================

-- Returns the company_id of the currently authenticated user.
-- Used in every tenant-scoped RLS policy.
-- SECURITY DEFINER: runs with function owner's privileges to
-- avoid infinite recursion when querying the users table under RLS.
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

-- Returns true if the current user has the 'super_admin' role.
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

-- Returns true if the current user is company_owner OR super_admin.
-- Used on tables where company owners need full CRUD on their own data.
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

-- Trigger function: auto-update updated_at on any mutable table.
-- Attach to tables with: CREATE TRIGGER <name> BEFORE UPDATE ON <table>
--                        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- Attach updated_at triggers.
-- Uses %s (not %I) for the trigger name — trigger names are plain
-- SQL identifiers and must not be double-quoted in the format string.
-- %I is used only for the table name to handle reserved words safely.
-- Safe to re-run: pg_trigger existence check prevents duplicates.
-- Run AFTER all migration files have been applied.
-- ============================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'companies',
    'company_settings',
    'users',
    'services',
    'service_pricing',
    'bookings',
    'company_subscriptions',
    'company_themes',
    'analytics_daily'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'set_updated_at_' || tbl
        AND tgrelid = tbl::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER set_updated_at_%s
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
        tbl,   -- %s: plain identifier for the trigger name (no quoting)
        tbl    -- %I: quoted identifier for the table name
      );
    END IF;
  END LOOP;
END;
$$;
