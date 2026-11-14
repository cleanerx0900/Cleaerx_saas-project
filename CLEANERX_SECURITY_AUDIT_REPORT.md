# CleanerX SaaS — Security, Privacy & Reliability Audit Report

**Date:** November 14, 2026  
**Auditor:** Senior Application Security Engineer & Privacy Auditor  
**Audit Scope:** Full Application Codebase (`pages/`, `pages/api/`, `components/`, `contexts/`, `lib/`, `sql/`, `middleware.js`, `next.config.js`, dependencies, configurations)  
**Mode:** READ-ONLY Architectural & Source Code Vulnerability Analysis  
**Target Environment:** Multi-Tenant SaaS (Next.js Pages Router + Supabase Postgres/Auth + Tailwind + Twilio WhatsApp)

---

## A. Executive Summary

### Overall Risk Rating: **HIGH**

CleanerX implements solid multi-tenant database defense-in-depth on its core transactional tables (`bookings`, `company_settings`, and `users` via Migration 025), and enforces authoritative server-side pricing recalculation on booking submissions. However, significant vulnerabilities in **session cookie configuration, missing CSRF defenses, client-only route protection, unauthenticated public API endpoints without rate limiting, critical dependency vulnerabilities, and missing production HTTP security headers** expose the application to cross-site request forgery, automated denial-of-service / spam, clickjacking, and lateral authorization bypass.

### Top 5 Most Urgent Issues

1. **`SameSite: 'none'` Session Cookies Exposing Authenticated Endpoints to CSRF (FINDING-02)**  
   Session and impersonation cookies are configured with `sameSite: 'none'`, causing browsers to include them on all cross-origin requests. Because state-changing API routes (`/api/admin/delete-company`, `/api/admin/reset-company-password`, `/api/booking/adjust-price`, `/api/booking/update-status`, `/api/company/upload-logo`) lack CSRF tokens or Origin checks, authenticated super admins and company owners can be coerced into performing unintended destructive actions via malicious third-party websites.

2. **Middleware Omits Role Checks and Server-Side Page Route Guards for `/admin/*` and `/dashboard/*` (FINDING-01)**  
   `middleware.js` only checks authentication (`if (!user)`) and explicitly delegates role verification to client-side React layout components. Next.js pages under `/admin/*` and `/dashboard/*` implement no `getServerSideProps` role validation. Any authenticated company staff member requesting an `/admin/*` route receives an HTTP 200 with the full HTML and administrative JavaScript bundle. Access denial is rendered only client-side after browser hydration.

3. **Public Booking and Notification Endpoints Lack Rate Limiting and Anti-Automation (FINDING-03)**  
   `/api/create-pricing-booking`, `/api/create-booking`, and `/api/booking-notify` have no rate limiting, CAPTCHA, or IP throttling. Automated scripts can mass-submit fake bookings, flood the database, lock company schedules, and abuse `/api/booking-notify` to exhaust Twilio WhatsApp balances and spam company phone numbers.

4. **Critical Next.js and Dependency Vulnerabilities Identified by `npm audit` (FINDING-04)**  
   `npm audit` reports 5 high/critical vulnerabilities, including Next.js unauthenticated Remote Code Execution on Windows servers (GHSA-p293-qw3h-jr36), Image Optimization SSRF/RCE (GHSA-cjq9-62q9-8jv4, GHSA-2xp9-vwfh-vxw4), and cache poisoning (GHSA-4jqv-mc3x-m676).

5. **Hardcoded Live Supabase Endpoint and Anon Key Committed in `.replit` (FINDING-05)**  
   The live Supabase project URL (`https://lopzzzbbhvuolhytzfpt.supabase.co`) and a valid Supabase anon JWT are permanently hardcoded in `.replit` under `[userenv.shared]`, persisting in version control history.

---

## B. Vulnerability & Risk Findings Table

| ID | Severity | Category | Title | File:Line | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **High** | Access Control | Middleware omits role verification; `/admin/*` and `/dashboard/*` rely on client-side layout gates | `middleware.js:8-9, 46-59`<br>`components/AdminLayout.js:45-50, 100-110` | Confirmed |
| **SEC-02** | **High** | Session / CSRF | `SameSite: 'none'` cookies paired with missing CSRF defenses expose state-changing APIs | `lib/supabaseClient.js:32-35`<br>`pages/api/admin/delete-company.js:20` | Confirmed |
| **SEC-03** | **High** | Abuse / DoS | Public booking & notification APIs lack rate limiting, CAPTCHA, and abuse protection | `pages/api/create-pricing-booking.js:15-35`<br>`pages/api/booking-notify.js:14-23` | Confirmed |
| **SEC-04** | **High** | Supply Chain | Critical Next.js & package vulnerabilities reported by `npm audit` | `package.json:26`<br>`package-lock.json` | Confirmed |
| **SEC-05** | **Medium** | Secrets / Config | Live Supabase project URL and anon JWT hardcoded in `.replit` configuration | `.replit:49-50` | Confirmed |
| **SEC-06** | **Medium** | Authentication | Public signup assigns `role = 'company_owner'` via trigger with unhardened `search_path` | `sql/migrations/015_auto_create_user_profile.sql:40-52` | Confirmed |
| **SEC-07** | **Medium** | Config / XSS | Missing security headers (CSP, X-Frame-Options, HSTS) & unsafe dev origins in `next.config.js` | `next.config.js:5-12` | Confirmed |
| **SEC-08** | **Medium** | Business Logic | Subscription plan feature gating is defined in context but completely unenforced | `contexts/TenantContext.js:79, 102`<br>`pages/dashboard/services.js:57` | Confirmed |
| **SEC-09** | **Medium** | Reliability | `TenantContext` does not integrate with `ImpersonationContext`, breaking Super Admin impersonation | `contexts/TenantContext.js:65-72`<br>`contexts/ImpersonationContext.js:9-11` | Confirmed |
| **SEC-10** | **Medium** | Info Disclosure | Internal PostgreSQL error messages returned to clients in administrative API responses | `pages/api/admin/create-company.js:93, 125, 162`<br>`pages/api/admin/delete-company.js:100` | Confirmed |
| **SEC-11** | **Low** | Input Validation | Company slugs lack character whitelisting and reserved word collision checks | `pages/api/admin/create-company.js:66-68`<br>`pages/admin/companies.js:302` | Confirmed |
| **SEC-12** | **Low** | Privacy | PII logged to consoles; customer data transmitted to WhatsApp without consent banner | `middleware.js:42-44`<br>`contexts/AuthContext.js:47, 90`<br>`pages/api/booking-notify.js:63-70` | Confirmed |
| **SEC-13** | **Low** | Database / RLS | Legacy PascalCase `schema.sql` tables contain unconstrained public INSERT policies | `sql/schema.sql:120-123`<br>`sql/schema.sql:81-83` | Confirmed |
| **SEC-14** | **Low** | Database / RLS | Missing `super_admin` SELECT policy on `invoices` table prevents PostgREST oversight | `sql/migrations/021_invoices.sql:50-63` | Confirmed |
| **SEC-15** | **Low** | Database / RLS | Multiple `SECURITY DEFINER` functions use mutable `SET search_path = public` | `sql/functions/auth_helpers.sql:15, 29, 44`<br>`sql/migrations/014_company_service_settings.sql:71, 96`<br>`sql/migrations/024_company_deletion_rules.sql:53` | Confirmed |
| **SEC-16** | **Info** | Operations | Absence of structured audit logging table and automated migration tracking | `sql/migrations/*`<br>`pages/api/admin/*` | Confirmed |

