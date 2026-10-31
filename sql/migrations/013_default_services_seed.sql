-- ============================================================
-- Migration 013: Seed default services + service_pricing for every company
-- Depends on: 001_core_tenant_layer, 002_services_layer
-- Safe to re-run: UNIQUE constraint + ON CONFLICT DO NOTHING
-- ============================================================
-- Purpose:
--   Establishes the unified single source of truth for the CleanerX
--   booking system. The services + service_pricing tables (002_services_layer)
--   are the canonical data source for:
--     • /company/[slug]/book  (customer booking form)
--     • Dashboard → Services  (visibility toggles)
--     • Dashboard → Pricing   (price editing)
--
--   This migration seeds the same 8 service categories that were
--   previously only available via company_pricing_rules (migrations 011/012),
--   mapping each category into one or more service rows with a matching
--   service_pricing row using the pricing_type engine already supported by
--   the booking form (flat | tiered).
--
--   company_pricing_rules is left intact — nothing is dropped until the legacy
--   booking form (book-service.js) is removed in a later step.
-- ============================================================

-- -------------------------------------------------------
-- 0. Schema hardening: add a deterministic uniqueness key to
--    services(company_id, name) so the seed function can use
--    ON CONFLICT instead of WHERE NOT EXISTS (which is not
--    race-safe without the constraint). IF NOT EXISTS guard
--    makes this idempotent.
-- -------------------------------------------------------
ALTER TABLE services
  ADD CONSTRAINT IF NOT EXISTS uq_services_company_name
  UNIQUE (company_id, name);

-- -------------------------------------------------------
-- 1. Core seed function: seeds one company's default services + pricing.
--    Called by the trigger (new companies) and the backfill block below
--    (all existing companies).
--
--    Security notes:
--    • SECURITY DEFINER is required so RLS does not block the insert
--      (anon/authenticated have no INSERT on services/service_pricing).
--    • EXECUTE is immediately revoked from all non-owner roles below,
--      so this function cannot be called via Supabase RPC by any tenant.
--      It is only reachable from: (a) the trigger, which runs as the DB
--      owner, and (b) the migration DO block, which runs as the migration
--      executor.
--    • The trigger wrapper (_trg_seed_company_default_services) receives
--      the same REVOKE treatment.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_company_default_services(p_company_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;

  -- Helper macro: insert one service + its pricing row.
  -- Uses ON CONFLICT (company_id, name) DO NOTHING for idempotency.
BEGIN

  -- ── Sofa Cleaning ─────────────────────────────────────
  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Sofa Cleaning', 'item', true, 10)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Sofa Cleaning';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'tiered', 320, 'PKR',
    '[{"min_qty":1,"max_qty":9,"price":320},{"min_qty":10,"price":280}]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Foam Chair Cleaning ───────────────────────────────
  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Foam Chair Cleaning', 'item', true, 20)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Foam Chair Cleaning';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'tiered', 280, 'PKR',
    '[{"min_qty":1,"max_qty":9,"price":280},{"min_qty":10,"price":250}]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Carpet Cleaning ───────────────────────────────────
  -- unit=sqft: the qty input on the booking form = total sqft.
  -- Tiered bands match lib/pricing.js carpetRate bands.
  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Carpet Cleaning', 'sqft', true, 30)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Carpet Cleaning';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'tiered', 25, 'PKR',
    '[{"min_qty":0,"max_qty":100,"price":25},{"min_qty":101,"max_qty":300,"price":23},{"min_qty":301,"max_qty":500,"price":22},{"min_qty":501,"price":20}]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Mattress – Single ─────────────────────────────────
  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Mattress – Single', 'item', true, 40)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Mattress – Single';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'tiered', 1500, 'PKR',
    '[{"min_qty":1,"max_qty":1,"price":1500},{"min_qty":2,"price":1200}]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Mattress – Double ─────────────────────────────────
  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Mattress – Double', 'item', true, 41)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Mattress – Double';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'tiered', 2500, 'PKR',
    '[{"min_qty":1,"max_qty":1,"price":2500},{"min_qty":2,"price":2000}]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Curtain – Small ───────────────────────────────────
  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Curtain – Small', 'item', true, 50)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Curtain – Small';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 500, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Curtain – Standard ────────────────────────────────
  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Curtain – Standard', 'item', true, 51)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Curtain – Standard';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 800, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Curtain – Large ───────────────────────────────────
  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Curtain – Large', 'item', true, 52)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Curtain – Large';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 1200, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Curtain – Blackout ────────────────────────────────
  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Curtain – Blackout', 'item', true, 53)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Curtain – Blackout';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 1500, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Water Tank – Up to 500L ───────────────────────────
  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Water Tank – Up to 500L', 'item', true, 60)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Water Tank – Up to 500L';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 2500, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Water Tank – 501–1,000L ───────────────────────────
  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Water Tank – 501–1,000L', 'item', true, 61)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Water Tank – 501–1,000L';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 3500, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Water Tank – 1,001–2,000L ─────────────────────────
  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Water Tank – 1,001–2,000L', 'item', true, 62)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Water Tank – 1,001–2,000L';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 5000, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Water Tank – 2,001–5,000L ─────────────────────────
  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Water Tank – 2,001–5,000L', 'item', true, 63)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Water Tank – 2,001–5,000L';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 7000, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Home Cleaning (Regular) – room types ──────────────
  -- unit=room. QtyControl on booking form = number of rooms.
  -- Uses small-home base rates. Larger-home pricing can be configured
  -- per-company via the Pricing page after seeding.

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Regular) – Bedroom', 'room', true, 71)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Regular) – Bedroom';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 1200, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Regular) – Lounge', 'room', true, 72)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Regular) – Lounge';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 1500, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Regular) – Kitchen', 'room', true, 73)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Regular) – Kitchen';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 800, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Regular) – Washroom', 'room', true, 74)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Regular) – Washroom';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 800, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Regular) – Garage', 'room', true, 75)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Regular) – Garage';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 800, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Regular) – Staircase', 'room', true, 76)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Regular) – Staircase';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 800, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Regular) – Store Room', 'room', true, 77)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Regular) – Store Room';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 800, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  -- ── Home Cleaning (Deep) – room types ─────────────────

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Deep) – Bedroom', 'room', true, 81)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Deep) – Bedroom';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 2000, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Deep) – Lounge', 'room', true, 82)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Deep) – Lounge';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 2000, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Deep) – Kitchen', 'room', true, 83)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Deep) – Kitchen';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 1500, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Deep) – Washroom', 'room', true, 84)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Deep) – Washroom';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 1500, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Deep) – Garage', 'room', true, 85)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Deep) – Garage';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 1500, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Deep) – Staircase', 'room', true, 86)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Deep) – Staircase';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 1500, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

  INSERT INTO services (company_id, name, unit, is_active, display_order)
  VALUES (p_company_id, 'Home Cleaning (Deep) – Store Room', 'room', true, 87)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_id FROM services WHERE company_id = p_company_id AND name = 'Home Cleaning (Deep) – Store Room';
  INSERT INTO service_pricing (service_id, company_id, pricing_type, base_price, currency, tiers)
  VALUES (v_id, p_company_id, 'flat', 1500, 'PKR', '[]'::jsonb)
  ON CONFLICT (service_id) DO NOTHING;

