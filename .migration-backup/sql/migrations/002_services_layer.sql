-- ============================================================
-- Migration 002: Services Layer
-- Tables: service_categories, services, service_pricing,
--         service_discounts
-- Depends on: 001_core_tenant_layer (companies)
-- ============================================================

-- -------------------------------------------------------
-- 1. service_categories
-- Per-company groupings (e.g. "Sofa Cleaning", "Room Cleaning")
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_categories (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text    NOT NULL,
  icon          text,                   -- emoji or icon name shown on booking form
  display_order int     NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  service_categories              IS 'Per-company service categories used to group services on the booking form';
COMMENT ON COLUMN service_categories.icon         IS 'Emoji or Heroicons name, e.g. "🛋️" or "sparkles"';
COMMENT ON COLUMN service_categories.display_order IS 'Controls rendering order on the booking form (ascending)';

-- -------------------------------------------------------
-- 2. services
-- Individual services per company.
-- Composite UNIQUE on (id, company_id) enables cross-tenant
-- integrity checks in dependent tables without a join.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id   uuid    REFERENCES service_categories(id) ON DELETE SET NULL,
  name          text    NOT NULL,
  description   text,
  unit          text    NOT NULL DEFAULT 'item',
  -- Valid units: 'item' | 'sqft' | 'room' | 'hour'
  is_active     boolean NOT NULL DEFAULT true,
  display_order int     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT services_unit_check CHECK (
    unit IN ('item', 'sqft', 'room', 'hour')
  ),

  -- Composite unique required so service_pricing can declare a
  -- composite FK (service_id, company_id) enforcing same-tenant integrity.
  CONSTRAINT services_id_company_unique UNIQUE (id, company_id)
);

COMMENT ON TABLE  services      IS 'Per-company services. Each service belongs to a category and has a pricing record.';
COMMENT ON COLUMN services.unit IS 'Determines how quantity is measured and how service_pricing.tiers/variants are interpreted';

-- Enforce that a category referenced by a service belongs to the same company.
-- Done via FK on (category_id, company_id) → service_categories(id, company_id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_categories_id_company_unique'
  ) THEN
    ALTER TABLE service_categories
      ADD CONSTRAINT service_categories_id_company_unique
        UNIQUE (id, company_id);
  END IF;
END;
$$;

-- Now the compound FK on services can reference it:
ALTER TABLE services
  DROP CONSTRAINT IF EXISTS fk_services_category_same_tenant;
ALTER TABLE services
  ADD CONSTRAINT fk_services_category_same_tenant
    FOREIGN KEY (category_id, company_id)
    REFERENCES service_categories(id, company_id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

-- -------------------------------------------------------
-- 3. service_pricing
-- Flexible pricing engine per service. Replaces hardcoded lib/pricing.js.
-- One-to-one with services (UNIQUE on service_id).
-- Composite FK (service_id, company_id) enforces same-tenant integrity:
-- you cannot attach Company A's pricing to Company B's service.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_pricing (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id   uuid        UNIQUE NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  company_id   uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Composite FK ensuring this pricing row's company matches the service's company
  CONSTRAINT fk_service_pricing_same_tenant
    FOREIGN KEY (service_id, company_id)
    REFERENCES services(id, company_id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,

  -- Pricing type determines which fields are used
  pricing_type text        NOT NULL DEFAULT 'flat',
  -- 'flat'     → use base_price only
  -- 'tiered'   → use tiers jsonb array (quantity breakpoints)
  -- 'per_unit' → base_price × quantity (e.g. sqft)
  -- 'variant'  → use variants jsonb object (named sizes/types)

  base_price   numeric(10,2) NOT NULL DEFAULT 0,          -- Fallback / single-tier price
  currency     text          NOT NULL DEFAULT 'PKR',

  -- Tiered pricing — quantity breakpoints with per-unit price
  -- Example (sofas): [{min_qty:1,max_qty:9,price:320},{min_qty:10,price:280}]
  tiers        jsonb         NOT NULL DEFAULT '[]',

  -- Named variant pricing (room types, sofa types, sqft bands)
  -- Example (rooms): {regular:{small:{bed:1200,lounge:1500},large:{bed:1500}},
  --                   deep:{small:{bed:2000},large:{bed:2800}}}
  variants     jsonb         NOT NULL DEFAULT '{}',

  is_active    boolean       NOT NULL DEFAULT true,
  updated_at   timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT service_pricing_type_check CHECK (
    pricing_type IN ('flat', 'tiered', 'per_unit', 'variant')
  )
);

COMMENT ON TABLE  service_pricing              IS 'Configurable pricing per service — replaces hardcoded pricing.js';
COMMENT ON COLUMN service_pricing.pricing_type IS 'flat|tiered|per_unit|variant — determines which fields the app reads';
COMMENT ON COLUMN service_pricing.tiers        IS 'Array of {min_qty, max_qty?, price} for quantity-based breakpoints';
COMMENT ON COLUMN service_pricing.variants     IS 'Nested object of named price points (room sizes, sofa types, sqft bands, etc.)';

-- -------------------------------------------------------
-- 4. service_discounts
-- Promotional discount rules per company.
-- Can be scoped to one service (service_id set) or all services (NULL).
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_discounts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_id        uuid        REFERENCES services(id) ON DELETE CASCADE, -- NULL = all services
  name              text        NOT NULL,
  type              text        NOT NULL,   -- 'percentage' | 'fixed'
  value             numeric(10,2) NOT NULL,  -- % (0-100) or PKR amount
  min_order_amount  numeric(10,2),           -- Minimum cart subtotal to qualify
  min_quantity      int,                     -- Minimum item quantity to qualify
  valid_from        timestamptz,             -- NULL = immediate
  valid_until       timestamptz,             -- NULL = no expiry
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT service_discounts_type_check CHECK (
    type IN ('percentage', 'fixed')
  ),
  CONSTRAINT service_discounts_percentage_range CHECK (
    type != 'percentage' OR (value >= 0 AND value <= 100)
  )
);

COMMENT ON TABLE  service_discounts            IS 'Per-company discount rules. service_id NULL = applies to entire cart.';
COMMENT ON COLUMN service_discounts.value      IS 'For percentage: 0-100. For fixed: currency amount subtracted from total.';
COMMENT ON COLUMN service_discounts.valid_until IS 'NULL means the discount never expires unless manually deactivated.';
