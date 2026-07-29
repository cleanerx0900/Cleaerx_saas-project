-- ============================================================
-- Migration 006: Analytics Layer
-- Tables: analytics_daily
-- Trigger: auto-upsert analytics_daily on booking changes
-- Depends on: 001_core_tenant_layer, 002_services_layer, 003_bookings_layer
-- ============================================================

-- -------------------------------------------------------
-- 1. analytics_daily
-- Pre-aggregated daily metrics per company.
-- Written by database trigger — never by application code directly.
-- UNIQUE(company_id, date): one row per company per day, upserted.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_daily (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date                date        NOT NULL,

  -- Booking volume
  total_bookings      int         NOT NULL DEFAULT 0,
  confirmed_bookings  int         NOT NULL DEFAULT 0,
  cancelled_bookings  int         NOT NULL DEFAULT 0,
  completed_bookings  int         NOT NULL DEFAULT 0,

  -- Revenue (sum of total_amount on completed bookings only)
  total_revenue       numeric(12,2) NOT NULL DEFAULT 0,

  -- Top service (denormalized to avoid join on every analytics read)
  top_service_id      uuid        REFERENCES services(id) ON DELETE SET NULL,
  top_service_name    text,       -- snapshot in case service is later deleted

  -- Derived metric: confirmed / total * 100
  conversion_rate     numeric(5,2),

  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT analytics_daily_unique_company_date UNIQUE (company_id, date)
);

COMMENT ON TABLE  analytics_daily               IS 'Pre-aggregated daily metrics per company. Written by trigger — do not INSERT manually.';
COMMENT ON COLUMN analytics_daily.total_revenue IS 'Sum of total_amount only on completed bookings (status = completed).';
COMMENT ON COLUMN analytics_daily.top_service_id IS 'Service with the most booking_items on this date. SET NULL on service delete.';
COMMENT ON COLUMN analytics_daily.conversion_rate IS 'confirmed_bookings / total_bookings * 100. NULL if total_bookings = 0.';

-- -------------------------------------------------------
-- 2. Helper: recompute and upsert one (company_id, date) bucket
-- Called by the main trigger for both OLD and NEW buckets.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION recompute_analytics_bucket(
  p_company_id uuid,
  p_date       date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_top_service_id   uuid;
  v_top_service_name text;
BEGIN
  -- Find the top service for this company on this date
  SELECT bi.service_id, bi.service_name
  INTO v_top_service_id, v_top_service_name
  FROM booking_items bi
  JOIN bookings b ON b.id = bi.booking_id
  WHERE b.company_id  = p_company_id
    AND b.booking_date = p_date
    AND bi.service_id IS NOT NULL
  GROUP BY bi.service_id, bi.service_name
  ORDER BY SUM(bi.quantity) DESC
  LIMIT 1;

  -- Upsert the daily aggregate row
  INSERT INTO analytics_daily (
    company_id,
    date,
    total_bookings,
    confirmed_bookings,
    cancelled_bookings,
    completed_bookings,
    total_revenue,
    top_service_id,
    top_service_name,
    conversion_rate
  )
  SELECT
    p_company_id,
    p_date,
    COUNT(*)                                                          AS total_bookings,
    COUNT(*) FILTER (WHERE status = 'confirmed')                      AS confirmed_bookings,
    COUNT(*) FILTER (WHERE status = 'cancelled')                      AS cancelled_bookings,
    COUNT(*) FILTER (WHERE status = 'completed')                      AS completed_bookings,
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'completed'), 0) AS total_revenue,
    v_top_service_id,
    v_top_service_name,
    CASE
      WHEN COUNT(*) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE status = 'confirmed')::numeric / COUNT(*) * 100,
        2
      )
      ELSE NULL
    END AS conversion_rate
  FROM bookings
  WHERE company_id  = p_company_id
    AND booking_date = p_date
  ON CONFLICT (company_id, date) DO UPDATE SET
    total_bookings      = EXCLUDED.total_bookings,
    confirmed_bookings  = EXCLUDED.confirmed_bookings,
    cancelled_bookings  = EXCLUDED.cancelled_bookings,
    completed_bookings  = EXCLUDED.completed_bookings,
    total_revenue       = EXCLUDED.total_revenue,
    top_service_id      = EXCLUDED.top_service_id,
    top_service_name    = EXCLUDED.top_service_name,
    conversion_rate     = EXCLUDED.conversion_rate,
    updated_at          = now();
END;
$$;

-- -------------------------------------------------------
-- 3. Trigger function: update analytics on booking change
-- Handles INSERT, UPDATE (including date/company changes), and DELETE.
-- On date or company_id change: recomputes BOTH the old bucket
-- and the new bucket so neither goes stale.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION update_analytics_daily()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM recompute_analytics_bucket(NEW.company_id, NEW.booking_date);

  ELSIF TG_OP = 'UPDATE' THEN
    -- If the booking moved to a different date or company,
    -- the old bucket must also be recomputed (it loses a booking).
    IF OLD.booking_date != NEW.booking_date OR OLD.company_id != NEW.company_id THEN
      PERFORM recompute_analytics_bucket(OLD.company_id, OLD.booking_date);
    END IF;
    PERFORM recompute_analytics_bucket(NEW.company_id, NEW.booking_date);

  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recompute_analytics_bucket(OLD.company_id, OLD.booking_date);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach the trigger to bookings
DROP TRIGGER IF EXISTS trg_analytics_daily_on_booking ON bookings;
CREATE TRIGGER trg_analytics_daily_on_booking
  AFTER INSERT OR UPDATE OF status, total_amount, booking_date, company_id OR DELETE
  ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_analytics_daily();

COMMENT ON FUNCTION recompute_analytics_bucket IS 'Recomputes one (company_id, date) analytics bucket via full aggregate — called by trigger and backfill scripts.';
COMMENT ON FUNCTION update_analytics_daily IS 'Trigger on bookings — recomputes OLD bucket (if date/company changed) and NEW bucket.';
