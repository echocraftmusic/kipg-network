-- Run after 20261002_001_theater_chat.sql in the KIPG project's SQL Editor.
-- Keeps private membership details separate from public chat usernames.
begin;
create table public.kipg_member_details (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 80 and first_name !~ '[[:cntrl:]]'),
  last_name text not null default '' check (char_length(last_name) <= 80 and last_name !~ '[[:cntrl:]]'),
  email text not null,
  newsletter_opt_in boolean not null default false,
  newsletter_consent_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.kipg_member_details enable row level security;
revoke all on public.kipg_member_details from public, anon, authenticated;
grant select on public.kipg_member_details to authenticated;
create policy kipg_own_member_details on public.kipg_member_details
  for select to authenticated using (user_id = (select auth.uid()));

create function public.kipg_get_member_details() returns public.kipg_member_details
language plpgsql security definer set search_path = '' as $$
declare account auth.users; details public.kipg_member_details; given text; family text; subscribed boolean;
begin
  select * into account from auth.users where id = auth.uid();
  if not found or account.email_confirmed_at is null or account.email is null then
    raise exception 'A verified community account is required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(account.id::text, 0));
  -- Metadata seeds new profiles only; it never overwrites saved details or consent.
  given := btrim(coalesce(account.raw_user_meta_data->>'first_name', ''));
  family := btrim(coalesce(account.raw_user_meta_data->>'last_name', ''));
  if char_length(given)>80 or given ~ '[[:cntrl:]]' then given := ''; end if;
  if char_length(family)>80 or family ~ '[[:cntrl:]]' then family := ''; end if;
  subscribed := coalesce(account.raw_user_meta_data->'newsletter_opt_in' = 'true'::jsonb, false);
  insert into public.kipg_member_details(user_id, first_name, last_name, email, newsletter_opt_in, newsletter_consent_at)
    values(account.id, given, family, account.email, subscribed, case when subscribed then now() end)
    on conflict(user_id) do update set email=excluded.email
    returning * into details;
  return details;
end $$;
revoke all on function public.kipg_get_member_details() from public, anon, authenticated;
grant execute on function public.kipg_get_member_details() to authenticated;

create function public.kipg_save_member_details(given_name text, family_name text, subscribe_newsletter boolean)
returns public.kipg_member_details
language plpgsql security definer set search_path = '' as $$
declare details public.kipg_member_details;
begin
  given_name := btrim(given_name); family_name := btrim(family_name);
  if given_name is null or family_name is null or char_length(given_name) not between 1 and 80
    or char_length(family_name) not between 1 and 80
    or given_name ~ '[[:cntrl:]]' or family_name ~ '[[:cntrl:]]' then
    raise exception 'Enter your first and last name (up to 80 characters each).';
  end if;
  if subscribe_newsletter is null then raise exception 'Choose your newsletter preference.'; end if;
  details := public.kipg_get_member_details();
  update public.kipg_member_details set first_name=given_name, last_name=family_name,
    newsletter_consent_at=case when subscribe_newsletter then coalesce(newsletter_consent_at, now()) else null end,
    newsletter_opt_in=subscribe_newsletter, updated_at=now()
    where user_id=auth.uid() returning * into details;
  return details;
end $$;
revoke all on function public.kipg_save_member_details(text,text,boolean) from public, anon, authenticated;
grant execute on function public.kipg_save_member_details(text,text,boolean) to authenticated;
commit;
