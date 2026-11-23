# clipboard

**Primary web app:** https://namthedev.github.io/clipboard/ — this is the public frontend and the canonical share-link origin. Railway is used only for the JSON sharing API. Visiting the Railway app root redirects to GitHub Pages; `/api/` endpoints stay available.

**Settings:** Open **View → Settings**, the toolbar Settings control, or Start → Settings. Appearance (classic light / neutral dark), default vault expiration, and automatic refresh cadence are saved to this browser only. UI icons are monochrome; both themes use four-tone Windows 95/98 bevels.

**AI disclosure:** See [AI_DISCLAIMER.md](AI_DISCLAIMER.md) and [design attribution](CREDITS.md).


## Live deployment

- **GitHub Pages (primary):** https://namthedev.github.io/clipboard/
- **API (Railway):** https://clipboard-production-afe5e7e4.up.railway.app/

GitHub Pages hosts the Windows 98 interface; the Railway service stores shared rooms and pasted items. The API must allow origin `https://namthedev.github.io` via the Railway `ALLOWED_ORIGIN` setting. The Pages workflow uses the Railway API URL by default. Rooms are short-lived and not end-to-end encrypted.


A shared, temporary **text clipboard vault** with a Windows 95/98-style interface. Create a vault, add multiple snippets, share an easy-to-type **six-character room ID**, and copy the snippets from another browser or device.

## How it works

1. Select **Create Vault** and optionally set its name and expiration (24 hours or 7 days).
2. Paste one or more text items in the vault; they appear as a list with a preview pane.
3. Select **Copy ID** or **Copy link** and send it to another device.
4. On the second device, open the app and enter the room ID, such as `K7P-4MX`. The guest can select any item and choose **Copy text**.
5. The creator can add, edit, and delete items. The owner key is held in the creator's browser `localStorage`, **never** in shared links.

Vault content is fetched at the interval set in Settings (five seconds by default) while a room is open. Room IDs are case-insensitive; the code alphabet avoids ambiguous characters (`I`, `L`, `O`, `0`, `1`). Vault IDs are **access codes, not passwords**.

## GitHub Pages + a hosted sharing API

The frontend is **deployable on GitHub Pages**, at
`https://namthedev.github.io/clipboard/`, once the repository is pushed and
Pages is enabled. `.github/workflows/deploy-pages.yml` publishes `public/`
automatically on every push to `main`.

**GitHub Pages is static-only and cannot store or synchronize vaults.** The site
needs a separately hosted API to make short room codes work between browsers.
The repository includes **two interchangeable API backends**:

- `server.mjs`: Node.js + SQLite for self-hosting or a persistent Node server.
  Set `ALLOWED_ORIGIN=https://namthedev.github.io` when the public frontend
  calls it from GitHub Pages. Use HTTPS for its public API address.
- `worker/`: Cloudflare Worker + D1 for hosted persistent storage. This is the
  recommended GitHub Pages pairing; see [worker/README.md](worker/README.md).

### Publish to GitHub

