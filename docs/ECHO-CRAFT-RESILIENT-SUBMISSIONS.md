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