END;
$$;

-- -------------------------------------------------------
-- 2. Lock down the seed function.
--    It MUST NOT be callable via Supabase RPC by any tenant
--    (that would allow cross-tenant writes despite RLS).
--    Only the DB trigger mechanism (which runs as the owner,
--    not as an authenticated/anon role) may invoke it.
-- -------------------------------------------------------
REVOKE ALL ON FUNCTION seed_company_default_services(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION seed_company_default_services(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION seed_company_default_services(UUID) FROM authenticated;

-- -------------------------------------------------------
-- 3. Trigger wrapper: fires on every new company row.
--    Intentionally thin — all logic lives in the seed function.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION _trg_seed_company_default_services()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM seed_company_default_services(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION _trg_seed_company_default_services() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION _trg_seed_company_default_services() FROM anon;
REVOKE EXECUTE ON FUNCTION _trg_seed_company_default_services() FROM authenticated;

DROP TRIGGER IF EXISTS trg_seed_company_default_services ON companies;

CREATE TRIGGER trg_seed_company_default_services
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION _trg_seed_company_default_services();

-- -------------------------------------------------------
-- 4. Backfill: call the seed function for ALL existing
--    companies, not only zero-service ones. The ON CONFLICT
--    guards inside the function make this safe to run
--    against companies that were partially seeded — only the
--    missing rows are inserted.
-- -------------------------------------------------------
DO $$
DECLARE
  comp RECORD;
BEGIN
  FOR comp IN SELECT id FROM companies LOOP
    PERFORM seed_company_default_services(comp.id);
  END LOOP;
END;
$$;
