import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { defaults, validateConfig } from './app/lib/config.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.AMBIENT_PORT || 43127);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local port');
const origin = `http://127.0.0.1:${port}`;
const dataRoot = process.env.AMBIENT_DATA_DIR || (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'CodexAmbient', 'settings'));
if (!dataRoot) throw new Error('Windows LOCALAPPDATA is required.');
let owned, ensuring, closing = false, activated = false, started = false, lastError = null;

async function request(endpoint, body) {
  const headers = {};
  if (body !== undefined) {
    const page = await fetch(origin + '/', { signal: AbortSignal.timeout(3000), redirect: 'error' });
    const token = (await page.text()).match(/name="ambient-token" content="([a-f0-9]{64})"/)?.[1];
    if (!page.ok || !token) throw new Error('Ambient control token is unavailable.');
    headers['Content-Type'] = 'application/json';
    headers['X-Ambient-Token'] = token;
  }
  for (let retry = 0; ; retry++) {
    const response = await fetch(origin + endpoint, {
      method: body === undefined ? 'GET' : 'POST', headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25000), redirect: 'error'
    });
    const result = await response.json();
    if (response.status === 409 && retry < 5) { await delay(250); continue; }
    if (!response.ok) throw new Error(result.error || `Ambient HTTP ${response.status}`);
    return result;
  }
}

async function identity() {
  let response;
  try { response = await fetch(origin + '/api/identity', { signal: AbortSignal.timeout(800), redirect: 'error' }); }
  catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return false;
    throw new Error('The local Ambient port is not responding. No other process was stopped.');
  }
  const info = await response.json().catch(() => null);
  if (!response.ok || info?.app !== 'codex-ambient' || info.version !== '0.3.0') {
    throw new Error('Port is occupied by an incompatible service. Quit the old Ambient tray app before retrying.');
  }
  return true;
}

async function ensureService() {
  if (closing) throw new Error('Plugin is shutting down.');
  if (ensuring) return ensuring;
  ensuring = (async () => {
    if (!await identity()) {
      if (closing) throw new Error('Plugin is shutting down.');
      const child = spawn(process.execPath, [path.join(root, 'app/server.mjs')], {
        cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
        env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', AMBIENT_PORT: String(port), AMBIENT_DATA_DIR: dataRoot, AMBIENT_PARENT_PID: String(process.pid) }
      });
      owned = child;
      let launchError;
      child.on('error', error => { launchError = error; });
      child.stderr.on('data', chunk => process.stderr.write(chunk));
      child.once('exit', () => { if (owned === child) owned = null; });
      let ready = false;
      for (let i = 0; i < 40 && !closing; i++) {
        await delay(100);
        if (launchError) throw launchError;
        if (await identity()) { ready = true; break; }
      }
      if (!ready) throw new Error('Could not start the local Ambient helper.');
      await request('/api/resume', {});
    } else if (!started) {
      // Respect persisted restore/disabled preferences when attaching to the EXE service.
      await request('/api/resume', {});
    }
    started = true;
    lastError = null;
  })().finally(() => { ensuring = null; });
  return ensuring;
}

const object = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const targetId = { type: 'string', description: 'Target ID from ambient_status. Required when multiple Codex windows are open.' };
const tools = [
  { name: 'ambient_status', description: 'Check the local Windows Codex background connection, windows, and automatic restore state. Does not read conversations.', inputSchema: object(), annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'ambient_preview', description: 'Return the local live background preview URL. Open it in the Codex browser panel. Choose videos, GIFs and images in this preview; media stays on the computer.', inputSchema: object(), annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'ambient_apply', description: 'Apply and remember an animated preset in a Codex window. Requires Codex background mode. Never restart or terminate Codex to fix a missing connection.', inputSchema: object({
    mode: { type: 'string', enum: ['aurora', 'ocean', 'stars'] },
    strength: { type: 'number', minimum: 0, maximum: 80 }, blur: { type: 'number', minimum: 0, maximum: 20 },
    speed: { type: 'number', minimum: 0.25, maximum: 2 }, paused: { type: 'boolean' }, targetId
  }, ['mode']), annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'ambient_restore', description: 'Remove the background from the selected Codex window and disable automatic background restore. Requires a connected window.', inputSchema: object({ targetId }), annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'ambient_language', description: 'Switch the Ambient preview and tray menu between Traditional Chinese and English.', inputSchema: object({ language: { type: 'string', enum: ['zh-Hant', 'en'] } }, ['language']), annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false } }
];

