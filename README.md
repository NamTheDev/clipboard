# clipboard

**Web app:** https://namthedev.github.io/clipboard/

A Windows 95/98-style, GitHub Pages-hosted shared clipboard. Make a temporary vault, paste text snippets, and share a short, easy-to-type room ID. Another browser or device can join and copy items without an account.

## Hosting and architecture

**GitHub Pages is the one public website for clipboard.** The static UI lives in `public/`, published by [Deploy GitHub Pages](.github/workflows/deploy-pages.yml). Only HTML, CSS, SVG and client-side JavaScript are shipped to the Pages URL. The source link and share-link origin always use the Pages address, without tracking parameters.

Because GitHub Pages cannot store synchronized vaults, a separate **API-only runtime** is necessary for the original cross-device room feature. Railway hosts the Node.js + SQLite API at `https://clipboard-production-afe5e7e4.up.railway.app/api/`. This is **not a second public website**: browser visits to the Railway homepage redirect to the GitHub Pages URL. Do not remove `server.mjs` or `Dockerfile`; they operate the active room-sharing API. The SQLite database is persisted on a Railway volume at `/data`, with one runtime replica. The API restricts cross-origin browser requests to `https://namthedev.github.io` using `ALLOWED_ORIGIN`.

The Pages workflow writes `public/config.js` at build time, using the `CLIPBOARD_API_BASE` repository variable (with the Railway API URL as the default). Do not put access tokens or private keys in that file.

## How to use

1. Create a vault (24 hours or 7 days). You receive a six-character room ID, formatted as `ABC-234`.
2. Add one or more snippets using **New item** or **Paste text**.
3. Use **Copy ID** or **Copy link** to share the vault.
4. Open the Pages app in another browser, enter the code, choose an item and select **Copy text**. Guests have read-only access.
5. The creator can edit or delete items and the whole vault. Owner credentials are stored only in the creator browser's localStorage.

## Settings and design

**View → Settings**, **toolbar → Settings**, or **Start → Settings** opens the preferences dialog: classic/dark theme, default expiration, and automatic refresh (off / 5 / 15 / 30 seconds). Settings persist per browser.

Both `clipboard` and [keep](https://namthedev.github.io/keep/) share the same visual contract from [Chris Lemke's Windows 95/98 design reference](https://chrislemke.github.io/website_designs/designs/Windows_95_98.html): teal desktop `#008080`, silver faces `#c0c0c0`, navy-to-blue title bars, square controls, and the four-tone raised/recessed bevel system. Dark mode uses the same neutral four-tone palette adapted for keep; the reference has no official dark theme. Icons are monochrome. The two apps differ in screen content and workflow, not in design language. See [CREDITS.md](CREDITS.md).

## Build, API development and tests

Requires Node.js 22.13+. These commands are for local development/testing, **not GitHub Pages hosting**:

```sh
npm run check
npm test
npm start
```

Use `DATA_DIR` for a writable database directory. On local development, the API server also serves the static UI at `http://127.0.0.1:3000` to support integrated browser tests. Production visitors use GitHub Pages only.

GitHub Actions run [backend tests](.github/workflows/test.yml), [Chromium UI regression](.github/workflows/ui-verification.yml), post-deployment [live Pages + API smoke tests](scripts/smoke-deployment.mjs), [commit-format checks](.github/workflows/commit-message-format.yml), and [AI-disclosure checks](.github/workflows/ai-disclosure-format.yml). See [commit_message_format.txt](commit_message_format.txt) and [AI_DISCLAIMER.md](AI_DISCLAIMER.md).

## Security and limitations

Vault IDs are **access codes, not passwords**. Anyone who knows or guesses a room ID can read the vault. Shared content is **not end-to-end encrypted**. Do not put credentials, financial records or other secrets into vaults. Rooms expire automatically; the owner token is not included in shared links. The app has not undergone an independent security audit.

## License

MIT. Original design reference is separately attributed in [CREDITS.md](CREDITS.md).

## Unified fullscreen shell and icon pack

The app now fills the browser viewport rather than simulating an OS desktop, window controls, or taskbar. File/Edit/View/Help menus, quick-action toolbar, address strip, status strip, dialogs and room-sharing workflow remain. Both clipboard and keep share the same Windows 95/98 visual tokens and a Dark mode checkbox in Settings.

Icons and the transparent favicon are installed from the [Lucide Static icon pack](https://lucide.dev/) (version `1.77.0`), not manually drawn. The Pages workflow installs this package and copies only selected monochrome SVG icons into the static artifact. In dark mode, their strokes are rendered light.

For complete local frontend preview, run `npm install && npm run icons && npm start`. The public app remains on GitHub Pages, and Railway serves only the cross-device sharing API.

## Native dark-mode detection for browser extensions

Both clipboard and [keep](https://namthedev.github.io/keep/) advertise their **actual native theme**, not the OS preference. `theme-signal.js` runs before the stylesheet and sets `<meta name="color-scheme" content="light|dark">`, the `<html data-theme="light|dark">` attribute, root `color-scheme`, and the browser theme-color. The theme is also announced through `app-theme-change` whenever Settings saves it. This follows [Dark Reader's official native-dark-theme detection recommendation](https://github.com/darkreader/darkreader/discussions/15128). No extension is installed or forcibly disabled; in light mode, Dark Reader can continue to offer its transformations.

## Design system port from keep

The former clipboard-specific `public/style.css` was **fully replaced** with the complete `src/style.css` source from [NamTheDev/keep](https://github.com/NamTheDev/keep). The copied file is the common, authoritative Windows 95/98 design foundation. The new `public/clipboard.css` contains **only clipboard-specific layout** (room IDs, item cards, two-pane preview, responsive clipboard flows), and uses keep's existing CSS variables for all palette colors and bevels. The clipboard HTML now uses the same actual `main-window`, `menu-btn`, `popup`, `tool-btn`, `nav-btn`, `content-heading`, `note-window`, `note-paper`, `chrome-btn`, `dialog-window`, and `status-cell` components as keep. The sharing API, notes, room controls, Settings, icon pack, fullscreen layout, and native-dark-mode extension signals are preserved.
