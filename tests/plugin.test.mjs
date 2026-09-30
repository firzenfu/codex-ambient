import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { pluginClient } from './plugin-client.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = path.join(root, 'test-results', `plugin-${process.pid}`);
let client, env, origin;
async function freePort() {
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve)); return port;
}
before(async () => {
  await mkdir(fixture, { recursive: true });
  await cp(path.join(root, 'plugins/codex-ambient'), fixture, { recursive: true });
  await mkdir(path.join(fixture, 'app'), { recursive: true });
  for (const name of ['server.mjs', 'package.json', 'lib', 'public']) await cp(path.join(root, name), path.join(fixture, 'app', name), { recursive: true });
  const port = await freePort(); origin = `http://127.0.0.1:${port}`;
  env = { AMBIENT_PORT: String(port), AMBIENT_DEBUG_PORT: String(await freePort()), AMBIENT_DATA_DIR: path.join(fixture, 'settings') };
  client = pluginClient(path.join(fixture, 'mcp-server.mjs'), env);
  const info = await client.initialize();
  assert.equal(info.serverInfo.name, 'codex-ambient');
});
after(async () => { await client?.close(); });

test('MCP lists the five bounded tools and diagnoses an ordinary Codex launch', async () => {
  assert.equal((await client.request('tools/list')).tools.length, 5);
  const result = await client.call('ambient_status');
  assert.ok(!result.isError, JSON.stringify(result));
  assert.equal(result.structuredContent.connected, false);
  assert.match(result.structuredContent.nextStep, /background mode/);
  assert.equal(result.structuredContent.autoResume.armed, true);
  assert.equal((await client.call('ambient_preview')).structuredContent.url, origin + '/');
});
test('MCP validates arguments and does not report an offline apply as successful', async () => {
  for (const args of [{ mode: 'aurora', speed: 99 }, { mode: 'stars', targetId: 4 }, { mode: 'media' }, { mode: 'aurora', command: 'anything' }]) {
    assert.equal((await client.call('ambient_apply', args)).isError, true);
  }
  assert.equal((await client.call('ambient_apply', { mode: 'ocean' })).isError, true);
  assert.equal((await client.call('ambient_restore')).isError, true);
  assert.equal((await client.call('not_a_tool')).isError, true);
  await assert.rejects(client.request('unknown/method'), /-32601/);
  await assert.rejects(client.request('initialize', null), /-32602/);
});
test('MCP language persists and a second session survives the first helper owner closing', async () => {
  assert.deepEqual((await client.call('ambient_language', { language: 'en' })).structuredContent, { language: 'en' });
  assert.equal(JSON.parse(await readFile(path.join(fixture, 'settings/ui.json'), 'utf8')).language, 'en');
  const second = pluginClient(path.join(fixture, 'mcp-server.mjs'), env);
  try {
    await second.initialize();
    assert.ok(!(await second.call('ambient_status')).isError);
    await client.close();
    await delay(300);
    assert.ok(!(await second.call('ambient_status')).isError);
    assert.equal((await (await fetch(origin + '/api/language')).json()).language, 'en');
  } finally { await second.close(); }
  let closed = false;
  for (let i = 0; i < 25; i++) {
    try { await fetch(origin + '/api/identity', { signal: AbortSignal.timeout(200) }); }
    catch { closed = true; break; }
    await delay(100);
  }
  assert.equal(closed, true, 'owned helper must stop when the last owning MCP session exits');
});
test('MCP refuses an unrelated port occupant without modifying or stopping it', async () => {
  let writes = 0;
  const other = http.createServer((req, res) => { if (req.method !== 'GET') writes++; res.setHeader('Content-Type', 'application/json'); res.end('{"app":"other-service"}'); });
  await new Promise(resolve => other.listen(0, '127.0.0.1', resolve));
  const conflict = pluginClient(path.join(fixture, 'mcp-server.mjs'), { ...env, AMBIENT_PORT: String(other.address().port) });
  try {
    await conflict.initialize();
    const result = await conflict.call('ambient_status');
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /incompatible service/);
    assert.equal(writes, 0);
    assert.equal(other.listening, true);
  } finally { await conflict.close(); await new Promise(resolve => other.close(resolve)); }
});