function validateArguments(tool, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments must be an object.');
  const { properties, required } = tool.inputSchema;
  for (const key of required) if (!(key in args)) throw new Error(`Missing argument: ${key}`);
  for (const [key, value] of Object.entries(args)) {
    const rule = properties[key];
    if (!rule || typeof value !== rule.type) throw new Error(`Invalid argument: ${key}`);
    if (rule.enum && !rule.enum.includes(value)) throw new Error(`Unsupported ${key}`);
    if (rule.type === 'number' && (!Number.isFinite(value) || value < rule.minimum || value > rule.maximum)) throw new Error(`Out of range: ${key}`);
  }
}
async function callTool(name, args) {
  const tool = tools.find(tool => tool.name === name);
  if (!tool) throw new Error('Unknown tool');
  validateArguments(tool, args);
  activated = true;
  await ensureService();
  if (name === 'ambient_preview') return { url: origin + '/', instructions: 'Open this URL in the Codex browser panel for live preview, local media selection and language switching.' };
  if (name === 'ambient_language') return request('/api/language', args);
  if (name === 'ambient_apply') {
    const { targetId: selected, ...preset } = args;
    return request('/api/apply', { config: validateConfig({ ...defaults, ...preset }), targetId: selected });
  }
  if (name === 'ambient_restore') return request('/api/restore', args);
  const status = await request('/api/status');
  return { ...status, preview: origin + '/', pluginVersion: '0.4.0', helperError: lastError,
    ...(!status.connected ? { nextStep: 'Codex is not in background mode. Finish your work, completely exit Codex, then use Codex + Ambient or Start-Codex.ps1. Installing this plugin cannot enable debugging in an already-running Codex.' } : {}) };
}

function send(id, result, error) {
  if (closing) return;
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) }) + '\n');
}
async function handle(line) {
  let message;
  try { message = JSON.parse(line); }
  catch { send(null, null, { code: -32700, message: 'Parse error' }); return; }
  if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    send(message?.id ?? null, null, { code: -32600, message: 'Invalid request' }); return;
  }
  const { id, method, params = {} } = message;
  if (id === undefined) {
    if (method === 'notifications/initialized') {
      activated = true;
      void ensureService().catch(error => { lastError = error.message; });
    }
    return;
  }
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    send(id, null, { code: -32602, message: 'Parameters must be an object' }); return;
  }
  if (method === 'initialize') {
    const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
    send(id, { protocolVersion: versions.includes(params.protocolVersion) ? params.protocolVersion : '2025-11-25',
      capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'codex-ambient', version: '0.4.0' },
      instructions: 'Windows local backgrounds. Preview is a local browser URL. Installation does not enable Codex debugging or restart the app. Use ambient_status to diagnose a missing connection; never close Codex or read chats/authentication data. The helper starts automatically when the plugin session loads.' });
  } else if (method === 'ping') send(id, {});
  else if (method === 'tools/list') send(id, { tools });
  else if (method === 'tools/call') {
    try {
      const result = await callTool(params.name, params.arguments ?? {});
      send(id, { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result });
    } catch (error) { send(id, { isError: true, content: [{ type: 'text', text: error.message }] }); }
  } else send(id, null, { code: -32601, message: 'Method not found' });
}

const reconnect = setInterval(() => {
  if (activated && !closing) void ensureService().catch(error => { lastError = error.message; });
}, 5000);
reconnect.unref();
function shutdown() {
  if (closing) return;
  closing = true; clearInterval(reconnect);
  owned?.kill();
  process.exit(0);
}
let pending = Promise.resolve();
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', line => {
  if (Buffer.byteLength(line) > 1024 * 1024) { send(null, null, { code: -32600, message: 'Request too large' }); return; }
  pending = pending.then(() => handle(line)).catch(error => process.stderr.write(error.message + '\n'));
});
lines.on('close', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdout.on('error', shutdown);
