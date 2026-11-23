import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const dataDir = mkdtempSync(join(tmpdir(), 'clipboard-test-'));
const port = 33000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stderr.on('data', c => { output += String(c); });

async function request(path, method = 'GET', body, token) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json(), headers: r.headers };
}
async function ready() {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Child exited: ' + output);
    try { if ((await request('/api/health')).data.ok) return; }
    catch { await new Promise(resolve => setTimeout(resolve, 35)); }
  }
  throw new Error('Server not ready: ' + output);
}

test('vaults: create, read, owner-only add/edit/delete, expiration options', async () => {
  await ready();
  const created = await request('/api/rooms', 'POST', { title: 'My Test Vault', duration: '24h' });
  assert.equal(created.status, 201);
  const { room, ownerToken } = created.data;
  assert.match(room.code, /^[A-HJ-KM-NP-Z2-9]{6}$/);
  assert.ok(room.expiresAt - room.createdAt === 86400000);
  assert.ok(ownerToken.length > 40);
  const read = await request(`/api/rooms/${room.code.toLowerCase()}`);
  assert.equal(read.status, 200);
  assert.equal(read.data.room.title, 'My Test Vault');
  assert.ok(!('ownerToken' in read.data));
  assert.ok(!('owner_hash' in read.data));
  const forbidden = await request(`/api/rooms/${room.code}/items`, 'POST', { title: 'No', content: 'Access' });
  assert.equal(forbidden.status, 403);
  const item = await request(`/api/rooms/${room.code}/items`, 'POST', { title: '<script>', content: '  Hello\nWorld\n' }, ownerToken);
  assert.equal(item.status, 201);
  const id = item.data.item.id;
  assert.equal(item.data.item.title, '<script>'); // Client renders via textContent.
  assert.equal(item.data.item.content, '  Hello\nWorld\n'); // Clipboard whitespace must survive.
  const updated = await request(`/api/rooms/${room.code}/items/${id}`, 'PATCH', { title: 'Edited', content: 'New text' }, ownerToken);
  assert.equal(updated.status, 200);
  assert.equal(updated.data.item.content, 'New text');
  const blocked = await request(`/api/rooms/${room.code}/items/${id}`, 'DELETE', undefined, 'bad-token');
  assert.equal(blocked.status, 403);
  const deleted = await request(`/api/rooms/${room.code}/items/${id}`, 'DELETE', undefined, ownerToken);
  assert.equal(deleted.status, 200);
  assert.equal((await request(`/api/rooms/${room.code}`)).data.items.length, 0);
  const destroyed = await request(`/api/rooms/${room.code}`, 'DELETE', undefined, ownerToken);
  assert.equal(destroyed.status, 200);
  assert.equal((await request(`/api/rooms/${room.code}`)).status, 404);
  const week = await request('/api/rooms', 'POST', { duration: '7d' });
  assert.equal(week.status, 201);
  assert.equal(week.data.room.expiresAt - week.data.room.createdAt, 604800000);
});

test('validation, limits, static response headers', async () => {
  const created = await request('/api/rooms', 'POST', { title: 'Validation' });
  const { code } = created.data.room;
  const owner = created.data.ownerToken;
  assert.equal((await request('/api/rooms/BAD!', 'GET')).status, 400);
  assert.equal((await request('/api/rooms', 'POST', { duration: 'never' })).status, 400);
  assert.equal((await request(`/api/rooms/${code}/items`, 'POST', { title: 'x', content: 'x'.repeat(16001) }, owner)).status, 400);
  assert.equal((await request(`/api/rooms/${code}/items`, 'POST', { title: '', content: 'test' }, owner)).status, 400);
  const staticPage = await fetch(base);
  assert.equal(staticPage.status, 200);
  assert.match(await staticPage.text(), /Clipboard Vault Explorer/);
  assert.match(staticPage.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(staticPage.headers.get('x-content-type-options'), 'nosniff');
});

test.after(async () => {
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 1000))]);
  rmSync(dataDir, { recursive: true, force: true });
});
