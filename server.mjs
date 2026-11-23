import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '').replace(/\/+$/, '');
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, 'data'));
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, 'clipboard.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    owner_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS items_by_room ON items(room_code, created_at DESC);
  CREATE INDEX IF NOT EXISTS rooms_by_expiry ON rooms(expires_at);
`);

const sql = {
  purge: db.prepare('DELETE FROM rooms WHERE expires_at <= ?'),
  insertRoom: db.prepare('INSERT INTO rooms (code,title,owner_hash,created_at,expires_at) VALUES (?,?,?,?,?)'),
  room: db.prepare('SELECT code,title,owner_hash,created_at,expires_at FROM rooms WHERE code = ? AND expires_at > ?'),
  list: db.prepare('SELECT id,title,content,created_at,updated_at FROM items WHERE room_code = ? ORDER BY created_at DESC, id DESC'),
  count: db.prepare('SELECT COUNT(*) AS total FROM items WHERE room_code = ?'),
  addItem: db.prepare('INSERT INTO items (id,room_code,title,content,created_at,updated_at) VALUES (?,?,?,?,?,?)'),
  editItem: db.prepare('UPDATE items SET title = ?, content = ?, updated_at = ? WHERE id = ? AND room_code = ?'),
  item: db.prepare('SELECT id,title,content,created_at,updated_at FROM items WHERE id = ? AND room_code = ?'),
  deleteItem: db.prepare('DELETE FROM items WHERE id = ? AND room_code = ?'),
  deleteRoom: db.prepare('DELETE FROM rooms WHERE code = ?'),
};

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No ambiguous I, L, O, 0, 1.
const CODE_LENGTH = 6;
const MAX_ITEMS = 100;
const MAX_CONTENT = 16000;
const CODE_PATTERN = /^[A-HJ-KM-NP-Z2-9]{6}$/;
const MAX_BODY_BYTES = 100_000;
const STALE_AFTER_MS = 90_000;
const rateBuckets = new Map();

function rateLimit(req, kind, limit) {
  // Use direct peer address; untrusted X-Forwarded-For cannot bypass the limiter.
  const key = `${req.socket.remoteAddress || 'unknown'}:${kind}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key) || [];
  const active = bucket.filter(t => t > now - 60_000);
  if (active.length >= limit) {
    rateBuckets.set(key, active);
    return false;
  }
  active.push(now);
  rateBuckets.set(key, active);
  return true;
}

function generateCode() {
  // Rejection sampling prevents biased mappings of random bytes to alphabet positions.
  let s = '';
  while (s.length < CODE_LENGTH) {
    for (const byte of randomBytes(12)) {
      if (byte >= Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length) continue;
      s += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (s.length === CODE_LENGTH) break;
    }
  }
  return s;
}

