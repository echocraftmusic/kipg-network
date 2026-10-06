# KIPG prayer request function

This function receives the public Prayer page form, validates it server-side, stores a temporary private recovery copy, sends the request through Resend to `keepingitpg247@gmail.com`, then purges the sensitive recovery fields after Resend accepts delivery.

## Required setup

1. Run `supabase/migrations/20261006_005_prayer_requests.sql` in the KIPG Supabase SQL Editor.
2. Create/deploy an Edge Function named `kipg-prayer-request` using `index.ts`.
3. Reuse the existing `RESEND_API_KEY` Edge Function secret. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Disable the legacy gateway JWT check for this public function. The handler allows only the KIPG production origins and validates every field itself.
5. Submit one real test from the site. Confirm:
   - recipient is `keepingitpg247@gmail.com`
   - subject is exactly `Prayer Request`
   - body shows Name, Email, Contact Requested and Prayer Request
   - Reply-To is the visitor only when Contact Requested = Yes
   - the database row is marked `accepted` and sensitive fields are null after delivery
6. Only after that test passes, change `data/prayer-config.json` to `"enabled": true`.

## Privacy and resilience

The browser never contains the Resend API key or service-role key. The recovery table has RLS enabled and no anon/authenticated policies. If email delivery fails or becomes uncertain, the private recovery row remains for review. After accepted delivery, name, email, request text and contact preference are purged from the recovery table.
