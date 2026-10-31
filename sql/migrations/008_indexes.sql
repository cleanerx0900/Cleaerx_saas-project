-- ============================================================
-- Migration 008: Performance Indexes
-- Depends on: All table migrations (001–006)
-- Safe to re-run: all use IF NOT EXISTS / CREATE INDEX CONCURRENTLY
-- ============================================================
-- IMPORTANT: In Supabase SQL Editor, CONCURRENTLY is not supported.
-- Remove CONCURRENTLY keyword if running in Supabase dashboard.
-- Use CONCURRENTLY only when running via psql against a live DB.
-- ============================================================

-- -------------------------------------------------------
-- TIER 1: Critical — Required for RLS correctness at any scale
-- Every query filtered by company_id needs these.
-- -------------------------------------------------------

-- Company slug lookup (already covered by UNIQUE constraint)
-- companies(slug) — B-tree index auto-created by UNIQUE

-- Tenant lookup on every dashboard query
CREATE INDEX IF NOT EXISTS idx_services_company
  ON services(company_id);

CREATE INDEX IF NOT EXISTS idx_service_categories_company
  ON service_categories(company_id);

CREATE INDEX IF NOT EXISTS idx_service_pricing_company
  ON service_pricing(company_id);

CREATE INDEX IF NOT EXISTS idx_service_discounts_company
  ON service_discounts(company_id);

CREATE INDEX IF NOT EXISTS idx_bookings_company
  ON bookings(company_id);

CREATE INDEX IF NOT EXISTS idx_booking_items_booking
  ON booking_items(booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_items_company
  ON booking_items(company_id);

CREATE INDEX IF NOT EXISTS idx_booking_status_booking
  ON booking_status_history(booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_status_company
  ON booking_status_history(company_id);

CREATE INDEX IF NOT EXISTS idx_user_invites_company
  ON user_invites(company_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_company
  ON company_subscriptions(company_id);

CREATE INDEX IF NOT EXISTS idx_analytics_company
  ON analytics_daily(company_id);

CREATE INDEX IF NOT EXISTS idx_users_company
  ON users(company_id);

-- -------------------------------------------------------
-- TIER 2: Performance — Required at 1,000+ companies
-- -------------------------------------------------------

-- Booking dashboard: filter by status
-- Most common dashboard query: "show me all pending bookings"
CREATE INDEX IF NOT EXISTS idx_bookings_company_status
  ON bookings(company_id, status);

-- Booking dashboard: filter by date range (newest first)
CREATE INDEX IF NOT EXISTS idx_bookings_company_date
  ON bookings(company_id, booking_date DESC);

-- Combined: status + date for filtered date-range queries
CREATE INDEX IF NOT EXISTS idx_bookings_company_status_date
  ON bookings(company_id, status, booking_date DESC);

-- CRM: customer lookup by phone (search across all bookings for a number)
CREATE INDEX IF NOT EXISTS idx_bookings_customer_phone
  ON bookings(customer_phone);

-- Active subscription check (runs on every authenticated dashboard request)
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_status
  ON company_subscriptions(company_id, status);

-- Analytics: time-series queries (newest first)
CREATE INDEX IF NOT EXISTS idx_analytics_company_date
  ON analytics_daily(company_id, date DESC);

-- Service pricing lookup by service (JOIN from services → service_pricing)
CREATE INDEX IF NOT EXISTS idx_service_pricing_service
  ON service_pricing(service_id);

-- Booking items service lookup (for analytics aggregation)
CREATE INDEX IF NOT EXISTS idx_booking_items_service
  ON booking_items(service_id);

-- User email lookup (login, invite acceptance)
-- Already covered by UNIQUE constraint: users(email)

-- -------------------------------------------------------
-- TIER 3: Partial Indexes — Efficient filters on large tables
-- Only index rows that match the WHERE clause.
-- Dramatically smaller index size vs full table.
-- -------------------------------------------------------

-- Active pending/confirmed bookings only (most common dashboard view)
CREATE INDEX IF NOT EXISTS idx_bookings_active
  ON bookings(company_id, booking_date DESC)
  WHERE status NOT IN ('completed', 'cancelled');

-- Active services only (booking form query)
CREATE INDEX IF NOT EXISTS idx_services_active_ordered
  ON services(company_id, display_order ASC)
  WHERE is_active = true;

-- Active categories only (booking form query)
CREATE INDEX IF NOT EXISTS idx_categories_active_ordered
  ON service_categories(company_id, display_order ASC)
  WHERE is_active = true;

-- Active discounts within validity window (applied at checkout)
CREATE INDEX IF NOT EXISTS idx_discounts_active
  ON service_discounts(company_id)
  WHERE is_active = true;

-- Active company subscriptions (plan feature check)
CREATE INDEX IF NOT EXISTS idx_subscriptions_active
  ON company_subscriptions(company_id)
  WHERE status = 'active';

-- -------------------------------------------------------
-- TIER 4: Future/Scale — Add when query volume demands it
-- -------------------------------------------------------

-- Future: Full-text search on customer names across bookings
-- CREATE INDEX idx_bookings_customer_name_fts
--   ON bookings USING gin(to_tsvector('english', customer_name));

-- Future: BRIN index on bookings.created_at for time-series scans
-- (BRIN is extremely compact for append-only timestamp columns)
-- CREATE INDEX idx_bookings_created_brin
--   ON bookings USING brin(created_at);

-- Future: Partition bookings by company_id at 50k+ companies
-- PARTITION BY HASH (company_id) — requires table recreation
