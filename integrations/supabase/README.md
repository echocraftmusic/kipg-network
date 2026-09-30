# Optional Supabase Integration

Use this integration only when a project needs authentication, durable database records, storage, or server-backed workflows.

## Setup

1. Create a separate development Supabase project.
2. Copy `supabase-config.example.js` to `supabase-config.js`.
3. Add the development project URL and publishable key.
4. Load the official Supabase browser library before the configuration file.
5. Create and test the project's database tables and RLS policies.
6. Update the expected roles in `admin-guard.js` for that project.

## Never place in browser code

- a service-role key;
- email-provider credentials;
- payment-provider secrets;
- private API keys; or
- unprotected administrative operations.

The publishable key is not the security boundary. Row Level Security and server-side authorization are the security boundary.

