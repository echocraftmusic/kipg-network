# KIPG Prayer Ministry — production encryption-key recovery

**Status:** The temporary testing key is still installed. Public submissions, production-key readiness, notifications and private test mode remain disabled. This document is a procedure, not permission to open intake.

## Why a separate recovery copy matters

The public intake Worker encrypts private requests with AES-256-GCM before storing them in a private Cloudflare R2 bucket. The private staff Worker decrypts them. **Both Workers must have the exact same 32-byte key**, encoded as Base64 (44 characters). D1 stores only request metadata.

Cloudflare Worker secrets cannot be read back after saving. If the key is replaced or lost, encrypted prayers already stored under it cannot be recovered without an owner-held copy. Store the key **outside GitHub, ChatGPT, email, and unencrypted cloud documents**.

## Owner-only key creation and custody

1. Open the private standalone **KIPG Prayer Encryption Key Kit** HTML file provided during setup. Download it to your own device and open it in a browser. This file has no network requests; generate the key locally with browser cryptography.
2. Select **Generate encryption key**. Save the complete recovery record (the Base64 key and its 64-character SHA-256 fingerprint) in an **encrypted password manager secure note** or directly on a **hardware-encrypted USB drive**. Avoid putting raw keys into ordinary documents or sending them through chat/email. If you use clipboard history or sync, clear the secret from it afterward.
3. Close the utility, reopen the saved record, and make sure the key and fingerprint are retrievable **before** installing the key anywhere.
4. In Cloudflare, open Workers & Pages → **kipg-prayer-intake** → Settings → Variables and Secrets → `RECOVERY_ENCRYPTION_KEY`. Replace its existing temporary value with the **same 44-character Base64 key**.
5. Repeat for **kipg-prayer-admin** → `RECOVERY_ENCRYPTION_KEY`. Never use two different keys; never replace either while live requests are being accepted.
6. Visit the **Cloudflare Access-protected** admin endpoint: `https://prayer-admin.kipgnetwork.com/api/key-fingerprint`. It returns **only a SHA-256 fingerprint**, not the key. Compare all 64 characters to the saved recovery record. An empty/error response means do not proceed.
7. Tell the technical assistant **only the fingerprint** and that you verified the securely stored recovery copy. **Never send the Base64 key.** The assistant can configure `PRODUCTION_KEY_FINGERPRINT` on the public intake Worker and check its fail-closed status remotely.
8. Complete a private end-to-end test and backup recovery drill before changing any launch switches or accepting actual prayer requests.

## Independent launch safeguards

The intake Worker requires all of the following before accepting a submission:
- `SUBMISSIONS_ENABLED=true` (currently `false`)
- `PRODUCTION_KEY_READY=true` (currently `false`)
- `PRODUCTION_KEY_FINGERPRINT` equals SHA-256 of the actual `RECOVERY_ENCRYPTION_KEY` (currently not configured)
- A valid Turnstile verification, rate-limit approval and working encrypted R2/D1 bindings
- The separate website config `data/prayer-config.json` must also be enabled **last** after explicit final approval

The fingerprint is a one-way hash of a randomly generated 256-bit key. Sharing the fingerprint (but not the key) is appropriate for matching. The fingerprint **does not prove a recovery copy exists**; that requires the owner's separate confirmation and a successful restoration test.

Do not turn on notifications until the receiving prayer mailbox and verified sender are ready.

## Recovery drill before launch

1. Check D1 and R2 for previously stored test requests; do not replace keys if any objects still rely on the old key.
2. Keep all public switches closed.
3. Verify the SHA-256 fingerprint from the owner's recovery record matches the protected admin endpoint after the two secrets are installed.
4. Create **fictional** requests through private test mode; confirm encryption, decryption, status change, delete, and zero residual R2/D1 test records.
5. Confirm the public intake Worker accepts no requests while production switches remain off.
6. Only after tests and owner approvals may an authorized operator mark `PRODUCTION_KEY_READY=true`; live intake and public form remain separate explicit actions.

## If a key is ever compromised

Immediately close public intake and disable related credentials. Preserve encrypted backups and metadata, investigate access, agree on a controlled re-encryption plan for existing objects, and rotate to a new backed-up key. **Never simply overwrite the only encryption key while requests encrypted with it remain stored.**
