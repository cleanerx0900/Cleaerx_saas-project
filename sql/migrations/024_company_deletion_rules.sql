-- ============================================================
-- Migration 024: Safe company deletion rules
-- Depends on: 001, 002, 003, 004, 005, 006, 011, 014, 017, 018, 021
--
-- Deletion policy:
--   - Active company + current active subscription: blocked.
--   - Suspended company OR no current active subscription: allowed.
--
-- Authentication users are not deleted. Their company_id is detached by
-- the existing users.company_id ON DELETE SET NULL relationship.
-- ============================================================

BEGIN;

-- Company subscriptions are company-owned history. The API performs the
-- business-rule check before deletion; this FK must not block an allowed
-- company removal.
ALTER TABLE company_subscriptions
  DROP CONSTRAINT IF EXISTS company_subscriptions_company_id_fkey;

ALTER TABLE company_subscriptions
  ADD CONSTRAINT company_subscriptions_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- Re-assert the booking child cascades so direct company deletion cannot
-- leave tenant-owned transactional records behind or fail on old schemas.
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_company_id_fkey;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE booking_items
  DROP CONSTRAINT IF EXISTS booking_items_company_id_fkey;
ALTER TABLE booking_items
  ADD CONSTRAINT booking_items_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE booking_status_history
  DROP CONSTRAINT IF EXISTS booking_status_history_company_id_fkey;
ALTER TABLE booking_status_history
  ADD CONSTRAINT booking_status_history_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- Atomic cleanup used by the authenticated Super Admin API route.
-- The function is executable only by Supabase's service role; the API route
-- performs the user/session/role check before calling it and repeats the
-- deletion guard here to protect against stale UI state or races.
CREATE OR REPLACE FUNCTION admin_delete_company(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_name text;
  v_is_active boolean;
  v_deleted jsonb;
BEGIN
  SELECT name, is_active
    INTO v_company_name, v_is_active
  FROM companies
  WHERE id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPANY_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_is_active AND EXISTS (
    SELECT 1
    FROM company_subscriptions
    WHERE company_id = p_company_id
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RAISE EXCEPTION 'ACTIVE_COMPANY_ACTIVE_SUBSCRIPTION'
      USING ERRCODE = 'P0001';
  END IF;

  -- Delete direct company-owned records explicitly. This keeps the cleanup
  -- readable and resilient even when a child FK has not yet been migrated.
  DELETE FROM invoices WHERE company_id = p_company_id;
  DELETE FROM booking_status_history WHERE company_id = p_company_id;
  DELETE FROM booking_items WHERE company_id = p_company_id;
  DELETE FROM bookings WHERE company_id = p_company_id;
  DELETE FROM analytics_daily WHERE company_id = p_company_id;

  DELETE FROM service_discounts WHERE company_id = p_company_id;
  DELETE FROM service_pricing WHERE company_id = p_company_id;
  DELETE FROM services WHERE company_id = p_company_id;
  DELETE FROM service_categories WHERE company_id = p_company_id;

  DELETE FROM company_pricing_rules WHERE company_id = p_company_id;
  DELETE FROM company_service_settings WHERE company_id = p_company_id;
  DELETE FROM company_themes WHERE company_id = p_company_id;
  DELETE FROM company_settings WHERE company_id = p_company_id;
  DELETE FROM user_invites WHERE company_id = p_company_id;
  DELETE FROM company_subscriptions WHERE company_id = p_company_id;

  -- users.company_id and companies.owner_user_id are both ON DELETE SET NULL.
  -- This preserves Auth accounts and avoids changing authentication behavior.
  DELETE FROM companies WHERE id = p_company_id;

  v_deleted := jsonb_build_object(
    'company_id', p_company_id,
    'company_name', v_company_name
  );
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION admin_delete_company(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_delete_company(uuid) FROM anon;
REVOKE ALL ON FUNCTION admin_delete_company(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_company(uuid) TO service_role;

COMMIT;