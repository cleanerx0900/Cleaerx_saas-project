-- ============================================================
-- Migration 001: Core Tenant Layer
-- Tables: companies, company_settings, users, user_invites
-- ============================================================
-- Run order: FIRST (all other migrations depend on companies + users)
-- Safe to re-run: all statements use IF NOT EXISTS
-- ============================================================

-- -------------------------------------------------------
-- 1. companies
-- The tenant registry. One row per cleaning company.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text        UNIQUE NOT NULL,           -- URL key e.g. 'sparkle-clean'
  name             text        NOT NULL,
  owner_user_id    uuid,                                  -- FK added after users table exists
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  companies              IS 'Tenant registry — one row per cleaning company on the platform';
COMMENT ON COLUMN companies.slug         IS 'URL-safe unique identifier used in /book/[slug] routing';
COMMENT ON COLUMN companies.owner_user_id IS 'Set after the first company_owner user is created';
COMMENT ON COLUMN companies.is_active    IS 'Super admin can suspend a company without deleting its data';

-- -------------------------------------------------------
-- 2. company_settings
-- One-to-one with companies. All brand + contact config.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_settings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        UNIQUE NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Brand
  logo_url         text,
  favicon_url      text,

  -- Contact
  whatsapp_number  text,                                  -- E.164 format: +923279959900
  email            text,
  website          text,
  phone            text,
  address          text,
  city             text,
  country          text        NOT NULL DEFAULT 'PK',

  -- Localisation
  currency         text        NOT NULL DEFAULT 'PKR',    -- ISO 4217
  timezone         text        NOT NULL DEFAULT 'Asia/Karachi', -- IANA

  -- Quick-access colors (full theme lives in company_themes)
  primary_color    text        DEFAULT '#0A1F44',
  secondary_color  text        DEFAULT '#D4AF37',
  accent_color     text,
  button_color     text,

  -- Working hours
  -- Shape: {mon:{open:"08:00",close:"18:00"}, sat:{open:"09:00",close:"14:00"}, sun:null}
  working_hours    jsonb       NOT NULL DEFAULT '{}',

  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  company_settings IS 'Per-company brand, contact, and localisation settings';
COMMENT ON COLUMN company_settings.working_hours IS 'JSONB keyed by day abbreviation: {mon:{open,close}, tue:{open,close}, sun:null}';

-- -------------------------------------------------------
-- 3. users
-- All platform users across all companies.
-- id = auth.users.id (Supabase Auth foreign key).
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id               uuid        PRIMARY KEY,               -- matches auth.users(id)
  company_id       uuid        REFERENCES companies(id) ON DELETE SET NULL,
  email            text        UNIQUE NOT NULL,
  full_name        text,
  role             text        NOT NULL DEFAULT 'company_owner',
  -- Valid roles: 'super_admin' | 'company_owner' | 'company_staff'
  is_active        boolean     NOT NULL DEFAULT true,
  last_login_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_role_check CHECK (
    role IN ('super_admin', 'company_owner', 'company_staff')
  )
);

COMMENT ON TABLE  users          IS 'All platform users — super admins, company owners, and company staff';
COMMENT ON COLUMN users.id       IS 'Must equal the corresponding auth.users.id UUID';
COMMENT ON COLUMN users.role     IS 'super_admin: platform-wide | company_owner: own company | company_staff: limited own company';

-- Now that users exists, add the deferred FK on companies
ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS companies_owner_user_id_fkey;
ALTER TABLE companies
  ADD CONSTRAINT companies_owner_user_id_fkey
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- -------------------------------------------------------
-- 4. user_invites
-- Staff invitation tokens. Expire after 48 hours.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_invites (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_by   uuid        REFERENCES users(id) ON DELETE SET NULL,
  email        text        NOT NULL,
  role         text        NOT NULL DEFAULT 'company_staff',
  token        text        UNIQUE NOT NULL,               -- cryptographically random
  status       text        NOT NULL DEFAULT 'pending',
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_invites_role_check CHECK (
    role IN ('company_owner', 'company_staff')
  ),
  CONSTRAINT user_invites_status_check CHECK (
    status IN ('pending', 'accepted', 'expired')
  )
);

COMMENT ON TABLE  user_invites       IS 'Invite tokens sent to new staff members; expire after 48 hours';
COMMENT ON COLUMN user_invites.token IS 'Cryptographically random — used in invite link URL';
