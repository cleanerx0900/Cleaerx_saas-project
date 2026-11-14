# CleanerX — Figma UI Design Prompt (Copy-Paste Ready)

Design a complete, modern, user-friendly UI for **CleanerX**, a multi-tenant SaaS cleaning-services booking platform. The UI must match ONLY the pages and features listed below — nothing extra, nothing missing.

---

## 1. BRAND / COLOR SYSTEM (exact hex, taken from the official logo)
- **Primary Blue:** #0071BD — main buttons, headers, active states, icons
- **Accent Cyan (glow):** #38B6FF — highlights, gradients, hover states, chart accents, glowing edges
- **Text Black:** #111111 — body text, headings
- **Neutral Gray:** #6B7280 — secondary text, labels
- **Background:** #F7F9FC (very light blue-gray) for app backgrounds, #FFFFFF for cards
- **Status colors:** Pending = amber #EAB308, Confirmed = green #22C55E, In Progress = blue #3B82F6, Completed = teal #15803D, Cancelled = red #EF4444
- **Style direction:** Clean, modern SaaS look — soft rounded corners (12–16px), soft drop shadows on cards, subtle cyan glow accents on primary buttons/active nav items (echoing the glowing "X" in the logo), plenty of white space, sans-serif font (Inter / Poppins style).
- Use the CleanerX logo (blue "Cleaner" + glowing cyan "X") in the top-left of every layout header/sidebar.

---

## 2. GLOBAL COMPONENTS TO DESIGN ONCE, REUSE EVERYWHERE
- Sidebar navigation (2 versions: Super Admin Sidebar, Company Dashboard Sidebar) — logo on top, nav items with icons, active item highlighted in Primary Blue with cyan glow, collapsible on mobile.
- Top header bar — page title, search bar (where relevant), notification bell, user avatar + dropdown (Profile / Logout).
- Stat card component — icon, label, big number, colored left border (used on both dashboards).
- Data table component — search input, filter dropdowns, status pill badges, row actions (view/edit/delete icons), pagination.
- Modal component — for "View Booking" and "Edit Booking/Customer/Staff" forms.
- Toast/notification component — success (green) and error (red) small floating alerts.
- Empty state component — icon + short text for "No bookings yet" type screens.
- Buttons: Primary (solid blue, cyan glow on hover), Secondary (outline blue), Danger (red), Icon buttons.

---

## 3. AUTH / PUBLIC SCREENS

### 3.1 Login Page (Company Owner/Staff) — `/login`
Centered card on a Primary Blue full-bleed background. CleanerX logo on top. Fields: Email, Password (with show/hide eye icon). "Forgot Password?" link. Primary button "Log In". Link to Signup at bottom.

### 3.2 Signup Page — `/signup`
Same centered-card layout. Fields: Full Name, Email, Password. Primary button "Create Account".

### 3.3 Forgot Password — `/forgot-password`
Centered card, single Email field, "Send Reset Link" button, back-to-login link.

### 3.4 Reset Password — `/reset-password`
Centered card, New Password + Confirm Password fields, "Reset Password" button.

### 3.5 Change Password (forced) — `/change-password`
Centered card, message "You must change your password before continuing," New Password + Confirm fields.

### 3.6 Super Admin Login — `/admin/login`
Same style as Login Page but labeled "Admin Login" / "Platform Administrators Only" — distinguish subtly (e.g. small badge or darker navy variant) so it's visually recognizable as the platform-level login, not a company login.

---

## 4. CUSTOMER-FACING PUBLIC PAGES

### 4.1 Company Public Profile — `/company/[slug]`
Hero section with the COMPANY's own logo (dynamic placeholder) and the company's own theme color (not fixed to CleanerX blue — design it so the color is a swappable variable). Tagline, short "About" text, WhatsApp contact button, phone button. Below: grid of 8 service cards (icon + name + "Starting at ₨ ___") linking to the booking page. Footer with company contact info.

### 4.2 Customer Booking Form — `/company/[slug]/book` and `/book-service`
**IMPORTANT: Do NOT redesign or change the layout/structure of this form — it already exists and works. Only re-skin its colors to the CleanerX/company theme, and replace only the SERVICE ICONS with ones matching each real service below. Keep all existing sections, quantity selectors, real-time bill calculation panel, and WhatsApp/contact display exactly as they are structurally.**

The 8 service sections and the icon each one needs (service-accurate, not generic):
1. **Sofa Cleaning** — icon: a sofa/couch icon
2. **Foam Chair Cleaning** — icon: a single armchair/office-chair icon
3. **Carpet Cleaning** — icon: a rolled or textured rug/carpet icon
4. **Mattress Cleaning** — icon: a bed/mattress icon
5. **Curtain Cleaning** — icon: a curtain/drape window icon
6. **Water Tank Cleaning** — icon: a water tank/drum icon
7. **Regular Home Cleaning** — icon: a broom or spray-bottle icon
8. **Deep Home Cleaning** — icon: a sparkle/shine or deep-clean (bubbles) icon

