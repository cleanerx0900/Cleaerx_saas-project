-- ============================================================
-- Migration 011: Company Pricing Rules Engine
-- Depends on: 001_core_tenant_layer (companies), functions/auth_helpers.sql
-- Safe to re-run: CREATE TABLE IF NOT EXISTS + seed uses ON CONFLICT DO NOTHING
-- ============================================================
-- Purpose:
--   Dedicated, editable pricing engine for the Company Dashboard's new
--   "Pricing" page. Each row is one editable number (a price or a
--   threshold/qty) inside a category that mirrors the categories already
--   shown on the public booking forms (lib/pricing.js / pages/book-service.js
--   and pages/company/[slug]/book.js).
--
--   IMPORTANT — scope of this migration:
--   This table is intentionally NOT read by any booking form yet. It exists
--   so company owners can manage their rates in one place before the
--   booking forms are wired up to read from it in a later change. Nothing
--   about booking calculations changes as a result of this migration.
-- ============================================================

-- -------------------------------------------------------
-- 1. company_pricing_rules
-- One row per editable price/threshold, scoped to a company + category.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_pricing_rules (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Category groups rules into the cards shown on the dashboard Pricing
  -- page, matching the existing booking form sections.
  category      text          NOT NULL,
  category_label text         NOT NULL,   -- e.g. "🛋 Sofa Cleaning" (card title)

  -- One rule = one editable number within a category.
  rule_key      text          NOT NULL,   -- stable key, e.g. 'standard_rate', 'bulk_threshold'
  rule_label    text          NOT NULL,   -- e.g. "Standard Rate (1–9 Seats)"
  value         numeric(10,2) NOT NULL,
  value_kind    text          NOT NULL DEFAULT 'price', -- 'price' | 'threshold'
  unit_note     text,                                    -- cosmetic hint, e.g. "/seat", "/sqft", "seats"

  display_order int           NOT NULL DEFAULT 0,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT company_pricing_rules_category_check CHECK (
    category IN ('sofa', 'foam', 'carpet', 'mattress', 'curtain', 'tank', 'home_regular', 'home_deep')
  ),
  CONSTRAINT company_pricing_rules_value_kind_check CHECK (
    value_kind IN ('price', 'threshold')
  ),
  CONSTRAINT company_pricing_rules_value_nonnegative CHECK (value >= 0),

  -- One rule per (company, category, rule_key) — upserts key off this.
  CONSTRAINT company_pricing_rules_unique UNIQUE (company_id, category, rule_key)
);

COMMENT ON TABLE  company_pricing_rules              IS 'Editable pricing engine for the Company Dashboard Pricing page. Not yet read by any booking form.';
COMMENT ON COLUMN company_pricing_rules.category     IS 'Groups rules into dashboard cards; mirrors public booking form sections';
COMMENT ON COLUMN company_pricing_rules.value_kind   IS 'price = currency amount; threshold = a quantity breakpoint (e.g. bulk starts at N)';
COMMENT ON COLUMN company_pricing_rules.rule_key     IS 'Stable identifier per category, not shown to the user — UI shows rule_label instead';

CREATE INDEX IF NOT EXISTS idx_company_pricing_rules_company
  ON company_pricing_rules(company_id);

CREATE INDEX IF NOT EXISTS idx_company_pricing_rules_company_category
  ON company_pricing_rules(company_id, category);

-- -------------------------------------------------------
-- 2. Row Level Security
-- Same pattern as service_pricing (007_rls_policies.sql):
-- super_admin: ALL. company_owner/admin: ALL within own company.
-- No public (anon) policy — this table is never read by public booking pages.
-- -------------------------------------------------------
ALTER TABLE company_pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_pricing_rules"     ON company_pricing_rules;
DROP POLICY IF EXISTS "company_owner_manage_pricing_rules" ON company_pricing_rules;

CREATE POLICY "super_admin_all_pricing_rules" ON company_pricing_rules
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "company_owner_manage_pricing_rules" ON company_pricing_rules
  FOR ALL
  USING (company_id = auth_company_id() AND is_company_admin())
  WITH CHECK (company_id = auth_company_id() AND is_company_admin());

