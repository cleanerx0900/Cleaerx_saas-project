// CleanerX PLATFORM brand — colors extracted from the official CleanerX logo
// (public/brand/cleanerx-logo.jpg) and the logo asset itself.
//
// Scope: this is ONLY for platform-owned surfaces that are the same for every
// tenant — Company Login, Admin Login, the Super Admin panel, and shared
// auth flows (forgot/reset/change password). It must NEVER be imported by
// company-tenant surfaces (dashboard, booking form, Company Profile) —
// those stay on each company's own uploaded-logo colors via
// `lib/brandDefaults.js` (unchanged) and `company_settings`. See
// `replit.md` for the full rationale.
// Updated to match the approved Figma UI spec exactly (CleanerX SaaS UI):
// Primary Blue #0071BD, Accent Cyan #38B6FF (glow), Deep Navy #001F3F (admin).
export const PLATFORM_PRIMARY = '#0071BD'   // deep CleanerX blue — buttons, links, active states, "Cleaner" wordmark tone
export const PLATFORM_DARK    = '#001F3F'   // deep navy-blue — admin gradient/hero panels, admin sidebar
export const PLATFORM_LIGHT   = '#38B6FF'   // bright cyan-blue — the logo's "X", used for CTA gradients & highlights, glow effect
export const PLATFORM_ACCENT  = '#8FD6FC'   // soft pale blue — subtle badges, hover washes, decorative accents

export const PLATFORM_LOGO = '/brand/cleanerx-logo.jpg'
