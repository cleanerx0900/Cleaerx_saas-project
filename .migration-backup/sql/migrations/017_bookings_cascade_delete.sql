-- ============================================================
-- Migration 017: Cascade-delete bookings when a company is deleted
-- Depends on: 003_bookings_layer
--
-- Fixes:
--   update or delete on table "companies" violates foreign key
--   constraint "bookings_company_id_fkey" on table "bookings"
--
-- Bookings, their line items, and their status history are historical
-- transactional records that belong entirely to a single tenant. Once
-- a super_admin deletes a company (pages/admin/companies.js ->
-- `supabase.from("companies").delete()`), that data cannot meaningfully
-- exist for any other tenant — it should be removed with the company
-- instead of blocking the deletion.
--
-- Why all three tables, not just `bookings`:
--   booking_items and booking_status_history already CASCADE via their
--   composite same-tenant FK to bookings(id, company_id) (see 003), but
--   they ALSO each carry their own direct company_id -> companies(id)
--   FK, which was RESTRICT. Firing order between two independent FK
--   triggers on the same companies-row delete is not something to rely
--   on — leaving those direct FKs as RESTRICT could still block the
--   delete (or merely relocate the same error to a different
--   constraint name) depending on trigger evaluation order. Cascading
--   all three closes that gap deterministically.
--
-- Explicitly NOT touched (other tenant relationships, out of scope):
--   subscriptions.company_id        (RESTRICT — a company with an
--                                     active subscription should not
--                                     silently lose its billing record)
--   services / service_categories / service_pricing_rules
--   staff / company_theme / company_settings / analytics tables
--   All of the above keep their existing ON DELETE behavior unchanged.
-- ============================================================

BEGIN;

-- -------------------------------------------------------
-- 1. bookings.company_id: RESTRICT -> CASCADE
-- -------------------------------------------------------
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_company_id_fkey;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

COMMENT ON COLUMN bookings.company_id IS
  'CASCADE delete — deleting a company removes all of its bookings. (Changed from RESTRICT in migration 017.)';

-- -------------------------------------------------------
-- 2. booking_items.company_id: RESTRICT -> CASCADE
-- -------------------------------------------------------
ALTER TABLE booking_items
  DROP CONSTRAINT IF EXISTS booking_items_company_id_fkey;

ALTER TABLE booking_items
  ADD CONSTRAINT booking_items_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

COMMENT ON COLUMN booking_items.company_id IS
  'CASCADE delete — follows bookings.company_id; removed when the company (and its bookings) are deleted. (Changed from RESTRICT in migration 017.)';

-- -------------------------------------------------------
-- 3. booking_status_history.company_id: RESTRICT -> CASCADE
-- -------------------------------------------------------
ALTER TABLE booking_status_history
  DROP CONSTRAINT IF EXISTS booking_status_history_company_id_fkey;

ALTER TABLE booking_status_history
  ADD CONSTRAINT booking_status_history_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

COMMENT ON COLUMN booking_status_history.company_id IS
  'CASCADE delete — follows bookings.company_id; removed when the company (and its bookings) are deleted. (Changed from RESTRICT in migration 017.)';

COMMIT;

-- ============================================================
-- Verification queries (run manually, not part of the migration)
-- ============================================================
--
-- 1. Confirm the new cascade rules are in place:
--
--   SELECT conrelid::regclass AS table_name, conname, confdeltype
--   FROM pg_constraint
--   WHERE conname IN (
--     'bookings_company_id_fkey',
--     'booking_items_company_id_fkey',
--     'booking_status_history_company_id_fkey'
--   );
--   -- confdeltype should be 'c' (cascade) for all three rows.
--
-- 2. Pick a disposable test company with bookings, note counts, delete it,
--    then confirm bookings/items/history for that company are gone AND
--    every other company's bookings/items/history counts are unchanged:
--
--   SELECT company_id, count(*) FROM bookings GROUP BY company_id;
--   DELETE FROM companies WHERE id = '<test-company-id>';
--   SELECT count(*) FROM bookings WHERE company_id = '<test-company-id>'; -- expect 0
--   SELECT company_id, count(*) FROM bookings GROUP BY company_id;        -- other rows unchanged
