# KIPG Prayer 2.0 — Cloudflare-first staging plan

**Do not enable public submission yet.** Website `data/prayer-config.json` remains `enabled:false`. Existing recovery Worker must also remain `SUBMISSIONS_ENABLED=false`. No Cloudflare secrets belong in GitHub.

## Storage and privacy design
- Cloudflare Worker: verifies Turnstile and rate limits, validates input, generates encrypted R2 payloads.
- Cloudflare R2: stores the complete request encrypted with AES-256-GCM (random IV per item). The encryption key is a Worker secret and must be securely backed up.
- Cloudflare D1: stores only an opaque UUID, encrypted object key, request status, follow-up indicator, and timestamps. Never store the prayer text or contact details in D1.
- Status values: pending, reviewing, prayed, follow_up, closed.
- No publicly accessible dashboard endpoints. Authorized staff dashboard and access validation must be implemented and independently tested before enabling submissions.
- No public prayer wall and no visitor search/list endpoints. Notifications must omit personal content.
- Existing Supabase delivery/recovery code is legacy and remains **disabled**. Do not enable DELIVERY_ENABLED until a properly reviewed Cloudflare-only delivery process replaces it.

## Setup still required
1. Create a private D1 database and run `schema.sql`; configure Worker D1 binding with name `PRAYER_DB`.
2. Use existing private R2 bucket `kipg-prayer-recovery` with `PRAYER_RECOVERY` binding.
3. Provision Turnstile and IP rate limiting; bind `TURNSTILE_SECRET_KEY`, `PRAYER_RATE_LIMITER`, `RECOVERY_ENCRYPTION_KEY` securely.
4. Deploy Cloudflare-only Worker on a controlled route; keep `SUBMISSIONS_ENABLED=false` in both site and Worker.
5. Complete staff identity verification and protected read/status actions (e.g. Cloudflare Access JWT verified server-side), operational alerts, key rotation, data retention, backups, and a deletion path.
6. Test encryption, malicious payloads, duplicate UUIDs, concurrent requests, D1/R2 outages, rate limits, Turnstile expiration, and unauthorized attempts to retrieve prayer text.
7. Only enable site submission and Worker when both are verified. A low-traffic website still deserves full privacy controls.

## Pilot conventions
The first-name-or-initial and email fields are still required by the current form; revisit anonymous prayer support before launch. Keep this feature free of Supabase dependencies.

## Implemented in GitHub (not yet deployed)
- `worker.js`: public intake with Turnstile, rate limits, R2 encryption, D1 request metadata, and generic Resend notifications retried by cron. Default state remains OFF.
- `admin-worker.js`: standalone Cloudflare Access-protected private dashboard; reads/decrypts encrypted R2 records and updates status in D1. Uses verified Access RS256 JWT + explicit `PRAYER_ADMIN_EMAILS` allowlist. The admin URL is **not** an ordinary static GitHub Pages route.
- `schema.sql`: includes status queue, notification receipt timestamp, and staff audit records.
- `worker.test.mjs`: unit tests; run `node --test cloudflare/prayer-v2/worker.test.mjs`.

## Cloudflare operator deployment checklist (must complete before enabling)
1. Create a **private** D1 database (suggested `kipg-prayer`) through Cloudflare Workers & Pages -> D1. Execute `schema.sql` in its console. Supply its binding as `PRAYER_DB` to **both** new Workers.
2. Bind existing private R2 bucket `kipg-prayer-recovery` as `PRAYER_RECOVERY` to both new Workers. Back up `RECOVERY_ENCRYPTION_KEY` securely and bind exactly the same key to both Workers; avoid key rotation without re-encrypting existing objects.
3. Deploy the public intake Worker separately from the admin Worker; connect Turnstile secret `TURNSTILE_SECRET_KEY`, rate limiter `PRAYER_RATE_LIMITER`, `SUBMISSIONS_ENABLED=false`, and the existing controlled origin policy. The website `data/prayer-config.json` must remain `enabled:false`.
4. Configure the restricted admin Worker on a **separate hostname** protected by a Cloudflare Access application and an Access allow policy for PG and Troy, requiring strong identity verification/MFA. Supply `ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com`, the application's `ACCESS_AUD`, and secret `PRAYER_ADMIN_EMAILS` with only approved verified email addresses. Access policies alone are insufficient; Worker also verifies the signed JWT and exact email allowlist.
5. Establish `prayers@kipgnetwork.com` and validate outgoing domain via the chosen notification provider (Resend integration currently coded). Provide `RESEND_API_KEY`, `PRAYER_NOTIFICATION_FROM`, and `PRAYER_NOTIFICATION_TO=prayers@kipgnetwork.com` to intake Worker only. Leave `NOTIFICATIONS_ENABLED=false` until verified and monitor cron errors. Configure a cron trigger, e.g. `*/5 * * * *`.
6. Test with synthetic prayers only: blocked unauthenticated staff URLs, Cloudflare Access JWT validation, encryption/decryption, D1 and R2 outage handling, same-origin anti-CSRF status edits, duplicate submissions, Turnstile anti-bot checks, rate limits, authorized status updates, email acceptance and retries. Verify audit rows for status changes.
7. Set documented retention, data deletion and archival procedures and key backup/recovery; define handling of urgent threats and sensitive requests. Establish monitoring so undelivered notifications and unread prayers are visible.
8. **Only after** the protected dashboard, privacy policies, mailbox and end-to-end test succeed: update the website endpoint, turn on the intake Worker `SUBMISSIONS_ENABLED`, and finally set `data/prayer-config.json` to `enabled:true`. Never enable the legacy Supabase prayer-delivery flags.

The repository is public; never commit Wrangler account IDs, API keys, auth tokens, mailbox passwords, prayer content, or real request exports. Cloudflare secrets must be configured in the platform.
