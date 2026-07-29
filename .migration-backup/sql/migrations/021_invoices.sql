-- ============================================================
-- Migration 021: Invoice System
-- Table: invoices
-- Depends on: 001_core_tenant_layer, 003_bookings_layer
-- ============================================================

-- -------------------------------------------------------
-- 1. invoices
-- One invoice record per generated invoice.
-- PDFs are generated on-demand; invoice_url is optional
-- (populated only if the PDF is persisted to storage).
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  booking_id     uuid        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  -- Human-readable sequential invoice number, unique per company
  -- Format: INV-{YYYY}-{NNNN}  e.g. INV-2026-0001
  invoice_number text        NOT NULL,

  -- Who generated this invoice (company_owner only)
  generated_by   uuid        REFERENCES users(id) ON DELETE SET NULL,

  -- Optional: URL if the PDF is persisted to Supabase Storage
  invoice_url    text,

  created_at     timestamptz NOT NULL DEFAULT now(),

  -- One invoice number per company (sequential, no duplicates)
  CONSTRAINT invoices_number_company_unique UNIQUE (company_id, invoice_number),

  -- One invoice per booking (re-generating replaces nothing — same record returned)
  CONSTRAINT invoices_booking_unique UNIQUE (booking_id)
);

COMMENT ON TABLE  invoices                IS 'Invoice records for company bookings. PDFs generated on-demand by company owners.';
COMMENT ON COLUMN invoices.invoice_number IS 'Sequential per-company invoice number. Format: INV-YYYY-NNNN.';
COMMENT ON COLUMN invoices.generated_by   IS 'User who first generated the invoice. Only company_owner role can generate.';
COMMENT ON COLUMN invoices.invoice_url    IS 'Optional Supabase Storage URL if PDF was persisted. NULL = generated on-demand only.';

-- -------------------------------------------------------
-- 2. RLS — company_owner can select/insert their own invoices
-- -------------------------------------------------------
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Company members can view their own invoices.
-- PostgreSQL does not support CREATE POLICY IF NOT EXISTS,
-- so guard with a pg_policies check inside a DO block.
DO
$migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'invoices'
      AND policyname = 'invoices_select_company'
  ) THEN
    CREATE POLICY "invoices_select_company"
      ON invoices FOR SELECT
      USING (company_id = auth_company_id());
  END IF;
END
$migration$;

-- Only service role (admin client) inserts — enforced in application layer
-- No direct INSERT/UPDATE/DELETE policies for anon/user roles
