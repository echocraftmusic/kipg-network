# Echo Craft Resilient Submission Standard

This standard applies to any client form where losing a submission could harm the client relationship, reputation, revenue, or user trust.

## Required behavior

Every important form should use a layered submission flow:

1. Capture the submission locally before attempting the network request.
2. Send to the primary backend/database.
3. If the primary backend is unavailable, preserve the submission in a recovery queue.
4. If appropriate for the data type, write a second durable server-side fallback copy.
5. Show the visitor a calm confirmation only after the submission has been preserved somewhere durable enough for recovery.
6. Retry queued submissions automatically when the primary backend becomes available again.
7. Use a unique submission ID so retries cannot create duplicates.
8. Keep front-end validation synchronized with database constraints.
9. Remove recovery copies after successful synchronization so temporary storage does not accumulate.
10. Maintain an admin-visible status for pending and recovery-queued submissions.
11. Provide a controlled test mode before launch so failover can be verified without taking production services offline.

## User-facing language

Do not expose infrastructure failures when the submission has been safely preserved. Use language such as:

> Thank you. Your submission has been received and is being held for review.

The exact wording should match the form purpose.

## Privacy levels

### Standard business submissions
Examples: reviews, booking inquiries, contact leads, testimonials.

A secondary email or server-side queue may be acceptable if it is configured appropriately and does not expose secrets.

### Sensitive submissions
Examples: prayer requests, counseling-related notes, health-related or highly personal information.

Do not send full sensitive content through a generic email fallback. Use protected server-side storage, restricted admin access, encrypted transport, and short retention. Recovery copies should be purged after successful synchronization.

## KIPG prayer requests

When prayer-request submission is implemented, it must follow the sensitive-submission rules above:

- primary storage: KIPG backend/database
- fallback: protected server-side recovery queue
- visitor confirmation should remain calm and non-technical
- no full prayer text in generic email fallback
- unique submission IDs and duplicate protection
- admin-only visibility
- automatic retry and purge after successful sync
- failover test required before launch

## Origin

This standard was adopted after a real-world review submission was lost when a primary backend service was unavailable. The goal is to make graceful failure and recovery part of the default Echo Craft build process rather than a one-off repair.


## Review System Guardrail

For any future Echo Craft website that collects and publishes reviews, use this checklist before launch:

1. **Separate public and admin database policies.** Public visitors may read only approved reviews. Admin access must use a separate authenticated policy. Never make the public-read rule depend on querying an admin-only table.
2. **Test as a true anonymous visitor.** Verify the public review feed in a signed-out/private browser session, not only in a browser where an admin has previously signed in.
3. **Test on desktop, Android, and iPhone.** A successful desktop/admin test does not count as a complete public test.
4. **Verify the backend directly.** Before changing frontend code, test the anonymous database/API request and record the exact HTTP/database error. Diagnose first; do not guess.
5. **Keep frontend and database rules aligned.** Approved/pending status, validation lengths, consent requirements, and duplicate handling must match the live database schema.
6. **Use explicit asset versioning after CSS/JS changes.** When changing review display or submission code, bump the stylesheet/script version in the page so mobile browsers do not retain stale assets.
7. **Keep review body text highly legible.** Use a clean reading font for long testimonials; reserve decorative display fonts for headings and accents.
8. **Retain resilient submission recovery.** Capture locally before network transmission, use duplicate-safe IDs, and use the approved fallback/retry pattern from this standard.
9. **Run a full publish-path test.** Submit a test review, confirm it is pending, approve it, then verify that a signed-out visitor can see it on all supported device classes.
10. **Remove test data and temporary diagnostic switches after verification.**

This guardrail was added after the Crazy Carla review rollout exposed two preventable issues: an anonymous RLS policy that depended on an admin-only table, and stale mobile CSS after a typography update.
