import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No ambiguous I, L, O, 0, 1.
const CODE_LENGTH = 6;
const MAX_ITEMS = 100;
const MAX_CONTENT = 16000;
const CODE_PATTERN = /^[A-HJ-KM-NP-Z2-9]{6}$/;
const MAX_BODY_BYTES = 100_000;
const STALE_AFTER_MS = 90_000;
const rateBuckets = new Map();

export function rateLimit(req, kind, limit) {
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

export function generateCode() {
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
export function isOwner(req, room) {
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(req.headers.authorization || '');
  if (!match) return false;
  const provided = Buffer.from(digest(match[1]), 'hex');
  const expected = Buffer.from(room.owner_hash, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function normalizeCode(raw) {
  const code = String(raw || '').toUpperCase().replace(/-/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}

export function cleanupRateBuckets() {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.every(t => t < now - STALE_AFTER_MS)) rateBuckets.delete(key);
  }
}