Each section: icon + title + short description + quantity/tier selector + live subtotal, matching what already exists — just themed in CleanerX blue/cyan with clean card styling, and a running total bill summary panel (sticky on desktop, bottom sheet on mobile).

---

## 5. SUPER ADMIN PANEL (`/admin/*`) — Sidebar items: Dashboard, Companies, Customers, Services, Staff, Bookings, Settings

### 5.1 Admin Dashboard — `/admin`
4 stat cards in a row: Total Bookings, Pending, Confirmed, Completed (each with icon + colored left border). Below: "Recent Bookings" table (Service, Date, Status columns, status pill badges).

### 5.2 Companies (Tenants) — `/admin/companies`
Table of all companies: Name, Owner, Email, Plan, Status (active/inactive badge), Color swatch, Actions (Edit / Reset Password / Delete). "+ Add Company" button opens a form modal with fields: Company Name, Slug, Owner Name, Owner Email, WhatsApp Number, Phone, Subscription Plan (dropdown), Status, Primary Color (color picker), Timezone (dropdown), Currency (dropdown), Logo Upload. After creating, show a "Credentials Generated" card with Login URL, Email, Temp Password + Copy button.

### 5.3 Customers — `/admin/customers`
Table across all companies: Name, Phone, Email, Active/Inactive badge, Booking count. Search bar + Active/Inactive filter dropdown. Edit modal (Name, Phone, Email).

### 5.4 Services — `/admin/services`
8 rows/cards, one per service category (icon + title + description) with an ON/OFF toggle switch per row.

### 5.5 Staff — `/admin/staff`
Table/card grid: Avatar (initials, colored circle), Name, Email, Role badge (Admin=purple, Owner=blue, Staff=gray), Company name, Active/Inactive badge. Filters: search, role dropdown, status dropdown.

### 5.6 Bookings — `/admin/bookings`
Full table: Booking ID (short), Customer Name, Phone, Service, Date, Total Price, Status pill (5 states: Pending/Confirmed/In Progress/Completed/Cancelled — use the exact status colors above). Search + status filter. Row click → "View Booking" modal (full read-only detail) and an "Edit" modal (editable fields: customer info, service, date, status dropdown, price, notes).

### 5.7 Settings — `/admin/settings`
Simple placeholder page: card with heading "Settings" and a short description text (future features notice) — keep it minimal.

---

## 6. COMPANY DASHBOARD (`/dashboard/*`) — Sidebar items: Dashboard, Bookings, Company Profile, Contact, Pricing, Services

### 6.1 Dashboard — `/dashboard`
Greeting header ("Good morning, [Company Name]") with company logo/initials avatar, today's date. A prominent card: "Your Public Booking Link" with the shareable URL + "Copy Link" button. Quick stat cards (Total Bookings, Pending, etc., same style as admin). Use the COMPANY's own theme color as accent (dynamic, not fixed).

### 6.2 Bookings — `/dashboard/bookings`
Same table style as Admin Bookings but scoped only to this company: Customer Name, Phone, Address, Date, Total, Currency, Status pill, and expandable rows showing booking items (service name, qty, unit price).

### 6.3 Company Profile — `/dashboard/company-profile`
Tabbed interface with 5 tabs (icon + label each):
- 🎨 **Branding** — logo upload/crop tool, primary/secondary/accent color pickers with live preview, auto color-extraction from logo
- 🏢 **Company Information** — Name, Slug, Description fields
- ☎️ **Contact Information** — WhatsApp Number, Phone
- ⏱️ **Business Settings** — working days (Mon–Sun toggle chips), working hours, timezone, currency
- 🔒 **Security** — Change Password fields

### 6.4 Contact — `/dashboard/contact`
Simple form card: WhatsApp Number, Phone fields, "Save" button, note that this is what shows on the public booking page.

### 6.5 Pricing — `/dashboard/pricing`
8 collapsible sections (one per service category, same icons as booking form), each showing an editable rate table: Standard Rate, Bulk Rate, Bulk Threshold (for tiered ones), or a room × house-size grid (Bedroom, Lounge, Kitchen, Washroom, Garage, Staircase, Store Room × Small/Large House) for Regular & Deep Home Cleaning sections.

### 6.5 Services — `/dashboard/services`
Same layout as Admin Services (8 rows/cards with icon + ON/OFF toggle) — scoped to this company only.

---

## 7. GENERAL RULES FOR THE FIGMA UI (apply everywhere)
- Only include screens/features listed above — no extra pages, no placeholder features not mentioned.
- Every icon must match its real-world function (booking icons = actual furniture/cleaning items, not generic shapes).
- Use dashboard stat-cards with icons on both Admin Dashboard and Company Dashboard — make them visually attractive with subtle cyan glow/shadow.
- Keep customer Booking Form's structure/layout untouched — only re-theme colors and update the 8 service icons.
- Mobile-responsive versions for: Login, Company Public Page, Booking Form, and both Dashboards (sidebar collapses to bottom nav or hamburger menu).
- Consistent 8px spacing grid, consistent corner radius (12px cards, 8px buttons/inputs), consistent status-pill style across Admin and Company Bookings tables.