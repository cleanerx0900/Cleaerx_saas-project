-- ============================================================
-- Migration 005: Theme Engine
-- Tables: theme_templates, company_themes
-- Depends on: 001_core_tenant_layer
-- ============================================================

-- -------------------------------------------------------
-- 1. theme_templates
-- Global library of themes. Created by super_admin.
-- Companies apply a template and optionally override values.
-- Future: theme marketplace (is_premium = true requires Pro+ plan).
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS theme_templates (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  slug              text        UNIQUE NOT NULL,
  preview_image_url text,
  -- Full theme config object — shape must match company_themes overrideable fields
  -- Shape: {primary_color, secondary_color, accent_color, button_color,
  --         background_color, text_color, font_family, border_radius, card_shadow}
  config            jsonb       NOT NULL DEFAULT '{}',
  is_public         boolean     NOT NULL DEFAULT true,
  -- false = marketplace / gated content (future)
  is_premium        boolean     NOT NULL DEFAULT false,
  -- true = requires Pro+ plan to apply
  created_by        uuid        REFERENCES users(id) ON DELETE SET NULL,
  -- NULL = system-created template
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  theme_templates            IS 'Global theme templates created by super_admin. Companies apply and override them.';
COMMENT ON COLUMN theme_templates.config     IS 'Full theme config: {primary_color, secondary_color, accent_color, button_color, background_color, text_color, font_family, border_radius, card_shadow}';
COMMENT ON COLUMN theme_templates.is_premium IS 'Premium themes require a Pro+ subscription plan to apply.';
COMMENT ON COLUMN theme_templates.created_by IS 'NULL = system/platform template. UUID = super_admin who created it.';

-- -------------------------------------------------------
-- 2. company_themes
-- Per-company theme configuration.
-- Inherits from template_id, then overrides individual values.
-- Merge logic (app-side): spread template.config, then apply non-null overrides.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_themes (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid    UNIQUE NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id      uuid    REFERENCES theme_templates(id) ON DELETE SET NULL,
  -- Individual overrides (NULL = inherit from template)
  primary_color    text,
  secondary_color  text,
  accent_color     text,
  button_color     text,
  background_color text,
  text_color       text,
  font_family      text,
  -- 'none' | 'sm' | 'md' | 'lg' | 'full'
  border_radius    text,
  -- Power-user escape hatch — must be sanitized by app before storing
  custom_css       text,
  -- Forward-compatibility: full merged config computed by app and stored here
  -- Allows the booking form to read a single row without joining template
  config           jsonb   NOT NULL DEFAULT '{}',
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT company_themes_border_radius_check CHECK (
    border_radius IS NULL OR border_radius IN ('none', 'sm', 'md', 'lg', 'full')
  )
);

COMMENT ON TABLE  company_themes            IS 'Per-company theme. Inherits from template_id and overrides individual fields.';
COMMENT ON COLUMN company_themes.config     IS 'Fully merged config computed and cached by the app: template values + overrides applied.';
COMMENT ON COLUMN company_themes.custom_css IS 'Advanced CSS override. Must be sanitized server-side before storage to prevent XSS.';
COMMENT ON COLUMN company_themes.template_id IS 'SET NULL on template delete — company keeps their last computed config.';
