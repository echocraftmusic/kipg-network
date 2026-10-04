-- Run once in the kipg-network SQL Editor before deploying kipg-welcome-email.
begin;
create table if not exists public.kipg_welcome_deliveries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('pending','accepted','needs_review','skipped')),
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.kipg_welcome_deliveries enable row level security;
revoke all on public.kipg_welcome_deliveries from public, anon, authenticated;
grant select, insert, update on public.kipg_welcome_deliveries to service_role;
-- Existing accounts are excluded, including when this migration is rerun.
insert into public.kipg_welcome_deliveries(user_id,status)
select id,'skipped' from auth.users
on conflict(user_id) do nothing;
commit;
