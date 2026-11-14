-- ============================================================
-- Migration 022: Default Subscription Plan
-- Inserts the Monthly Subscription plan.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- ============================================================

INSERT INTO subscription_plans (
  name,
  slug,
  price_monthly,
  currency,
  features,
  is_active,
  display_order
)
VALUES (
  'Monthly Subscription',
  'monthly-subscription',
  2000,
  'PKR',
  '{}',
  true,
  1
)
ON CONFLICT (slug) DO NOTHING;
