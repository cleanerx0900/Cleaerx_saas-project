-- 1. Companies table
create table if not exists "Companies" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  contact text,
  logo_url text,
  created_at timestamp with time zone default now()
);

-- 2. Add customer detail columns to Bookings (safe if already exist)
alter table "Bookings" add column if not exists customer_name text;
alter table "Bookings" add column if not exists customer_phone text;
alter table "Bookings" add column if not exists customer_address text;

-- 3. Enable Row Level Security
alter table "Companies" enable row level security;
alter table "Bookings" enable row level security;

-- 4. Admin-only policies (based on existing Users table's role column)
-- Bookings: anyone can insert (public booking form), only admin can read/update/delete
drop policy if exists "Public can insert bookings" on "Bookings";
create policy "Public can insert bookings"
  on "Bookings" for insert
  with check (true);

drop policy if exists "Admins can view all bookings" on "Bookings";
create policy "Admins can view all bookings"
  on "Bookings" for select
  using (
    exists (
      select 1 from "Users"
      where "Users".email = auth.jwt() ->> 'email'
      and "Users".role = 'admin'
    )
  );

drop policy if exists "Admins can update bookings" on "Bookings";
create policy "Admins can update bookings"
  on "Bookings" for update
  using (
    exists (
      select 1 from "Users"
      where "Users".email = auth.jwt() ->> 'email'
      and "Users".role = 'admin'
    )
  );

drop policy if exists "Admins can delete bookings" on "Bookings";
create policy "Admins can delete bookings"
  on "Bookings" for delete
  using (
    exists (
      select 1 from "Users"
      where "Users".email = auth.jwt() ->> 'email'
      and "Users".role = 'admin'
    )
  );

-- Companies: only admin can read/write
drop policy if exists "Admins can manage companies" on "Companies";
create policy "Admins can manage companies"
  on "Companies" for all
  using (
    exists (
      select 1 from "Users"
      where "Users".email = auth.jwt() ->> 'email'
      and "Users".role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from "Users"
      where "Users".email = auth.jwt() ->> 'email'
      and "Users".role = 'admin'
    )
  );
