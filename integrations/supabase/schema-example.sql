-- Development example only. Customize and test before production.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles can read self"
on public.profiles for select to authenticated
using (id = auth.uid());

create policy "profiles can update safe self fields"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Column-level privileges prevent browser users from promoting their own role
-- or approval status. Use a protected server or Edge Function for those changes.
