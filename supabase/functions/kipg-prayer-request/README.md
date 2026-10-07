# KIPG prayer delivery — deployment in progress

Browser submissions will enter the encrypted Cloudflare R2 queue. This function accepts only forwarding authenticated with X-KIPG-Recovery-Secret; the old direct browser form is not compatible and must remain disabled.

## Setup

1. Run migrations 20261006_005 and 20261007_006 in the KIPG project.
2. Set DELIVERY_SECRET to the exact secret stored in the Worker. Keep existing RESEND_API_KEY; Supabase supplies its URL and service-role key.
3. Replace and deploy kipg-prayer-request using index.ts. Keep legacy JWT verification OFF because the handler authenticates the shared secret.
4. Leave both Worker enable flags false until deployment, frontend wiring and admin review are complete.
5. Test normal delivery, outage capture and recovery, duplicate requests, cleanup failure and failure of both stores before opening the public form.

Each submission UUID is also its database primary key and Resend idempotency key. SQL functions claim a two-minute lease under a row lock. Changed content using the same ID is rejected. Delivery returns status=delivered plus that ID only after Resend acceptance and successful sensitive-field cleanup. This status means provider acceptance; it is not an inbox delivery receipt.

Unconfirmed retries stop at 23 hours from the first claim, before Resend's 24-hour key expiry. The prayer stays protected for staff review. Never reset that deadline blindly. The shared secret also keys the payload fingerprint, so changing it requires a migration strategy for existing records.

The table and all three SQL functions are restricted to the service role. No secret or prayer content appears in HTTP errors or logs. The ministry email still goes to keepingitpg247@gmail.com with subject Prayer Request, and Reply-To is set only with contact permission.

Local verification:

    node --test supabase/functions/kipg-prayer-request/index.test.mjs cloudflare/prayer-recovery/worker.test.mjs

These use mocked services. Actual PostgreSQL claim concurrency, Cloudflare-to-Supabase forwarding, Resend inbox delivery and controlled failover require live acceptance tests.
