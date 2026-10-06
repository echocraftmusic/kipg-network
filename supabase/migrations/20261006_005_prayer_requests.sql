-- Private recovery buffer for KIPG prayer requests.
-- The Edge Function writes with the service role. No browser role gets table access.
-- Sensitive fields are purged immediately after Resend accepts delivery.

create table if not exists public.kipg_prayer_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending','accepted','needs_review')),
  name text,
  email text,
  prayer_text text,
  contact_requested boolean,
  provider_id text,
  purged_at timestamptz
);

alter table public.kipg_prayer_requests enable row level security;

comment on table public.kipg_prayer_requests is
  'Temporary private recovery storage for prayer submissions. Sensitive fields are purged after successful email delivery.';

revoke all on table public.kipg_prayer_requests from anon, authenticated;
