# Project guide

**Website:** https://namthedev.github.io/clipboard/

A temporary shared clipboard with short vault IDs and a compact, Catppuccin Bootstrap 6-based interface. Create a vault, save snippets, and share a six-character room ID with another device. Guests can read and copy; owners can add, edit or remove items.

## Using clipboard

Create or join a vault from the home cards or sidebar. Inside a vault, **New item**, **Paste text**, **Copy ID**, **Copy link**, **Refresh**, **Leave vault**, and owner-only **Delete vault** live in the sidebar. The list/preview interface provides **Copy text**, **Edit**, and **Delete** for selected items. **Settings**, **Privacy & sharing**, and **About** are also in the sidebar; use the menu button on smaller screens. The redundant File/Edit/View/Help menu and separate toolbar are removed.

Vaults expire after 24 hours or seven days. Settings include default expiry, and automatic refresh (off / 5 / 15 / 30 seconds). Preference keys, owner tokens and API routes remain compatible with earlier builds.

## Architecture and hosting

The public frontend is served exclusively from **GitHub Pages**. `public/index.html`, `public/app.js`, `public/js/core/` and `public/js/ui/` are native browser modules. The shared design configuration is synchronized from [util/design/config.css](https://github.com/NamTheDev/util/blob/main/design/config.css); `public/style.css` contains shell and component styling, and `public/clipboard.css` contains vault-specific layouts. See [Architecture](ARCHITECTURE.md) for module responsibilities.

The cross-device vault backend is separate. Railway hosts the Node.js/SQLite API at `https://clipboard-production-afe5e7e4.up.railway.app/api/` and redirects visits to its homepage to GitHub Pages. The repository variable `CLIPBOARD_API_BASE` configures the public frontend; credentials must never be placed in public JS. Keep `server.mjs`, `server/security.mjs`, `Dockerfile`, and the persisted SQLite volume for sharing. The API permits the configured origin through `ALLOWED_ORIGIN`.

## Design

The locally vendored Bootstrap 6.0.0-alpha.2 CSS requires Chrome/Edge 138, Firefox 147, or Safari 26. The current shared visual system uses Roboto, Material Symbols Rounded, fixed Catppuccin Mocha dark theme, compact spacing, tonal cards and outlined controls. A Lucide source SVG is still used for the **favicon only**, not interface actions.

## Development and tests

Requires Node.js 22.13+.

```sh
npm install
npm run icons
npm run check
npm test
npm start
```

The local server runs on `127.0.0.1:3000` by default, serving both the API and the allowlisted frontend modules. GitHub Actions run [backend tests](../.github/workflows/test.yml), [Chromium UI tests](../.github/workflows/ui-verification.yml), [GitHub Pages deploy and smoke tests](../.github/workflows/deploy-pages.yml), commit formatting and disclosure checks.

## Security

Vault IDs are access codes, **not passwords**. Anyone with a valid room ID can read vault contents; vault content is not end-to-end encrypted. Do not store passwords, financial records or other secrets in a vault. Owner tokens stay in the creator browser and are excluded from shared links. The app has not undergone an independent security audit.

MIT license. See [CREDITS.md](../CREDITS.md) and [AI_DISCLAIMER.md](../AI_DISCLAIMER.md).
