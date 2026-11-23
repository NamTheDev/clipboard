import assert from 'node:assert/strict';

// Runs after GitHub Pages publishes. Exercises the actual public hosting and API.
const site = 'https://namthedev.github.io/clipboard/';
const api = (process.env.CLIPBOARD_API_BASE || 'https://clipboard-production-afe5e7e4.up.railway.app').replace(/\/+$/, '');
const origin = new URL(site).origin;

async function req(url, options = {}) {
  return await fetch(url, { cache: 'no-store', ...options });
}
async function deployed() {
  const page = await req(site + '?smoke=' + Date.now());
  if (!page.ok || !(await page.text()).includes('Clipboard Vault Explorer')) return false;
  const js = await req(site + 'config.js?smoke=' + Date.now());
  return js.ok && (await js.text()).includes(api);
}
let ready = false;
for (let n = 0; n < 12; n++) {
  try { if (await deployed()) { ready = true; break; } }
  catch (error) { console.warn('Pages availability check:', error.message); }
  if (n < 11) await new Promise(resolve => setTimeout(resolve, 5000));
}
assert.ok(ready, 'GitHub Pages did not serve the app with its configured sharing API');
console.log('✓ GitHub Pages serves the clipboard app and correct API config');

const health = await req(api + '/api/health');
assert.equal(health.status, 200);
assert.equal((await health.json()).ok, true);
const preflight = await req(api + '/api/rooms', { method: 'OPTIONS', headers: {
  Origin: origin,
  'Access-Control-Request-Method': 'POST',
  'Access-Control-Request-Headers': 'content-type',
}});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
console.log('✓ Backend healthy and accepts GitHub Pages CORS requests');

const create = await req(api + '/api/rooms', { method: 'POST', headers: {
  Origin: origin,
  'Content-Type': 'application/json',
}, body: JSON.stringify({ title: 'Deployment smoke test', duration: '24h' }) });
assert.equal(create.status, 201, 'Could not create room on public API');
const { room, ownerToken } = await create.json();
assert.match(room.code, /^[A-HJ-KM-NP-Z2-9]{6}$/);
assert.ok(ownerToken);
try {
  const content = '  Text stays intact\nLine two\n';
  const added = await req(api + '/api/rooms/' + room.code + '/items', { method: 'POST', headers: {
    Origin: origin,
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + ownerToken,
  }, body: JSON.stringify({ title: 'Shared snippet', content }) });
  assert.equal(added.status, 201);
  const read = await req(api + '/api/rooms/' + room.code, { headers: { Origin: origin } });
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('access-control-allow-origin'), origin);
  const result = await read.json();
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].content, content);
  const blocked = await req(api + '/api/rooms/' + room.code + '/items', { method: 'POST', headers: {
    Origin: origin, 'Content-Type': 'application/json',
  }, body: JSON.stringify({ title: 'Unauthorized', content: 'nope' }) });
  assert.equal(blocked.status, 403);
  console.log('✓ Created a room, shared exact text, guest read works, guest cannot edit');
} finally {
  const cleanup = await req(api + '/api/rooms/' + room.code, { method: 'DELETE', headers: {
    Origin: origin, Authorization: 'Bearer ' + ownerToken,
  } });
  assert.equal(cleanup.status, 200);
  console.log('✓ Test room deleted');
}
console.log('GitHub Pages + Railway smoke test passed.');
