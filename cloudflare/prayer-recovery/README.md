# Private prayer recovery — deployment in progress

The Worker is deliberately closed by default. R2 bucket and Worker binding have been created in Cloudflare. The public prayer form remains disabled.

Paste worker.js into the dashboard editor. Its GET / response shows whether submissions are enabled, without reading or exposing prayer data.

Required before opening:
- Add RECOVERY_ENCRYPTION_KEY as a Worker secret: base64-encoded 32 cryptographically random bytes. Back up the key securely; replacing it while records remain makes those records unreadable.
- Add DELIVERY_SECRET to the Worker and the Supabase function; never put secrets in GitHub or the website.
- Add DELIVERY_URL pointing to the project's kipg-prayer-request function.
- Run migrations 005 and 006, then deploy the updated Supabase index.ts. The new endpoint requires DELIVERY_SECRET and returns status=delivered only after email acceptance and confirmed database cleanup. The old status=received response is intentionally insufficient to purge R2.
- Add a five-minute scheduled trigger.
- Wire the website to /submit with a stable submission UUID and local draft capture.
- Add protected admin review for pending requests and a retention/review policy. Do not automatically delete undelivered prayers.
- Test normal delivery, database outage, recovery, duplicate requests and both storage services failing. Only then enable the public form and Worker flags.

Pending prayer content is AES-GCM encrypted before R2 writes. HTTP responses never return it. Receipt objects retain only a random ID and delivery time to prevent recreating delivered requests. Configure receipt expiry only alongside the endpoint's deduplication retention policy.

Local tests cover capture, encryption, validation, secret rejection, outage retention, confirmation/purge and deduplication. Live testing on October 7 confirmed encrypted R2 capture while delivery was paused, automatic scheduled forwarding after delivery was enabled, inbox arrival, a delivered receipt, and removal of the pending encrypted object. A real database outage and public browser flow still need live tests. Run: node --test cloudflare/prayer-recovery/worker.test.mjs supabase/functions/kipg-prayer-request/index.test.mjs

Resend keeps idempotency keys for 24 hours. The database stops unconfirmed retries after 23 hours from the first claim, preserving the request for staff review instead of risking a duplicate. See https://resend.com/changelog/idempotency-keys. Keep the delivery secret stable while requests or deduplication records exist: it also keys their content fingerprints. Rotation needs a planned fingerprint migration. Admin review and retention are still required before launch.


## Submission security — activation pending

The hardened worker.js requires both TURNSTILE_SECRET_KEY and PRAYER_RATE_LIMITER. It fails closed when either is missing or unavailable. There is no production bypass for PowerShell or a forged Origin header. GET / remains a non-sensitive health response; it reports the submissions flag, not full security readiness.

Create a Managed Turnstile widget allowing only kipgnetwork.com and www.kipgnetwork.com. Keep its secret in the Worker secret TURNSTILE_SECRET_KEY. The public site key can be shared for frontend integration. Render the widget with action prayer_submit and cData equal to the stable lowercase submission UUID. Send its token as turnstileToken with the prayer. Obtain a fresh token for retries: tokens are single-use. The server checks success, exact origin hostname, action, and submission ID before any R2 reads/writes. Only the token, secret and client network address go to Siteverify; prayer text and contact information do not.

Bind PRAYER_RATE_LIMITER using the ratelimits entry in wrangler.jsonc: namespace 2026100701, 10 attempts per 60 seconds. Check this namespace is unused by other Workers before deployment. This is an anonymous form, so the key uses Cloudflare's client IP (not user-provided forwarding headers). Shared networks share this allowance; monitor false rejections. Cloudflare's limiter is local and eventually consistent, not a strict worldwide cap or full DDoS defense. Rejections return 429 and Retry-After: 60. Keep separate account alerts and review for distributed abuse.

Deployment order: configure widget secret and rate binding; paste/deploy the hardened worker.js with the existing R2 binding and delivery secrets; promote the correct new version to 100%; confirm a tokenless submission is rejected; integrate the public widget and Worker URL while the website form remains disabled; live-test valid, invalid, expired/reused tokens and rate limits; only then open the public form. Existing encrypted pending requests can still be delivered by the scheduled handler without a browser token.

The committed SUBMISSIONS_ENABLED and DELIVERY_ENABLED defaults remain false to avoid accidental launch from a fresh CLI deployment. Preserve the intentionally chosen dashboard flags and DELIVERY_URL when deploying. Dashboard variable edits may require promoting their saved version.

Cron attempts are capped at 25 objects per run to bound runtime during a backlog. Persistent failed records still require protected staff review and operational alerts; the cap is not a complete fair queue.

Verify MFA on Cloudflare, GitHub, Supabase and the staff email accounts. Do not disable MFA or share passwords/backup codes here. The account setting checks, full database RLS/staff-role audit, protected recovery admin, and retention policy remain pending; this change does not claim to complete them.

References: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ and https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/.
