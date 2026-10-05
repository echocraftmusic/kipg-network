-- Run after migrations 001 and 002. Assign staff in SQL Editor separately.
begin;
create table kipg_private.staff (
 user_id uuid primary key references auth.users(id) on delete cascade,
 administrator boolean not null default false,
 moderator boolean not null default false,
 projector boolean not null default false
);
create table kipg_private.incidents (
 id uuid primary key default gen_random_uuid(),
 subject_id uuid not null references auth.users(id),
 session_id uuid not null references public.kipg_sessions(id),
 message_id uuid not null references public.kipg_messages(id),
 actor_id uuid not null references auth.users(id),
 action text not null check(action in ('hide','remove')),
 reason text not null,
 note text not null default '' check(char_length(note)<=1000),
 evidence jsonb not null,
 context jsonb not null,
 strike integer,
 until_at timestamptz,
 created_at timestamptz not null default now(),
 restored_at timestamptz,
 reversed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 review_note text
);
create unique index kipg_one_hide_per_show on kipg_private.incidents(subject_id,session_id)
 where action='hide' and reversed_at is null;
create index kipg_active_hides on kipg_private.incidents(subject_id,until_at)
 where action='hide' and restored_at is null and reversed_at is null;
create table kipg_private.quarantine (
 message_id uuid not null references public.kipg_messages(id) on delete cascade,
 incident_id uuid not null references kipg_private.incidents(id),
 primary key(message_id,incident_id)
);
alter table kipg_private.staff enable row level security;
alter table kipg_private.incidents enable row level security;
alter table kipg_private.quarantine enable row level security;
revoke all on kipg_private.staff,kipg_private.incidents,kipg_private.quarantine from public,anon,authenticated;

create function kipg_private.has_permission(capability text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kipg_private.staff s join auth.users u on u.id=s.user_id
 where s.user_id=auth.uid() and u.email_confirmed_at is not null and
 (s.administrator or case capability when 'moderator' then s.moderator
 when 'projector' then s.projector else false end));
$$;
create function public.kipg_capabilities() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('administrator',kipg_private.has_permission('administrator'),
 'moderator',kipg_private.has_permission('moderator'),'projector',kipg_private.has_permission('projector'));
$$;

