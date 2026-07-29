-- ============================================================
-- Migration 012: Auto-copy default pricing to every new company
-- Depends on: 011_company_pricing_rules.sql
-- Safe to re-run: CREATE OR REPLACE FUNCTION + trigger existence check +
--                 backfill uses ON CONFLICT DO NOTHING.
-- ============================================================
-- Purpose:
--   A new company must NEVER see an empty Pricing page. This migration
--   makes "copy CleanerX's default pricing into the new company" an
--   automatic, database-level side effect of creating a company row —
--   so it happens no matter which code path creates that row (the
--   Company Provisioning API, the Super Admin UI, or any future signup
--   flow), with zero application code changes required.
--
--   This does NOT touch lib/pricing.js, the booking form, or any
--   customer-facing page. It only initializes/backfills rows in
--   company_pricing_rules — the same table and same default values
--   introduced in migration 011.
-- ============================================================

-- -------------------------------------------------------
-- 1. Trigger function: seed one company's default pricing rows.
-- Mirrors the VALUES list from migration 011's seed block exactly, so
-- "default pricing" has a single source of truth across both migrations.
-- SECURITY DEFINER + fixed search_path, matching functions/auth_helpers.sql,
-- so the insert succeeds regardless of which role's INSERT on `companies`
-- fired the trigger.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_company_pricing_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO company_pricing_rules
    (company_id, category, category_label, rule_key, rule_label, value, value_kind, unit_note, display_order)
  VALUES
    -- 🛋 Sofa Cleaning
    (NEW.id, 'sofa', '🛋 Sofa Cleaning', 'standard_rate',  'Standard Rate (1–9 Seats)',  320, 'price',     '/seat',  1),
    (NEW.id, 'sofa', '🛋 Sofa Cleaning', 'bulk_rate',      'Bulk Rate (10+ Seats)',      280, 'price',     '/seat',  2),
    (NEW.id, 'sofa', '🛋 Sofa Cleaning', 'bulk_threshold', 'Bulk Starts From',            10, 'threshold', 'seats',  3),

    -- 🪑 Foam Chairs
    (NEW.id, 'foam', '🪑 Foam Chairs', 'standard_rate',   'Standard Rate',              280, 'price',     '/chair', 1),
    (NEW.id, 'foam', '🪑 Foam Chairs', 'bulk_rate',       'Bulk Rate',                  250, 'price',     '/chair', 2),
    (NEW.id, 'foam', '🪑 Foam Chairs', 'bulk_threshold',  'Bulk Starts From',            10, 'threshold', 'chairs', 3),

    -- 🧼 Carpet Cleaning
    (NEW.id, 'carpet', '🧼 Carpet Cleaning', 'band_0_100',    '0–100 sqft',    25, 'price', '/sqft', 1),
    (NEW.id, 'carpet', '🧼 Carpet Cleaning', 'band_101_300',  '101–300 sqft',  23, 'price', '/sqft', 2),
    (NEW.id, 'carpet', '🧼 Carpet Cleaning', 'band_301_500',  '301–500 sqft',  22, 'price', '/sqft', 3),
    (NEW.id, 'carpet', '🧼 Carpet Cleaning', 'band_500_plus', '500+ sqft',     20, 'price', '/sqft', 4),

    -- 🛏 Mattress Cleaning
    (NEW.id, 'mattress', '🛏 Mattress Cleaning', 'single_standard', 'Single Standard',   1500, 'price', 'each', 1),
    (NEW.id, 'mattress', '🛏 Mattress Cleaning', 'single_bulk',     'Single Bulk (2+)',  1200, 'price', 'each', 2),
    (NEW.id, 'mattress', '🛏 Mattress Cleaning', 'double_standard', 'Double Standard',   2500, 'price', 'each', 3),
    (NEW.id, 'mattress', '🛏 Mattress Cleaning', 'double_bulk',     'Double Bulk (2+)',  2000, 'price', 'each', 4),

    -- 🪟 Curtains
    (NEW.id, 'curtain', '🪟 Curtains', 'small',    'Small',    500, 'price', 'each', 1),
    (NEW.id, 'curtain', '🪟 Curtains', 'standard', 'Standard', 800, 'price', 'each', 2),
    (NEW.id, 'curtain', '🪟 Curtains', 'large',    'Large',   1200, 'price', 'each', 3),
    (NEW.id, 'curtain', '🪟 Curtains', 'blackout', 'Blackout',1500, 'price', 'each', 4),

    -- 🪣 Water Tank Cleaning
    (NEW.id, 'tank', '🪣 Water Tank Cleaning', 'band_500',  'Up to 500L',    2500, 'price', 'flat rate', 1),
    (NEW.id, 'tank', '🪣 Water Tank Cleaning', 'band_1000', '501–1,000L',    3500, 'price', 'flat rate', 2),
    (NEW.id, 'tank', '🪣 Water Tank Cleaning', 'band_2000', '1,001–2,000L',  5000, 'price', 'flat rate', 3),
    (NEW.id, 'tank', '🪣 Water Tank Cleaning', 'band_5000', '2,001–5,000L',  7000, 'price', 'flat rate', 4),

    -- 🏠 Home Cleaning — Regular
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'small_bed',     'Bedroom (Small Home)',    1200, 'price', '/room', 1),
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'small_lounge',  'Lounge (Small Home)',     1500, 'price', '/room', 2),
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'small_kitchen', 'Kitchen (Small Home)',     800, 'price', '/room', 3),
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'small_wash',    'Washroom (Small Home)',    800, 'price', '/room', 4),
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'small_garage',  'Garage (Small Home)',      800, 'price', '/room', 5),
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'small_stair',   'Staircase (Small Home)',   800, 'price', '/room', 6),
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'small_store',   'Store Room (Small Home)',  800, 'price', '/room', 7),
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'large_bed',     'Bedroom (Large Home)',    1500, 'price', '/room', 8),
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'large_lounge',  'Lounge (Large Home)',     1500, 'price', '/room', 9),
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'large_kitchen', 'Kitchen (Large Home)',    1200, 'price', '/room', 10),
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'large_wash',    'Washroom (Large Home)',   1200, 'price', '/room', 11),
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'large_garage',  'Garage (Large Home)',     1200, 'price', '/room', 12),
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'large_stair',   'Staircase (Large Home)',  1200, 'price', '/room', 13),
    (NEW.id, 'home_regular', '🏠 Home Cleaning — Regular', 'large_store',   'Store Room (Large Home)', 1200, 'price', '/room', 14),

    -- ✨ Home Cleaning — Deep
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'small_bed',     'Bedroom (Small Home)',    2000, 'price', '/room', 1),
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'small_lounge',  'Lounge (Small Home)',     2000, 'price', '/room', 2),
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'small_kitchen', 'Kitchen (Small Home)',    1500, 'price', '/room', 3),
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'small_wash',    'Washroom (Small Home)',   1500, 'price', '/room', 4),
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'small_garage',  'Garage (Small Home)',     1500, 'price', '/room', 5),
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'small_stair',   'Staircase (Small Home)',  1500, 'price', '/room', 6),
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'small_store',   'Store Room (Small Home)', 1500, 'price', '/room', 7),
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'large_bed',     'Bedroom (Large Home)',    2800, 'price', '/room', 8),
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'large_lounge',  'Lounge (Large Home)',     2800, 'price', '/room', 9),
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'large_kitchen', 'Kitchen (Large Home)',    2000, 'price', '/room', 10),
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'large_wash',    'Washroom (Large Home)',   2000, 'price', '/room', 11),
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'large_garage',  'Garage (Large Home)',     2000, 'price', '/room', 12),
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'large_stair',   'Staircase (Large Home)',  2000, 'price', '/room', 13),
    (NEW.id, 'home_deep', '✨ Home Cleaning — Deep', 'large_store',   'Store Room (Large Home)', 2000, 'price', '/room', 14)
  ON CONFLICT (company_id, category, rule_key) DO NOTHING;

  RETURN NEW;
