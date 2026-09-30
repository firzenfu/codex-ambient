import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defaults } from '../lib/config.mjs';
const origin = 'http://127.0.0.1:43128';
let child, token;
const settingsDir = fileURLToPath(new URL(`../test-results/http-settings-${process.pid}/`, import.meta.url));
before(async () => {
  child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, AMBIENT_PORT: '43128', AMBIENT_DATA_DIR: settingsDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', code => reject(new Error(`Server exited: ${code}`))); });
  token = (await (await fetch(origin)).text()).match(/name="ambient-token" content="([a-f0-9]+)"/)[1];
});
after(() => child?.kill());
test('language preference persists separately and accepts only supported languages', async () => {
  const endpoint = origin + '/api/language';
  const post = (language, extra = {}) => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ambient-Token': token, ...extra }, body: JSON.stringify({ language }) });
  assert.deepEqual(await (await fetch(endpoint)).json(), { language: 'zh-Hant' });
  assert.equal((await post('en', { 'X-Ambient-Token': 'wrong' })).status, 403);
  assert.equal((await post('en', { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await post('en')).status, 200);
  assert.equal(JSON.parse(await readFile(settingsDir + '/ui.json', 'utf8')).language, 'en');
  assert.equal((await post('unsupported')).status, 400);
  assert.deepEqual(await (await fetch(endpoint)).json(), { language: 'en' });
  assert.deepEqual(await (await fetch(origin + '/api/settings')).json(), defaults);
  assert.equal((await fetch(origin + '/i18n.js')).status, 200);
  await writeFile(settingsDir + '/ui.json', 'broken');
  assert.deepEqual(await (await fetch(endpoint)).json(), { language: 'zh-Hant' });
});
test('serves the panel with frame and script restrictions', async () => {
  const r = await fetch(origin); assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
});
test('rejects cross-site and unauthenticated modifications', async () => {
  for (const endpoint of ['/api/restore', '/api/resume']) for (const extra of [{}, { Origin: 'https://attacker.example', 'X-Ambient-Token': token }]) {
    const r = await fetch(origin + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: '{}' });
    assert.equal(r.status, 403);
  }
});
test('rejects malformed config before trying to connect to Codex', async () => {
  const r = await fetch(origin + '/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ambient-Token': token }, body: JSON.stringify({ config: { ...defaults, speed: 500 } }) });
  assert.equal(r.status, 400); assert.match((await r.json()).error, /speed/);
});
test('does not serve arbitrary workspace files', async () => {
  for (const file of ['/server.mjs', '/README.md', '/data/settings.json', '/%2e%2e/package.json']) assert.equal((await fetch(origin + file)).status, 404);
});
test('packaged settings persist outside the versioned engine directory', async () => {
  const config = { ...defaults, mode: 'ocean', strength: 42 };
  const r = await fetch(origin + '/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ambient-Token': token }, body: JSON.stringify({ config }) });
  assert.equal(r.status, 200);
  const stored = JSON.parse(await readFile(settingsDir + '/settings.json', 'utf8'));
  assert.equal(stored.mode, 'ocean'); assert.equal(stored.strength, 42);
  assert.equal((await (await fetch(origin + '/api/settings')).json()).strength, 42);
});
test('malformed saved preferences fall back to valid defaults', async () => {
  await mkdir(settingsDir, { recursive: true });
  await writeFile(settingsDir + '/settings.json', '{"mode":"unknown","strength":"bad"}');
  assert.deepEqual(await (await fetch(origin + '/api/settings')).json(), defaults);
});
