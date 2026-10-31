# KIPG Prayer Ministry — operations, privacy and urgent-request handling

**Operational baseline — 2026-10-31**

This document governs how KIPG Prayer Ministry handles confidential requests once public intake is approved. It is an internal ministry workflow, not a promise of real-time crisis response or professional counseling.

## 1. Ministry scope
- KIPG Prayer Ministry receives confidential prayer requests and may provide pastoral encouragement or requested follow-up.
- The prayer team is **not** an emergency dispatch service, crisis hotline, medical provider, therapist, or law-enforcement agency.
- The public form must state that requests may not be seen immediately and direct people in immediate danger to 911 and people in emotional distress or mental-health crisis in the U.S. to call or text 988.
- Prayer-team members should not promise response times that the ministry cannot consistently meet.

## 2. Access and confidentiality
- Only explicitly authorized ministry staff may access the private prayer dashboard.
- Prayer text, names, email addresses and phone numbers remain encrypted in R2 and must never be copied into GitHub issues, ordinary email, chat, screenshots, analytics or public posts.
- Generic notification email may say only that a confidential prayer request is waiting; it must not include prayer content or contact details.
- Staff should avoid downloading or locally copying request content unless there is a specific ministry need.
- Contact information may be used only to honor the visitor's selected follow-up preference for that request.

## 3. Queue and status workflow
- **New / Pending:** not yet reviewed.
- **Being reviewed:** a ministry leader is actively reviewing or assigning it.
- **Prayed for:** prayer has occurred and no further action is currently required.
- **Follow-up needed:** visitor requested contact or ministry staff agreed to continue contact.
- **Closed:** prayer request is complete and ready for retention review.

Status changes should identify the authorized staff account in the D1 audit trail. Requests should not remain indefinitely in Pending or Follow-up without review.

## 4. Practical retention baseline
KIPG should collect and retain as little confidential material as reasonably necessary.

- **Pending / Reviewing:** review at least weekly while active.
- **Follow-up needed:** review at least every 30 days and close when the agreed follow-up is complete.
- **Prayed for:** close when no further follow-up is needed.
- **Closed requests:** review for deletion within 30 days.
- **Maximum ordinary retention:** target removal of the encrypted request and direct contact data within 90 days after closure unless there is a specific, documented ministry reason to keep it longer.
- Do **not** implement automatic deletion until the manual deletion workflow, audit behavior and backup consequences have been deliberately reviewed and tested.
- Audit metadata may be retained separately from prayer content if it contains no prayer text or contact details and is needed for security/accountability.

If a visitor asks for deletion and the ministry can reliably identify the request, authorized staff should prioritize deletion rather than waiting for the ordinary retention window.

## 5. Urgent or high-risk content
If a prayer request appears to describe immediate danger, suicide/self-harm risk, violence, abuse, medical emergency or another urgent safety concern:

1. Do not rely on prayer-dashboard messaging as emergency intervention.
2. If the person is actively communicating with KIPG, encourage them to contact appropriate emergency/crisis help immediately.
3. In the U.S., immediate danger or medical emergency → **911**. Emotional distress or mental-health crisis → **988** by call or text.
4. Escalate internally to the designated KIPG ministry lead promptly.
5. Do not improvise clinical advice, conduct an amateur risk assessment, or promise confidentiality beyond what KIPG can responsibly guarantee.
6. If staff believe an emergency response or mandatory report may be legally required, pause ministry-only handling and seek appropriate qualified/legal guidance for the specific situation and jurisdiction.
7. Record only the minimum operational note needed in the status/audit system; do not duplicate sensitive content into ordinary notes or email.

KIPG should designate at least one primary and one backup ministry lead before launch so an urgent request is not dependent on a single person being available.

## 6. Follow-up communication
- Email follow-up: use only the email address voluntarily supplied for the request.
- Phone call follow-up: use only the supplied phone number and identify the caller as KIPG Prayer Ministry.
- Text follow-up: use only when the visitor explicitly selected text and the stored consent flag is true.
- Initial launch should use **manual person-to-person** follow-up. No bulk messaging, marketing, automated SMS campaign or unrelated solicitation is authorized by prayer-request consent.
- If a visitor asks staff to stop contacting them, stop follow-up and update/close the request.

## 7. Deletion and backups
- Deleting a prayer must eventually remove its encrypted R2 object and related active queue metadata in a controlled workflow.
- Do not delete encryption keys while any prayer object still depends on them.
- Never rotate a live encryption key by simple overwrite without a migration/re-encryption plan for existing encrypted objects.
- The owner-held production-key recovery copy must remain secured separately from GitHub, ChatGPT and ordinary email.
- Before any destructive batch cleanup, confirm database counts, object prefixes and backup/recovery consequences.

## 8. Operational review cadence
Until traffic patterns are known:
- Check the prayer queue at least once each ministry day when intake is live.
- Review Pending/Reviewing items weekly.
- Review Follow-up items every 30 days or sooner.
- Review Closed items monthly for deletion.
- Review staff access whenever ministry roles change.
- Test recovery with fictional data periodically and after any encryption/key change.

## 9. Launch requirements remaining after encryption readiness
Before enabling public requests:
- Confirm authorized staff identities and backup ministry lead.
- Confirm privacy/retention workflow and manual deletion procedure.
- Create and verify the prayer mailbox and generic notification delivery.
- Run one final controlled intake rehearsal using fictional data.
- Confirm the public urgent-help notice is visible and usable on desktop/mobile.
- Explicitly approve public launch before enabling the Worker and website switches.
