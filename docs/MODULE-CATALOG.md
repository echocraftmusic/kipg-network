# Module Catalog

## Core modules

- `ec-framework.js`: versioned global utilities and event bus.
- `theme-manager.js`: Cherry Executive and Black Onyx selection and persistence.
- `navigation.js`: accessible responsive navigation behavior.
- `notifications.js`: live-region toast notifications.
- `modal.js`: native dialog opening and closing.
- `forms.js`: client-side validation and submission hook.
- `site-config.js`: loads site identity and shared values.
- `app.js`: initializes the standard public-site experience.

## Administration modules

- `storage.js`: namespaced browser storage for prototypes.
- `repository.js`: generic local CRUD repository.
- `data-binding.js`: safe text and attribute binding.
- `dashboard.js`: functioning administration demonstration.

Do not use browser storage for production customer, financial, medical, authentication, or other sensitive records.

## Analytics module

`analytics.js` sends a deliberately small event payload to a project-owned endpoint. It avoids full referrer URLs and respects Global Privacy Control. Legal requirements, consent behavior, retention, and endpoint security still need to be decided per project.

## Content module

`collection.js` generalizes the current Echo Craft portfolio, services, FAQ and case-study JSON patterns. It loads arrays, filters them and renders DOM elements without inserting raw HTML.

## Supabase integration

The optional integration provides configuration, session, magic-link, and administrator-guard patterns. Each project must supply its own schema, RLS policies, approved redirect URLs, and development credentials.

## Referral module

The general framework includes only a routing note. Use the separate Referral SaaS Foundation for tenant, partner, referral, commission, payout, and subscription logic.
