-- ============================================================
-- Migration 020 (apply): Lost & Cancellation columns
-- Run this in Supabase Dashboard → SQL Editor if the
-- "Mark as Lost" / "Cancel Booking" actions return a
-- database schema error (PGRST204 / column not found).
--
-- Safe to run multiple times (IF NOT EXISTS guards).
-- ============================================================

-- 1. Lost booking metadata
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS lost_reason text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS lost_at     timestamptz;

-- 2. Cancellation metadata
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at         timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by         text;

-- 3. Check constraint (drop first so re-runs don't error)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cancelled_by_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_cancelled_by_check
  CHECK (cancelled_by IN ('customer', 'company') OR cancelled_by IS NULL);

-- 4. Verify columns were created
SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_name = 'bookings'
  AND  column_name IN (
         'lost_reason', 'lost_at',
         'cancellation_reason', 'cancelled_at', 'cancelled_by'
       )
ORDER  BY column_name;