The project targets a new **public** GitHub repository `NamTheDev/clipboard`.
With [GitHub CLI](https://cli.github.com/) installed and authenticated (`gh auth login`):

```sh
./publish-to-github.sh
```

The script creates/pushes the repository and attempts to configure Pages with
GitHub Actions as its publishing source. It does not overwrite any existing
repository. If Pages setup is denied, choose **Settings → Pages → Build and
deployment → Source: GitHub Actions** in the repository and re-run the workflow.

### Connect the API to GitHub Pages

After deploying the Worker (or HTTPS Node server), copy its **base URL**,
for example `https://clipboard-rooms-api.<your-subdomain>.workers.dev`.

In `NamTheDev/clipboard`, open **Settings → Secrets and variables → Actions →
Variables → New repository variable**, and set:

| Name | Value |
| --- | --- |
| `CLIPBOARD_API_BASE` | Your HTTPS API base URL, with no `/api` suffix |

Re-run **Actions → Deploy GitHub Pages → Run workflow** after changing the
variable. The deployment writes `public/config.js` into the Pages artifact.
The source file contains **no secret**: an API URL is public by design.

Until `CLIPBOARD_API_BASE` is configured and the API is online, the GitHub
Pages frontend shows an **explicit not-connected notice** rather than
pretending that shared vaults are available.

## Deploy as a complete web app on Railway (simplest public setup)

Railway can run **the whole Node + SQLite app on one HTTPS domain**. In this
mode, you do **not** need GitHub Pages, Cloudflare, CORS, or an API base URL:
the server serves the interface and API together.

1. Publish this repository to GitHub (`NamTheDev/clipboard`).
2. In Railway, create a project/service from this GitHub repository. Railway
   automatically builds the included `Dockerfile`.
3. **Attach a persistent volume** to the service with mount path `/data`.
   Without this, all vaults may disappear when the service is redeployed.
4. Railway mounts volumes as root; set the Railway service variable
   `RAILWAY_RUN_UID=0` so this container can access the volume. The image's
   default user remains `node` when run without this override.
5. Generate a Railway public HTTPS domain for the service. Set the healthcheck
   path to `/api/health`. The container binds `HOST=0.0.0.0` and reads the
   port from Railway's `PORT` environment variable.
6. Visit the Railway domain; **Create Vault** and **Join Vault** both work
   on that single HTTPS URL. Test between two devices.

Railway has a usage-based pricing model; check project billing and volume
availability. The Railway service should use one replica because this backend
has a single SQLite database file. When deploying from GitHub, GitHub Actions
still runs the tests, while Railway can automatically redeploy the application.

Official references: [Railway services](https://docs.railway.com/services),
[Railway volumes](https://docs.railway.com/volumes),
[Railway variables](https://docs.railway.com/variables/reference).

## Run locally

Requires **Node.js 22.13+**. No npm dependencies.

```sh
npm start
```

Open <http://localhost:3000>. By default the app listens on `127.0.0.1`. To access it from another machine on your LAN, run:

```sh
HOST=0.0.0.0 PORT=3000 npm start
```

Then open `http://YOUR-LAN-IP:3000` from both devices. Browser clipboard APIs require HTTPS on public domains or localhost; on plain HTTP, use the manual paste editor and, where supported, the legacy copy fallback.

Run tests and syntax checks:

```sh
npm run check
npm test
```

## Docker / self-hosting

```sh
docker compose up -d --build
```

A named Docker volume stores the SQLite database under `/data`. **Back up this volume** if necessary. To publish on the internet, place the app behind a reverse proxy with HTTPS and configure access controls appropriate for your environment.

**GitHub Pages can host the static interface**, but a separate live API is required for shared rooms. Use the Worker + D1 instructions above or deploy this Node server with HTTPS and `ALLOWED_ORIGIN`.

## API

| Method | Endpoint | Access |
| --- | --- | --- |
| `POST` | `/api/rooms` | Create; send `{ "title": "My Clipboard", "duration": "24h" }` |
| `GET` | `/api/rooms/:code` | Read metadata and all items via code |
| `POST` | `/api/rooms/:code/items` | Owner bearer token; `{ "title": "...", "content": "..." }` |
| `PATCH` | `/api/rooms/:code/items/:id` | Owner bearer token; update title/content |
| `DELETE` | `/api/rooms/:code/items/:id` | Owner bearer token |
| `DELETE` | `/api/rooms/:code` | Owner bearer token |
| `GET` | `/api/health` | Health check |

The room creation response contains `ownerToken`; keep it secret. API changes require `Authorization: Bearer <ownerToken>`.

## Security and limitations

- **Not end-to-end encrypted**. Room content is stored as plaintext in SQLite. Anyone with (or able to guess) a room code can read it. Do not store passwords, private documents, or other sensitive data.
- Tokens are generated from cryptographically secure random bytes. The server stores only a SHA-256 hash of the owner token.
- Requests are rate-limited in memory by directly connected IP, but this is a modest abuse deterrent, **not** a complete defense against distributed guessing or denial-of-service attacks. Large public deployments should add a trusted reverse-proxy rate limiter.
- A vault expires after 24 hours or 7 days and is removed by periodic cleanup (or the next cleanup after it expires). The app limits each vault to 100 text items, each containing up to 16,000 characters.
- Clipboard reading is subject to browser permission and secure-context rules. Manual paste (`Ctrl+V`) always remains available in the editor.
- The creator's owner token is device/browser specific. If browser data is cleared, that device loses editing access. Opening a share URL does not transfer ownership.
- This version shares **text only** (no files, rich text, images, or permanent accounts).
- Single-process SQLite backend. Use one server instance per database volume.

## Visual design

CSS follows [Chris Lemke's Windows 95/98 reference](https://chrislemke.github.io/website_designs/designs/Windows_95_98.html): `#008080` teal desktop, `#C0C0C0` panel faces, four-tone raised/sunken borders, `#000080`-to-`#1084D0` active title bars, squared buttons, compact typography, Explorer-style navigation, and a bottom taskbar. No UI frameworks or remote assets are loaded.

## License

MIT. The interface is inspired by the linked historical UI design reference; this is an independent implementation. GitHub Pages publishing uses relative asset paths so the app can live at `/clipboard/`.

## Development policies

Commits use [commit_message_format.txt](commit_message_format.txt). GitHub Actions check new commit message format and the structure/linkage of the [AI disclosure](AI_DISCLAIMER.md); branch rules are required to make checks block direct pushes.
