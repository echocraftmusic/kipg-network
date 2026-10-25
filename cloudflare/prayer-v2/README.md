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