-- -------------------------------------------------------
-- 3. Seed defaults for every existing company
-- Values below are the current hardcoded defaults from lib/pricing.js,
-- copied verbatim so every company starts from today's real rates.
-- ON CONFLICT DO NOTHING makes this safe to re-run.
-- -------------------------------------------------------
INSERT INTO company_pricing_rules
  (company_id, category, category_label, rule_key, rule_label, value, value_kind, unit_note, display_order)
SELECT c.id, v.category, v.category_label, v.rule_key, v.rule_label, v.value, v.value_kind, v.unit_note, v.display_order
FROM companies c
CROSS JOIN (
  VALUES
    -- 🛋 Sofa Cleaning
    ('sofa', '🛋 Sofa Cleaning', 'standard_rate',   'Standard Rate (1–9 Seats)',  320::numeric, 'price',     '/seat',  1),
    ('sofa', '🛋 Sofa Cleaning', 'bulk_rate',       'Bulk Rate (10+ Seats)',      280::numeric, 'price',     '/seat',  2),
    ('sofa', '🛋 Sofa Cleaning', 'bulk_threshold',  'Bulk Starts From',            10::numeric, 'threshold', 'seats',  3),

    -- 🪑 Foam Chairs
    ('foam', '🪑 Foam Chairs', 'standard_rate',    'Standard Rate',              280::numeric, 'price',     '/chair', 1),
    ('foam', '🪑 Foam Chairs', 'bulk_rate',        'Bulk Rate',                  250::numeric, 'price',     '/chair', 2),
    ('foam', '🪑 Foam Chairs', 'bulk_threshold',   'Bulk Starts From',            10::numeric, 'threshold', 'chairs', 3),

    -- 🧼 Carpet Cleaning
    ('carpet', '🧼 Carpet Cleaning', 'band_0_100',    '0–100 sqft',    25::numeric, 'price', '/sqft', 1),
    ('carpet', '🧼 Carpet Cleaning', 'band_101_300',  '101–300 sqft',  23::numeric, 'price', '/sqft', 2),
    ('carpet', '🧼 Carpet Cleaning', 'band_301_500',  '301–500 sqft',  22::numeric, 'price', '/sqft', 3),
    ('carpet', '🧼 Carpet Cleaning', 'band_500_plus', '500+ sqft',     20::numeric, 'price', '/sqft', 4),

    -- 🛏 Mattress Cleaning
    ('mattress', '🛏 Mattress Cleaning', 'single_standard', 'Single Standard',    1500::numeric, 'price', 'each', 1),
    ('mattress', '🛏 Mattress Cleaning', 'single_bulk',     'Single Bulk (2+)',   1200::numeric, 'price', 'each', 2),
    ('mattress', '🛏 Mattress Cleaning', 'double_standard', 'Double Standard',    2500::numeric, 'price', 'each', 3),
    ('mattress', '🛏 Mattress Cleaning', 'double_bulk',     'Double Bulk (2+)',   2000::numeric, 'price', 'each', 4),

    -- 🪟 Curtains
    ('curtain', '🪟 Curtains', 'small',    'Small',    500::numeric, 'price', 'each', 1),
    ('curtain', '🪟 Curtains', 'standard', 'Standard', 800::numeric, 'price', 'each', 2),
    ('curtain', '🪟 Curtains', 'large',    'Large',   1200::numeric, 'price', 'each', 3),
    ('curtain', '🪟 Curtains', 'blackout', 'Blackout',1500::numeric, 'price', 'each', 4),

    -- 🪣 Water Tank Cleaning (exists on current booking forms; included for completeness)
    ('tank', '🪣 Water Tank Cleaning', 'band_500',  'Up to 500L',    2500::numeric, 'price', 'flat rate', 1),
    ('tank', '🪣 Water Tank Cleaning', 'band_1000', '501–1,000L',    3500::numeric, 'price', 'flat rate', 2),
    ('tank', '🪣 Water Tank Cleaning', 'band_2000', '1,001–2,000L',  5000::numeric, 'price', 'flat rate', 3),
    ('tank', '🪣 Water Tank Cleaning', 'band_5000', '2,001–5,000L',  7000::numeric, 'price', 'flat rate', 4),

    -- 🏠 Home Cleaning — Regular (small home / large home × 7 room types)
    ('home_regular', '🏠 Home Cleaning — Regular', 'small_bed',     'Bedroom (Small Home)',     1200::numeric, 'price', '/room', 1),
    ('home_regular', '🏠 Home Cleaning — Regular', 'small_lounge',  'Lounge (Small Home)',      1500::numeric, 'price', '/room', 2),
    ('home_regular', '🏠 Home Cleaning — Regular', 'small_kitchen', 'Kitchen (Small Home)',      800::numeric, 'price', '/room', 3),
    ('home_regular', '🏠 Home Cleaning — Regular', 'small_wash',    'Washroom (Small Home)',     800::numeric, 'price', '/room', 4),
    ('home_regular', '🏠 Home Cleaning — Regular', 'small_garage',  'Garage (Small Home)',       800::numeric, 'price', '/room', 5),
    ('home_regular', '🏠 Home Cleaning — Regular', 'small_stair',   'Staircase (Small Home)',    800::numeric, 'price', '/room', 6),
    ('home_regular', '🏠 Home Cleaning — Regular', 'small_store',   'Store Room (Small Home)',   800::numeric, 'price', '/room', 7),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_bed',     'Bedroom (Large Home)',     1500::numeric, 'price', '/room', 8),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_lounge',  'Lounge (Large Home)',      1500::numeric, 'price', '/room', 9),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_kitchen', 'Kitchen (Large Home)',     1200::numeric, 'price', '/room', 10),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_wash',    'Washroom (Large Home)',    1200::numeric, 'price', '/room', 11),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_garage',  'Garage (Large Home)',      1200::numeric, 'price', '/room', 12),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_stair',   'Staircase (Large Home)',   1200::numeric, 'price', '/room', 13),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_store',   'Store Room (Large Home)',  1200::numeric, 'price', '/room', 14),

    -- 🏠✨ Home Cleaning — Deep (small home / large home × 7 room types)
    ('home_deep', '✨ Home Cleaning — Deep', 'small_bed',     'Bedroom (Small Home)',     2000::numeric, 'price', '/room', 1),
    ('home_deep', '✨ Home Cleaning — Deep', 'small_lounge',  'Lounge (Small Home)',      2000::numeric, 'price', '/room', 2),
    ('home_deep', '✨ Home Cleaning — Deep', 'small_kitchen', 'Kitchen (Small Home)',     1500::numeric, 'price', '/room', 3),
    ('home_deep', '✨ Home Cleaning — Deep', 'small_wash',    'Washroom (Small Home)',    1500::numeric, 'price', '/room', 4),
    ('home_deep', '✨ Home Cleaning — Deep', 'small_garage',  'Garage (Small Home)',      1500::numeric, 'price', '/room', 5),
    ('home_deep', '✨ Home Cleaning — Deep', 'small_stair',   'Staircase (Small Home)',   1500::numeric, 'price', '/room', 6),
    ('home_deep', '✨ Home Cleaning — Deep', 'small_store',   'Store Room (Small Home)',  1500::numeric, 'price', '/room', 7),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_bed',     'Bedroom (Large Home)',     2800::numeric, 'price', '/room', 8),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_lounge',  'Lounge (Large Home)',      2800::numeric, 'price', '/room', 9),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_kitchen', 'Kitchen (Large Home)',     2000::numeric, 'price', '/room', 10),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_wash',    'Washroom (Large Home)',    2000::numeric, 'price', '/room', 11),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_garage',  'Garage (Large Home)',      2000::numeric, 'price', '/room', 12),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_stair',   'Staircase (Large Home)',   2000::numeric, 'price', '/room', 13),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_store',   'Store Room (Large Home)',  2000::numeric, 'price', '/room', 14)
) AS v(category, category_label, rule_key, rule_label, value, value_kind, unit_note, display_order)
ON CONFLICT (company_id, category, rule_key) DO NOTHING;