---

## C. Detailed Findings

### SEC-01: Middleware Omits Role Verification; `/admin/*` and `/dashboard/*` Rely on Client-Side Layout Gates

* **Severity:** High
* **Category:** Authorization & Access Control
* **File & Lines:** [middleware.js:8-9, 46-59](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/middleware.js#L8-L59), [components/AdminLayout.js:45-50, 100-110](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/components/AdminLayout.js#L45-L110)
* **Description:**  
  `middleware.js` acts solely as an authentication gate (`if (!user)`). The code comments explicitly state: `No role checking — that is handled at the page level`. However, none of the pages under `pages/admin/*` or `pages/dashboard/*` implement Next.js server-side guards (`getServerSideProps`). When an authenticated company staff member or tenant owner requests `/admin` or `/admin/companies`, the Next.js server returns HTTP 200 along with the full pre-rendered HTML and client JavaScript bundle for the admin interface. Access is only evaluated on the client inside `AdminLayout.js` during React lifecycle execution.
* **Impact:**  
  An authenticated non-admin user can inspect the full administrative UI bundle, view internal endpoint structures, component state trees, and schema layout. If client-side JavaScript execution is manipulated or disabled, the initial HTML scaffold is exposed.
* **Code Proof:**
  ```javascript
  // middleware.js (lines 7-9, 56-59)
  // Protects /dashboard/*, /platform/*, /admin/*.
  // Unauthenticated requests are redirected to /login.
  // No role checking — that is handled at the page level.
  ...
  if (!user) {
    ...
    return NextResponse.redirect(loginUrl)
  }
  return response // Allows any authenticated user to proceed to /admin/*
  ```
  ```javascript
  // components/AdminLayout.js (lines 45-50, 100-101)
  useEffect(() => {
    if (isLoading || !profileReady) return;
    if (!isAuthenticated) router.replace("/admin/login");
  }, [isLoading, profileReady, isAuthenticated, router]);
  ...
  if (role !== "super_admin") { // Pure client-side check
    return <AccessDeniedScreen />
  }
  ```
* **Conceptual Exploit Scenario:**
  1. An attacker logs in as a legitimate `company_staff` user.
  2. The attacker's browser holds a valid Supabase auth cookie.
  3. The attacker navigates directly to `https://cleanerx.com/admin/companies`.
  4. `middleware.js` validates that `user` is non-null and passes the request through.
  5. The server serves the entire `/admin/companies` JavaScript chunk and HTML markup before client-side hydration mounts `AdminLayout`.
* **Recommended Fix:**  
  Verify user role directly in `middleware.js` or in a server-side authentication utility before serving `/admin/*` pages:
  ```javascript
  // In middleware.js:
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || profile.role !== 'super_admin') {
      return NextResponse.redirect(new URL('/login?reason=forbidden', request.url))
    }
  }
  ```
* **Effort Estimate:** Medium (M)

---

### SEC-02: `SameSite: 'none'` Cookies Paired with Missing CSRF Defenses Expose State-Changing APIs

* **Severity:** High
* **Category:** Authentication & Session Management / CSRF
* **File & Lines:** [lib/supabaseClient.js:32-35](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/lib/supabaseClient.js#L32-L35), [lib/supabaseServerClient.js:14-17](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/lib/supabaseServerClient.js#L14-L17), [pages/api/admin/impersonate.js:80-84](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/api/admin/impersonate.js#L80-L84)
* **Description:**  
  To support development inside Replit cross-origin iframes, session cookies and impersonation cookies are explicitly set with `SameSite: 'none', Secure: true`. In modern browsers, `SameSite: 'none'` causes cookies to be attached to **all** third-party cross-site requests (e.g., cross-origin POST requests initiated from an external domain). None of the state-changing API endpoints in `pages/api/*` (`/api/admin/delete-company`, `/api/admin/reset-company-password`, `/api/booking/adjust-price`, `/api/booking/update-status`, `/api/company/upload-logo`) enforce anti-CSRF tokens or validate the `Origin` / `Referer` headers against the application's domain.
* **Impact:**  
  An attacker can host a malicious webpage that executes a background POST or PATCH request to CleanerX API endpoints. If a logged-in Super Admin or Company Owner visits the malicious page, the browser automatically attaches their authentication cookies, allowing the attacker to delete companies, reset owner passwords, adjust booking prices, or modify statuses without the user's consent.
* **Code Proof:**
  ```javascript
  // lib/supabaseClient.js (lines 32-35)
  cookieOptions: {
    sameSite: 'none',
    secure: true,
  }
  ```
  ```javascript
  // pages/api/admin/delete-company.js (lines 20-31)
  export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405)...
    // No Origin or CSRF token verification!
    const supabase = createSupabaseApiClient(req, res) // Authenticates via cookies automatically sent by browser
    const { data: { user } } = await supabase.auth.getUser()
    ...
  ```
* **Conceptual Exploit Scenario:**
  1. An attacker creates a website containing a hidden JavaScript `fetch()` request targeting `https://cleanerx.com/api/admin/delete-company` with payload `{"companyId": "<target-uuid>"}`.
  2. The attacker entices an authenticated Platform Super Admin to view the page.
  3. The victim's browser sends the cross-origin POST request with `cleanerx` auth cookies attached due to `SameSite: 'none'`.
  4. The CleanerX server validates the cookies, confirms the user is `super_admin`, and executes company deletion.
* **Recommended Fix:**  
  1. In production, change session cookie settings from `sameSite: 'none'` to `sameSite: 'lax'`.
  2. Implement an Origin/Referer check middleware on all state-changing API routes:
  ```javascript
  const origin = req.headers['origin'] || req.headers['referer']
  const allowedHost = process.env.NEXT_PUBLIC_APP_URL // e.g., https://app.cleanerx.com
  if (!origin || !origin.startsWith(allowedHost)) {
    return res.status(403).json({ error: 'CSRF protection: invalid origin' })
  }
  ```
* **Effort Estimate:** Medium (M)

---

### SEC-03: Public Booking and Notification Endpoints Lack Rate Limiting and Anti-Automation

* **Severity:** High
* **Category:** API Input Validation & Abuse / Denial of Service
* **File & Lines:** [pages/api/create-pricing-booking.js:15-35](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/api/create-pricing-booking.js#L15-L35), [pages/api/create-booking.js:26-46](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/api/create-booking.js#L26-L46), [pages/api/booking-notify.js:14-23](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/api/booking-notify.js#L14-L23)
* **Description:**  
  The endpoints responsible for creating customer bookings (`/api/create-pricing-booking` and `/api/create-booking`) and dispatching Twilio WhatsApp messages (`/api/booking-notify`) are unauthenticated by design to allow public customer submissions. However, they lack any form of rate limiting, IP throttling, bot protection (such as Cloudflare Turnstile), or idempotency mechanisms.
* **Impact:**  
  - **Resource Exhaustion / Database Bloat:** An attacker can write a loop submitting tens of thousands of fake bookings per minute, exhausting PostgreSQL storage and IOPS.
  - **Operational Denial of Service:** Tenant scheduling calendars will be overwhelmed with bogus bookings, preventing real customers from booking legitimate slots.
  - **Financial Toll & Telephony Abuse:** `/api/booking-notify` immediately invokes the Twilio REST API to send WhatsApp messages. Repeated calls with valid booking IDs can rapidly consume the company's Twilio credits and trigger carrier-level spam blocking on the company's WhatsApp sender.
* **Code Proof:**
  ```javascript
  // pages/api/booking-notify.js (lines 14-23, 83-93)
  export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405)...
    const { bookingId, companyId } = req.body || {}
    // Zero rate limiting or deduplication check!
    ...
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, ...)
  ```
* **Conceptual Exploit Scenario:**
  1. An attacker submits one valid booking to obtain a valid `bookingId` and `companyId`.
  2. The attacker scripts an HTTP client to POST that payload to `/api/booking-notify` 5,000 times in an automated loop.
  3. The server executes 5,000 requests against Twilio's API.
  4. The company owner's phone receives 5,000 WhatsApp notifications, and the tenant's Twilio balance is depleted.
* **Recommended Fix:**  
  1. Integrate an edge or in-memory rate limiter (e.g. `@upstash/ratelimit` or Redis token bucket) restricting booking submissions to 5 requests per 10 minutes per IP.
  2. Add a notification dispatch flag on the `bookings` row (`whatsapp_notified: boolean DEFAULT false`) so `/api/booking-notify` will only dispatch once per booking.
  3. Require Cloudflare Turnstile on the booking submission form before calling `/api/create-pricing-booking`.
* **Effort Estimate:** Medium (M)

---

### SEC-04: Critical Next.js & Package Vulnerabilities Reported by `npm audit`

* **Severity:** High
* **Category:** Dependencies & Supply Chain
* **File & Lines:** [package.json:26](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/package.json#L26), [package-lock.json](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/package-lock.json)
* **Description:**  
  Running `npm audit` against the project's dependency manifest reveals 5 vulnerabilities (1 Critical, 4 High):
  - **`next` (Critical / High):** Multiple high-severity advisories including GHSA-p293-qw3h-jr36 (Unauthenticated Remote Code Execution on Windows-hosted servers), GHSA-2xp9-vwfh-vxw4 & GHSA-2464-fhr4-w9xw (Image Optimization API RCE), GHSA-cjq9-62q9-8jv4 (SSRF in Image Optimization), and GHSA-4jqv-mc3x-m676 (Cache poisoning).
  - **`postcss` (High):** GHSA-qx2v-qp2m-jg93 (XSS via Unescaped `</style>`) and GHSA-6g55-p6wh-862q (Arbitrary file read via `sourceMappingURL`).
  - **`sharp` (High):** Libvips and librsvg inherited memory vulnerabilities (CVE-2026-33327, CVE-2026-96889).
  - **`nanoid` (High):** Custom generator infinite loop denial of service (GHSA-2v37-7h3g-55p8).
* **Impact:**  
  When deployed on Node.js hosting infrastructure, attackers could exploit Next.js image optimization SSRF or Windows-specific path handling flaws to disclose internal services or trigger denial of service.
* **Code Proof:**
  Output of `npm audit`:
  ```text
  next 9.3.4-canary.0 - 16.4.0
  Severity: critical
  Next.js: Unauthenticated Remote Code Execution on windows-hosted servers - GHSA-p293-qw3h-jr36
  Next.js: Server-Side Request Forgery in Image Optimization - GHSA-cjq9-62q9-8jv4
  5 vulnerabilities (4 high, 1 critical)
  ```
* **Recommended Fix:**  
  Upgrade `next`, `@tailwindcss/postcss`, and related build dependencies to their latest patched releases (`npm update next` or pinned clean upgrade in `package.json`), then verify build stability.
* **Effort Estimate:** Small (S)

---

### SEC-05: Live Supabase Endpoint and Anon Key Committed in `.replit` Configuration

* **Severity:** Medium
* **Category:** Secrets & Configuration
* **File & Lines:** [.replit:49-50](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/.replit#L49-L50)
* **Description:**  
  The `.replit` file contains hardcoded values for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under the `[userenv.shared]` table:
  - `NEXT_PUBLIC_SUPABASE_URL = "https://lopzzzbbhvuolhytzfpt.supabase.co"`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsIn..."`
* **Impact:**  
  While the Supabase `anon` key is designed to be public to client browsers, storing hardcoded project URLs and tokens inside configuration files checked into git repositories permanently exposes the exact Supabase backend project ID and JWT across revision history. If the repo is made public or shared with third parties, the project endpoint is exposed to scanning.
* **Code Proof:**
  ```toml
  # .replit (lines 48-50)
  [userenv.shared]
  NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvcHp6emJiaHZ1b2xoeXR6ZnB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNTk4MzksImV4cCI6MjA5ODczNTgzOX0.xbY_nSfvUwOJJSVS2KHzq7yNJy8aBaCl5innn_bjsh0"
  NEXT_PUBLIC_SUPABASE_URL = "https://lopzzzbbhvuolhytzfpt.supabase.co"
  ```
* **Recommended Fix:**  
  Remove the credentials from `.replit`. Ensure environment variables are loaded exclusively from `.env.local` or hosting provider secret stores (e.g. Vercel / Replit Secrets Manager), and add `.replit` sanitization to `.gitignore` or clean the file.
* **Effort Estimate:** Small (S)

---

### SEC-06: Public Signup Assigns `role = 'company_owner'` via Trigger with Unhardened `search_path`

* **Severity:** Medium
* **Category:** Authentication & Session / Privilege Escalation
* **File & Lines:** [sql/migrations/015_auto_create_user_profile.sql:40-52](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/sql/migrations/015_auto_create_user_profile.sql#L40-L52), [pages/signup.js:20-31](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/signup.js#L20-L31)
* **Description:**  
  When an anonymous user completes the form on `pages/signup.js`, Supabase Auth fires the `on_auth_user_created` trigger executing `handle_new_auth_user()`. This function automatically creates a row in `public.users` with `role = 'company_owner'`.
  Although `company_id` is initialized to `NULL`, the user is granted the `company_owner` role rather than a restricted role like `customer` or `unassigned`.
  Additionally, the `SECURITY DEFINER` function declares `SET search_path = public` instead of `SET search_path = ''`.
* **Impact:**  
  Self-registered public users immediately obtain the `company_owner` role. Functions checking `is_company_admin()` evaluate to `true` (`role IN ('company_owner', 'super_admin')`). If any RLS policy or API route checks `is_company_admin()` without enforcing an explicit `company_id IS NOT NULL` check, self-registered users may gain unauthorized administrative access.
* **Code Proof:**
  ```sql
  -- sql/migrations/015_auto_create_user_profile.sql (lines 40-52)
  CREATE OR REPLACE FUNCTION handle_new_auth_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  BEGIN
    INSERT INTO public.users (id, email, full_name, role, is_active)
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data ->> 'full_name',
      'company_owner', -- Grants owner role to any unauthenticated signup!
      true
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END;
  $$;
  ```
* **Recommended Fix:**  
  Assign a default role of `'unassigned'` or `'customer'` upon public signup. Reserve the `'company_owner'` role for users provisioned by Super Admins through `/api/admin/create-company`:
  ```sql
  CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    INSERT INTO public.users (id, email, full_name, role, is_active)
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data ->> 'full_name',
      'unassigned',
      true
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END;
  $$;
  ```
* **Effort Estimate:** Small (S)

---

### SEC-07: Missing Security Headers (CSP, X-Frame-Options, HSTS) & Unsafe Dev Origins in `next.config.js`

* **Severity:** Medium
* **Category:** Secrets & Configuration / Clickjacking / Browser Security
* **File & Lines:** [next.config.js:5-12](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/next.config.js#L5-L12)
* **Description:**  
  `next.config.js` contains no security header directives. It omits:
  - `Content-Security-Policy` (CSP)
  - `X-Frame-Options` or `frame-ancestors`
  - `X-Content-Type-Options: nosniff`
  - `Strict-Transport-Security` (HSTS)
  - `Referrer-Policy`
  - `Permissions-Policy`  
  Additionally, line 5 specifies `allowedDevOrigins: ["*.replit.dev", "*.pike.replit.dev", ...]`.
* **Impact:**  
  Because `X-Frame-Options` and `frame-ancestors` are missing, and because session cookies use `SameSite: 'none'`, any malicious website can embed the CleanerX Admin or Company Dashboard inside a transparent `<iframe>` and conduct **Clickjacking** attacks, tricking an authenticated manager into clicking critical action buttons.
* **Code Proof:**
  ```javascript
  // next.config.js
  const nextConfig = {
    reactStrictMode: true,
    devIndicators: false,
    allowedDevOrigins: ["*.replit.dev", "*.pike.replit.dev", "*.riker.replit.dev", "*.sisko.replit.dev", "*.janeway.replit.dev", "*.kirk.replit.dev", "127.0.0.1"],
    turbopack: {},
  };
  export default nextConfig;
  ```
* **Recommended Fix:**  
  Define standard production security headers in `next.config.js`:
  ```javascript
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  }
  ```
* **Effort Estimate:** Small (S)

---

### SEC-08: Subscription Plan Feature Gating is Defined in Context but Completely Unenforced

* **Severity:** Medium
* **Category:** Reliability & Business Logic
* **File & Lines:** [contexts/TenantContext.js:78-79, 101-102](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/contexts/TenantContext.js#L78-L102), [pages/dashboard/services.js:57](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/dashboard/services.js#L57), [pages/dashboard/pricing.js:80](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/dashboard/pricing.js#L80)
* **Description:**  
  `TenantContext.js` provides feature gating logic:
  ```javascript
  const planFeatures = subscription?.features ?? {}
  const hasFeature = (key) => planFeatures[key] === true
  ```
  However, an audit of the entire codebase confirms that `hasFeature()` is **never called anywhere** in `pages/dashboard/*`, `components/*`, or any server-side API route.
* **Impact:**  
  Companies that are on free tiers, or whose paid subscriptions have expired or been suspended, retain unrestricted access to premium platform capabilities (e.g. editing complex pricing rules, uploading custom branding, modifying service configurations). Plan tier enforcement exists only in documentation and database schema, not in runtime enforcement.
* **Code Proof:**
  Searching the entire codebase for `hasFeature(` returns 0 occurrences across all operational views.
* **Recommended Fix:**  
  Implement feature checks in `pages/dashboard/*` and wrap sensitive mutation endpoints (`/api/company/upload-logo`, `/api/booking/generate-invoice`) with subscription verification checks.
* **Effort Estimate:** Medium (M)

---

### SEC-09: `TenantContext` Does Not Integrate with `ImpersonationContext`, Breaking Super Admin Impersonation

* **Severity:** Medium
* **Category:** Reliability & Business Logic
* **File & Lines:** [contexts/TenantContext.js:63-72](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/contexts/TenantContext.js#L63-L72), [contexts/ImpersonationContext.js:8-11](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/contexts/ImpersonationContext.js#L8-L11)
* **Description:**  
  The documentation in `ImpersonationContext.js` notes:
  `Consumers: - TenantContext: use the impersonated companyId instead of the auth companyId`.
  However, `TenantContext.js` does not import `useImpersonation`. Instead, lines 65-70 state:
  ```javascript
  if (!isAuthenticated || role === 'super_admin') {
    setCompany(null)
    setSettings(null)
    setIsLoading(false)
    return
  }
  ```
* **Impact:**  
  When a Super Admin initiates an impersonation session from `/admin/companies` and is redirected to `/dashboard`, `TenantContext` detects `role === 'super_admin'` and wipes `company` and `settings` to `null`. As a result, the dashboard views (`/dashboard/services`, `/dashboard/pricing`, `/dashboard/bookings`) fail to load tenant data, rendering "No company linked" error states for the admin.
* **Code Proof:**
  ```javascript
  // contexts/TenantContext.js (lines 63-72)
  useEffect(() => {
    // super_admin is platform-wide and has no single tenant context.
    if (!isAuthenticated || role === 'super_admin') {
      setCompany(null)
      setSettings(null)
      setIsLoading(false)
      return // Impersonation session cookie is completely ignored!
    }
    loadCompany(companyId)
  }, [isAuthenticated, role, companyId, loadCompany])
  ```
* **Recommended Fix:**  
  Consume `useImpersonation` within `TenantContext` to resolve the target company ID when `isImpersonating` is active:
  ```javascript
  const { isImpersonating, impersonatedCompanyId } = useImpersonation()
  const effectiveCompanyId = (role === 'super_admin' && isImpersonating) 
    ? impersonatedCompanyId 
    : companyId
  ```
* **Effort Estimate:** Small (S)

---

### SEC-10: Internal PostgreSQL Error Messages Returned to Clients in Administrative API Responses

* **Severity:** Medium
* **Category:** Information Disclosure & Error Handling
* **File & Lines:** [pages/api/admin/create-company.js:93, 125, 162, 187, 223, 260](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/api/admin/create-company.js#L93), [pages/api/admin/delete-company.js:100](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/api/admin/delete-company.js#L100), [pages/api/company/upload-logo.js:188](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/api/company/upload-logo.js#L188)
* **Description:**  
  When database queries encounter errors during company provisioning, company deletion, or logo uploads, the API routes directly return raw Supabase/PostgreSQL error messages in the HTTP 500 JSON response:
  ```javascript
  return res.status(500).json({
    success: false,
    error: `Failed to create company: ${insertError.message}`,
  })
  ```
* **Impact:**  
  Internal PostgreSQL table names, foreign key constraint names, column types, and database error states are leaked to API callers. This aids attackers in footprinting the database schema and identifying potential constraint violations.
* **Recommended Fix:**  
  Log detailed database errors to server-side telemetry, but return standardized, generic error messages to the client.
* **Effort Estimate:** Small (S)

---

### SEC-11: Company Slugs Lack Character Whitelisting and Reserved Word Collision Checks

* **Severity:** Low
* **Category:** API Input Validation & Business Logic
* **File & Lines:** [pages/api/admin/create-company.js:66-68](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/api/admin/create-company.js#L66-L68), [pages/admin/companies.js:302](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/admin/companies.js#L302)
* **Description:**  
  When creating or editing a company, the slug input is validated only as a non-empty string (`!slug || typeof slug !== 'string' || !slug.trim()`). There is no regular expression validation enforcing lowercase alphanumeric characters and hyphens (`^[a-z0-9-]+$`), nor is there any check against reserved application paths (`admin`, `dashboard`, `api`, `login`, `signup`, `book-service`, `auth`, `public`).
* **Impact:**  
  A company registered with a slug such as `admin` or `api` or containing characters like `/`, `?`, or spaces will break public routing for `/company/[slug]` and `/company/[slug]/book`, potentially causing routing ambiguities or client 404 errors.
* **Recommended Fix:**  
  Add strict slug validation against reserved names and format:
  ```javascript
  const RESERVED_SLUGS = ['admin', 'dashboard', 'api', 'login', 'signup', 'book-service', 'settings', 'auth']
  const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  if (!SLUG_REGEX.test(slug) || RESERVED_SLUGS.includes(slug.toLowerCase())) {
    return res.status(400).json({ error: 'Invalid or reserved company slug.' })
  }
  ```
* **Effort Estimate:** Small (S)

---

### SEC-12: PII Logged to Consoles; Customer Data Transmitted to WhatsApp Without Consent Banner

* **Severity:** Low
* **Category:** Privacy & Data Protection
* **File & Lines:** [middleware.js:42-44](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/middleware.js#L42-L44), [contexts/AuthContext.js:47, 90](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/contexts/AuthContext.js#L47), [pages/api/booking-notify.js:63-70](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/api/booking-notify.js#L63-L70), [pages/book-service.js](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/book-service.js), [pages/company/[slug]/book.js](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/company/[slug]/book.js)
* **Description:**  
  1. **PII Logging:** `middleware.js` logs user UUIDs on every HTTP request. `AuthContext.js` logs user emails and UUIDs to the browser developer console on every auth state change.
  2. **Third-Party Data Sharing Without Notice:** When a customer completes a booking, their full name, phone number, physical address, and service details are packaged into an unencrypted WhatsApp message sent via Twilio (`pages/api/booking-notify.js`). Neither `pages/book-service.js` nor `pages/company/[slug]/book.js` contains a Privacy Policy link, Terms of Service link, or consent checkbox informing customers of this data transmission.
* **Impact:**  
  Violates standard privacy compliance frameworks (GDPR, CCPA, local data protection regulations) regarding user notification and consent prior to transmitting personally identifiable information to third-party telecommunications providers.
* **Recommended Fix:**  
  - Remove debug `console.log` statements outputting emails and user IDs.
  - Add a clear consent notice and Privacy Policy link below the submit button on the booking form.
* **Effort Estimate:** Small (S)

---

### SEC-13: Legacy PascalCase `schema.sql` Tables Contain Unrestricted Public INSERT Policies

* **Severity:** Low
* **Category:** Database & RLS
* **File & Lines:** [sql/schema.sql:120-123](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/sql/schema.sql#L120-L123), [sql/schema.sql:81-83](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/sql/schema.sql#L81-L83)
* **Description:**  
  `sql/schema.sql` defines early PascalCase tables (`"Companies"`, `"Users"`, `"Bookings"`, `"Services"`). On table `"Users"`, lines 120-122 specify:
  ```sql
  create policy "Service role can insert users" on "Users" for insert with check (true);
  ```
  Because the policy does not restrict the target role to `service_role` (e.g. `TO service_role`), it defaults to `PUBLIC`. Any anonymous user can directly insert rows into `"Users"` via PostgREST.
* **Impact:**  
  If `schema.sql` was executed on the live Supabase instance alongside modern migrations, the `"Users"` table allows unauthenticated row insertion. While the active application now utilizes lowercase `users` (hardened by Migration 025), leaving vulnerable legacy schemas in the database or repo creates residual risk.
* **Recommended Fix:**  
  Safely drop the legacy PascalCase tables (`DROP TABLE IF EXISTS "Users", "Companies", "Bookings", "Services", "AuthInvites" CASCADE;`) or apply strict RLS blocking public access.
* **Effort Estimate:** Small (S)

---

### SEC-14: Missing `super_admin` SELECT Policy on `invoices` Table Prevents PostgREST Oversight

* **Severity:** Low
* **Category:** Database & RLS
* **File & Lines:** [sql/migrations/021_invoices.sql:50-63](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/sql/migrations/021_invoices.sql#L50-L63)
* **Description:**  
  Migration 021 defines RLS on the `invoices` table:
  ```sql
  CREATE POLICY "invoices_select_company" ON invoices FOR SELECT
    USING (company_id = auth_company_id());
  ```
  There is no corresponding policy for `is_super_admin()`. Because `super_admin` accounts have `company_id = NULL`, any direct PostgREST SELECT query executed by an authenticated super admin returns 0 invoice rows.
* **Impact:**  
  Platform Super Admins cannot audit or view company invoices via authenticated Supabase client queries. While backend routes like `/api/booking/generate-invoice` bypass this via `supabaseAdmin`, any future direct client queries will fail silently.
* **Recommended Fix:**  
  Add `is_super_admin()` to the invoice SELECT policy:
  ```sql
  CREATE POLICY "invoices_select_super_admin" ON invoices FOR SELECT
    USING (is_super_admin());
  ```
* **Effort Estimate:** Small (S)

---

### SEC-15: Multiple `SECURITY DEFINER` Database Functions Use Mutable `SET search_path = public`

* **Severity:** Low
* **Category:** Database & RLS
* **File & Lines:** [sql/functions/auth_helpers.sql:15, 29, 44](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/sql/functions/auth_helpers.sql#L15), [sql/migrations/014_company_service_settings.sql:71, 96](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/sql/migrations/014_company_service_settings.sql#L71), [sql/migrations/024_company_deletion_rules.sql:53](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/sql/migrations/024_company_deletion_rules.sql#L53)
* **Description:**  
  Functions `auth_company_id()`, `is_super_admin()`, `is_company_admin()`, `seed_company_default_service_settings()`, and `admin_delete_company()` declare `SECURITY DEFINER` with `SET search_path = public`.
* **Impact:**  
  PostgreSQL security advisories strongly recommend `SET search_path = ''` (empty search path) for `SECURITY DEFINER` functions with fully schema-qualified object references (e.g. `public.users`). Setting `search_path = public` creates a potential object shadowing vulnerability if a schema-level injection occurs.
* **Recommended Fix:**  
  Update all helper and migration functions to use `SET search_path = ''` and fully qualify all table and function references (as was done for `protect_super_admin_role` in Migration 025).
* **Effort Estimate:** Small (S)

---

### SEC-16: Absence of Structured Audit Logging Table and Automated Migration Tracking

* **Severity:** Info
* **Category:** Operations & Reliability
* **File & Lines:** [sql/migrations/*](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/sql/migrations), [pages/api/admin/*](file:///c:/Users/Tayyab/Desktop/Cleaerx_saas-project-main/Cleaerx_saas-project-main/pages/api/admin)
* **Description:**  
  - High-privilege actions (Super Admin password resets, company deletions, tenant impersonation sessions) create no persistent audit log records in the database.
  - The repository relies on manual copy-pasting of SQL scripts into the Supabase Dashboard SQL Editor rather than an automated, version-controlled migration pipeline (e.g. Supabase CLI / Prisma / Drizzle).
* **Impact:**  
  In the event of an account takeover or unauthorized tenant deletion, security forensic investigation is impaired. Manual migrations introduce risk of schema drift across environments.
* **Recommended Fix:**  
  Create an `audit_logs` table and adopt the Supabase CLI (`supabase db push`) for automated schema tracking.
* **Effort Estimate:** Medium (M)

---

## D. API Route Security Inventory Table

| Route | HTTP Method | Auth Required? | Role Enforced Server-Side? | Input Validation | Identified Security Issues |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/admin/create-company` | POST | Yes (Cookie) | Yes (`super_admin`) | Yes (name, slug, email) | CSRF vulnerable (`SameSite: 'none'`); DB errors leaked to client; Unsanitized slug |
| `/api/admin/delete-company` | POST | Yes (Cookie) | Yes (`super_admin`) | Yes (`companyId`) | CSRF vulnerable; Destructive action has no persistent audit trail |
| `/api/admin/impersonate` | POST | Yes (Cookie) | Yes (`super_admin`) | Yes (`companyId`) | CSRF vulnerable; Cookie uses `SameSite: 'none'` |
| `/api/admin/impersonate/status` | GET | Yes (Cookie) | Yes (`super_admin`) | N/A | None (Read-only status check) |
| `/api/admin/impersonate/exit` | POST | Yes (Cookie) | Partial (Clears cookie) | N/A | CSRF could force premature exit of admin session |
| `/api/admin/reset-company-password` | POST | Yes (Cookie) | Yes (`super_admin`) | Yes (`companyId`) | CSRF vulnerable; Leaks DB error messages |
| `/api/booking/adjust-price` | PATCH | Yes (Cookie) | Yes (`company_owner` of tenant) | Yes (positive number, `<= est`) | CSRF vulnerable (`SameSite: 'none'`) |
| `/api/booking/generate-invoice` | POST | Yes (Cookie) | Yes (`company_owner` of tenant) | Yes (`bookingId`) | CSRF vulnerable; PDF generated in memory |
| `/api/booking/update-status` | PATCH | Yes (Cookie) | Yes (`owner` / `staff` scoped) | Yes (state machine transition) | CSRF vulnerable (`SameSite: 'none'`) |
| `/api/company/upload-logo` | POST | Yes (Cookie) | Yes (`owner` / `super_admin`) | Yes (2MB, MIME, Magic Bytes) | CSRF vulnerable (`SameSite: 'none'`) |
| `/api/company-booking-info` | GET | No (Public) | None | Yes (`slug`) | No rate limit (Enumeration of company branding) |
| `/api/company-pricing` | GET | No (Public) | None | Yes (`slug`) | No rate limit (Enumeration of pricing rules) |
| `/api/create-booking` | POST | No (Public) | None | Partial | **No rate limit / CAPTCHA**; Spam / Denial of service vector |
| `/api/create-pricing-booking` | POST | No (Public) | None | Yes (recomputed total) | **No rate limit / CAPTCHA**; Spam / Calendar pollution |
| `/api/booking-notify` | POST | No (Public) | None | Yes (`bookingId`, `companyId`) | **No rate limit**; Twilio SMS/WhatsApp financial toll & spam vector |

---

## E. Database Tables & Row-Level Security (RLS) Review

| Table Name | RLS Enabled? | RLS Forced? | Existing Policies | Assessment & Gaps |
| :--- | :---: | :---: | :--- | :--- |
| `companies` | **Yes** | No | `super_admin_all_companies` (ALL)<br>`company_users_select_own` (SELECT) | **Secure.** Tenant isolation enforced. No tenant write policy. |
| `company_settings` | **Yes** | No | `super_admin_all_settings` (ALL)<br>`company_owner_manage_settings` (ALL) | **Secure.** Scoped to `auth_company_id()` + `is_company_admin()`. |
| `users` | **Yes** | No | `super_admin_all_users` (ALL)<br>`company_owner_select_users` (SELECT)<br>`company_owner_insert_users` (INSERT staff)<br>`company_owner_update_staff` (UPDATE staff)<br>`company_owner_update_self` (UPDATE self)<br>`company_owner_delete_users` (DELETE staff)<br>`staff_select_own_row` (SELECT self) | **Hardened via Migration 025.** `protect_super_admin_role()` trigger prevents role tampering and unauthorized admin creation. |
| `user_invites` | **Yes** | No | `super_admin_all_invites` (ALL)<br>`company_owner_manage_invites` (ALL) | **Secure.** Scoped to tenant owner. |
| `service_categories` | **Yes** | No | `super_admin_all_categories`<br>`company_users_manage_cats` | **Secure.** Scoped to `company_id = auth_company_id()`. |
| `services` | **Yes** | No | `super_admin_all_services`<br>`company_users_manage_services` | **Secure.** Scoped to `company_id = auth_company_id()`. |
| `service_pricing` | **Yes** | No | `super_admin_all_pricing`<br>`company_owner_manage_pricing` | **Secure.** Tenant owner only. |
| `service_discounts` | **Yes** | No | `super_admin_all_discounts`<br>`company_owner_discounts` | **Secure.** Tenant owner only. |
| `bookings` | **Yes** | **Yes (025)** | `super_admin_all_bookings`<br>`company_users_manage_bookings` | **Hardened via Migration 025.** Anon INSERT dropped and revoked. Service role API route is sole entry point. |
| `booking_items` | **Yes** | **Yes (025)** | `super_admin_all_booking_items`<br>`company_users_manage_booking_items` | **Hardened via Migration 025.** Anon INSERT dropped and revoked. |
| `booking_status_history` | **Yes** | No | `super_admin_all_history`<br>`company_users_read_history`<br>`company_users_append_history` | **Secure.** Append-only by design; no non-admin UPDATE/DELETE. |
| `subscription_plans` | **Yes** | No | `super_admin_all_plans`<br>`anyone_read_active_plans` | **Secure.** Public read of active plans is expected for pricing page. |
| `company_subscriptions`| **Yes** | No | `super_admin_all_subscriptions`<br>`company_owner_read_subscription` | **Secure.** Read-only for tenant owners. |
| `theme_templates` | **Yes** | No | `super_admin_all_templates`<br>`authenticated_read_theme_templates`| **Secure.** Requires authentication; no anon read. |
| `company_themes` | **Yes** | No | `super_admin_all_company_themes`<br>`company_owner_manage_theme` | **Secure.** Scoped to tenant owner. |
| `analytics_daily` | **Yes** | No | `super_admin_all_analytics`<br>`company_users_read_analytics` | **Secure.** Read-only for tenants; written via database triggers. |
| `company_pricing_rules`| **Yes** | No | `super_admin_all_rules`<br>`company_owner_manage_rules` | **Secure.** Scoped to tenant owner. |
| `company_service_settings`| **Yes** | No | `css_super_admin_all`<br>`css_company_admin_manage` | **Secure.** Scoped to tenant owner. |
| `invoices` | **Yes** | No | `invoices_select_company` (SELECT) | **Minor Gap (SEC-14).** Missing `super_admin` SELECT policy. |
| Legacy `"Bookings"` | **Yes** | **Yes (025)** | `super_admin_all_legacy_bookings`<br>`company_users_manage_legacy_bookings`| **Hardened via Migration 025.** Anon insert dropped and revoked. |
| Legacy `"Users"` | **Yes** | No | `"Service role can insert users"` (`WITH CHECK (true)`) | **Vulnerability in `schema.sql` (SEC-13).** Unconstrained public insert. |
| Legacy `"Companies"` | **Yes** | No | `"Admins can manage companies"` | Secure under legacy `is_admin()`. |

---

## F. Privacy & Data Protection Compliance Notes

1. **Personally Identifiable Information (PII) Inventory:**
   - **Customer Records:** `customer_name`, `customer_phone`, `property_address`, service summary details.
   - **Company / Staff Records:** `email`, `full_name`, `phone`, `whatsapp_number`, `last_login_at`.
2. **Third-Party Data Flow:**
   - On booking submission, `pages/api/booking-notify.js` constructs an unencrypted payload containing the customer's full name, phone number, and physical cleaning address, and transmits it via HTTP Basic Auth to Twilio's US-hosted REST API (`api.twilio.com`) for WhatsApp delivery.
3. **Privacy Compliance Gaps:**
   - **No Consent or Privacy Notice:** The booking form does not include any checkbox or statement indicating that customer contact data and service locations will be transmitted to WhatsApp/Twilio.
   - **No Data Retention Policy:** Bookings and customer phone numbers remain indefinitely in PostgreSQL tables without an automated retention or anonymization lifecycle.
   - **Console Leaks:** User emails and UUIDs are output via client-side `console.log` statements in `contexts/AuthContext.js`.

---

## G. Prioritized Remediation Roadmap

```
+-------------------------------------------------------------------------------+
|                               REMEDIATION ROADMAP                             |
+-------------------------------------------------------------------------------+
|  PHASE 1: FIX TODAY (Critical & High - Blockers for Production Launch)         |
|  - Switch session cookies from `sameSite: 'none'` to `sameSite: 'lax'`.       |
|  - Implement Origin/Referer header verification on all `pages/api/*` routes.  |
|  - Add server-side role verification in `middleware.js` for `/admin/*`.       |
|  - Apply Next.js & package updates (`npm update next`) to patch RCE/SSRF.     |
|  - Purge hardcoded Supabase project URL and anon JWT from `.replit`.          |
+-------------------------------------------------------------------------------+
|  PHASE 2: FIX THIS WEEK (High & Medium - Robustness & Abuse Prevention)       |
|  - Implement IP rate limiting on `/api/create-pricing-booking` & notify.     |
|  - Add `whatsapp_notified` column on `bookings` to prevent Twilio spam loops. |
|  - Enforce Cloudflare Turnstile on public customer booking submission forms.  |
|  - Connect `ImpersonationContext` into `TenantContext` to fix Admin View.     |
|  - Add security headers (CSP, X-Frame-Options, HSTS) to `next.config.js`.     |
|  - Sanitize company slugs with regex `^[a-z0-9-]+$` and block reserved words. |
+-------------------------------------------------------------------------------+
|  PHASE 3: FIX BEFORE SCALING (Low & Operational - Long-Term Health)           |
|  - Change `handle_new_auth_user()` default signup role to `'unassigned'`.     |
|  - Drop or lock down legacy PascalCase tables (`"Users"`, `"Companies"`).     |
|  - Add `is_super_admin()` SELECT policy to `invoices` table.                  |
|  - Add customer privacy consent banner on public booking pages.               |
|  - Create persistent `audit_logs` table for administrative tracking.          |
+-------------------------------------------------------------------------------+
```

---

## H. Positive Findings: Things That Are Already Done Well

1. **Authoritative Server-Side Pricing Recalculation:**  
   Unlike many SaaS platforms that accept client-calculated pricing, `pages/api/create-pricing-booking.js` and `pages/api/create-booking.js` ignore all client-supplied amounts. The server fetches active company pricing rules from the database and recalculates the line items and total authoritatively.
2. **Defensive Logo Upload Validation (LU-01):**  
   `pages/api/company/upload-logo.js` strictly prohibits SVG uploads (preventing stored XSS), inspects raw binary magic bytes for PNG, JPEG, and WEBP signatures, validates internal chunk dimensions, rejects polyglot script payloads, enforces a 2MB limit, and isolates uploads by company ID without path traversal risks.
3. **Hardened Super Admin Role Trigger (Migration 025):**  
   `protect_super_admin_role()` in Migration 025 uses `session_user` to differentiate direct DBA sessions from PostgREST API calls, blocks ordinary `service_role` backend requests from granting `super_admin`, properly returns `OLD` on DELETE triggers, and prevents tenant owners from escalating privileges.
4. **Tenant Isolation on Bookings & Invoicing APIs:**  
   Endpoints such as `/api/booking/adjust-price`, `/api/booking/update-status`, and `/api/booking/generate-invoice` rigorously verify that the requesting user's `company_id` matches the target booking's `company_id`, effectively preventing horizontal Insecure Direct Object References (IDOR).
5. **No Service Role Client Leakage in Client Bundles:**  
   `lib/supabaseAdminClient.js` is imported exclusively within server-side `pages/api/*` files and is never included in browser client bundles or public components.
