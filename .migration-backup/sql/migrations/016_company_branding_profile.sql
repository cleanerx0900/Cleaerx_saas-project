-- ============================================================
-- Migration 016: Company Profile / Branding fields
-- Depends on: 001_core_tenant_layer (company_settings)
-- Safe to re-run: every statement uses ADD COLUMN IF NOT EXISTS
-- ============================================================
-- Purpose:
--   Extends the existing company_settings table (NOT a new table — brand
--   colors, logo_url, contact fields, and working_hours already live here,
--   see 001_core_tenant_layer.sql) to support the redesigned Company
--   Profile dashboard page:
--     - Branding mode (auto-from-logo vs manually customized colors)
--     - The extracted logo color palette, so "Reset to Logo Colors" can
--       restore it without re-uploading or re-analyzing the logo
--     - Company description / service area (Company Information section)
--     - Minimum order + booking preferences (Business Settings section)
--
-- No new tables, no changes to pricing/booking/auth tables or logic.
-- ============================================================

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS branding_mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS logo_palette jsonb,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS service_area text,
  ADD COLUMN IF NOT EXISTS min_order_amount numeric,
  ADD COLUMN IF NOT EXISTS booking_preferences jsonb NOT NULL DEFAULT '{}';

ALTER TABLE company_settings
  DROP CONSTRAINT IF EXISTS company_settings_branding_mode_check;
ALTER TABLE company_settings
  ADD CONSTRAINT company_settings_branding_mode_check
    CHECK (branding_mode IN ('auto', 'manual'));

COMMENT ON COLUMN company_settings.branding_mode        IS 'auto = colors follow the logo palette; manual = owner has customized primary/secondary/accent';
COMMENT ON COLUMN company_settings.logo_palette          IS 'Array of hex colors extracted from the uploaded logo, e.g. ["#0A1F44","#D4AF37","#F5C518"]. Powers "Reset to Logo Colors".';
COMMENT ON COLUMN company_settings.description           IS 'Short public-facing company description shown in the Company Profile / booking pages';
COMMENT ON COLUMN company_settings.service_area          IS 'Free-text description of areas/cities served';
COMMENT ON COLUMN company_settings.min_order_amount      IS 'Minimum order amount (in company currency) accepted on the booking form; NULL = no minimum';
COMMENT ON COLUMN company_settings.booking_preferences   IS 'JSONB booking preferences, e.g. {"require_phone_verification":false,"advance_booking_days":30}';

-- RLS already covers all columns of company_settings (migration 007) —
-- "super_admin_all_settings" and "company_owner_manage_settings" apply to
-- the whole row, so no policy changes are needed for these new columns.
