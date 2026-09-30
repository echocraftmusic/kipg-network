# Framework Architecture

## Layers

| Layer | Responsibility |
| --- | --- |
| `core/` | Design tokens, base styles, navigation, forms, notifications, modals, configuration, events, and utilities used by nearly every project. |
| `templates/` | Starting page structures. Copy and customize these inside a project. |
| `modules/` | Optional feature packages such as administration and analytics. |
| `integrations/` | External service adapters. They remain disconnected in the master framework. |
| `assets/` | Project images, icons, fonts, and media. The master contains placeholders only. |
| `docs/` | Build standards and checklists. |

## Core principles

1. Keep project-specific business rules outside `core/`.
2. Use semantic design tokens instead of repeating colors throughout page CSS.
3. Prefer browser-native accessible elements such as `dialog`, buttons, labels, tables, and landmarks.
4. Treat client-side storage as prototype or device-local storage—not a production database.
5. Treat authentication and authorization as separate concerns.
6. Put privileged operations behind RLS and protected server functions.
7. Load optional modules only when a project uses them.
8. Keep the master framework free of live credentials and customer data.

## Event convention

The core exposes `window.EC.events`. Events use the `ec:` prefix, including:

- `ec:ready`
- `ec:app-started`
- `ec:config-loaded`
- `ec:theme-change`
- `ec:form-success`
- `ec:form-error`
- `ec:modal-open`
- `ec:modal-close`
- `ec:storage-change`
- `ec:admin-ready`

Modules can subscribe without tightly coupling themselves to page-specific code.

## Theme convention

Components consume semantic variables such as `--ec-bg`, `--ec-surface`, `--ec-text`, `--ec-border`, and `--ec-metal`. A theme changes the variables, not the component structure. Add future client themes by defining another `[data-ec-theme="..."]` block with the same semantic variable set.