const digest = token => createHash('sha256').update(token).digest('hex');
function isOwner(req, room) {
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(req.headers.authorization || '');
  if (!match) return false;
  const provided = Buffer.from(digest(match[1]), 'hex');
  const expected = Buffer.from(room.owner_hash, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function normalizeCode(raw) {
  const code = String(raw || '').toUpperCase().replace(/-/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}

const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function respond(res, code, body, extra = {}) {
  res.writeHead(code, { ...HEADERS, 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', ...extra });
  res.end(JSON.stringify(body));
}
const bad = (res, code, error) => respond(res, code, { error });

async function readJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { const e = new Error('Invalid JSON'); e.status = 400; throw e; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const e = new Error('Expected a JSON object'); e.status = 400; throw e;
  }
  return value;
}

function validText(value, max, required = true) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s.length > max || (required && !s)) return null;
  return s;
}
function validContent(value) {
  // Copy/paste must preserve indentation, spaces and trailing newlines exactly.
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_CONTENT) return null;
  return value;
}

function publicRoom(room) {
  return { code: room.code, title: room.title, createdAt: room.created_at, expiresAt: room.expires_at };
}

function getRoom(code) { return sql.room.get(code, Date.now()); }

const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/config.js', ['config.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
const staticCache = new Map();
for (const [url, [name, type]] of staticFiles) {
  // Production API-only hosting must never require generated Pages assets.
  try { staticCache.set(url, [readFileSync(join(ROOT, 'public', name)), type]); }
  catch (error) {
    if (error.code !== 'ENOENT' || name !== 'favicon.svg') throw error;
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const path = requestUrl.pathname;
  // Railway remains an API host. Browser visits to its home page use GitHub Pages.
  if ((req.method === 'GET' || req.method === 'HEAD') && (path === '/' || path === '/index.html') &&
      /\.up\.railway\.app(?::\d+)?$/i.test(req.headers.host || '')) {
    res.writeHead(302, { Location: 'https://namthedev.github.io/clipboard/' + requestUrl.search,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(); return;
  }
  // Allow the optional GitHub Pages frontend to contact a separately hosted API.
  // Do not use wildcard CORS for endpoints with an owner bearer token.
  if (ALLOWED_ORIGIN && req.headers.origin === ALLOWED_ORIGIN && path.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS' && path.startsWith('/api/')) {
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  try {
    if (req.method === 'GET' && staticCache.has(path)) {
      const [buffer, contentType] = staticCache.get(path);
      res.writeHead(200, { ...HEADERS, 'Content-Type': contentType, 'Cache-Control': 'public, max-age=300' });
      res.end(buffer);
      return;
    }
    if (req.method === 'GET' && /^\/icons\/[a-z0-9-]+\.svg$/.test(path)) {
      try {
        const buffer = readFileSync(join(ROOT, 'public', path.slice(1)));
        res.writeHead(200, { ...HEADERS, 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' });
        res.end(buffer);
      } catch (error) {
        if (error.code === 'ENOENT') return bad(res, 404, 'Icon not found.');
        throw error;
      }
      return;
    }
    if (req.method === 'GET' && path === '/api/health') {
      respond(res, 200, { ok: true }); return;
    }
    if (path === '/api/rooms' && req.method === 'POST') {
      if (!rateLimit(req, 'create', 10)) return bad(res, 429, 'Too many vaults created. Try again shortly.');
      const body = await readJson(req);
      const title = validText(body.title ?? 'Untitled Vault', 60);
      const hours = body.duration === '7d' ? 168 : body.duration === '24h' || body.duration == null ? 24 : null;
      if (!title || !hours) return bad(res, 400, 'Invalid vault name or duration.');
      const ownerToken = randomBytes(32).toString('base64url');
      const now = Date.now();
      let code;
      let inserted = false;
      for (let n = 0; n < 10; n++) {
        code = generateCode();
        try { sql.insertRoom.run(code, title, digest(ownerToken), now, now + hours * 3_600_000); inserted = true; break; }
        catch (e) { if (!String(e.message).includes('UNIQUE')) throw e; }
      }
      if (!inserted) return bad(res, 503, 'Could not allocate a room ID.');
      respond(res, 201, { room: publicRoom(getRoom(code)), ownerToken }); return;
    }
    const roomMatch = /^\/api\/rooms\/([^/]+)(?:\/items(?:\/([^/]+))?)?$/.exec(path);
    if (!roomMatch) return bad(res, 404, 'Not found.');
    const code = normalizeCode(roomMatch[1]);
    if (!code) return bad(res, 400, 'Invalid room ID.');
    if (!rateLimit(req, 'room', 120)) return bad(res, 429, 'Too many requests. Try again shortly.');
    const room = getRoom(code);
    if (!room) return bad(res, 404, 'Room not found or expired.');
    const itemId = roomMatch[2];
    const isItemsPath = path.includes('/items');
    if (req.method === 'GET' && !isItemsPath) {
      respond(res, 200, { room: publicRoom(room), items: sql.list.all(code) }); return;
    }
    if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) return bad(res, 405, 'Method not allowed.');
    if (!isOwner(req, room)) return bad(res, 403, 'Only the vault creator can change its contents.');
    if (!rateLimit(req, 'write', 80)) return bad(res, 429, 'Too many changes. Try again shortly.');
    if (req.method === 'DELETE' && !isItemsPath) {
      sql.deleteRoom.run(code); respond(res, 200, { ok: true }); return;
    }
    if (req.method === 'POST' && isItemsPath && !itemId) {
      const body = await readJson(req);
      const title = validText(body.title ?? 'Text item', 80);
      const content = validContent(body.content);
      if (!title || !content) return bad(res, 400, 'Item name or content is missing or too long.');
      if (sql.count.get(code).total >= MAX_ITEMS) return bad(res, 409, 'Vault is full (100 items maximum).');
      const id = randomBytes(12).toString('hex');
      const now = Date.now();
      sql.addItem.run(id, code, title, content, now, now);
      respond(res, 201, { item: sql.item.get(id, code) }); return;
    }
    if (req.method === 'PATCH' && isItemsPath && itemId && /^[a-f0-9]{24}$/.test(itemId)) {
      const item = sql.item.get(itemId, code);
      if (!item) return bad(res, 404, 'Item not found.');
      const body = await readJson(req);
      const title = validText(body.title, 80);
      const content = validContent(body.content);
      if (!title || !content) return bad(res, 400, 'Invalid item name or content.');
      sql.editItem.run(title, content, Date.now(), itemId, code);
      respond(res, 200, { item: sql.item.get(itemId, code) }); return;
    }
    if (req.method === 'DELETE' && isItemsPath && itemId && /^[a-f0-9]{24}$/.test(itemId)) {
      const deleted = sql.deleteItem.run(itemId, code);
      if (!deleted.changes) return bad(res, 404, 'Item not found.');
      respond(res, 200, { ok: true }); return;
    }
    bad(res, 405, 'Method not allowed.');
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error(error);
    bad(res, error.status || 500, error.status ? error.message : 'Unexpected server error.');
  }
});

const cleanup = setInterval(() => {
  sql.purge.run(Date.now());
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.every(t => t < now - STALE_AFTER_MS)) rateBuckets.delete(key);
  }
}, 30 * 60_000);
cleanup.unref();
server.listen(PORT, HOST, () => console.log(`clipboard on http://${HOST}:${server.address().port}`));

function shutdown() {
  clearInterval(cleanup);
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
