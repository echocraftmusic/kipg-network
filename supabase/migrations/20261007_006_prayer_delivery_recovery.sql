-- Existing prayer records remain intact. The service role owns delivery access.
begin;
alter table public.kipg_prayer_requests
  add column if not exists payload_hash text,
  add column if not exists delivery_token uuid,
  add column if not exists lease_until timestamptz,
  add column if not exists first_attempt_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error_code text;
create or replace function public.kipg_claim_prayer_delivery(
  p_id uuid, p_payload_hash text, p_name text, p_email text,
  p_prayer_text text, p_contact_requested boolean
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_row public.kipg_prayer_requests%rowtype;
  v_now timestamptz := clock_timestamp();
  v_token uuid;
begin
  if p_id is null or p_payload_hash is null
    or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_name is null or length(btrim(p_name)) not between 1 and 60
    or p_email is null or length(p_email) not between 3 and 160
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_prayer_text is null or length(btrim(p_prayer_text)) not between 5 and 4000
    or p_contact_requested is null then
    raise exception 'Invalid prayer delivery fields' using errcode = '22023';
  end if;
  insert into public.kipg_prayer_requests
    (id, payload_hash, name, email, prayer_text, contact_requested)
  values (p_id, p_payload_hash, p_name, p_email, p_prayer_text, p_contact_requested)
  on conflict (id) do nothing;
  select * into v_row from public.kipg_prayer_requests where id = p_id for update;
  if v_row.payload_hash is distinct from p_payload_hash then
    return jsonb_build_object('action', 'conflict');
  end if;
  if v_row.status = 'accepted' and v_row.provider_id is not null
    and v_row.purged_at is not null then
    return jsonb_build_object('action', 'delivered');
  end if;
  if v_row.lease_until > v_now then
    return jsonb_build_object('action', 'busy');
  end if;
  -- Stop ambiguous retries before the provider's idempotency window expires.
  if v_row.first_attempt_at is not null
    and v_row.first_attempt_at <= v_now - interval '23 hours' then
    update public.kipg_prayer_requests set status = 'needs_review',
      last_error_code = 'delivery_window_elapsed', updated_at = v_now,
      delivery_token = null, lease_until = null where id = p_id;
    return jsonb_build_object('action', 'review');
  end if;
  v_token := gen_random_uuid();
  update public.kipg_prayer_requests set delivery_token = v_token,
    lease_until = v_now + interval '2 minutes',
    first_attempt_at = coalesce(first_attempt_at, v_now),
    attempt_count = attempt_count + 1, updated_at = v_now
  where id = p_id;
  return jsonb_build_object('action', 'send', 'token', v_token);
end;
$$;
create or replace function public.kipg_finish_prayer_delivery(
  p_id uuid, p_token uuid, p_provider_id text
) returns boolean
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if p_token is null or p_provider_id is null
    or length(p_provider_id) not between 1 and 200 then return false; end if;
  update public.kipg_prayer_requests set status = 'accepted',
    provider_id = p_provider_id, name = null, email = null,
    prayer_text = null, contact_requested = null,
    purged_at = clock_timestamp(), updated_at = clock_timestamp(),
    delivery_token = null, lease_until = null, last_error_code = null
  where id = p_id and delivery_token = p_token and status <> 'accepted';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.kipg_release_prayer_delivery(p_id uuid, p_token uuid)
returns boolean
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update public.kipg_prayer_requests set status = 'needs_review',
    last_error_code = 'delivery_unconfirmed', updated_at = clock_timestamp(),
    delivery_token = null, lease_until = null
  where id = p_id and delivery_token = p_token and status <> 'accepted';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.kipg_claim_prayer_delivery(uuid,text,text,text,text,boolean)
  from public, anon, authenticated;
revoke all on function public.kipg_finish_prayer_delivery(uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.kipg_release_prayer_delivery(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.kipg_claim_prayer_delivery(uuid,text,text,text,text,boolean)
  to service_role;
grant execute on function public.kipg_finish_prayer_delivery(uuid,uuid,text) to service_role;
grant execute on function public.kipg_release_prayer_delivery(uuid,uuid) to service_role;
grant select, insert, update on public.kipg_prayer_requests to service_role;
alter table public.kipg_prayer_requests enable row level security;
revoke all on public.kipg_prayer_requests from anon, authenticated;
commit;
