# KIPG Network — Phase 1 technical handoff (2026-10-30)

## Confirmed infrastructure (through connected Cloudflare and GitHub)
- GitHub Pages site is built and deploying; the site is **not approved for public promotion**.
- The public "Need Prayer?" button and private prayer page are present.
- D1 database `kipg-prayer` exists, including `prayer_requests` and `prayer_audit`.
- Private R2 bucket `kipg-prayer-recovery` exists, with public bucket domain disabled.
- Worker `kipg-prayer-intake` is deployed and bound to D1 and R2, with Turnstile, rate limiter (5 per 60 s per Cloudflare location/IP), a test-only AES-256-GCM key, and a five-minute cron.
- Public intake settings `SUBMISSIONS_ENABLED=false` and `NOTIFICATIONS_ENABLED=false`. The website's `data/prayer-config.json` also remains `enabled:false` and points to the *new* Worker.
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
