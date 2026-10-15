-- VIPL Payroll — database setup / security rules.
-- Run in Supabase -> SQL Editor. Safe to run more than once.
--
-- The whole ERP database is one JSON row in erp_data. These rules let ONLY signed-in staff
-- accounts read or write it: a Supabase Auth user whose app_metadata has a "role" (which only
-- the server-side api/users.js — or an admin in this SQL editor — can set). Signed-out visitors,
-- and anyone who signs up on their own, get nothing.

create table if not exists erp_data (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table erp_data enable row level security;

-- Remove the old "anyone with the public key" rule and any earlier versions of these rules.
drop policy if exists "app access" on erp_data;
drop policy if exists "staff can read" on erp_data;
drop policy if exists "staff can insert" on erp_data;
drop policy if exists "staff can update" on erp_data;

create policy "staff can read" on erp_data
  for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is not null);

create policy "staff can insert" on erp_data
  for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') is not null);

create policy "staff can update" on erp_data
  for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is not null)
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') is not null);

-- ---------------------------------------------------------------------------------------------
-- FIRST SOFTWARE ADMIN (one time):
--   1. Authentication -> Users -> Add user -> Create new user
--        Email:    swadmin@users.vipl-payroll.app
--        Password: (choose a strong one)
--        [x] Auto Confirm User
--   2. Then run the statement below to give that account the Software Admin role.
--      Everyone else is then created from the app's User Management screen.
-- ---------------------------------------------------------------------------------------------
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                        || '{"role": "Software Admin", "username": "swadmin"}'::jsonb
where email = 'swadmin@users.vipl-payroll.app';
