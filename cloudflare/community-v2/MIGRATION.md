# KIPG Network — Supabase to Cloudflare migration (planning/staging)

**Current production state:** Website community login, KIPG chat, moderation and shared projector still depend on Supabase. **Do not disable Supabase or deploy a D1-only UI until the replacement passes end-to-end tests.** This folder is preparation, NOT a completed migration.

## What exists today (reviewed Oct 25, 2026)
- Supabase Auth magic-link accounts via `assets/js/community-client.js`, `assets/js/community.js`.
- Verified member names/profiles via RPCs and `kipg_profiles` / `kipg_member_details`.
- `kipg_sessions` schedule and server-authorized projector controls.
- `kipg_messages` and Supabase Realtime. Server-side checks on sending, 3-second cooldown, 500-character limit, read window.
- Administrator/moderator roles, hidden-user quarantine, incident review and restricted restore actions.
- Welcome mail sent by a Supabase Edge Function.
- Public presence broadcasting has been disabled; **do not reintroduce** public attendance counts or identifying lists.

## Target architecture
| Existing component | Replacement | Constraint |
| --- | --- | --- |
| Supabase Postgres | Cloudflare D1 | Use `schema.sql` as staging model. No direct client SQL or public D1 access |
| Supabase Auth magic links | Cloudflare Worker + dedicated email sender + signed HttpOnly Secure SameSite session cookies | Cloudflare Access free seats are intended for staff/admin, NOT unlimited public community accounts. Implement one-time expiring tokens, anti-replay, logout, CSRF defenses and signup abuse prevention |
| Supabase Realtime | Cloudflare Durable Objects (SQLite backed) | Validate per-connection authorization and session before sharing messages; D1 is durable history, not a push transport |
| Supabase RLS/RPC checks | Server-authorized Worker endpoints | Verify every read/write, staff role and window **on the server**, not by hiding UI controls |
| Moderation and hides | D1 incident/quarantine + Worker filtering | Hidden/restricted member messages must never leak to other clients over WebSocket/history; restoration administrator-only with audit |
| Scheduled shared projector | Worker-backed D1 shows | Staff-only create/edit/cancel; validate overlap and timing on server |
| Welcome mail | Verified email provider integration | No API key in browser or GitHub |

## Staged rollout
1. **Inventory:** compare schema and current production records/roles. Confirm how many real accounts, messages, and incidents exist; determine whether consent and data retention permit export.
2. **Backend staging:** create a new, private D1 DB; apply `schema.sql`; implement account identity and staff authorization with fail-closed tests.
3. **Realtime staging:** build a Durable Object room per shared session. Test reconnect, concurrent writes, 500-character limit, server message rate limiting, restrictions, and broadcast filtering.
4. **Shadow testing:** run with synthetic accounts and synthetic messages; do not mirror private real chat into a new backend without a vetted access/migration plan.
5. **Functional parity:** test email login/verification, logout, scheduling, moderator hide/remove, admin-only restore, incidents, welcome mail, mobile, and participant privacy.
6. **Controlled data cutover:** only after private test environment passes. Export/transform legitimate records over an authenticated, secure, audited admin process; **never put member email data or any secrets in this public GitHub repository**.
7. **Switch frontend configuration behind a reversible flag** and monitor. Keep Supabase as a backup until independently confirmed.
8. **Retire Supabase after verified backup, authentication account cutover, and rollback window.** Don't delete historical incident records prematurely.

## Required security/integrity tests before publishing
- Forged/expired/reused sign-in tokens and sessions; CSRF; nonstaff trying staff endpoints.
- HTML/JS strings displayed as inert chat text; malicious links and payload-size limits.
- Suspended and hidden authors cannot bypass restriction through direct API or WebSocket messages; moderator cannot restore.
- Anonymous watchers can view scheduled programs but cannot post; no public attendance feed or identifiable presence.
- No arbitrary client updates to staff roles, timestamps, username snapshots or message visibility.
- Rate limiting, D1 query exhaustion, durable-object restart, duplicate delivery, reconnect after network drop.
- Verify moderation audit persists and recovery/rollback works.

## Cost controls
Start with Cloudflare's free-tier quotas and low-traffic staging, set monitoring/alerts, measure real chat connection durations and request rates. Workers/D1/Durable Objects have distinct limits. The free plan may fail closed on daily D1/Workers limits; this is not an unlimited free realtime-hosting promise. Review the official pricing and limits before production.

## Known existing GitHub red X
Supabase Preview fails on `kipg_profiles already exists` in a repeated SQL migration. It does **not** mean a Cloudflare migration occurred, and must not be 'fixed' by deleting existing Supabase data.
