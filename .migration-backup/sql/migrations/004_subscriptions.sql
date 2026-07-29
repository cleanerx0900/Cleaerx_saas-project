-- ============================================================
-- Migration 004: Subscription Layer
-- Tables: subscription_plans, company_subscriptions
-- Depends on: 001_core_tenant_layer
-- ============================================================

-- -------------------------------------------------------
-- 1. subscription_plans
-- Platform-defined plans. Managed by super_admin.
-- Public read (anyone can see pricing page).
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text        NOT NULL,
  slug                     text        UNIQUE NOT NULL,
  -- Limits (NULL = unlimited)
  max_bookings_per_month   int,
  max_services             int,
  max_staff_users          int,
  -- Feature flags
  -- Shape: {theme_studio:true, analytics:true, api_access:false, whitelabel:false}
  features                 jsonb       NOT NULL DEFAULT '{}',
  -- Pricing (in USD — companies billed in their local currency at conversion)
  price_monthly            numeric(10,2),
  price_quarterly          numeric(10,2),   -- Typically 10% discount vs monthly×3
  price_yearly             numeric(10,2),   -- Typically 20% discount vs monthly×12
  currency                 text        NOT NULL DEFAULT 'USD',
  is_active                boolean     NOT NULL DEFAULT true,
  display_order            int         NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  subscription_plans                  IS 'Platform-defined SaaS plans. Readable by anyone (public pricing page).';
COMMENT ON COLUMN subscription_plans.slug             IS 'Machine-readable identifier: starter | professional | enterprise';
COMMENT ON COLUMN subscription_plans.features         IS 'JSONB feature flags checked by the application for plan-gating features';
COMMENT ON COLUMN subscription_plans.max_bookings_per_month IS 'NULL = unlimited. Application enforces this limit at booking creation time.';

-- -------------------------------------------------------
-- 2. company_subscriptions
-- One active row per company. Historical rows kept for audit.
-- status transitions:
--   pending → active → expired / cancelled / suspended → renewed → active
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_subscriptions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  plan_id           uuid        NOT NULL REFERENCES subscription_plans(id),

  status            text        NOT NULL DEFAULT 'active',
  -- 'active' | 'expired' | 'suspended' | 'cancelled' | 'renewed'

  billing_cycle     text        NOT NULL DEFAULT 'monthly',
  -- 'monthly' | 'quarterly' | 'yearly'

  -- Lifecycle timestamps
  started_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,             -- NULL = lifetime (e.g. grandfathered)
  cancelled_at      timestamptz,
  renewed_at        timestamptz,

  -- Pricing locked at subscription creation (never changes retroactively)
  amount_paid       numeric(10,2),
  currency          text        NOT NULL DEFAULT 'USD',

  -- Payment integration (Stripe / future)
  payment_reference text,                    -- Stripe PaymentIntent ID or equivalent

  notes             text,                    -- Super admin notes (e.g. "comped 3 months")
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT company_subscriptions_status_check CHECK (
    status IN ('active', 'expired', 'suspended', 'cancelled', 'renewed')
  ),
  CONSTRAINT company_subscriptions_billing_check CHECK (
    billing_cycle IN ('monthly', 'quarterly', 'yearly')
  )
);

COMMENT ON TABLE  company_subscriptions            IS 'Per-company subscription history. Multiple rows allowed — one per subscription period.';
COMMENT ON COLUMN company_subscriptions.amount_paid IS 'Price locked at signup time — never recalculated if plan prices change later.';
COMMENT ON COLUMN company_subscriptions.expires_at  IS 'NULL = lifetime subscription. Application checks this on each authenticated request.';
COMMENT ON COLUMN company_subscriptions.status      IS 'active|expired|suspended|cancelled|renewed. App gates features on active status.';

-- View: current active subscription per company (convenience)
CREATE OR REPLACE VIEW active_subscriptions AS
  SELECT DISTINCT ON (company_id)
    cs.*,
    sp.name   AS plan_name,
    sp.slug   AS plan_slug,
    sp.features
  FROM company_subscriptions cs
  JOIN subscription_plans sp ON sp.id = cs.plan_id
  WHERE cs.status = 'active'
    AND (cs.expires_at IS NULL OR cs.expires_at > now())
  ORDER BY company_id, cs.created_at DESC;

COMMENT ON VIEW active_subscriptions IS 'One row per company — their current active subscription with plan details.';
