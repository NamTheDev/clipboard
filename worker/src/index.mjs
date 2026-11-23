// Cloudflare Worker counterpart of server.mjs, for static GitHub Pages hosting.
// The public room ID grants READ access; the private creator token grants WRITE access.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-KM-NP-Z2-9]{6}$/;
const ITEM_RE = /^[0-9a-f]{24}$/;
const MAX_ITEMS = 100;
const MAX_CONTENT = 16_000;
const MAX_BODY_BYTES = 100_000;
const encoder = new TextEncoder();
const rateBuckets = new Map();

function bytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}
function roomCode() {
  let result = '';
  const bound = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  while (result.length < 6) {
    for (const value of bytes(12)) {
      if (value >= bound) continue;
      result += ALPHABET[value % ALPHABET.length];
      if (result.length === 6) break;
    }
  }
  return result;
}
function token() {
  return btoa(String.fromCharCode(...bytes(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function itemId() {
  return Array.from(bytes(12), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function sha256(value) {
  const digested = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digested), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function ownerAuthorized(request, room) {
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(request.headers.get('Authorization') || '');
  if (!match) return false;
  const provided = await sha256(match[1]);
  const expected = room.owner_hash;
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
function normalizeCode(raw) {
  const code = String(raw || '').toUpperCase().replace(/-/g, '');
  return CODE_RE.test(code) ? code : null;
}
function validTitle(value, max = 80) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}
function validContent(value) {
  return typeof value === 'string' && value.trim() && value.length <= MAX_CONTENT ? value : null;
}
function roomPayload(room) {
  return {code: room.code, title: room.title, createdAt: room.created_at, expiresAt: room.expires_at};
}
function corsHeaders(request, env) {
  const configured = (env.ALLOWED_ORIGIN || '').replace(/\/+$/, '');
  const origin = request.headers.get('Origin');
  const headers = { 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  if (origin && configured && origin === configured) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, Accept';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}
function reply(request, env, status, body) {
  return Response.json(body, {status, headers: corsHeaders(request, env)});
}
function denied(request, env, status, error) {return reply(request, env, status, {error});}
async function readJson(request) {
  // Stream the body, rejecting oversized submissions before buffering indefinitely.
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error('Expected a JSON body.'), {status: 400});
  let total = 0;
  const parts = [];
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw Object.assign(new Error('Request too large.'), {status: 413});
    }
    parts.push(value);
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { data.set(part, offset); offset += part.byteLength; }
  let value;
  try { value = JSON.parse(new TextDecoder().decode(data)); }
  catch { throw Object.assign(new Error('Invalid JSON.'), {status: 400}); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Expected a JSON object.'), {status: 400});
  }
  return value;
}
function allowRequest(request, group, limit) {
  // Per-isolate guard only. Enforce stricter public rate limiting at Cloudflare's edge.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = group + ':' + ip;
  const now = Date.now();
  const recent = (rateBuckets.get(key) || []).filter(t => t >= now - 60_000);
  if (recent.length >= limit) {rateBuckets.set(key, recent); return false;}
  recent.push(now);
  rateBuckets.set(key, recent);
  if (rateBuckets.size > 4096) rateBuckets.clear();
  return true;
}

async function handle(request, env) {
  const path = new URL(request.url).pathname;
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders(request, env)});
  if (method === 'GET' && path === '/api/health') return reply(request, env, 200, {ok: true});
  if (!env.DB) return denied(request, env, 503, 'Database not configured.');
  if (method === 'POST' && path === '/api/rooms') {
    if (!allowRequest(request, 'create', 10)) return denied(request, env, 429, 'Too many vaults created. Try again shortly.');
    const body = await readJson(request);
    const title = validTitle(body.title ?? 'Untitled Vault', 60);
    const duration = body.duration ?? '24h';
    const hours = duration === '24h' ? 24 : duration === '7d' ? 168 : null;
    if (!title || !hours) return denied(request, env, 400, 'Invalid vault name or duration.');
    const ownerToken = token();
    const ownerHash = await sha256(ownerToken);
    const now = Date.now();
    for (let n = 0; n < 10; n++) {
      const code = roomCode();
      try {
        await env.DB.prepare('INSERT INTO rooms (code,title,owner_hash,created_at,expires_at) VALUES (?,?,?,?,?)').bind(code, title, ownerHash, now, now + hours * 3_600_000).run();
        return reply(request, env, 201, {room: {code, title, createdAt: now, expiresAt: now + hours * 3_600_000}, ownerToken});
      } catch (error) {
        if (!/UNIQUE|constraint/i.test(String(error))) throw error;
      }
    }
    return denied(request, env, 503, 'Could not allocate a room ID.');
  }
  const match = /^\/api\/rooms\/([^/]+)(?:\/items(?:\/([^/]+))?)?$/.exec(path);
  if (!match) return denied(request, env, 404, 'Not found.');
  const code = normalizeCode(match[1]);
  if (!code) return denied(request, env, 400, 'Invalid room ID.');
  if (!allowRequest(request, 'room', 120)) return denied(request, env, 429, 'Too many requests. Try again shortly.');
  const room = await env.DB.prepare('SELECT code,title,owner_hash,created_at,expires_at FROM rooms WHERE code = ? AND expires_at > ?').bind(code, Date.now()).first();
  if (!room) return denied(request, env, 404, 'Room not found or expired.');
  const id = match[2];
  const isItems = path.includes('/items');
  if (method === 'GET' && !isItems) {
    const listing = await env.DB.prepare('SELECT id,title,content,created_at,updated_at FROM items WHERE room_code = ? ORDER BY created_at DESC, id DESC').bind(code).all();
    return reply(request, env, 200, {room: roomPayload(room), items: listing.results || []});
  }
  if (!['POST', 'PATCH', 'DELETE'].includes(method)) return denied(request, env, 405, 'Method not allowed.');
  if (!(await ownerAuthorized(request, room))) return denied(request, env, 403, 'Only the vault creator can change its contents.');
  if (!allowRequest(request, 'write', 80)) return denied(request, env, 429, 'Too many changes. Try again shortly.');
  if (method === 'DELETE' && !isItems) {
    // D1 defaults to foreign key enforcement; explicit delete protects older schema migrations.
    await env.DB.prepare('DELETE FROM items WHERE room_code = ?').bind(code).run();
    await env.DB.prepare('DELETE FROM rooms WHERE code = ?').bind(code).run();
    return reply(request, env, 200, {ok: true});
  }
  if (method === 'POST' && isItems && !id) {
    const body = await readJson(request);
    const title = validTitle(body.title ?? 'Text item');
    const content = validContent(body.content);
    if (!title || !content) return denied(request, env, 400, 'Item name or content is missing or too long.');
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM items WHERE room_code = ?').bind(code).first();
    if (count.total >= MAX_ITEMS) return denied(request, env, 409, 'Vault is full (100 items maximum).');
    const now = Date.now();
    const item = {id: itemId(), title, content, created_at: now, updated_at: now};
    await env.DB.prepare('INSERT INTO items (id,room_code,title,content,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(item.id, code, title, content, now, now).run();
    return reply(request, env, 201, {item});
  }
  if (id && ITEM_RE.test(id) && isItems && method === 'PATCH') {
    const current = await env.DB.prepare('SELECT id FROM items WHERE id = ? AND room_code = ?').bind(id, code).first();
    if (!current) return denied(request, env, 404, 'Item not found.');
    const body = await readJson(request);
    const title = validTitle(body.title);
    const content = validContent(body.content);
    if (!title || !content) return denied(request, env, 400, 'Invalid item name or content.');
    await env.DB.prepare('UPDATE items SET title = ?, content = ?, updated_at = ? WHERE id = ? AND room_code = ?').bind(title, content, Date.now(), id, code).run();
    const item = await env.DB.prepare('SELECT id,title,content,created_at,updated_at FROM items WHERE id = ? AND room_code = ?').bind(id, code).first();
    return reply(request, env, 200, {item});
  }
  if (id && ITEM_RE.test(id) && isItems && method === 'DELETE') {
    const result = await env.DB.prepare('DELETE FROM items WHERE id = ? AND room_code = ?').bind(id, code).run();
    if (!result.meta?.changes) return denied(request, env, 404, 'Item not found.');
    return reply(request, env, 200, {ok: true});
  }
  return denied(request, env, 405, 'Method not allowed.');
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (error) {
      console.error('clipboard worker failure:', error);
      return denied(request, env, error.status || 500, error.status ? error.message : 'Unexpected server error.');
    }
  },
  async scheduled(_event, env) {
    if (!env.DB) return;
    // Delete expired items first, independent of foreign-key cascade configuration.
    const now = Date.now();
    await env.DB.prepare('DELETE FROM items WHERE room_code IN (SELECT code FROM rooms WHERE expires_at <= ?)').bind(now).run();
    await env.DB.prepare('DELETE FROM rooms WHERE expires_at <= ?').bind(now).run();
  },
};
