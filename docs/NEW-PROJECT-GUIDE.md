# New Project Guide

## 1. Preserve the master archive

Never build a client website directly inside the archived master. Copy the framework into a new project folder and work from the copy.

## 2. Define the project

Record the following before adding pages:

- business name and audience;
- primary action visitors should take;
- required pages;
- required forms and where submissions go;
- whether an administrator area is needed;
- whether authentication or durable data is needed; and
- launch domain and hosting environment.

## 3. Configure the foundation

Update `core/config/site.json`, the document titles, descriptions, canonical URLs, contact details, and navigation. Replace the placeholder monogram or add the approved logo.

## 4. Choose capabilities intentionally

| Requirement | Use |
| --- | --- |
| Static marketing site | `core/`, `index.html`, and `templates/` |
| Contact form | `core/js/forms.js` plus a real submission endpoint |
| Local prototype/dashboard | `modules/admin/` with browser storage |
| Real accounts or durable records | `integrations/supabase/` after schema and RLS review |
| First-party events | `modules/analytics/` with a protected endpoint |
| Referral SaaS | Separate Referral SaaS Foundation package |

Do not add a database, login, analytics, upload system, or administration panel when the project does not require it.

## 5. Create content and pages

Start from the closest template. Each page needs a unique title, description, first heading, useful copy, keyboard-accessible interactions, and a clear next step.

## 6. Connect forms safely

The starter contact form validates inputs but does not send them anywhere. Connect a trusted form provider, serverless function, or protected Supabase Edge Function. Never expose private email or API credentials in the browser.

## 7. Test before launch

Use `docs/LAUNCH-CHECKLIST.md`, then run:

```bash
npm run verify
```

The included local preview command is:

```bash
npm run serve
```

Open `http://localhost:8080` while the server is running.

