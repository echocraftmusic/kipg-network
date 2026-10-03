# KIPG shared-chat database setup

Run `migrations/20261002_001_theater_chat.sql` **once** in the KIPG Supabase project's SQL Editor. It is transactional: if it fails, the transaction rolls back. Do not run it in the Echo Craft project. Existing Auth accounts are preserved. No live show is created, and no site feature is enabled by this migration alone.

## Install

1. Open the KIPG project, then **SQL Editor → New query**.
2. Paste the entire migration and select **Run**.
3. Expect “Success. No rows returned.” If an error appears, share its text; do not rerun portions separately.
4. Confirm the Table Editor lists `kipg_profiles`, `kipg_sessions`, and `kipg_messages`.
5. Keep the `kipg_private` schema outside the Data API's exposed schemas.

## What is enforced

- Only verified email accounts can create a profile or send messages.
- `kipg_ensure_profile()` creates a random unique User + nine-digit username at first verified member use. It ignores the old display-name metadata. Names persist on the profile and are case-insensitively unique.
- `kipg_set_username(candidate)` allows 3–24 ASCII letters/numbers, starting with a letter. It blocks reserved staff terms, several inappropriate terms and common digit/repeated-letter disguises. The generated User + number namespace is reserved.
- This baseline filter is conservative and incomplete. Expand the private blocked-term list and add moderator review before public launch. It does not filter message content.
- Visitors can read chat during the show's open window. Verified members can send; suspended/muted members cannot. Members cannot directly edit profiles, assign roles, manage shows, hide messages, or forge authors/timestamps.
- Chat opens 15 minutes before `starts_at`, closes five minutes after `ends_at`, and closes immediately on cancellation. Limits: 500 characters and one message every three seconds, enforced by the database.
- Only trusted SQL/server operations can change `ends_at`. Individual viewers reaching the end of their YouTube player cannot close everyone's chat. The host workflow must update the room's authoritative end time.

## Browser integration contract (next step)

Call `rpc('kipg_ensure_profile')` after verification/sign-in. Use the returned username. Call `rpc('kipg_set_username', {candidate})` for a custom name. Fetch the active show, retrieve the latest messages, subscribe to INSERT events on `kipg_messages` filtered by `session_id`, and deduplicate by message ID. Send with `from('kipg_messages').insert({session_id, body})` without `.select()`; fetch/subscribe separately. A message accepted just before chat closes can become unreadable afterward.

Fetch messages after subscribing to avoid missing messages during connection. Re-fetch after reconnect; preserve scrollback. At close, clear displayed history and unsubscribe. Cancelled/ended session changes require listening to `kipg_sessions` and re-fetching on reconnect. Hidden-message removal requires a trusted moderation notification workflow; Realtime does not reliably emit updates when RLS makes a row unreadable. Do not claim delete/mute controls are implemented yet.

The standalone projector rehearsal and current browser-only chat remain unchanged until the shared adapter is installed. Magic links, host/moderator roles and UI, custom SMTP, newsletter delivery, privacy/retention policy, and end-to-end multi-account tests are separate remaining work.

## Connected website

The website adapter is now installed. Do not rerun the migration after a successful installation. On the Community page, sign in by email link and confirm that your assigned username appears. Choose a custom username if desired. Existing display-name metadata is not automatically migrated because it may violate the new rules.

The public theater reads only database shows; the Projector drawer explicitly remains a local rehearsal. A trusted operator must first create a test show in SQL Editor (with the selected YouTube ID and accurate episode duration). No host account is implicitly granted rights by signup or metadata. Public chat remains closed while no show is scheduled.

Validation: `npm run verify`, `npm run test:room`, `npm run test:chat`; 33 PostgreSQL assertions in `supabase/tests/chat-security.mjs` passed with the RLS-enabled private table. Anonymous production reads were checked; real-member/email and two-account Realtime verification still require user participation.
