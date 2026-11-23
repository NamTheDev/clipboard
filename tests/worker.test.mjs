import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../worker/src/index.mjs';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    const statement = db.prepare(sql);
    return {
      bind(...args) {
        return {
          async run() {return {meta: {changes: statement.run(...args).changes}};},
          async first() {return statement.get(...args) || null;},
          async all() {return {results: statement.all(...args)};},
        };
      },
    };
  },
};
const env = {DB, ALLOWED_ORIGIN: 'https://namthedev.github.io'};
const HOST = 'https://clipboard-rooms-api.example.workers.dev';
const ORIGIN = 'https://namthedev.github.io';
async function request(path, {method='GET', data, token, origin = ORIGIN} = {}) {
  const headers = {'Origin': origin};
  if (data) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const response = await worker.fetch(new Request(HOST + path, {method, headers, body: data ? JSON.stringify(data) : undefined}), env);
  const result = await response.json();
  return {status: response.status, headers: response.headers, result};
}

test('GitHub Pages API permits its configured origin and rejects other cross-origin reads', async () => {
  const options = await worker.fetch(new Request(HOST + '/api/rooms', {method:'OPTIONS', headers:{Origin: ORIGIN, 'Access-Control-Request-Headers':'authorization'}}), env);
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(options.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  const other = await request('/api/health', {origin:'https://evil.example'});
  assert.equal(other.status, 200);
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
});

test('create, join, guest read, owner edit/delete with preserved whitespace', async () => {
  const create = await request('/api/rooms', {method:'POST', data:{title:'Notes',duration:'24h'}});
  assert.equal(create.status, 201);
  const {ownerToken,room} = create.result;
  assert.match(room.code, /^[A-HJ-KM-NP-Z2-9]{6}$/);
  assert.match(ownerToken, /^[A-Za-z0-9_-]{40,}$/);
  const denied = await request(`/api/rooms/${room.code}/items`, {method:'POST', data:{title:'Guest',content:'no'}});
  assert.equal(denied.status, 403);
  const content = '  console.log("hello")\n\n';
  const created = await request(`/api/rooms/${room.code}/items`, {method:'POST', token:ownerToken,data:{title:'Code',content}});
  assert.equal(created.status, 201);
  assert.equal(created.result.item.content, content);
  const code = room.code.slice(0,3)+'-'+room.code.slice(3);
  const joined = await request(`/api/rooms/${code}`);
  assert.equal(joined.status, 200);
  assert.equal(joined.result.items.length, 1);
  assert.equal(joined.result.items[0].content, content);
  const id = created.result.item.id;
  const edited = await request(`/api/rooms/${room.code}/items/${id}`, {method:'PATCH',token:ownerToken,data:{title:'Changed',content:'new text'}});
  assert.equal(edited.status,200);
  assert.equal(edited.result.item.content,'new text');
  const invalid = await request(`/api/rooms/${room.code}/items`, {method:'POST', token:ownerToken,data:{title:'Bad',content:'   '}});
  assert.equal(invalid.status,400);
  const removed = await request(`/api/rooms/${room.code}/items/${id}`, {method:'DELETE',token:ownerToken});
  assert.equal(removed.status,200);
  const empty = await request(`/api/rooms/${room.code}`);
  assert.equal(empty.result.items.length,0);
  const deleted = await request(`/api/rooms/${room.code}`, {method:'DELETE',token:ownerToken});
  assert.equal(deleted.status,200);
  const missing = await request(`/api/rooms/${room.code}`);
  assert.equal(missing.status,404);
});

test('room expiration cannot be bypassed; worker scheduler removes expired data', async () => {
  const create = await request('/api/rooms',{method:'POST',data:{duration:'7d'}});
  const {room,ownerToken} = create.result;
  await request(`/api/rooms/${room.code}/items`,{method:'POST',token:ownerToken,data:{content:'Soon to expire'}});
  db.prepare('UPDATE rooms SET expires_at = 1 WHERE code = ?').run(room.code);
  const missing = await request(`/api/rooms/${room.code}`);
  assert.equal(missing.status,404);
  await worker.scheduled(null,env);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rooms WHERE code = ?').get(room.code).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM items WHERE room_code = ?').get(room.code).n,0);
});

after(() => db.close());
