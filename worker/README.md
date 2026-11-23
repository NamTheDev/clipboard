# Clipboard sharing API (Cloudflare Workers + D1)

This is an optional hosted API for the GitHub Pages frontend. Its room and item
endpoints are compatible with the local Node.js/SQLite server.

## Deploy

Requires a Cloudflare account, Wrangler, and a D1 database.

1. From the repository root, run:

   ```sh
   cd worker
   npm install
   npx wrangler login
   npx wrangler d1 create clipboard-rooms
   ```

2. Copy `wrangler.toml.example` to `wrangler.toml`. From the create output,
   copy the real D1 **database ID** into `database_id`, replacing
   `PASTE_YOUR_DATABASE_UUID_HERE`. Keep `ALLOWED_ORIGIN` set to
   `https://namthedev.github.io` for the intended GitHub Pages site.

3. Initialize the remote database and deploy the Worker:

   ```sh
   npx wrangler d1 execute clipboard-rooms --remote --file=./schema.sql
   npx wrangler deploy
   ```

4. Wrangler prints a public `https://...workers.dev` URL. In GitHub repository
   **Settings → Secrets and variables → Actions → Variables**, set
   `CLIPBOARD_API_BASE` to that URL, with **no trailing `/api`**. Re-run the
   GitHub Pages workflow.

The frontend and backend must both be on HTTPS for copying to work reliably.

## API and storage

- `POST /api/rooms` creates a 24-hour or 7-day room and returns an owner token.
- `GET /api/rooms/:code` reads public room contents.
- Owner-authorized `POST/PATCH/DELETE` add, update, or remove items/rooms.
- Data is persisted in D1; expired rooms are inaccessible immediately.
- A daily cron deletes expired rooms and their items.
- D1 schema: [`schema.sql`](schema.sql).

## Security

This is a **short-code text transfer utility**, **not** an encrypted private
vault. Anyone with a room ID can read the room. Do not paste credentials or
sensitive data. The creator token is a 256-bit secret stored only as a SHA-256
hash in D1; the frontend keeps the original token in its own browser storage.

CORS is restricted to the configured Pages origin, but CORS **does not prevent
non-browser clients** from calling the API. A modest in-memory per-isolate
rate limiter is included; it does **not** reliably enforce global limits.
Before public/high-volume usage, enable Cloudflare WAF/rate limiting and
consider abuse prevention. The UI supports text only, 100 items per vault,
maximum 16,000 characters per item.

`wrangler.toml` contains your D1 database identifier and is ignored by Git; the
`.example` file is safe to commit. No Cloudflare authentication token is
committed. For a non-default Pages domain, update `ALLOWED_ORIGIN` accordingly.
