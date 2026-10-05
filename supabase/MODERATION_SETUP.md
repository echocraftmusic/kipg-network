# Phase One: private moderation and shared Projector 1

## Deployment order

1. In the **kipg-network** Supabase SQL Editor, run `migrations/20261005_004_moderation_projector.sql` once, after the existing profile/chat/member-details migrations. It creates no staff assignments and starts no shows. Do not expose the `kipg_private` schema in the API.
2. In SQL Editor, look up each proposed administrator by exact registered email. Confirm the account and email verification before assigning it. Grant roles by Auth UUID, not username or user-editable metadata:

```sql
select u.id, u.email, u.email_confirmed_at, p.username
from auth.users u left join public.kipg_profiles p on p.user_id=u.id
where lower(u.email)=lower('REGISTERED_EMAIL_HERE');

-- After confirming that row, replace VERIFIED_AUTH_USER_ID_HERE:
insert into kipg_private.staff(user_id,administrator,moderator,projector)
select id,true,true,true from auth.users
where id='VERIFIED_AUTH_USER_ID_HERE'::uuid and email_confirmed_at is not null
on conflict(user_id) do update
set administrator=true, moderator=true, projector=true;
```

For additional staff, set administrator=false and independently choose moderator/projector. Regular community members receive no staff row. Browser accounts cannot edit this table. Administrator restoration is available through the review panel, but role assignment stays in SQL Editor for this version.

3. Refresh the live website and sign into an assigned administrator account. The Projector 1 drawer and private moderation review panel appear only for authorized accounts. The old projector rehearsal page points to the Viewing Room.

## Three-browser acceptance test

Use separate browsers/profiles; ordinary tabs share the same login. Visit `/pages/live.html` without a `rehearsal` parameter.

1. Administrator: enter a known embeddable YouTube link and accurate duration; press **Play Now**. All browsers should load the same show and one-minute countdown within five seconds. Test a future Schedule separately. The backend rejects overlapping show/chat windows. A manual End Show stops playback on the shared timeline and gives five minutes of goodbye chat; canceling a future show closes it.
2. Regular member and test member: each posts a message. Messages arrive in the shared room; guests can watch/read during an open chat window but cannot post. Neither regular member has projector/moderator controls. Attempting the RPCs directly as a regular member must fail.
3. Administrator: select the test member's message menu → **Hide User**, choose a reason/note. Hidden member continues to watch, read public chat, and send/see their own messages. No notification, email, disabled composer, restriction flag, or strike count is sent to that member. Another member/guest cannot fetch or receive those messages. Previously delivered messages disappear on the next history refresh (up to three seconds); already-read text cannot be recalled.
4. Private review: confirm the exact triggering message, up to seven nearby messages, note, moderator, show, duration, and strike. Recent messages help review continued behavior. Review records remain available after chat closes. Repeat Hide on the same member in the same show: one strike only.
5. Administrator: **Unhide User** restores future public messages; previously quarantined messages stay private. **Reverse mistaken action** removes that strike and releases its quarantined messages unless another incident also quarantines them. Staff accounts cannot be targeted through this message menu.
6. New shows: first counted incident ends with the show/chat window, second lasts seven days, third is indefinite. Serious abuse can be indefinite on the first incident. Signing out/back in or changing username does not clear a restriction. Normal expiry restores future participation automatically through database time checks, without a scheduled job. No ban notice is emitted on expiry/restoration.

## Implementation limits

- Supabase RLS applies the private quarantine check to message reads and Realtime INSERT delivery. The message row and member profile contain no silent-hide flags. Private evidence is never published to Realtime. The after-insert quarantine trigger runs in the same transaction as each message; the hide RPC and message trigger share a per-member advisory lock.
- The shared projector runs on a server schedule, not a live audio/video encoder. YouTube remains the video source. Late joiners seek to the room position. Browser clock skew, autoplay restrictions, inaccurate entered duration, and network buffering can affect playback; hosts should test the actual episode duration.
- Hiding is account-based; it does not reliably identify replacement accounts. CAPTCHA/new-account screening and moderator role-management UI are not implemented in this migration. YouTube moderation assignments do not transfer.
- A new hide on the same account/show is deduplicated. Escalating an existing same-show incident to indefinite requires SQL/admin review in this version; the first serious hide can be indefinite.
- Review shows the 100 most recent incidents, plus 10 recent messages per incident. Evidence is retained until a deliberate retention policy is implemented; deleting an Auth account with moderation history needs a separate administrative retention/removal process because incident evidence references that account.
- Website controls gracefully remain hidden until SQL and permissions are installed. No service-role key belongs in the website. No signup/admin privilege comes from auth metadata.

## Validation

Run `node supabase/tests/moderation-security.mjs /absolute/path/to/@electric-sql/pglite/dist/index.js` for isolated PostgreSQL role/RLS/evidence/escalation checks. `npm run test:chat` covers shared-chat navigation and lifecycle. Live three-browser acceptance remains necessary to verify the hosted Realtime service and episode playback.
