# KIPG Network — Phase 1 technical handoff (2026-10-30)

## Confirmed infrastructure (through connected Cloudflare and GitHub)
- GitHub Pages site is built and deploying; the site is **not approved for public promotion**.
- The public "Need Prayer?" button and private prayer page are present.
- D1 database `kipg-prayer` exists, including `prayer_requests` and `prayer_audit`.
- Private R2 bucket `kipg-prayer-recovery` exists, with public bucket domain disabled.
- Worker `kipg-prayer-intake` is deployed and bound to D1 and R2, with Turnstile, rate limiter (5 per 60 s per Cloudflare location/IP), a test-only AES-256-GCM key, and a five-minute cron.
- Public intake settings `SUBMISSIONS_ENABLED=false`, `PRODUCTION_KEY_READY=false` and `NOTIFICATIONS_ENABLED=false`. The website's `data/prayer-config.json` also remains `enabled:false` and points to the *new* Worker.
- Worker `kipg-prayer-admin` is deployed and bound to D1/R2, with a matching **test-only** encryption key and Cloudflare Access JWT verification.
- Cloudflare Access protects `prayer-admin.kipgnetwork.com`; current access emails are `troy.saha@gmail.com` and `george@kipgnetwork.com` (the second address must be verified before testing). The admin Worker's public `workers.dev` hostname remains disabled.
- Previous Worker `kipg-prayer-recovery`: `workers.dev` disabled; both legacy `SUBMISSIONS_ENABLED=false` and `DELIVERY_ENABLED=false`; existing secrets preserved. No website should target it.
- KIPG DNS currently uses Purelymail MX/DKIM, SPF, DMARC, and existing Resend-related DNS. **No mail routing records were modified.**
- CI includes automated prayer intake, browser form, and launch-gate tests.

## Not complete: explicit launch blockers
1. **Encryption key custody.** The current shared AES key is for synthetic test data ONLY. Replace it before real prayer requests, and securely back up the final key outside GitHub and ChatGPT so both Workers can recover the same encrypted R2 objects. Never copy the key into the repository. Test restoration and establish rotation procedures.
2. **Staff authentication.** Test a real Cloudflare Access login, JWT verification, dashboard list/read/status actions, and forbidden access in a separate browser. Confirm PG's verified email; replace the placeholder if needed. Enforce available MFA options.
3. **Notification sender and receiving mailbox.** Verify `prayers@kipgnetwork.com` exists in Purelymail or its actual provider. Provision a provider-approved Resend API key as a Cloudflare Worker secret, verify sender authorization, and enable `NOTIFICATIONS_ENABLED` ONLY after a successful synthetic email. Never email prayer contents.
4. **Operational review.** Agree on retention/deletion windows, backup and restore strategy, handling of urgent requests, on-call owners, and errors/alerting. No unreviewed automatic deletion.
5. **Private end-to-end testing.** Test Turnstile, rate limiting, D1/R2 data consistency, duplicate requests, encrypted R2 retrieval, Access deny/allow, status audit atomics, and notification retries. All tests use invented data; then clear test records once policies are settled.
6. **Public approval.** Only after the above: enable the Worker `SUBMISSIONS_ENABLED`; verify production settings; then flip public `enabled:true` with a controlled rollout. Keep the old Worker disabled.

## Other Phase 1 items
- **Supabase / community:** GitHub Pages build/deploy currently passes; Supabase Preview reports an existing relation `kipg_profiles`. Do NOT re-run foundational migrations on production to silence the warning. Current connected Supabase tool permissions deny database inspection, so resolve via authorized database review before modifying schema.
- **Membership:** verify genuine email sign-in, username/profile, welcome email, newsletter consent, and multi-account RLS behavior.
- **Viewing Room / Theater One:** full multi-device schedule, pre- and post-show chat, moderator hide/restore, attendance privacy, playback, idle sponsorship display, and failure/reconnect rehearsal. Public sessions remain unscheduled until host approval.
- **Site:** final mobile/desktop/accessibility/navigation/performance check and review of privacy terms and community guidelines before promotion.
- **Phase 2 (not required for launch):** private paid theaters, independent artist programming, live unattended scheduling, broader video catalog, music-video licensing workflow.