END;
$$;

-- -------------------------------------------------------
-- 2. Attach the trigger to companies — fires once per new company row,
-- immediately after insert, in the same transaction. If this insert
-- fails, the whole company-creation transaction fails and rolls back
-- (no company can end up without pricing).
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_seed_company_pricing_defaults ON companies;

CREATE TRIGGER trg_seed_company_pricing_defaults
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION seed_company_pricing_defaults();

-- -------------------------------------------------------
-- 3. Backfill: any company created between migration 011 and this one
-- (or any company that for any reason has no pricing rows yet) gets the
-- same defaults now. Companies that already have rows are left alone —
-- ON CONFLICT DO NOTHING never overwrites an existing (and possibly
-- already-edited) value.
-- -------------------------------------------------------
INSERT INTO company_pricing_rules
  (company_id, category, category_label, rule_key, rule_label, value, value_kind, unit_note, display_order)
SELECT c.id, v.category, v.category_label, v.rule_key, v.rule_label, v.value, v.value_kind, v.unit_note, v.display_order
FROM companies c
CROSS JOIN (
  VALUES
    ('sofa', '🛋 Sofa Cleaning', 'standard_rate',   'Standard Rate (1–9 Seats)',  320::numeric, 'price',     '/seat',  1),
    ('sofa', '🛋 Sofa Cleaning', 'bulk_rate',       'Bulk Rate (10+ Seats)',      280::numeric, 'price',     '/seat',  2),
    ('sofa', '🛋 Sofa Cleaning', 'bulk_threshold',  'Bulk Starts From',            10::numeric, 'threshold', 'seats',  3),

    ('foam', '🪑 Foam Chairs', 'standard_rate',    'Standard Rate',              280::numeric, 'price',     '/chair', 1),
    ('foam', '🪑 Foam Chairs', 'bulk_rate',        'Bulk Rate',                  250::numeric, 'price',     '/chair', 2),
    ('foam', '🪑 Foam Chairs', 'bulk_threshold',   'Bulk Starts From',            10::numeric, 'threshold', 'chairs', 3),

    ('carpet', '🧼 Carpet Cleaning', 'band_0_100',    '0–100 sqft',    25::numeric, 'price', '/sqft', 1),
    ('carpet', '🧼 Carpet Cleaning', 'band_101_300',  '101–300 sqft',  23::numeric, 'price', '/sqft', 2),
    ('carpet', '🧼 Carpet Cleaning', 'band_301_500',  '301–500 sqft',  22::numeric, 'price', '/sqft', 3),
    ('carpet', '🧼 Carpet Cleaning', 'band_500_plus', '500+ sqft',     20::numeric, 'price', '/sqft', 4),

    ('mattress', '🛏 Mattress Cleaning', 'single_standard', 'Single Standard',    1500::numeric, 'price', 'each', 1),
    ('mattress', '🛏 Mattress Cleaning', 'single_bulk',     'Single Bulk (2+)',   1200::numeric, 'price', 'each', 2),
    ('mattress', '🛏 Mattress Cleaning', 'double_standard', 'Double Standard',    2500::numeric, 'price', 'each', 3),
    ('mattress', '🛏 Mattress Cleaning', 'double_bulk',     'Double Bulk (2+)',   2000::numeric, 'price', 'each', 4),

    ('curtain', '🪟 Curtains', 'small',    'Small',    500::numeric, 'price', 'each', 1),
    ('curtain', '🪟 Curtains', 'standard', 'Standard', 800::numeric, 'price', 'each', 2),
    ('curtain', '🪟 Curtains', 'large',    'Large',   1200::numeric, 'price', 'each', 3),
    ('curtain', '🪟 Curtains', 'blackout', 'Blackout',1500::numeric, 'price', 'each', 4),

    ('tank', '🪣 Water Tank Cleaning', 'band_500',  'Up to 500L',    2500::numeric, 'price', 'flat rate', 1),
    ('tank', '🪣 Water Tank Cleaning', 'band_1000', '501–1,000L',    3500::numeric, 'price', 'flat rate', 2),
    ('tank', '🪣 Water Tank Cleaning', 'band_2000', '1,001–2,000L',  5000::numeric, 'price', 'flat rate', 3),
    ('tank', '🪣 Water Tank Cleaning', 'band_5000', '2,001–5,000L',  7000::numeric, 'price', 'flat rate', 4),

    ('home_regular', '🏠 Home Cleaning — Regular', 'small_bed',     'Bedroom (Small Home)',    1200::numeric, 'price', '/room', 1),
    ('home_regular', '🏠 Home Cleaning — Regular', 'small_lounge',  'Lounge (Small Home)',     1500::numeric, 'price', '/room', 2),
    ('home_regular', '🏠 Home Cleaning — Regular', 'small_kitchen', 'Kitchen (Small Home)',     800::numeric, 'price', '/room', 3),
    ('home_regular', '🏠 Home Cleaning — Regular', 'small_wash',    'Washroom (Small Home)',    800::numeric, 'price', '/room', 4),
    ('home_regular', '🏠 Home Cleaning — Regular', 'small_garage',  'Garage (Small Home)',      800::numeric, 'price', '/room', 5),
    ('home_regular', '🏠 Home Cleaning — Regular', 'small_stair',   'Staircase (Small Home)',   800::numeric, 'price', '/room', 6),
    ('home_regular', '🏠 Home Cleaning — Regular', 'small_store',   'Store Room (Small Home)',  800::numeric, 'price', '/room', 7),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_bed',     'Bedroom (Large Home)',    1500::numeric, 'price', '/room', 8),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_lounge',  'Lounge (Large Home)',     1500::numeric, 'price', '/room', 9),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_kitchen', 'Kitchen (Large Home)',    1200::numeric, 'price', '/room', 10),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_wash',    'Washroom (Large Home)',   1200::numeric, 'price', '/room', 11),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_garage',  'Garage (Large Home)',     1200::numeric, 'price', '/room', 12),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_stair',   'Staircase (Large Home)',  1200::numeric, 'price', '/room', 13),
    ('home_regular', '🏠 Home Cleaning — Regular', 'large_store',   'Store Room (Large Home)', 1200::numeric, 'price', '/room', 14),

    ('home_deep', '✨ Home Cleaning — Deep', 'small_bed',     'Bedroom (Small Home)',    2000::numeric, 'price', '/room', 1),
    ('home_deep', '✨ Home Cleaning — Deep', 'small_lounge',  'Lounge (Small Home)',     2000::numeric, 'price', '/room', 2),
    ('home_deep', '✨ Home Cleaning — Deep', 'small_kitchen', 'Kitchen (Small Home)',    1500::numeric, 'price', '/room', 3),
    ('home_deep', '✨ Home Cleaning — Deep', 'small_wash',    'Washroom (Small Home)',   1500::numeric, 'price', '/room', 4),
    ('home_deep', '✨ Home Cleaning — Deep', 'small_garage',  'Garage (Small Home)',     1500::numeric, 'price', '/room', 5),
    ('home_deep', '✨ Home Cleaning — Deep', 'small_stair',   'Staircase (Small Home)',  1500::numeric, 'price', '/room', 6),
    ('home_deep', '✨ Home Cleaning — Deep', 'small_store',   'Store Room (Small Home)', 1500::numeric, 'price', '/room', 7),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_bed',     'Bedroom (Large Home)',    2800::numeric, 'price', '/room', 8),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_lounge',  'Lounge (Large Home)',     2800::numeric, 'price', '/room', 9),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_kitchen', 'Kitchen (Large Home)',    2000::numeric, 'price', '/room', 10),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_wash',    'Washroom (Large Home)',   2000::numeric, 'price', '/room', 11),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_garage',  'Garage (Large Home)',     2000::numeric, 'price', '/room', 12),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_stair',   'Staircase (Large Home)',  2000::numeric, 'price', '/room', 13),
    ('home_deep', '✨ Home Cleaning — Deep', 'large_store',   'Store Room (Large Home)', 2000::numeric, 'price', '/room', 14)
) AS v(category, category_label, rule_key, rule_label, value, value_kind, unit_note, display_order)
ON CONFLICT (company_id, category, rule_key) DO NOTHING;
