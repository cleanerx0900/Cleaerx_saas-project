-- ============================================================
-- Migration 014: Company Service Settings
-- Depends on: 001_core_tenant_layer (companies)
-- Safe to re-run: CREATE TABLE IF NOT EXISTS + seed uses ON CONFLICT DO NOTHING
-- ============================================================
-- Purpose:
--   One enable/disable toggle per company per booking-form section.
--   Eight canonical categories mirror the booking form exactly:
--     sofa | foam | carpet | mattress | curtain | tank | home_regular | home_deep
--
--   The booking form (/company/[slug]/book) reads this via company-pricing.js
--   and hides any section where is_active = false.
--   The Dashboard → Services page writes to this table.
--   The Admin → Services page also reads/writes this table.
--
--   IMPORTANT: this table is intentionally separate from company_pricing_rules
--   (which stores the pricing values). Enable/disable is a visibility flag;
--   pricing is a numeric concern. Keeping them separate means toggling a service
--   off never destroys its pricing configuration.
-- ============================================================

CREATE TABLE IF NOT EXISTS company_service_settings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category    text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT company_service_settings_category_check CHECK (
    category IN ('sofa', 'foam', 'carpet', 'mattress', 'curtain', 'tank', 'home_regular', 'home_deep')
  ),
  CONSTRAINT company_service_settings_unique UNIQUE (company_id, category)
);

COMMENT ON TABLE  company_service_settings           IS 'Per-company visibility toggles for the 8 booking-form sections.';
COMMENT ON COLUMN company_service_settings.category  IS 'Matches company_pricing_rules.category and the booking form section keys.';
COMMENT ON COLUMN company_service_settings.is_active IS 'false = section hidden on the customer booking form.';

CREATE INDEX IF NOT EXISTS idx_company_service_settings_company
  ON company_service_settings(company_id);

-- -------------------------------------------------------
-- Row Level Security
-- Mirrors company_pricing_rules pattern (migrations 007 + 011):
--   super_admin:               ALL rows (uses is_super_admin() helper)
--   company_owner/admin only:  ALL within own company (uses is_company_admin() + auth_company_id())
--   company_staff:             no access — toggling service visibility is an owner/admin action
-- -------------------------------------------------------
ALTER TABLE company_service_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "css_super_admin_all"           ON company_service_settings;
DROP POLICY IF EXISTS "css_company_admin_manage"      ON company_service_settings;

CREATE POLICY "css_super_admin_all" ON company_service_settings
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "css_company_admin_manage" ON company_service_settings
  FOR ALL TO authenticated
  USING (company_id = auth_company_id() AND is_company_admin())
  WITH CHECK (company_id = auth_company_id() AND is_company_admin());

-- -------------------------------------------------------
-- Seed function: idempotent, called by trigger + backfill
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_company_default_service_settings(p_company_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO company_service_settings (company_id, category, is_active)
  SELECT p_company_id, v.category, true
  FROM (VALUES
    ('sofa'::text),
    ('foam'::text),
    ('carpet'::text),
    ('mattress'::text),
    ('curtain'::text),
    ('tank'::text),
    ('home_regular'::text),
    ('home_deep'::text)
  ) AS v(category)
  ON CONFLICT (company_id, category) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION seed_company_default_service_settings(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION _trg_seed_company_service_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM seed_company_default_service_settings(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION _trg_seed_company_service_settings() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_seed_company_service_settings ON companies;
CREATE TRIGGER trg_seed_company_service_settings
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION _trg_seed_company_service_settings();

-- -------------------------------------------------------
-- Backfill all existing companies (idempotent)
-- -------------------------------------------------------
SELECT seed_company_default_service_settings(c.id)
FROM companies c;
