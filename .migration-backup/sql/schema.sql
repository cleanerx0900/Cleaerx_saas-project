-- ============================================================
-- CleanerX SaaS — Full Database Schema
-- Run this once in Supabase: Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Companies
create table if not exists "Companies" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  contact text,
  logo_url text,
  created_at timestamp with time zone default now()
);

-- 2. Users  (mirrors Supabase Auth; populated on signup)
create table if not exists "Users" (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  role text not null default 'customer',   -- 'customer' | 'admin'
  company_id uuid references "Companies"(id) on delete set null,
  created_at timestamp with time zone default now()
);

-- 3. Services
create table if not exists "Services" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,
  created_at timestamp with time zone default now()
);

-- 4. Bookings
create table if not exists "Bookings" (
  id uuid primary key default gen_random_uuid(),
  service text,                  -- summary string built in book-service.js
  booking_date date,
  status text not null default 'pending',  -- 'pending' | 'confirmed' | 'completed' | 'cancelled'
  customer_name text,
  customer_phone text,
  customer_address text,
  created_at timestamp with time zone default now()
);

-- 5. AuthInvites  (used by backend invite flow)
create table if not exists "AuthInvites" (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invite_token text unique not null,
  status text not null default 'pending',  -- 'pending' | 'accepted'
  created_at timestamp with time zone default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table "Companies"   enable row level security;
alter table "Users"       enable row level security;
alter table "Services"    enable row level security;
alter table "Bookings"    enable row level security;
alter table "AuthInvites" enable row level security;

-- Helper: is the caller an admin?
-- (checks the Users table using the JWT email claim)
create or replace function is_admin()
returns boolean
language sql security definer
as $$
  select exists (
    select 1 from "Users"
    where email = auth.jwt() ->> 'email'
    and role = 'admin'
  );
$$;

-- ---- Bookings policies ----
-- Anyone (including unauthenticated) can submit a booking via the public form
drop policy if exists "Public can insert bookings" on "Bookings";
create policy "Public can insert bookings"
  on "Bookings" for insert
  with check (true);

-- Only admins can read, update, delete bookings
drop policy if exists "Admins can view all bookings" on "Bookings";
create policy "Admins can view all bookings"
  on "Bookings" for select
  using (is_admin());

drop policy if exists "Admins can update bookings" on "Bookings";
create policy "Admins can update bookings"
  on "Bookings" for update
  using (is_admin());

drop policy if exists "Admins can delete bookings" on "Bookings";
create policy "Admins can delete bookings"
  on "Bookings" for delete
  using (is_admin());

-- ---- Companies policies ----
drop policy if exists "Admins can manage companies" on "Companies";
create policy "Admins can manage companies"
  on "Companies" for all
  using (is_admin())
  with check (is_admin());

-- ---- Users policies ----
-- Users can read their own row; admins can read all
drop policy if exists "Users can read own row" on "Users";
create policy "Users can read own row"
  on "Users" for select
  using (
    email = auth.jwt() ->> 'email'
    or is_admin()
  );

-- Service role (backend) can insert on signup
drop policy if exists "Service role can insert users" on "Users";
create policy "Service role can insert users"
  on "Users" for insert
  with check (true);

-- ---- Services policies ----
-- Anyone authenticated can read services; only admins can write
drop policy if exists "Authenticated can read services" on "Services";
create policy "Authenticated can read services"
  on "Services" for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admins can manage services" on "Services";
create policy "Admins can manage services"
  on "Services" for all
  using (is_admin())
  with check (is_admin());

-- ---- AuthInvites policies ----
drop policy if exists "Admins can manage invites" on "AuthInvites";
create policy "Admins can manage invites"
  on "AuthInvites" for all
  using (is_admin())
  with check (is_admin());

-- ============================================================
-- Seed: first admin user
-- After running this schema, sign up normally through the app,
-- then run the line below (replace the email) to promote yourself:
--
--   update "Users" set role = 'admin' where email = 'you@example.com';
--
-- ============================================================
