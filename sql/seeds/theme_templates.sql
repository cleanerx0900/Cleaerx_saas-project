-- ============================================================
-- Seed: Theme Templates
-- Run after migration 005_theme_engine.sql
-- Safe to re-run: ON CONFLICT DO NOTHING / DO UPDATE
-- ============================================================

INSERT INTO theme_templates (
  name,
  slug,
  preview_image_url,
  config,
  is_public,
  is_premium,
  created_by
) VALUES

-- -------------------------------------------------------
-- Classic Navy — Default CleanerX brand
-- -------------------------------------------------------
(
  'Classic Navy',
  'classic-navy',
  NULL,  -- Add preview image URL after uploading to Supabase Storage
  '{
    "primary_color":    "#0A1F44",
    "secondary_color":  "#D4AF37",
    "accent_color":     "#1E3A6E",
    "button_color":     "#D4AF37",
    "background_color": "#FFFFFF",
    "text_color":       "#1A1A1A",
    "card_bg":          "#F8FAFC",
    "font_family":      "Inter",
    "border_radius":    "md",
    "card_shadow":      true
  }'::jsonb,
  true,   -- is_public
  false,  -- is_premium
  NULL    -- system template
),

-- -------------------------------------------------------
-- Modern Slate — Clean grey-blue professional look
-- -------------------------------------------------------
(
  'Modern Slate',
  'modern-slate',
  NULL,
  '{
    "primary_color":    "#334155",
    "secondary_color":  "#38BDF8",
    "accent_color":     "#0EA5E9",
    "button_color":     "#0EA5E9",
    "background_color": "#F8FAFC",
    "text_color":       "#0F172A",
    "card_bg":          "#FFFFFF",
    "font_family":      "Inter",
    "border_radius":    "lg",
    "card_shadow":      true
  }'::jsonb,
  true,
  false,
  NULL
),

-- -------------------------------------------------------
-- Emerald Clean — Fresh green, conveys cleanliness
-- -------------------------------------------------------
(
  'Emerald Clean',
  'emerald-clean',
  NULL,
  '{
    "primary_color":    "#065F46",
    "secondary_color":  "#10B981",
    "accent_color":     "#34D399",
    "button_color":     "#10B981",
    "background_color": "#FFFFFF",
    "text_color":       "#064E3B",
    "card_bg":          "#ECFDF5",
    "font_family":      "Inter",
    "border_radius":    "md",
    "card_shadow":      false
  }'::jsonb,
  true,
  false,
  NULL
),

-- -------------------------------------------------------
-- Bold Crimson — High-contrast, memorable brand
-- -------------------------------------------------------
(
  'Bold Crimson',
  'bold-crimson',
  NULL,
  '{
    "primary_color":    "#991B1B",
    "secondary_color":  "#F59E0B",
    "accent_color":     "#EF4444",
    "button_color":     "#991B1B",
    "background_color": "#FFFFFF",
    "text_color":       "#1C1917",
    "card_bg":          "#FEF2F2",
    "font_family":      "Inter",
    "border_radius":    "sm",
    "card_shadow":      true
  }'::jsonb,
  true,
  false,
  NULL
),

-- -------------------------------------------------------
-- Minimal White — Ultra-clean, Scandinavian aesthetic (Premium)
-- -------------------------------------------------------
(
  'Minimal White',
  'minimal-white',
  NULL,
  '{
    "primary_color":    "#111827",
    "secondary_color":  "#6B7280",
    "accent_color":     "#374151",
    "button_color":     "#111827",
    "background_color": "#FAFAFA",
    "text_color":       "#111827",
    "card_bg":          "#FFFFFF",
    "font_family":      "Inter",
    "border_radius":    "none",
    "card_shadow":      false
  }'::jsonb,
  true,
  true,   -- Premium — requires Professional+ plan
  NULL
),

-- -------------------------------------------------------
-- Royal Purple — Luxury home services positioning (Premium)
-- -------------------------------------------------------
(
  'Royal Purple',
  'royal-purple',
  NULL,
  '{
    "primary_color":    "#4C1D95",
    "secondary_color":  "#C4B5FD",
    "accent_color":     "#7C3AED",
    "button_color":     "#7C3AED",
    "background_color": "#FFFFFF",
    "text_color":       "#1E1B4B",
    "card_bg":          "#F5F3FF",
    "font_family":      "Inter",
    "border_radius":    "full",
    "card_shadow":      true
  }'::jsonb,
  true,
  true,   -- Premium
  NULL
)

ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  config            = EXCLUDED.config,
  is_public         = EXCLUDED.is_public,
  is_premium        = EXCLUDED.is_premium;
