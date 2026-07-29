# CleanerX — SaaS Architecture Audit Report
**Date:** 2026-07-05  
**Auditor:** Senior Full Stack SaaS Architect  
**Project:** CleanerX — Next.js + Tailwind CSS + Supabase  
**Objective:** Migrate single-company platform → professional multi-tenant SaaS

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Overview](#2-current-architecture-overview)
3. [Critical Issues Found](#3-critical-issues-found)
4. [Full File Audit](#4-full-file-audit)
5. [Hardcoded Data Inventory](#5-hardcoded-data-inventory)
6. [Database Assessment](#6-database-assessment)
7. [Reusable Files (Keep As-Is)](#7-reusable-files-keep-as-is)
8. [Files to Modify](#8-files-to-modify)
9. [Files to Remove](#9-files-to-remove)
10. [New Files Required](#10-new-files-required)
11. [Target Folder Structure](#11-target-folder-structure)
12. [Database Migration Plan](#12-database-migration-plan)
13. [SaaS Migration Roadmap](#13-saas-migration-roadmap)
14. [Development Order](#14-development-order)

---

## 1. Executive Summary

The current codebase is a **single-company prototype** masquerading as a multi-company platform. The database has a `Companies` table and some RLS policies, but the application layer completely ignores tenant isolation. Any authenticated user can see all bookings, all services, and any company's settings.

**The good news:** The foundation is not lost. The UI quality is high, the booking form is excellent, the admin panel has solid structure, and the Supabase integration is functional. The migration path is additive — we extend and refactor rather than rebuild.

**Severity breakdown of issues found:**
| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 6 | Security holes, data leaks across tenants |
| 🟠 High | 8 | Architecture violations, broken features |
| 🟡 Medium | 9 | Duplicate code, hardcoded values, missing features |
| 🟢 Low | 5 | Code quality, cleanup tasks |

---

## 2. Current Architecture Overview

```
User visits /dashboard
    │
    ▼
DashboardLayout.js ──── NO AUTH CHECK ──── Anyone gets in
    │
    ▼
Supabase query: .from("Bookings").select("*")
                                 ^^^^^^^^^^^^
                    Returns ALL bookings from ALL companies
```

```
Current DB (what exists vs. what's needed):

Companies table ✅ exists, missing multi-tenant fields
Users table     ✅ exists, has company_id but NOT enforced in app
Services table  ❌ NO company_id — all companies share one service list
Bookings table  ❌ NO company_id — all bookings are mixed together
```

The platform currently operates as if there is one global company. The `Companies` table is treated as a settings record rather than a tenant registry.

---

## 3. Critical Issues Found

### 🔴 CRITICAL-1: Dashboard Has No Authentication Guard
**File:** `components/DashboardLayout.js` (14 lines total)

```javascript
// CURRENT CODE — NO auth check whatsoever
export default function DashboardLayout({ children }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-y-auto">
        <Header />
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
```
Any anonymous visitor can navigate directly to `/dashboard`, `/dashboard/bookings`, `/dashboard/settings`, and see all company data.

---

### 🔴 CRITICAL-2: Bookings Table Has No company_id
**Files:** `pages/dashboard/bookings.js`, `pages/admin/bookings.js`

```javascript
// dashboard/bookings.js — fetches EVERY booking from EVERY company
const { data } = await supabase
  .from("Bookings")
  .select("*")  // ← no .eq("company_id", currentCompany)
```

In a multi-tenant system, Company A's admin would see Company B's customer bookings. This is a **data leak**.

---

### 🔴 CRITICAL-3: Services Table Has No company_id
**Files:** `components/ServiceManager.js`, `pages/dashboard/services.js`, `pages/dashboard/pricing.js`

```javascript
// ServiceManager.js — inserts with no company reference
await supabase.from("Services").insert([{ name: serviceName, price }])
//                                                ^^^^^^^^^^^^^^^^^^^
//                                           No company_id = global service
```

All companies share one service list. Company A editing pricing changes it for all companies.

---

### 🔴 CRITICAL-4: Company Settings Fetches Wrong Company
**File:** `pages/dashboard/settings.js`

```javascript
// Gets whichever company was created first — NOT the logged-in user's company
const { data } = await supabase
  .from("Companies")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(1)           // ← takes the latest company regardless of who's logged in
  .maybeSingle()
```

A company admin editing settings could be overwriting another company's data.

---

### 🔴 CRITICAL-5: Notification API Has No Authentication
**File:** `pages/api/notify.js`

```javascript
export default async function handler(req, res) {
  // No session check, no API key, no rate limiting
  const { to, message } = req.body || {};
  // ↑ Anyone on the internet can POST here and send WhatsApp messages via your Twilio account
```

This is an **open relay** — anyone who discovers the endpoint can send WhatsApp messages charged to your Twilio account.

---

### 🔴 CRITICAL-6: process.env Access on Client Side
**File:** `lib/notifications.js` (lines 1–3)

```javascript
// This file is imported in pages/admin/bookings.js (browser context)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
//                         ^^^^^^^^^^
// process.env is Node.js only. In browser this returns undefined silently.
// These credentials are also bundled into client JS if not prefixed NEXT_PUBLIC_
```

Twilio credentials will be `undefined` in the browser (good for security by accident), but the code silently fails. Also exposes the logic that these credentials exist.

---

### 🟠 HIGH-1: Pricing is 100% Hardcoded
**Files:** `lib/pricing.js`, `pages/book-service.js`

```javascript
// lib/pricing.js — 166 lines of hardcoded Pakistani Rupee rates
export function sofaRate(qty) {
  return qty >= 10 ? 280 : 320;  // Rs — hardcoded, not per-company
}
export const curtainPrices = { csmall: 500, cstd: 800, clarge: 1200, cblack: 1500 };
// roomPrices: 14 hardcoded price points across regular/deep × small/large
```

No company can have custom pricing. Every tenant gets identical rates.

---

### 🟠 HIGH-2: WhatsApp Number Hardcoded in Booking Form
**File:** `pages/book-service.js` (line 207)

```javascript
window.open("https://wa.me/923279959900?text=" + encodeURIComponent(msg), "_blank");
//                    ^^^^^^^^^^^^^ hardcoded to one specific company's phone
```

Every company's booking form sends WhatsApp to the same number. This is the most visible single-company assumption in the codebase.

---

### 🟠 HIGH-3: Header Component is Non-Functional
**File:** `components/Header.js`

```javascript
export default function Header() {
  return (
    <div className="bg-white shadow p-4 flex justify-between items-center">
      <h1 className="text-2xl font-bold">CleanerX</h1>  {/* hardcoded name */}
      <button className="bg-red-500 text-white px-4 py-2 rounded">Logout</button>
      {/* ↑ No onClick — button does nothing */}
    </div>
  )
}
```

Logout button is decorative. Company name is hardcoded.

---

### 🟠 HIGH-4: ThemeStudio is a Non-Functional Placeholder
**File:** `components/ThemeStudio.js`

```javascript
const themes = ["Classic", "Modern", "Premium", "Minimal"]
// Apply buttons have no onClick, no state, no DB connection
// This entire component does nothing
```

---

### 🟠 HIGH-5: Duplicate Signup Logic
**Files:** `lib/signupUser.js` AND `backend/signupFlow.js`

Both files contain nearly identical `signupUser()` functions inserting into the `Users` table. The `lib/` version uses the anon key client (incorrect for privileged inserts), the `backend/` version uses the service role client (correct). Neither is called consistently.

---

### 🟠 HIGH-6: No Tenant Routing for Booking Form
**Current:** `/book-service` — one URL for all companies, hardcoded branding  
**Required:** `/book/[slug]` — dynamic per-company branded booking pages

Without slug-based routing, there is no way to give each company their own booking link.

---

### 🟠 HIGH-7: No Global Auth/Session Context
**File:** `pages/_app.js`

```javascript
// _app.js is 5 lines — no session provider, no company context
export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
```

Every page independently re-fetches the session from Supabase. There is no shared auth state, so session data is redundantly fetched on every page load. In a multi-tenant app, the current company must be globally available.

---

### 🟠 HIGH-8: RLS Policies Don't Enforce Company Isolation
**File:** `sql/schema.sql`

```sql
-- Current RLS only checks admin role, not company_id
create policy "Admins can view all bookings" on "Bookings" for select
  using (is_admin());
-- ↑ An admin from Company A can see Company B's bookings
-- There is no policy scoping data to a specific company
```

The RLS is role-based but not tenant-scoped.

---

### 🟡 MEDIUM Issues (Summary)

| # | File | Issue |
|---|------|-------|
| M-1 | `lib/supabaseClient.js` | URL/key swap fallback logic is fragile and confusing |
| M-2 | `pages/signup.js` | Plain, unstyled, redirects to `/dashboard` without creating a Users row |
| M-3 | `components/Sidebar.js` | Links to "Theme Studio" (broken feature), generic gray style |
| M-4 | `pages/dashboard/services.js` | Displays price as `$service.price` — wrong currency symbol |
| M-5 | `pages/dashboard.js` | Landing page shows ThemeStudio (broken) + ServiceManager side by side |
| M-6 | `backend/inviteFlow.js` | Invite system exists but is never wired into any UI |
| M-7 | `pages/admin/settings.js` | 17-line placeholder with no functionality |
| M-8 | `lib/notifications.js` | Message hardcoded with "CleanerX" brand name |
| M-9 | `pages/book-service.js` | "Faisalabad" hardcoded in header subtitle |

---

## 4. Full File Audit

| File | Lines | Status | Action | Reason |
|------|-------|--------|--------|--------|
| `pages/_app.js` | 5 | 🟡 Refactor | Add AuthProvider + CompanyProvider | No global state |
| `pages/index.js` | ~60 | ✅ Keep | Minor cleanup | Good admin login UI |
| `pages/login.js` | ~300 | ✅ Keep | Minor update | Good customer login UI |
| `pages/signup.js` | 41 | 🟠 Refactor | Add company onboarding flow | Unstyled, incomplete |
| `pages/book-service.js` | 583 | 🔴 Refactor | Extract hardcodes, make dynamic | WA number, pricing, city hardcoded |
| `pages/dashboard.js` | 14 | 🟠 Replace | Create proper overview | Shows broken ThemeStudio |
| `pages/dashboard/bookings.js` | 69 | 🔴 Refactor | Add company_id filter + auth guard | Data leaks across tenants |
| `pages/dashboard/services.js` | 65 | 🔴 Refactor | Add company_id filter + auth guard | Shares services across all companies |
| `pages/dashboard/pricing.js` | 100 | 🔴 Refactor | Add company_id filter + auth guard | Shares pricing across all companies |
| `pages/dashboard/settings.js` | 115 | 🔴 Refactor | Fix company fetch, add new fields | Fetches wrong company |
| `pages/admin/index.js` | 116 | 🟡 Refactor | Add company breakdown to stats | Good structure, extend |
| `pages/admin/bookings.js` | 142 | 🟡 Refactor | Add company column + filter | Good UI, extend |
| `pages/admin/companies.js` | 231 | 🟡 Refactor | Add slug, whatsapp, theme fields | Good CRUD, extend |
| `pages/admin/customers.js` | 148 | 🟡 Refactor | Add company_id filter | Good CRM UI |
| `pages/admin/settings.js` | 17 | 🟠 Replace | Build super-admin settings | Empty placeholder |
| `pages/api/notify.js` | 63 | 🔴 Refactor | Add session auth check | Open relay, no auth |
| `components/AdminLayout.js` | 208 | ✅ Keep | Extend for super-admin role | Solid auth guard |
| `components/DashboardLayout.js` | 14 | 🔴 Refactor | Add auth guard + company isolation | ZERO auth check |
| `components/Header.js` | 8 | 🔴 Replace | Dynamic company name, working logout | Hardcoded, broken button |
| `components/Sidebar.js` | 37 | 🟠 Refactor | Update links, company branding | Static links, broken reference |
| `components/LoginForm.js` | ~70 | ✅ Keep | Minor cleanup | Good styled form |
| `components/ServiceManager.js` | 60 | 🔴 Refactor | Add company_id to insert | Creates global services |
| `components/ThemeStudio.js` | 19 | 🔴 Replace | Implement proper theme editor | 100% non-functional placeholder |
| `lib/supabaseClient.js` | 13 | 🟡 Refactor | Remove swap logic | Fragile URL/key detection |
| `lib/pricing.js` | 166 | 🟠 Refactor | Accept config object for rates | All rates hardcoded |
| `lib/notifications.js` | 57 | 🔴 Refactor | Move to API-only, fix message brand | process.env in browser |
| `lib/signupUser.js` | 16 | 🟡 Remove | Consolidate into backend/ | Duplicate, uses wrong client |
| `backend/supabaseClient.js` | 13 | ✅ Keep | No change | Correct service role client |
| `backend/signupFlow.js` | 25 | 🟡 Keep | Move to lib/server/ | Correct logic, wrong location |
| `backend/inviteFlow.js` | 42 | 🟡 Keep | Wire into UI | Good logic, not connected |
| `backend/index.js` | 16 | 🔴 Remove | Delete | Debug script, hardcodes "Demo Company" |
| `backend/testInvite.js` | ~20 | 🔴 Remove | Delete | Debug script only |
| `sql/schema.sql` | ~120 | 🟡 Extend | Add multi-tenant columns + policies | Good base, needs company_id everywhere |
| `sql/module10_admin_upgrade.sql` | ~60 | ✅ Keep | Reference only | Applied, historical |
| `styles/globals.css` | ~100 | ✅ Keep | Add CSS variables for theming | Good animation library |
| `next.config.js` | 7 | ✅ Keep | No change | Correctly configured |
| `package.json` | — | ✅ Keep | No change | Stack is correct |

---

## 5. Hardcoded Data Inventory

Every piece of company-specific data that must be made dynamic:

| Value | Location | Line | Should Come From |
|-------|----------|------|-----------------|
| `923279959900` (WhatsApp number) | `pages/book-service.js` | 207 | `Companies.whatsapp_number` |
| `"Faisalabad"` (city) | `pages/book-service.js` | 243 | `Companies.city` |
| `"CleanerX"` (brand name in header) | `components/Header.js` | 4 | `Companies.name` |
| `"CleanerX"` (brand in notification) | `lib/notifications.js` | 56 | `Companies.name` |
| `"CleanerX SaaS"` (page title) | `pages/index.js`, `pages/login.js` | various | Global SaaS brand (keep) |
| `"Faisalabad"` (footer) | `pages/login.js`, `pages/index.js` | various | `Companies.city` |
| `#0A1F44` (NAVY color) | `components/AdminLayout.js` | 6 | SaaS admin brand (keep as-is) |
| `#D4AF37` (GOLD color) | Multiple files | various | SaaS admin brand (keep as-is) |
| `sofaRate: 280/320` | `lib/pricing.js` | 51–52 | `CompanyPricing.sofa_rate_*` |
| `foamRate: 250/280` | `lib/pricing.js` | 55–56 | `CompanyPricing.foam_rate_*` |
| `carpetRate: 20–25/sqft` | `lib/pricing.js` | 59–63 | `CompanyPricing.carpet_rate_*` |
| `mattressSingle: 1200/1500` | `lib/pricing.js` | 66–68 | `CompanyPricing.mattress_single_*` |
| `mattressDouble: 2000/2500` | `lib/pricing.js` | 71–73 | `CompanyPricing.mattress_double_*` |
| `curtainPrices: 500/800/1200/1500` | `lib/pricing.js` | 77 | `CompanyPricing.curtain_*` |
| Room cleaning rates (14 values) | `lib/pricing.js` | 1–10 | `CompanyPricing.room_prices` (jsonb) |
| SERVICES array (6 services) | `pages/book-service.js` | 21–28 | `Services` table (company-specific) |
| TIME_SLOTS array | `pages/book-service.js` | 30–34 | Can stay (universal) |
| `"Demo Company"` | `backend/index.js` | 6 | DELETE FILE |
| `"abc123"` (test token) | `backend/testInvite.js` | 2 | DELETE FILE |
| `"#00FF00"` (default color) | `pages/dashboard/settings.js` | 26 | `Companies.primary_color` with sane default |

---

## 6. Database Assessment

### Current Schema State

```sql
-- What exists in schema.sql:
Companies  (id, name, address, contact, logo_url, created_at)
Users      (id, email, full_name, role, company_id, created_at)
Services   (id, name, price, created_at)                       -- ❌ No company_id
Bookings   (id, service, booking_date, status, customer_name,  -- ❌ No company_id
            customer_phone, customer_address, created_at)
AuthInvites(id, email, invite_token, status, created_at)

-- Noted in dashboard/settings.js but NOT in schema.sql:
Companies.whatsapp      -- referenced in code, not in schema
Companies.primary_color -- referenced in code, not in schema
```

### Problems with Current Schema

1. **`Services` has no `company_id`** — Services are global. Every company's dashboard shows the same list.
2. **`Bookings` has no `company_id`** — Cannot isolate tenant data. RLS cannot protect per-tenant.
3. **`Companies` is missing SaaS fields** — No slug (for URL routing), no theme config, no subscription plan, no whatsapp (despite being used in app code).
4. **RLS is role-based, not tenant-based** — `is_admin()` function checks if user is an admin but doesn't check which company they manage.
5. **Users.role is too simple** — Only `'admin'` and `'customer'`. Needs `'super_admin'` | `'company_admin'` | `'company_staff'`.
6. **No pricing table** — Pricing is hardcoded in JavaScript. Per-company configurable pricing requires a DB table.

### Required Schema Changes

#### ALTER existing tables

```sql
-- Companies: add SaaS-required fields
ALTER TABLE "Companies" ADD COLUMN slug text UNIQUE;
ALTER TABLE "Companies" ADD COLUMN whatsapp_number text;
ALTER TABLE "Companies" ADD COLUMN primary_color text DEFAULT '#0A1F44';
ALTER TABLE "Companies" ADD COLUMN secondary_color text DEFAULT '#D4AF37';
ALTER TABLE "Companies" ADD COLUMN city text;
ALTER TABLE "Companies" ADD COLUMN is_active boolean DEFAULT true;
ALTER TABLE "Companies" ADD COLUMN plan text DEFAULT 'starter';
ALTER TABLE "Companies" ADD COLUMN theme_config jsonb DEFAULT '{}';

-- Services: add tenant isolation
ALTER TABLE "Services" ADD COLUMN company_id uuid REFERENCES "Companies"(id) ON DELETE CASCADE;
CREATE INDEX idx_services_company ON "Services"(company_id);

-- Bookings: add tenant isolation
ALTER TABLE "Bookings" ADD COLUMN company_id uuid REFERENCES "Companies"(id) ON DELETE SET NULL;
CREATE INDEX idx_bookings_company ON "Bookings"(company_id);

-- Users: expand role enum
-- Current role values: 'customer', 'admin'
-- New role values: 'super_admin', 'company_admin', 'company_staff', 'customer'
-- (Migrate existing 'admin' → 'super_admin' for super admins)
```

#### New table: CompanyPricing

```sql
CREATE TABLE "CompanyPricing" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES "Companies"(id) ON DELETE CASCADE,
  -- Item pricing (overrides per company)
  sofa_rate_standard    numeric DEFAULT 320,
  sofa_rate_bulk        numeric DEFAULT 280,
  foam_rate_standard    numeric DEFAULT 280,
  foam_rate_bulk        numeric DEFAULT 250,
  carpet_rate_tier1     numeric DEFAULT 25,   -- ≤100 sqft
  carpet_rate_tier2     numeric DEFAULT 23,   -- ≤300 sqft
  carpet_rate_tier3     numeric DEFAULT 22,   -- ≤500 sqft
  carpet_rate_tier4     numeric DEFAULT 20,   -- 500+ sqft
  mattress_single_1     numeric DEFAULT 1500,
  mattress_single_bulk  numeric DEFAULT 1200,
  mattress_double_1     numeric DEFAULT 2500,
  mattress_double_bulk  numeric DEFAULT 2000,
  curtain_small         numeric DEFAULT 500,
  curtain_standard      numeric DEFAULT 800,
  curtain_large         numeric DEFAULT 1200,
  curtain_blackout      numeric DEFAULT 1500,
  tank_tier1            numeric DEFAULT 2500,
  tank_tier2            numeric DEFAULT 3500,
  tank_tier3            numeric DEFAULT 5000,
  tank_tier4            numeric DEFAULT 7000,
  room_prices           jsonb DEFAULT '{}',   -- regular/deep × small/large
  updated_at            timestamp with time zone DEFAULT now(),
  UNIQUE(company_id)
);
```

#### Updated RLS Policies

```sql
-- Helper: get the company_id of the currently logged-in user
CREATE OR REPLACE FUNCTION current_company_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT company_id FROM "Users"
  WHERE email = auth.jwt() ->> 'email';
$$;

-- Helper: is current user a super admin?
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Users"
    WHERE email = auth.jwt() ->> 'email'
    AND role = 'super_admin'
  );
$$;

-- Bookings: company isolation
CREATE POLICY "Company admins see own bookings" ON "Bookings" FOR SELECT
  USING (company_id = current_company_id() OR is_super_admin());

CREATE POLICY "Public can insert booking for a company" ON "Bookings" FOR INSERT
  WITH CHECK (true);  -- company_id set server-side from slug

-- Services: company isolation
CREATE POLICY "Company admins see own services" ON "Services" FOR SELECT
  USING (company_id = current_company_id() OR is_super_admin());

CREATE POLICY "Company admins manage own services" ON "Services" FOR ALL
  USING (company_id = current_company_id() OR is_super_admin())
  WITH CHECK (company_id = current_company_id() OR is_super_admin());
```

---

## 7. Reusable Files (Keep As-Is)

These files are well-written and can be kept with no or minimal changes:

| File | Reuse Rationale |
|------|----------------|
| `components/AdminLayout.js` | Solid auth guard, good UI, extend for super_admin role |
| `components/LoginForm.js` | Good styled form with loading states |
| `pages/index.js` | Good admin portal design |
| `pages/login.js` | Good customer login design, split-screen |
| `pages/api/notify.js` | Good Twilio implementation — just needs auth middleware |
| `backend/supabaseClient.js` | Correct service_role client with ws transport |
| `backend/inviteFlow.js` | Good invite logic — wire into UI |
| `next.config.js` | Correctly configured |
| `styles/globals.css` | Good animation classes, extend with CSS variables |
| `sql/module10_admin_upgrade.sql` | Historical — keep for reference |
| `package.json` | Stack is correct |
| `pages/admin/bookings.js` | Good UI structure — add company filter |
| `pages/admin/customers.js` | Good CRM pattern — add company filter |
| `pages/admin/companies.js` | Good CRUD — extend with new fields |
| `pages/admin/index.js` | Good stats pattern — extend with company breakdown |

---

## 8. Files to Modify

Ordered by urgency:

### Phase 1 — Security & Data Isolation (Do First)

| File | Changes Required |
|------|----------------|
| `components/DashboardLayout.js` | Add session check + company_id isolation; redirect to login if no session |
| `pages/api/notify.js` | Add `await supabase.auth.getUser()` check at top; reject unauthenticated requests |
| `pages/dashboard/bookings.js` | Add `.eq("company_id", session.company_id)` filter |
| `pages/dashboard/services.js` | Add `.eq("company_id", session.company_id)` filter |
| `pages/dashboard/pricing.js` | Add `.eq("company_id", session.company_id)` filter |
| `pages/dashboard/settings.js` | Fix to `.eq("id", user.company_id)` instead of `.limit(1)` |
| `components/ServiceManager.js` | Pass `company_id` into the insert |

### Phase 2 — Hardcoded Values

| File | Changes Required |
|------|----------------|
| `pages/book-service.js` | Replace hardcoded WA number + city with props from company slug |
| `lib/pricing.js` | Accept a pricing config object; fall back to current defaults |
| `lib/notifications.js` | Remove process.env access; use API route only; replace "CleanerX" with company name |
| `components/Header.js` | Accept `company` prop; wire logout to `supabase.auth.signOut()` |
| `components/Sidebar.js` | Remove ThemeStudio link; add dynamic company name |
| `lib/supabaseClient.js` | Simplify — remove URL/key swap logic |

### Phase 3 — Feature Completion

| File | Changes Required |
|------|----------------|
| `pages/_app.js` | Add `<AuthProvider>` + `<CompanyProvider>` wrappers |
| `pages/signup.js` | Full redesign: company registration flow with slug + whatsapp |
| `pages/admin/companies.js` | Add slug, whatsapp_number, primary_color, city, plan fields |
| `pages/admin/settings.js` | Build out super-admin platform settings |
| `pages/dashboard.js` | Replace with proper overview (booking stats, recent activity) |
| `components/ThemeStudio.js` | Implement properly OR remove + replace with inline settings |
| `sql/schema.sql` | Add all new columns, new tables, updated RLS policies |

---

## 9. Files to Remove

| File | Reason |
|------|--------|
| `backend/index.js` | Debug script — inserts `"Demo Company"` hardcoded. No production use. |
| `backend/testInvite.js` | Debug script — inserts test invite token. No production use. |
| `lib/signupUser.js` | Duplicate of `backend/signupFlow.js`. Uses wrong Supabase client (anon key for privileged insert). |
| `scripts/make-zip.cjs` | Build utility — should not be in project root. Move to `package.json` scripts or remove. |
| `scripts/make-zip.mjs` | Same as above. |
| `zipFile.zip` | Original upload artifact — not source code. |
| `pages/dashboard.js` | Replaced by proper overview page at `pages/dashboard/index.js` |

---

## 10. New Files Required

### Context & Hooks

| File | Purpose |
|------|---------|
| `contexts/AuthContext.js` | Global Supabase session + user profile. Prevents per-page re-fetching. |
| `contexts/CompanyContext.js` | Current company for dashboard users. Provides company_id to all child components. |
| `hooks/useAuth.js` | Convenient `const { user, session, loading } = useAuth()` |
| `hooks/useCompany.js` | Convenient `const { company, pricing } = useCompany()` |

### Pages

| File | Purpose |
|------|---------|
| `pages/book/[slug].js` | **Core multi-tenant page.** Dynamic branded booking form per company. |
| `pages/dashboard/index.js` | Proper company dashboard overview (replaces `pages/dashboard.js`) |
| `pages/onboarding.js` | Company registration + setup wizard (first login after signup) |

### API Routes

| File | Purpose |
|------|---------|
| `pages/api/company/[slug].js` | Server-side: fetch company by slug (public, for booking page) |
| `pages/api/bookings/create.js` | Server-side: create booking with server-validated company_id |
| `pages/api/auth/session.js` | Server-side: get current session + profile (single source of truth) |

### Library

| File | Purpose |
|------|---------|
| `lib/server/supabaseAdmin.js` | Replaces `backend/supabaseClient.js` — better location for server utilities |
| `lib/server/getCompany.js` | Server-side: fetch company by slug or id; used in getServerSideProps |
| `lib/pricingConfig.js` | Pricing engine that accepts company pricing config from DB |

### Database

| File | Purpose |
|------|---------|
| `sql/migration_v2_multitenant.sql` | All ALTER statements for multi-tenancy; safe to run incrementally |

### Middleware

| File | Purpose |
|------|---------|
| `middleware.js` | Next.js edge middleware — protect `/dashboard/*` and `/admin/*` routes at the network level |

---

## 11. Target Folder Structure

```
cleanerx/
├── components/
│   ├── admin/                    ← Super-admin UI components
│   │   ├── AdminLayout.js        ← (moved + extended from components/)
│   │   └── StatCard.js           ← (extracted from admin/index.js)
│   ├── dashboard/                ← Company-admin UI components
│   │   ├── DashboardLayout.js    ← (refactored with auth guard)
│   │   ├── CompanyHeader.js      ← (replaces Header.js — dynamic)
│   │   ├── CompanySidebar.js     ← (replaces Sidebar.js — dynamic)
│   │   └── ServiceManager.js     ← (refactored with company_id)
│   ├── booking/                  ← Public booking form components
│   │   ├── BookingForm.js        ← (extracted from book-service.js)
│   │   ├── ServiceSelector.js    ← (extracted from book-service.js)
│   │   ├── BillSummary.js        ← (extracted from book-service.js)
│   │   └── CustomerDetails.js    ← (extracted from book-service.js)
│   └── shared/                   ← Shared across all contexts
│       ├── LoginForm.js          ← (kept from components/)
│       └── LoadingSpinner.js     ← (new — replace all "<p>Loading...</p>")
│
├── contexts/
│   ├── AuthContext.js
│   └── CompanyContext.js
│
├── hooks/
│   ├── useAuth.js
│   └── useCompany.js
│
├── lib/
│   ├── supabaseClient.js         ← (simplified — remove swap logic)
│   ├── pricing.js                ← (refactored — accepts config)
│   ├── pricingConfig.js          ← (NEW — maps DB rows to pricing.js format)
│   ├── notifications.js          ← (refactored — API-only, dynamic brand)
│   └── server/
│       ├── supabaseAdmin.js      ← (replaces backend/supabaseClient.js)
│       ├── getCompany.js         ← (NEW — server-side company lookup)
│       └── signupFlow.js         ← (moved from backend/)
│
├── middleware.js                 ← (NEW — edge route protection)
│
├── pages/
│   ├── _app.js                   ← (extended — AuthProvider + CompanyProvider)
│   ├── index.js                  ← (keep — super-admin / platform landing)
│   ├── login.js                  ← (keep — customer login)
│   ├── signup.js                 ← (refactor — company onboarding)
│   ├── onboarding.js             ← (NEW — post-signup setup wizard)
│   │
│   ├── book/
│   │   └── [slug].js             ← (NEW — per-company branded booking page)
│   │
│   ├── dashboard/
│   │   ├── index.js              ← (NEW — replaces dashboard.js)
│   │   ├── bookings.js           ← (refactor — company-scoped)
│   │   ├── services.js           ← (refactor — company-scoped)
│   │   ├── pricing.js            ← (refactor — company-scoped)
│   │   └── settings.js           ← (refactor — fixed company fetch)
│   │
│   ├── admin/
│   │   ├── index.js              ← (keep + extend)
│   │   ├── bookings.js           ← (keep + add company filter)
│   │   ├── companies.js          ← (keep + add new fields)
│   │   ├── customers.js          ← (keep + add company filter)
│   │   └── settings.js           ← (replace — build out super-admin settings)
│   │
│   └── api/
│       ├── notify.js             ← (refactor — add auth check)
│       ├── company/
│       │   └── [slug].js         ← (NEW — public company lookup)
│       ├── bookings/
│       │   └── create.js         ← (NEW — server-validated booking creation)
│       └── auth/
│           └── session.js        ← (NEW — session + profile endpoint)
│
├── sql/
│   ├── schema.sql                ← (extended — new columns + tables)
│   ├── migration_v2_multitenant.sql ← (NEW — safe ALTER statements)
│   └── module10_admin_upgrade.sql   ← (keep — historical)
│
├── styles/
│   └── globals.css               ← (extended — CSS variables for theming)
│
├── next.config.js                ← (keep)
├── package.json                  ← (keep)
├── replit.md                     ← (update with new structure)
└── SAAS_AUDIT.md                 ← (this document)
```

---

## 12. Database Migration Plan

Run these in order. Each step is safe and non-destructive to existing data.

### Step 1: Extend Companies table
```sql
ALTER TABLE "Companies"
  ADD COLUMN IF NOT EXISTS slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#0A1F44',
  ADD COLUMN IF NOT EXISTS secondary_color text DEFAULT '#D4AF37',
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS theme_config jsonb DEFAULT '{}';

-- Generate slugs for existing companies
UPDATE "Companies"
  SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
  WHERE slug IS NULL;
```

### Step 2: Add company_id to Services
```sql
ALTER TABLE "Services"
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES "Companies"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_services_company ON "Services"(company_id);
```

### Step 3: Add company_id to Bookings
```sql
ALTER TABLE "Bookings"
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES "Companies"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_company ON "Bookings"(company_id);
```

### Step 4: Create CompanyPricing table
```sql
CREATE TABLE IF NOT EXISTS "CompanyPricing" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES "Companies"(id) ON DELETE CASCADE,
  sofa_rate_standard    numeric DEFAULT 320,
  sofa_rate_bulk        numeric DEFAULT 280,
  foam_rate_standard    numeric DEFAULT 280,
  foam_rate_bulk        numeric DEFAULT 250,
  carpet_rate_tier1     numeric DEFAULT 25,
  carpet_rate_tier2     numeric DEFAULT 23,
  carpet_rate_tier3     numeric DEFAULT 22,
  carpet_rate_tier4     numeric DEFAULT 20,
  mattress_single_1     numeric DEFAULT 1500,
  mattress_single_bulk  numeric DEFAULT 1200,
  mattress_double_1     numeric DEFAULT 2500,
  mattress_double_bulk  numeric DEFAULT 2000,
  curtain_small         numeric DEFAULT 500,
  curtain_standard      numeric DEFAULT 800,
  curtain_large         numeric DEFAULT 1200,
  curtain_blackout      numeric DEFAULT 1500,
  tank_tier1            numeric DEFAULT 2500,
  tank_tier2            numeric DEFAULT 3500,
  tank_tier3            numeric DEFAULT 5000,
  tank_tier4            numeric DEFAULT 7000,
  room_prices           jsonb   DEFAULT '{"regular":{"small":{"bed":1200,"lounge":1500,"kitchen":800,"wash":800,"garage":800,"stair":800,"store":800},"large":{"bed":1500,"lounge":1500,"kitchen":1200,"wash":1200,"garage":1200,"stair":1200,"store":1200}},"deep":{"small":{"bed":2000,"lounge":2000,"kitchen":1500,"wash":1500,"garage":1500,"stair":1500,"store":1500},"large":{"bed":2800,"lounge":2800,"kitchen":2000,"wash":2000,"garage":2000,"stair":2000,"store":2000}}}',
  updated_at            timestamp with time zone DEFAULT now()
);

ALTER TABLE "CompanyPricing" ENABLE ROW LEVEL SECURITY;
```

### Step 5: Upgrade role values + helpers
```sql
-- Rename existing 'admin' super users to 'super_admin'
-- (Run manually after identifying which users are super admins)
-- UPDATE "Users" SET role = 'super_admin' WHERE email = 'your@email.com';

-- New RLS helper functions
CREATE OR REPLACE FUNCTION current_company_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT company_id FROM "Users"
  WHERE email = auth.jwt() ->> 'email' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Users"
    WHERE email = auth.jwt() ->> 'email'
    AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_company_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Users"
    WHERE email = auth.jwt() ->> 'email'
    AND role IN ('company_admin', 'super_admin')
  );
$$;
```

### Step 6: Update RLS policies
```sql
-- Drop all old single-company policies
DROP POLICY IF EXISTS "Admins can view all bookings" ON "Bookings";
DROP POLICY IF EXISTS "Admins can update bookings" ON "Bookings";
DROP POLICY IF EXISTS "Admins can delete bookings" ON "Bookings";
DROP POLICY IF EXISTS "Authenticated can read services" ON "Services";
DROP POLICY IF EXISTS "Admins can manage services" ON "Services";

-- New tenant-scoped Bookings policies
CREATE POLICY "Company admin sees own bookings" ON "Bookings" FOR SELECT
  USING (company_id = current_company_id() OR is_super_admin());

CREATE POLICY "Company admin updates own bookings" ON "Bookings" FOR UPDATE
  USING (company_id = current_company_id() OR is_super_admin());

CREATE POLICY "Company admin deletes own bookings" ON "Bookings" FOR DELETE
  USING (company_id = current_company_id() OR is_super_admin());

-- New tenant-scoped Services policies
CREATE POLICY "Company admin sees own services" ON "Services" FOR SELECT
  USING (company_id = current_company_id() OR is_super_admin());

CREATE POLICY "Company admin manages own services" ON "Services" FOR ALL
  USING (company_id = current_company_id() OR is_super_admin())
  WITH CHECK (company_id = current_company_id() OR is_super_admin());

-- CompanyPricing policies
CREATE POLICY "Company admin sees own pricing" ON "CompanyPricing" FOR SELECT
  USING (company_id = current_company_id() OR is_super_admin());

CREATE POLICY "Company admin manages own pricing" ON "CompanyPricing" FOR ALL
  USING (company_id = current_company_id() OR is_super_admin())
  WITH CHECK (company_id = current_company_id() OR is_super_admin());
```

---

## 13. SaaS Migration Roadmap

### Phase 0 — Foundation (Pre-coding)
> Run SQL migrations. No code changes. Validate DB is ready.

- [ ] Run Step 1–6 SQL migrations on Supabase
- [ ] Manually promote existing admin user to `super_admin` role
- [ ] Assign slugs to any existing test companies
- [ ] Validate all existing bookings still readable after schema changes

---

### Phase 1 — Security Patch (Week 1)
> Fix all 🔴 Critical issues before any feature work.

- [ ] **1.1** Add auth guard to `DashboardLayout.js`
- [ ] **1.2** Add session auth to `pages/api/notify.js`
- [ ] **1.3** Fix `dashboard/settings.js` to use correct company_id
- [ ] **1.4** Add `company_id` filter to `dashboard/bookings.js`
- [ ] **1.5** Add `company_id` filter to `dashboard/services.js`
- [ ] **1.6** Add `company_id` filter to `dashboard/pricing.js`
- [ ] **1.7** Add `company_id` to `ServiceManager.js` inserts
- [ ] **1.8** Fix `lib/notifications.js` — remove process.env, fix brand name

---

### Phase 2 — Global Auth State (Week 1–2)
> Create shared context so session/company is available everywhere without re-fetching.

- [ ] **2.1** Create `contexts/AuthContext.js`
- [ ] **2.2** Create `contexts/CompanyContext.js`
- [ ] **2.3** Create `hooks/useAuth.js` + `hooks/useCompany.js`
- [ ] **2.4** Update `pages/_app.js` with providers
- [ ] **2.5** Create `middleware.js` for edge-level route protection
- [ ] **2.6** Update `components/Header.js` — dynamic name, working logout
- [ ] **2.7** Update `components/Sidebar.js` — dynamic company, remove ThemeStudio

---

### Phase 3 — Tenant Booking Page (Week 2–3)
> The core SaaS value: per-company branded booking form.

- [ ] **3.1** Create `lib/server/getCompany.js` — server-side company + pricing lookup by slug
- [ ] **3.2** Create `pages/api/company/[slug].js` — public REST endpoint
- [ ] **3.3** Create `pages/book/[slug].js` — dynamic booking page using company data
- [ ] **3.4** Refactor `pages/book-service.js` — remove all hardcoded values, use dynamic props
- [ ] **3.5** Refactor `lib/pricing.js` — accept pricing config, retain defaults
- [ ] **3.6** Create `pages/api/bookings/create.js` — server-side booking creation with company_id
- [ ] **3.7** Test: two companies, two slugs, two branded booking pages

---

### Phase 4 — Company Dashboard (Week 3–4)
> Company admins manage their own isolated data.

- [ ] **4.1** Create `pages/dashboard/index.js` — proper overview with stats
- [ ] **4.2** Update `pages/dashboard/settings.js` — full company profile editor
- [ ] **4.3** Implement `pages/dashboard/pricing.js` — edit CompanyPricing table rows
- [ ] **4.4** Implement `components/ThemeStudio.js` — real color picker that saves to DB
- [ ] **4.5** Update `pages/dashboard/services.js` — company-scoped service CRUD

---

### Phase 5 — Super Admin Extensions (Week 4–5)
> Super admin can onboard and manage all tenant companies.

- [ ] **5.1** Update `pages/admin/companies.js` — add slug, whatsapp, plan, color fields
- [ ] **5.2** Update `pages/admin/bookings.js` — add company filter dropdown
- [ ] **5.3** Update `pages/admin/customers.js` — add company filter
- [ ] **5.4** Build `pages/admin/settings.js` — platform-level settings
- [ ] **5.5** Update `pages/admin/index.js` — per-company stats breakdown

---

### Phase 6 — Company Onboarding (Week 5–6)
> Self-service company registration.

- [ ] **6.1** Redesign `pages/signup.js` — company registration form
- [ ] **6.2** Create `pages/onboarding.js` — post-signup setup wizard (slug, theme, WhatsApp)
- [ ] **6.3** Wire `backend/inviteFlow.js` — staff invite system
- [ ] **6.4** Create `lib/server/signupFlow.js` — proper server-side user+company creation

---

### Phase 7 — Polish & Production-Ready (Week 6–7)
> Code quality, cleanup, testing.

- [ ] **7.1** Delete `backend/index.js`, `backend/testInvite.js`, `lib/signupUser.js`
- [ ] **7.2** Fix `lib/supabaseClient.js` URL/key swap logic
- [ ] **7.3** Replace all `<p>Loading...</p>` with shared `<LoadingSpinner />`
- [ ] **7.4** Fix `$service.price` → `Rs {service.price}` currency symbol bug
- [ ] **7.5** Add error boundaries to all dashboard pages
- [ ] **7.6** Write `sql/migration_v2_multitenant.sql` — final clean migration file
- [ ] **7.7** Update `replit.md` with new structure and run instructions
- [ ] **7.8** Final security audit: test all RLS policies with two test companies

---

## 14. Development Order

Start here — in this exact order:

```
1. SQL migrations (Phase 0)           — No risk, additive only
2. DashboardLayout auth guard          — Closes biggest security hole first
3. Fix dashboard/*.js company filters  — Stop data leaks immediately
4. Fix api/notify.js auth              — Close open relay
5. AuthContext + CompanyContext         — Foundation for everything else
6. middleware.js                        — Edge protection
7. pages/book/[slug].js                 — Core SaaS feature, highest value
8. Refactor pricing.js                  — Required by [slug].js
9. Company dashboard improvements       — Company admin experience
10. Super admin extensions              — Platform management
11. Company onboarding                  — Self-service growth
12. Cleanup + polish                    — Production readiness
```

---

## Appendix: Issue Count by File

| File | 🔴 Critical | 🟠 High | 🟡 Medium | Total |
|------|------------|--------|----------|-------|
| `components/DashboardLayout.js` | 1 | — | — | 1 |
| `pages/dashboard/bookings.js` | 1 | — | — | 1 |
| `pages/dashboard/settings.js` | 1 | — | 1 | 2 |
| `pages/dashboard/services.js` | 1 | — | 1 | 2 |
| `pages/dashboard/pricing.js` | 1 | — | — | 1 |
| `pages/book-service.js` | 1 | 1 | 1 | 3 |
| `pages/api/notify.js` | 1 | — | — | 1 |
| `lib/notifications.js` | 1 | — | 1 | 2 |
| `lib/pricing.js` | — | 1 | — | 1 |
| `components/Header.js` | — | 1 | — | 1 |
| `components/ThemeStudio.js` | — | 1 | — | 1 |
| `components/ServiceManager.js` | — | — | 1 | 1 |
| `lib/signupUser.js` | — | — | 1 | 1 |
| `pages/signup.js` | — | — | 1 | 1 |
| `sql/schema.sql` | — | 1 | 1 | 2 |
| `pages/_app.js` | — | 1 | — | 1 |
| `backend/index.js` | — | — | 1 | 1 |
| `backend/testInvite.js` | — | — | 1 | 1 |
| **TOTAL** | **8** | **6** | **9** | **23** |

---

*End of Audit Report — Do not begin coding until this document has been reviewed and Phase 0 SQL migrations have been applied.*
