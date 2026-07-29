-- ============================================================
-- Migration 018: Fix analytics_daily FK violation on company deletion
-- Depends on: 006_analytics, 017_bookings_cascade_delete
--
-- Fixes:
--   insert or update on table "analytics_daily" violates foreign key
--   constraint "analytics_daily_company_id_fkey"
--
-- Root cause:
--   analytics_daily.company_id already has ON DELETE CASCADE (set in
--   006_analytics.sql) — cleaning up EXISTING analytics_daily rows
--   when a company is deleted was never the broken part.
--
--   The failure happens mid-transaction, inside the delete cascade
--   itself: deleting a company cascades to bookings (see 017), and the
--   AFTER DELETE trigger trg_analytics_daily_on_booking fires for
--   every deleted booking row, calling
--   recompute_analytics_bucket(OLD.company_id, OLD.booking_date).
--   That function unconditionally re-INSERTs (upserts) a fresh
--   analytics_daily row for that company_id. By the time the cascade
--   reaches bookings, the parent companies row is already gone, so
--   this INSERT itself violates analytics_daily_company_id_fkey —
--   which is why the error reads "insert or update on table
--   analytics_daily", not the delete/restrict-style error you'd see
--   from a plain missing CASCADE.
--
-- Fix:
--   Make recompute_analytics_bucket() a no-op when the target company
--   no longer exists, instead of attempting the upsert. This only
--   guards the write path: the aggregate math (revenue, conversion
--   rate, top service, etc.) is byte-for-byte unchanged, and no RLS /
--   tenant-isolation policy is touched.
--
--   Also re-asserts ON DELETE CASCADE on analytics_daily.company_id
--   (idempotent — matches 006_analytics.sql) so existing analytics
--   rows for a deleted company are still cleaned up, in case the live
--   database ever drifted from that original definition.
--
-- Explicitly NOT touched (out of scope):
--   Aggregate calculation logic inside recompute_analytics_bucket
--   (top service lookup, revenue sum, conversion rate formula).
--   RLS policies on analytics_daily (007_rls_policies.sql) and all
--   other tenant-isolation rules.
-- ============================================================

BEGIN;

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
  -- Guard: if the company has already been deleted (or is being
  -- deleted in the same cascading transaction), there is no valid
  -- parent row left to attach this bucket to — skip instead of
  -- violating analytics_daily_company_id_fkey. Any pre-existing rows
  -- for this company are handled separately by the table's own
  -- ON DELETE CASCADE.
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_company_id) THEN
    RETURN;
  END IF;

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

  -- Upsert the daily aggregate row (unchanged from 006_analytics.sql)
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

-- Re-assert the CASCADE on analytics_daily.company_id (idempotent;
-- matches 006_analytics.sql's original definition).
ALTER TABLE analytics_daily
  DROP CONSTRAINT IF EXISTS analytics_daily_company_id_fkey;

ALTER TABLE analytics_daily
  ADD CONSTRAINT analytics_daily_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

COMMENT ON COLUMN analytics_daily.company_id IS
  'CASCADE delete — existing analytics rows are removed when the company is deleted. Write path is also guarded in recompute_analytics_bucket() against the deletion race that caused "insert or update on table analytics_daily violates foreign key constraint" during company deletion. (Migration 018.)';

COMMIT;

-- ============================================================
-- Verification queries (run manually, not part of the migration)
-- ============================================================
--
-- 1. Confirm the CASCADE rule is in place:
--
--   SELECT conrelid::regclass AS table_name, conname, confdeltype
--   FROM pg_constraint
--   WHERE conname = 'analytics_daily_company_id_fkey';
--   -- confdeltype should be 'c' (cascade)
--
-- 2. Pick a disposable test company with bookings (so analytics_daily
--    has rows and the on-delete trigger fires), delete it, and confirm
--    it no longer raises analytics_daily_company_id_fkey:
--
--   SELECT company_id, count(*) FROM analytics_daily GROUP BY company_id;
--   DELETE FROM companies WHERE id = '<test-company-id>';
--   -- expect: no error, and the company's own analytics_daily rows are gone
--   SELECT count(*) FROM analytics_daily WHERE company_id = '<test-company-id>'; -- expect 0
--   SELECT company_id, count(*) FROM analytics_daily GROUP BY company_id;        -- other rows unchanged