create function kipg_private.active_hide(subject uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select id from kipg_private.incidents where subject_id=subject and action='hide'
 and restored_at is null and reversed_at is null and (until_at is null or until_at>now())
 order by created_at desc limit 1;
$$;
create function kipg_private.visible_message(message uuid,author uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select author=auth.uid() or kipg_private.has_permission('moderator') or not exists(
 select 1 from kipg_private.quarantine q join kipg_private.incidents i on i.id=q.incident_id
 where q.message_id=message and i.reversed_at is null);
$$;
-- This policy protects REST reads and Realtime INSERT delivery. Private moderation
-- records/flags are never added to the public message payload or member profile.
drop policy kipg_open_chat_read on public.kipg_messages;
create policy kipg_open_chat_read on public.kipg_messages for select to anon,authenticated
 using(not hidden and kipg_private.visible_message(id,author_id) and exists(
 select 1 from public.kipg_sessions s where s.id=session_id and not s.cancelled
 and now()>=s.starts_at-interval '15 minutes' and now()<s.ends_at+interval '5 minutes'));
grant usage on schema kipg_private to anon,authenticated;
grant execute on function kipg_private.visible_message(uuid,uuid) to anon,authenticated;
revoke all on function kipg_private.active_hide(uuid),kipg_private.has_permission(text) from public,anon,authenticated;

create function kipg_private.quarantine_message() returns trigger
language plpgsql security definer set search_path='' as $$
declare incident uuid;
begin
 incident:=kipg_private.active_hide(new.author_id);
 if incident is not null then
  insert into kipg_private.quarantine(message_id,incident_id) values(new.id,incident);
 end if;
 return new;
end $$;
revoke all on function kipg_private.quarantine_message() from public,anon,authenticated;
create trigger kipg_quarantine_message after insert on public.kipg_messages
 for each row execute function kipg_private.quarantine_message();

create function public.kipg_moderate_message(target_message uuid,operation text,explanation text,
 moderator_note text default '',serious boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare msg public.kipg_messages; incident uuid; previous integer; expiry timestamptz; surrounding jsonb;
begin
 if not kipg_private.has_permission('moderator') then raise exception 'Moderator access required.'; end if;
 if operation not in ('hide','remove') or operation is null or serious is null
 or explanation not in ('Harassment','Hate speech','Threats','Profanity','Spam','Other') or explanation is null
 or moderator_note is null or char_length(moderator_note)>1000 then raise exception 'Choose a reason and a valid action.'; end if;
 select * into msg from public.kipg_messages where id=target_message;
 if not found then raise exception 'Message not found.'; end if;
 if exists(select 1 from kipg_private.staff where user_id=msg.author_id and (administrator or moderator or projector))
 then raise exception 'Staff incidents require administrator review outside this panel.'; end if;
 -- Same lock as message sending: no message can slip through during a hide action.
 perform pg_advisory_xact_lock(hashtextextended(msg.author_id::text,0));
 if operation='hide' then
  select id into incident from kipg_private.incidents where subject_id=msg.author_id
   and session_id=msg.session_id and action='hide' and reversed_at is null;
  if found then return incident; end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at,x.id),'[]') into surrounding from(
  select id,username,body,created_at from public.kipg_messages where session_id=msg.session_id
  order by abs(extract(epoch from created_at-msg.created_at)),id limit 7) x;
 if operation='hide' then
  select count(*) into previous from kipg_private.incidents where subject_id=msg.author_id
   and action='hide' and reversed_at is null;
  if not serious and previous=0 then
   select greatest(ends_at+interval '5 minutes',now()+interval '1 minute') into expiry from public.kipg_sessions where id=msg.session_id;
  elsif not serious and previous=1 then expiry:=now()+interval '7 days';
  else expiry:=null; end if;
 end if;
 insert into kipg_private.incidents(subject_id,session_id,message_id,actor_id,action,reason,note,evidence,context,strike,until_at)
 values(msg.author_id,msg.session_id,msg.id,auth.uid(),operation,explanation,btrim(moderator_note),to_jsonb(msg),surrounding,
 case when operation='hide' then previous+1 end,expiry) returning id into incident;
 insert into kipg_private.quarantine(message_id,incident_id)
 select id,incident from public.kipg_messages where id=msg.id
 or (operation='hide' and author_id=msg.author_id and session_id=msg.session_id)
 on conflict do nothing;
 return incident;
end $$;

create function public.kipg_review_incidents(subject uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not kipg_private.has_permission('moderator') then raise exception 'Moderator access required.'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into result from(
  select i.*,p.username,s.title as show_title,
  (select username from public.kipg_profiles where user_id=i.actor_id) as moderator_username,
  (select coalesce(jsonb_agg(to_jsonb(m)),'[]') from(
   select id,username,body,created_at from public.kipg_messages where author_id=i.subject_id
   and session_id=i.session_id order by created_at desc,id desc limit 10) m) as recent_messages
  from kipg_private.incidents i left join public.kipg_profiles p on p.user_id=i.subject_id
  join public.kipg_sessions s on s.id=i.session_id where subject is null or i.subject_id=subject
  order by i.created_at desc limit 100) x;
 return result;
end $$;
create function public.kipg_restore_incident(target_incident uuid,reverse_mistake boolean,review_explanation text) returns void
language plpgsql security definer set search_path='' as $$
declare subject uuid;
begin
 if not kipg_private.has_permission('administrator') then raise exception 'Administrator access required.'; end if;
 if reverse_mistake is null or review_explanation is null or char_length(btrim(review_explanation)) not between 1 and 1000
 then raise exception 'Add a short review note.'; end if;
 select subject_id into subject from kipg_private.incidents where id=target_incident;
 if not found then raise exception 'Incident not found.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(subject::text,0));
 update kipg_private.incidents set restored_at=now(),reversed_at=case when reverse_mistake then now() else reversed_at end,
 reviewed_by=auth.uid(),review_note=btrim(review_explanation) where id=target_incident;
end $$;

create function public.kipg_project_show(video_id text,show_title text,duration_minutes numeric,scheduled_start timestamptz default null)
returns public.kipg_sessions language plpgsql security definer set search_path='' as $$
declare start_time timestamptz; show public.kipg_sessions;
begin
 if not kipg_private.has_permission('projector') then raise exception 'Projector access required.'; end if;
 if video_id is null or video_id !~ '^[A-Za-z0-9_-]{11}$' or show_title is null or char_length(btrim(show_title)) not between 1 and 160
 or duration_minutes is null or duration_minutes::text='NaN' or duration_minutes not between 1 and 720
 then raise exception 'Enter a valid video, title, and duration (1–720 minutes).'; end if;
 perform pg_advisory_xact_lock(hashtextextended('kipg-projector-theater-1',0));
 start_time:=coalesce(scheduled_start,now()+interval '1 minute');
 if start_time<now() then raise exception 'Choose a future start time.'; end if;
 if exists(select 1 from public.kipg_sessions where not cancelled
 and starts_at-interval '15 minutes'<start_time+duration_minutes*interval '1 minute'+interval '5 minutes'
 and ends_at+interval '5 minutes'>start_time-interval '15 minutes')
 then raise exception 'This overlaps another show or its chat window. End or cancel that session first.'; end if;
 insert into public.kipg_sessions(title,youtube_id,starts_at,ends_at)
 values(btrim(show_title),video_id,start_time,start_time+duration_minutes*interval '1 minute') returning * into show;
 return show;
end $$;
create function public.kipg_end_show(target_show uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not kipg_private.has_permission('projector') then raise exception 'Projector access required.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('kipg-projector-theater-1',0));
 update public.kipg_sessions set cancelled=case when starts_at>=now() then true else cancelled end,
 ends_at=case when starts_at<now() then least(ends_at,now()) else ends_at end where id=target_show;
 if not found then raise exception 'Show not found.'; end if;
 -- A first incident follows a manually shortened show, including goodbye chat.
 update kipg_private.incidents i set until_at=least(i.until_at,
  case when s.cancelled then now() else s.ends_at+interval '5 minutes' end)
 from public.kipg_sessions s where s.id=target_show and i.session_id=s.id
 and i.action='hide' and i.strike=1 and i.until_at is not null
 and i.restored_at is null and i.reversed_at is null;
end $$;

revoke all on function public.kipg_capabilities(), public.kipg_moderate_message(uuid,text,text,text,boolean),
 public.kipg_review_incidents(uuid),public.kipg_restore_incident(uuid,boolean,text),
 public.kipg_project_show(text,text,numeric,timestamptz),public.kipg_end_show(uuid) from public,anon,authenticated;
grant execute on function public.kipg_capabilities(), public.kipg_moderate_message(uuid,text,text,text,boolean),
 public.kipg_review_incidents(uuid),public.kipg_restore_incident(uuid,boolean,text),
 public.kipg_project_show(text,text,numeric,timestamptz),public.kipg_end_show(uuid) to authenticated;
commit;
