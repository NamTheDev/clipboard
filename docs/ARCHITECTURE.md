# Codebase architecture

## Frontend (native ES modules)

- `public/index.html` — semantic app shell; no redundant desktop menu or action toolbar.
- `public/app.js` — room controller, UI rendering, user actions, and event coordination.
- `public/js/ui/dom.js` — selector helpers.
- `public/js/ui/dialog.js` — dialog lifecycle and focus restoration.
- `public/js/ui/sidebar.js` — mobile navigation drawer.
- `public/js/core/api.js` — HTTP API adapter and authorization headers.
- `public/js/core/clipboard.js` — copy/paste browser abstraction.
- `public/js/core/preferences.js` — settings persistence, defaults and validation.
- `public/js/core/room-code.js` — room ID validation and formatting.
- `public/config.css` — synchronized [shared design configuration](https://github.com/NamTheDev/util/blob/main/design/config.css).
- `public/bootstrap.min.css` — vendored Bootstrap 6 stylesheet.
- `public/style.css` — shared application layout and component styling.
- `public/clipboard.css` — clipboard-only layout overrides.

## Server

- `server.mjs` — HTTP server, persistence wiring, and route handling.
- `server/security.mjs` — code generation, owner-token authorization, request throttling, and cleanup.

## Design principles

Keep API/clipboard/format utilities independent from UI. Keep DOM ownership in UI modules. Avoid dependencies flowing from core to presentation, and avoid unrelated backend/data changes. The Pages frontend imports modules directly; the self-hosted server serves only allowlisted nested module paths. Existing storage keys and API routes remain unchanged.

## Verification

Run `npm test`, `npm run check`, the Playwright UI workflow, and the GitHub Pages deployment smoke test. The UI should expose all actions contextually: vault create/join in the home/side navigation; refresh, share, new item, paste and edit in the active room; settings and privacy in the sidebar.

## Consistent sidebar and minimal page copy

The sidebar groups Navigation, Current vault, room Actions and Preferences using the same `.sidebar-heading`, `.sidebar-group` and `.nav-btn` classes as keep. Room controls live in this sidebar rather than a second toolbar or footer. Desktop uses a persistent sidebar; mobile uses a drawer. Decorative page kickers and duplicate home-card labels were removed. The CSS source of truth is [util/design/config.css](https://github.com/NamTheDev/util/blob/main/design/config.css).

## Bootstrap-first styling

Follow the [shared minimum-custom-CSS standard](https://github.com/NamTheDev/util/blob/main/design/DESIGN_PRINCIPLES.md). Use native components and existing utilities directly in static and generated markup; shared theme values remain in config.css. Remaining local styles cover application-specific responsive geometry, component token overrides, dynamic colors where applicable, compact touch controls, dialogs, and interaction states that existing utilities cannot directly preserve. Avoid reintroducing generic layout or appearance rules.
