-- KIPG Theater 1 foundation. Run once in the KIPG project's SQL Editor.
-- Does not modify existing Auth users or create a live show.
begin;
create schema if not exists kipg_private;
revoke all on schema kipg_private from public, anon, authenticated;

create table public.kipg_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z][A-Za-z0-9]{2,23}$'),
  suspended boolean not null default false,
  muted_until timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index kipg_username_unique on public.kipg_profiles(lower(username));
alter table public.kipg_profiles enable row level security;
revoke all on public.kipg_profiles from public, anon, authenticated;
grant select on public.kipg_profiles to authenticated;
create policy kipg_own_profile on public.kipg_profiles for select to authenticated
  using (user_id = (select auth.uid()));

-- This list is private and extensible. It is a baseline, not a complete moderation system.
create table kipg_private.blocked_username_terms (term text primary key);
insert into kipg_private.blocked_username_terms(term) values
 ('fuck'),('shit'),('bitch'),('cunt'),('asshole'),('bastard'),('motherfucker'),
 ('nigger'),('nigga'),('faggot'),('porn'),('nazi'),('whore'),('slut'),('dick'),('cock'),
 ('admin'),('moderator'),('kipg'),('staff'),('support');
alter table kipg_private.blocked_username_terms enable row level security;
revoke all on kipg_private.blocked_username_terms from public, anon, authenticated;

create function kipg_private.username_allowed(candidate text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare plain text; disguised text;
begin
  if candidate is null or candidate !~ '^[A-Za-z][A-Za-z0-9]{2,23}$'
    or lower(candidate) ~ '^user[0-9]+$' then return false; end if;
  plain := lower(candidate);
  disguised := translate(plain, '0123456789', 'oizeasgtbg');
  return not exists (
    select 1 from kipg_private.blocked_username_terms b
    where position(b.term in plain) > 0 or position(b.term in disguised) > 0
      or position(b.term in regexp_replace(plain, '(.)\1+', '\1', 'g')) > 0
      or position(b.term in regexp_replace(disguised, '(.)\1+', '\1', 'g')) > 0
      or position(b.term in regexp_replace(plain, '[0-9]', '', 'g')) > 0
  );
end $$;
revoke all on function kipg_private.username_allowed(text) from public, anon, authenticated;

create function public.kipg_ensure_profile() returns public.kipg_profiles
language plpgsql security definer set search_path = '' as $$
declare member uuid := auth.uid(); profile public.kipg_profiles; attempt integer;
begin
  if member is null or not exists (select 1 from auth.users
    where id = member and email_confirmed_at is not null and email is not null) then
    raise exception 'A verified community account is required.';
  end if;
  -- Serialize profile creation and name changes for this member.
  perform pg_advisory_xact_lock(hashtextextended(member::text, 0));
  select * into profile from public.kipg_profiles where user_id = member;
  if found then return profile; end if;
  for attempt in 1..30 loop
    insert into public.kipg_profiles(user_id, username)
      values (member, 'User' || lpad(floor(random() * 1000000000)::bigint::text, 9, '0'))
      on conflict do nothing returning * into profile;
    if found then return profile; end if;
  end loop;
  raise exception 'Could not assign a username. Please try again.';
end $$;
revoke all on function public.kipg_ensure_profile() from public, anon, authenticated;
grant execute on function public.kipg_ensure_profile() to authenticated;

create function public.kipg_set_username(candidate text) returns public.kipg_profiles
language plpgsql security definer set search_path = '' as $$
declare profile public.kipg_profiles;
begin
  profile := public.kipg_ensure_profile();
  if profile.suspended then raise exception 'This account is suspended.'; end if;
  if not kipg_private.username_allowed(candidate) then
    raise exception 'Choose a respectful username: 3–24 letters and numbers, starting with a letter. Staff names and inappropriate names are reserved or blocked.';
  end if;
  update public.kipg_profiles set username = candidate where user_id = auth.uid()
    returning * into profile;
  return profile;
exception when unique_violation then raise exception 'That username is already taken.';
end $$;
revoke all on function public.kipg_set_username(text) from public, anon, authenticated;
grant execute on function public.kipg_set_username(text) to authenticated;

-- Only SQL Editor / trusted server operations can create or change shows for now.
create table public.kipg_sessions (
  id uuid primary key default gen_random_uuid(),
  theater_id text not null default 'theater-1' check (theater_id = 'theater-1'),
  title text not null check (char_length(title) between 1 and 160),
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.kipg_sessions enable row level security;
revoke all on public.kipg_sessions from public, anon, authenticated;
grant select on public.kipg_sessions to anon, authenticated;
create policy kipg_public_schedule on public.kipg_sessions for select to anon, authenticated using (true);

create table public.kipg_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.kipg_sessions(id),
  author_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  body text not null check (char_length(body) between 1 and 500),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index kipg_message_history on public.kipg_messages(session_id, created_at, id);
alter table public.kipg_messages enable row level security;
revoke all on public.kipg_messages from public, anon, authenticated;
grant select on public.kipg_messages to anon, authenticated;
grant insert(session_id, body) on public.kipg_messages to authenticated;
create policy kipg_open_chat_read on public.kipg_messages for select to anon, authenticated
 using (not hidden and exists (select 1 from public.kipg_sessions s
  where s.id = session_id and not s.cancelled
    and now() >= s.starts_at - interval '15 minutes'
    and now() < s.ends_at + interval '5 minutes'));
create policy kipg_member_chat_send on public.kipg_messages for insert to authenticated
 with check (author_id = (select auth.uid()) and not hidden);

create function kipg_private.prepare_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare profile public.kipg_profiles; server_time timestamptz;
begin
  profile := public.kipg_ensure_profile();
  select * into profile from public.kipg_profiles where user_id = auth.uid() for update;
  server_time := clock_timestamp();
  if profile.suspended or profile.muted_until > server_time then
    raise exception 'Chat access is restricted for this account.';
  end if;
  if profile.last_message_at > server_time - interval '3 seconds' then
    raise exception 'Please wait a few seconds before sending another message.';
  end if;
  if not exists (select 1 from public.kipg_sessions s where s.id = new.session_id
    and not s.cancelled and server_time >= s.starts_at - interval '15 minutes'
    and server_time < s.ends_at + interval '5 minutes') then
    raise exception 'Chat is closed for this show.';
  end if;
  new.body := btrim(new.body);
  if new.body is null or char_length(new.body) not between 1 and 500 then
    raise exception 'Messages must contain 1–500 characters.';
  end if;
  new.author_id := auth.uid(); new.username := profile.username;
  new.created_at := server_time; new.hidden := false;
  update public.kipg_profiles set last_message_at = server_time where user_id = auth.uid();
  return new;
end $$;
revoke all on function kipg_private.prepare_message() from public, anon, authenticated;
create trigger kipg_prepare_message before insert on public.kipg_messages
 for each row execute function kipg_private.prepare_message();

-- Public INSERT notifications are filtered through each subscriber's RLS access.
-- Soft-hide messages rather than deleting rows; moderator UI comes next.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.kipg_messages;
    alter publication supabase_realtime add table public.kipg_sessions;
  end if;
end $$;
commit;