## Operational checks
- GitHub: `npm test`, `npm run verify`, `npm run verify:seo`; inspect GitHub Actions after every deployment.
- Cloudflare: verify new Worker settings (don't infer status from code alone), D1 tables, R2 privacy, Access policy, cron, and active scripts.
- Never expose secrets or confidential prayer contents in logs, email, GitHub, public API responses, or screenshots.

## Private synthetic prayer rehearsal (2026-10-30)
- The Cloudflare Access-protected `prayer-admin.kipgnetwork.com` dashboard now has a **Test Prayer** form, activated only on the private admin Worker by `PRAYER_TEST_MODE=true`. Do not publish the dashboard URL as a public ministry entry point.
- Authorized ministry leads can type an invented visitor name and fictional request, explicitly affirm no real confidential information is included, and submit. Requests are encrypted with the temporary shared rehearsal key and stored in R2 under `test/<uuid>.json`; D1 contains metadata only.
- Synthetic records are tagged `TEST` in the queue, support the standard status and audit flow, and can be deleted from both D1 and R2 using the explicit private delete action. Test deletion cannot target ordinary prayer records.
- Test entries are marked with `notification_sent_at` to prevent email queuing; the intake Worker also excludes `test/%` objects from future notification retries. Email and public submission switches remain off.
- **Before accepting real requests:** remove all test records; verify D1 and R2 cleanup; set `PRAYER_TEST_MODE=false` (or remove the binding), replace and securely back up the temporary test-only encryption key on both Workers, verify authorized sign-in, complete private end-to-end tests, and configure ministry retention/alerts. The testing key must not be used to encrypt real people's prayers.

## Production readiness two-switch safeguard (2026-10-30)
The intake Worker requires **both** `SUBMISSIONS_ENABLED=true` and `PRODUCTION_KEY_READY=true` to accept requests. The readiness binding must remain `false` while the key is only a temporary rehearsal key or its owner-held recovery copy is missing. A public form enablement also remains a separate final step. Changing any one switch alone must not launch intake.

## Manual follow-up contact options (2026-10-31)
- The prayer page now asks whether follow-up is requested, then offers **Email**, **Text message**, or **Phone call**. Only the selected method's contact field becomes required. Text messaging also requires a separate explicit opt-in checkbox.
- The Cloudflare intake validates every method and consent state server-side and encrypts the chosen method, phone number or email, and SMS consent in private R2 alongside the prayer text. D1 continues to hold only queue metadata (including the follow-up requested flag).
- The protected dashboard reveals the contact preference, relevant address/number, and text consent only when an authorized ministry leader opens the request. Contact information stays out of queue summaries, notification emails, and public pages.
- **No automatic SMS or calls are implemented.** Any future integration with an SMS provider must be separately reviewed for consent, opt-out handling, messaging rules, and privacy. Initial responses should be manual by authorized ministry leaders.
- Public intake remains disabled until the owner-held production encryption-key backup, confidential retention rules, and remaining launch gates are approved.

## Owner-held production encryption recovery (2026-10-31)
- A separate [Production Encryption & Recovery Playbook](PRAYER-ENCRYPTION-RECOVERY.md) now describes local key generation, encrypted owner backup and recovery verification without placing the secret in ChatGPT or the public GitHub repository.
- Intake requires `PRODUCTION_KEY_FINGERPRINT` to match SHA-256 of the actual `RECOVERY_ENCRYPTION_KEY` **in addition to** the existing production-readiness and submission switches. An absent or mismatched fingerprint must fail closed.
- The protected staff Worker exposes `GET /api/key-fingerprint` after verified Cloudflare Access JWT authentication; it returns a one-way SHA-256 fingerprint, never the key. The owner compares this to their offline record.
- Do not replace the current rehearsal key before the owner has saved and confirmed the recoverable production key, and do not enable intake during the transition. Cloudflare's Worker secret APIs do not provide a way to retrieve the secret later.
