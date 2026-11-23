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
- `public/style.css` — synchronized MD3 foundation from keep.
- `public/clipboard.css` — clipboard-only layout overrides.

## Server

- `server.mjs` — HTTP server, persistence wiring, and route handling.
- `server/security.mjs` — code generation, owner-token authorization, request throttling, and cleanup.

## Design principles

Keep API/clipboard/format utilities independent from UI. Keep DOM ownership in UI modules. Avoid dependencies flowing from core to presentation, and avoid unrelated backend/data changes. The Pages frontend imports modules directly; the self-hosted server serves only allowlisted nested module paths. Existing storage keys and API routes remain unchanged.

## Verification

Run `npm test`, `npm run check`, the Playwright UI workflow, and the GitHub Pages deployment smoke test. The UI should expose all actions contextually: vault create/join in the home/side navigation; refresh, share, new item, paste and edit in the active room; settings and privacy in the sidebar.
