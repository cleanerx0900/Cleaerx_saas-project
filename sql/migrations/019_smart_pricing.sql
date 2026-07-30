-- ============================================================
-- Migration 019: Smart Booking & Pricing
-- Adds estimated_price, final_price, adjustment_reason, price_status
-- Extends status to include 'lost'
-- Depends on: 003_bookings_layer
-- ============================================================

-- -------------------------------------------------------
-- 1. estimated_price
-- Server-computed price at booking creation.
-- Mirrors subtotal — immutable after insert.
-- -------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS estimated_price numeric(10,2) NOT NULL DEFAULT 0;
-- Backfill from subtotal for any existing rows
UPDATE bookings SET estimated_price = subtotal WHERE estimated_price = 0;

-- -------------------------------------------------------
-- 2. final_price
-- Owner-adjusted final price. Starts equal to estimated_price.
-- Updated when company owner applies a discount/adjustment.
-- -------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS final_price numeric(10,2) NOT NULL DEFAULT 0;
-- Backfill from total_amount for any existing rows
UPDATE bookings SET final_price = total_amount WHERE final_price = 0;

-- -------------------------------------------------------
-- 3. adjustment_reason
-- Free-text reason for price adjustment (e.g. "Customer Negotiation").
-- Null when no adjustment has been made.
-- -------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS adjustment_reason text;

-- -------------------------------------------------------
-- 4. price_status
-- Tracks the price lifecycle:
--   estimated  = price is the server-computed estimate (default)
--   adjusted   = owner has applied a discount/adjustment
--   confirmed  = owner has locked in the final price
-- -------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_status text NOT NULL DEFAULT 'estimated';

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_price_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_price_status_check
  CHECK (price_status IN ('estimated', 'adjusted', 'confirmed'));

-- -------------------------------------------------------
-- 5. Extend status to include 'lost'
-- lost = booking that did not convert (customer went elsewhere, etc.)
-- -------------------------------------------------------
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'lost'));

-- -------------------------------------------------------
-- Comments
-- -------------------------------------------------------
COMMENT ON COLUMN bookings.estimated_price IS 'Server-computed price at booking creation. Immutable after insert. Mirrors subtotal.';
COMMENT ON COLUMN bookings.final_price     IS 'Owner-adjusted final price. Starts equal to estimated_price. Updated by the price-adjustment flow.';
COMMENT ON COLUMN bookings.adjustment_reason IS 'Reason for the price adjustment. Null when price_status = ''estimated''.';
COMMENT ON COLUMN bookings.price_status    IS 'Price lifecycle: estimated → adjusted → confirmed.';
