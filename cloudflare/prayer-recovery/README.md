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

Local tests cover capture, encryption, validation, secret rejection, outage retention, confirmation/purge and deduplication. Live end-to-end delivery and failover have not yet been tested. Run: node --test cloudflare/prayer-recovery/worker.test.mjs supabase/functions/kipg-prayer-request/index.test.mjs

Resend keeps idempotency keys for 24 hours. The database stops unconfirmed retries after 23 hours from the first claim, preserving the request for staff review instead of risking a duplicate. See https://resend.com/changelog/idempotency-keys. Keep the delivery secret stable while requests or deduplication records exist: it also keys their content fingerprints. Rotation needs a planned fingerprint migration. Admin review and retention are still required before launch.
