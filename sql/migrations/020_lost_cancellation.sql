-- ============================================================
-- Migration 020: Lost & Cancellation Management
-- Adds structured metadata for lost and cancelled bookings.
-- Depends on: 003_bookings_layer, 019_smart_pricing
-- ============================================================

-- -------------------------------------------------------
-- 1. Lost booking metadata
-- -------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS lost_reason text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS lost_at     timestamptz;

-- Allowed lost reasons (enforced in application layer; stored as-is)
COMMENT ON COLUMN bookings.lost_reason IS 'Reason booking was marked lost. Set when status transitions to ''lost''.';
COMMENT ON COLUMN bookings.lost_at     IS 'Timestamp when booking was marked as lost.';

-- -------------------------------------------------------
-- 2. Cancellation metadata
-- -------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at         timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by         text;

-- cancelled_by must be 'customer' or 'company' (or NULL for non-cancelled bookings)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cancelled_by_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_cancelled_by_check
  CHECK (cancelled_by IN ('customer', 'company') OR cancelled_by IS NULL);

COMMENT ON COLUMN bookings.cancellation_reason IS 'Free-text reason for cancellation.';
COMMENT ON COLUMN bookings.cancelled_at        IS 'Timestamp when booking was cancelled.';
COMMENT ON COLUMN bookings.cancelled_by        IS '''customer'' = customer requested | ''company'' = company cancelled.';
