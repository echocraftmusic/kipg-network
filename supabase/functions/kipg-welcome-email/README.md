# KIPG welcome email

Deployed by the project owner as `clever-processor` (the local folder keeps the descriptive name). The community page calls this endpoint after connecting a confirmed member.

1. Run `supabase/migrations/20261004_003_welcome_email.sql` once in the KIPG SQL Editor. Existing accounts are marked skipped; rerunning it also excludes accounts created since the first run, so do not rerun casually.
2. Add `RESEND_API_KEY` in Edge Functions → Secrets. Never put the key in website code. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side.
3. Replace the entire editor file with `index.ts`. Name the function `kipg-welcome-email`, deploy, and disable **Verify JWT with legacy secret** for this function. The handler validates the bearer token with Supabase Auth itself; anonymous requests remain rejected.
4. The website invokes `client.functions.invoke('clever-processor', {body: {}})` after connecting a confirmed member. It runs outside the Auth state-change callback and does not block access to the Viewing Room. If recreating the function under a different endpoint name, update the browser call to match.
5. Test with a newly registered account, confirm its magic link, and check Resend plus `kipg_welcome_deliveries`. Refresh and sign in again: there should be only one welcome. Existing test accounts receive none.

The handler sends only to the verified Auth email, never a browser-supplied address. Newsletter consent is unaffected. `accepted` means Resend accepted the email, not proof of inbox delivery. There is no background queue; sending begins when the confirmed member returns to the community page. A `pending` or `needs_review` record blocks automatic retries to prevent duplicate welcomes after uncertain network failures. Review Resend and the record before any manual retry; Resend idempotency lasts only 24 hours. Quarterly newsletter delivery is not part of this function.
