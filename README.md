# EC Framework v2.0

Echo Craft Studio's reusable foundation for premium business websites, dashboards, portals, and SaaS applications.

Version 2.0.0 — September 2026

## What this is

EC Framework is the parent foundation. Individual projects—including Echo Craft Studio, client websites, and the referral SaaS—are built on top of it.

This archive was rebuilt from the latest Echo Craft Studio package and the original EC Framework. It keeps the reusable ideas while removing project-specific content, production credentials, and private data.

## Included

- responsive marketing-site starter;
- premium Cherry Executive and Black Onyx themes;
- reusable navigation, cards, buttons, forms, tables, badges, modals, and alerts;
- accessible mobile navigation and keyboard behavior;
- client-side form validation and safe status messaging;
- site configuration and JSON content loading;
- event-based framework core;
- notification, modal, storage, data-binding, and repository engines;
- optional Supabase client, session, and admin-guard integration;
- optional privacy-conscious analytics adapter;
- starter admin dashboard;
- page, service, contact, and admin templates;
- security, launch, and project-creation checklists; and
- a verification script to check the archive before reuse.

## Start a new website

1. Copy this entire folder and rename the copy for the new project.
2. Read `docs/NEW-PROJECT-GUIDE.md`.
3. Edit `core/config/site.json`.
4. Replace the placeholder copy in `index.html` and the files in `templates/`.
5. Add brand assets under `assets/`.
6. Enable only the optional integrations the project actually needs.
7. Run `npm run verify` before deployment.

## Architecture rule

Keep the framework generic. Business-specific pages, database tables, images, copy, and integrations belong in the project built from the framework—not back inside the master archive unless they are broadly reusable.

## Supabase rule

The browser may contain a Supabase URL and publishable key, but never a service-role key or private server secret. RLS must protect every non-public table. The supplied integration is intentionally disconnected until a new project provides its own development credentials and security policies.

## Relationship to the referral SaaS

The Referral SaaS Foundation is a separate product package. It can use this framework's design, navigation, forms, administration, themes, and Supabase connection conventions while maintaining its own multi-tenant database and business logic.

