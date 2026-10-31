-- ============================================================
-- Seed: Subscription Plans
-- Run after migration 004_subscriptions.sql
-- Safe to re-run: ON CONFLICT DO NOTHING
-- ============================================================

INSERT INTO subscription_plans (
  id,
  name,
  slug,
  max_bookings_per_month,
  max_services,
  max_staff_users,
  features,
  price_monthly,
  price_quarterly,
  price_yearly,
  currency,
  is_active,
  display_order
) VALUES

-- -------------------------------------------------------
-- Free Plan — entry-level
-- -------------------------------------------------------
(
  gen_random_uuid(),
  'Free',
  'free',
  100,     -- max 100 bookings/month
  10,      -- max 10 services
  1,       -- owner only, no staff
  '{
    "theme_studio": false,
    "analytics": false,
    "api_access": false,
    "whitelabel": false,
    "custom_domain": false,
    "priority_support": false,
    "discount_engine": false,
    "staff_invites": false
  }'::jsonb,
  0.00,    -- Free
  0.00,
  0.00,
  'USD',
  true,
  1
),

-- -------------------------------------------------------
-- Professional Plan — Core business tier
-- -------------------------------------------------------
(
  gen_random_uuid(),
  'Professional',
  'professional',
  1000,    -- max 1000 bookings/month
  50,      -- max 50 services
  5,       -- up to 5 staff users
  '{
    "theme_studio": true,
    "analytics": true,
    "api_access": false,
    "whitelabel": false,
    "custom_domain": false,
    "priority_support": false,
    "discount_engine": true,
    "staff_invites": true
  }'::jsonb,
  29.00,   -- $29/month
  78.30,   -- $26.10/month × 3 (10% discount)
  278.40,  -- $23.20/month × 12 (20% discount)
  'USD',
  true,
  2
),

-- -------------------------------------------------------
-- Enterprise Plan — Unlimited, white-label
-- -------------------------------------------------------
(
  gen_random_uuid(),
  'Enterprise',
  'enterprise',
  NULL,    -- unlimited bookings
  NULL,    -- unlimited services
  NULL,    -- unlimited staff
  '{
    "theme_studio": true,
    "analytics": true,
    "api_access": true,
    "whitelabel": true,
    "custom_domain": true,
    "priority_support": true,
    "discount_engine": true,
    "staff_invites": true
  }'::jsonb,
  99.00,   -- $99/month
  267.30,  -- $89.10/month × 3 (10% discount)
  950.40,  -- $79.20/month × 12 (20% discount)
  'USD',
  true,
  3
)

ON CONFLICT (slug) DO UPDATE SET
  name                     = EXCLUDED.name,
  max_bookings_per_month   = EXCLUDED.max_bookings_per_month,
  max_services             = EXCLUDED.max_services,
  max_staff_users          = EXCLUDED.max_staff_users,
  features                 = EXCLUDED.features,
  price_monthly            = EXCLUDED.price_monthly,
  price_quarterly          = EXCLUDED.price_quarterly,
  price_yearly             = EXCLUDED.price_yearly,
  is_active                = EXCLUDED.is_active,
  display_order            = EXCLUDED.display_order;
