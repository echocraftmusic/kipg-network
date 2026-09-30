# Source Map from the Current Echo Craft Studio

The current Echo Craft Studio package was used as the functional reference for v2.0. This archive is a cleaned framework—not a duplicate of the live website.

| Current Echo Craft capability | EC Framework v2 treatment |
| --- | --- |
| Navigation and responsive behavior | Consolidated into `core/css/layout.css` and `core/js/navigation.js`. |
| Foundation, utility, component, luxury and responsive styles | Consolidated into semantic tokens and five focused core stylesheets. |
| Forms and client-intake validation | Generalized into `core/js/forms.js`; project submission logic remains separate. |
| Modals and notifications | Rebuilt as native reusable modules. |
| JSON portfolio, services, FAQ and case-study patterns | Generalized into `modules/content/collection.js`. |
| Storage, create, edit, delete and data-binding engines | Consolidated into the generic administration repository, storage and binding modules. |
| Dashboard and widgets | Represented by a functioning starter dashboard without Echo Craft-specific records. |
| Supabase client and sessions | Moved to an optional integration with placeholder development configuration. |
| Administrator guard | Preserved as a reusable approved-profile guard, dependent on project RLS. |
| Analytics | Rebuilt as a privacy-conscious endpoint adapter. |
| Partner/referral program | Moved to the separate Referral SaaS Foundation because it is specialized product logic. |
| Echo Craft portfolio, services, testimonials and business copy | Excluded because they belong to the Echo Craft Studio project, not every future website. |
| Production Supabase configuration and records | Excluded intentionally. |

