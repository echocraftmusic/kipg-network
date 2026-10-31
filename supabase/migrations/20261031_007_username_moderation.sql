-- KIPG Community username moderation expansion.
-- Apply ONCE after 20261002_001_theater_chat.sql.
-- This is intentionally additive/idempotent for the private term list and replaces only
-- the username validation function. It does not recreate kipg_profiles or other tables.
begin;

insert into kipg_private.blocked_username_terms(term) values
  -- Community/staff impersonation and reserved identities
  ('admin'),('administrator'),('moderator'),('modteam'),('kipg'),('kipgnetwork'),
  ('staff'),('support'),('official'),('owner'),('host'),
  -- Profanity / crude or sexually explicit names
  ('fuck'),('shit'),('bitch'),('cunt'),('asshole'),('bastard'),('motherfucker'),
  ('whore'),('slut'),('dick'),('cock'),('pussy'),('porn'),('porno'),('xxx'),
  ('nude'),('naked'),('hentai'),('onlyfans'),('blowjob'),('handjob'),('sexual'),
  -- Hate / extremist references
  ('nigger'),('nigga'),('faggot'),('nazi'),('kkk'),
  -- Deliberately provocative spiritual names KIPG does not permit as usernames
  ('evil'),('satan'),('satanic'),('lucifer'),('devil'),('demon'),
  -- Political names/slogans are blocked across viewpoints so usernames do not become campaign signs
  ('trump'),('maga'),('biden'),('harris'),('obama'),('desantis'),
  ('democrat'),('republican'),('potus'),('president')
on conflict (term) do nothing;

create or replace function kipg_private.username_allowed(candidate text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  plain text;
  disguised text;
  collapsed text;
  collapsed_disguised text;
  digits_removed text;
begin
  if candidate is null or candidate !~ '^[A-Za-z][A-Za-z0-9]{2,23}$'
    or lower(candidate) ~ '^user[0-9]+$' then
    return false;
  end if;

  plain := lower(candidate);
  -- Common visual substitutions: 0=o, 1=i, 2=z, 3=e, 4=a, 5=s, 6=g, 7=t, 8=b, 9=g.
  disguised := translate(plain, '0123456789', 'oizeasgtbg');
  collapsed := regexp_replace(plain, '(.)\1+', '\1', 'g');
  collapsed_disguised := regexp_replace(disguised, '(.)\1+', '\1', 'g');
  digits_removed := regexp_replace(plain, '[0-9]', '', 'g');

  return not exists (
    select 1
    from kipg_private.blocked_username_terms b
    where position(b.term in plain) > 0
       or position(b.term in disguised) > 0
       or position(b.term in collapsed) > 0
       or position(b.term in collapsed_disguised) > 0
       or position(b.term in digits_removed) > 0
  );
end $$;

revoke all on function kipg_private.username_allowed(text) from public, anon, authenticated;

-- Existing usernames are not renamed automatically. Any pre-existing name that would now
-- be rejected should be reviewed by a trusted moderator before public launch.
commit;
