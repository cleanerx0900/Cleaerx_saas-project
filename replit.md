# CleanerX

A multi-tenant SaaS platform for cleaning businesses — manages bookings, customer accounts, services, invoicing, and staff dashboards.

## Run & Operate

- `npm run dev` — start Next.js dev server on port 5000 (the workflow uses port 20233)
- `npm run build` — production build
- `npm run start` — start production server

The Replit workflow runs: `./node_modules/.bin/next dev -H 0.0.0.0 -p 20233`

## Stack

- Next.js 16 (Pages Router), React 19, TypeScript
- Tailwind CSS v4
- Supabase (auth + database)
- @react-pdf/renderer (invoice PDFs)

## Where things live

- `pages/` — Next.js pages (routes)
- `pages/api/` — API routes
- `components/` — shared UI components (AdminLayout, DashboardLayout, etc.)
- `contexts/` — React contexts (Auth, Tenant, Impersonation)
- `lib/` — utilities, Supabase clients, pricing, brand helpers
- `sql/` — database schema, migrations, seed data
- `styles/globals.css` — global styles

## Required Secrets

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-side only)
- `SESSION_SECRET` — cookie signing secret (already set)

Optional:
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` — WhatsApp notifications

## Architecture decisions

- Multi-tenant: tenant context resolved from subdomain/cookie, injected via `TenantContext`
- Supabase used for both auth and database (Row Level Security applies)
- Admin and customer-facing areas share the same Next.js app, separated by route (`/admin`, `/dashboard`)
- PDF invoices generated server-side with @react-pdf/renderer

## User preferences

_Populate as you build._

## Gotchas

- `NEXT_PUBLIC_*` vars are baked into the client bundle at build time — changes require a rebuild
- Middleware uses the deprecated "middleware" file convention; Next.js recommends renaming to "proxy"
