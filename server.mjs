import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { defaults, validateConfig } from './lib/config.mjs';
import { targets, evaluate, selectTarget } from './lib/cdp.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = process.env.AMBIENT_DATA_DIR ? path.resolve(process.env.AMBIENT_DATA_DIR) : path.join(root, 'data');
const port = Number(process.env.AMBIENT_PORT || 43127);
const debugPort = Number(process.env.AMBIENT_DEBUG_PORT || 9223);
for (const value of [port, debugPort]) if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('Invalid local port');
const origin = `http://127.0.0.1:${port}`;
const token = randomBytes(32).toString('hex');
function openPanel() {
  if (process.platform === 'win32') execFile('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${origin}'`], { windowsHide: true }, error => { if (error) console.log(`Open ${origin} in your browser.`); });
}
const runtime = await readFile(path.join(root, 'public/runtime.js'), 'utf8');
let applied = null, busy = false;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' };
function json(res, status, data) { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
async function body(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 29 * 1024 * 1024) throw new Error('素材超過 20 MB 上限');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function settings() {
  try { return validateConfig({ ...defaults, ...JSON.parse(await readFile(path.join(dataRoot, 'settings.json'), 'utf8')), media: null }); }
  catch { return { ...defaults }; }
}
const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin)) return json(res, 403, { error: '只接受本機控制台請求' });
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && url.pathname === '/api/identity') return json(res, 200, { app: 'codex-ambient', version: '0.2.1' });
    if (req.method === 'GET' && url.pathname === '/api/status') {
      let windows = [], connected = false;
      try { windows = await targets(debugPort); connected = windows.length > 0; } catch {}
      return json(res, 200, { connected, windows: windows.map(({ id, title }) => ({ id, title })), applied, debugPort });
    }
    if (req.method === 'GET' && url.pathname === '/api/settings') return json(res, 200, await settings());
    if (req.method === 'POST' && ['/api/apply', '/api/restore', '/api/save'].includes(url.pathname)) {
      if (req.headers['x-ambient-token'] !== token || !req.headers['content-type']?.startsWith('application/json')) return json(res, 403, { error: '控制台已過期，請重新整理' });
      if (busy) return json(res, 409, { error: '正在處理，請稍後再試' });
      busy = true;
      try {
        const input = await body(req);
        const config = url.pathname === '/api/restore' ? null : validateConfig(input.config);
        if (url.pathname === '/api/save') {
          await mkdir(dataRoot, { recursive: true });
          const temporary = path.join(dataRoot, 'settings.json.tmp');
          await writeFile(temporary, JSON.stringify({ ...config, mode: config.mode === 'media' ? 'aurora' : config.mode, media: null }, null, 2));
          await rename(temporary, path.join(dataRoot, 'settings.json'));
          return json(res, 200, { ok: true });
        }
        let list;
        try { list = await targets(debugPort); } catch { throw new Error('尚未連接 Codex。請完全結束 Codex 後，執行 Start-Codex.ps1，再按「重新偵測」。'); }
        const target = selectTarget(list, input.targetId);
        const expression = `(() => { ${runtime}\n return installAmbient(${JSON.stringify(config)}); })()`;
        const result = await evaluate(target.socket, expression);
        if (!result?.ok) throw new Error('Codex 未確認套用結果');
        applied = config ? { mode: config.mode, targetId: target.id, at: new Date().toISOString() } : null;
        return json(res, 200, result);
      } finally { busy = false; }
    }
    const files = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/runtime.js': 'runtime.js', '/favicon.ico': 'favicon.ico', '/favicon.svg': 'favicon.svg' };
    if (req.method !== 'GET' || !files[url.pathname]) return json(res, 404, { error: 'Not found' });
    let data = await readFile(path.join(root, 'public', files[url.pathname]));
    if (url.pathname === '/') data = Buffer.from(data.toString().replace('__AMBIENT_TOKEN__', token));
    const type = url.pathname.endsWith('.ico') ? 'image/x-icon' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html';
    res.writeHead(200, { ...headers, 'Content-Type': `${type}; charset=utf-8`, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'" });
    res.end(data);
  } catch (error) { json(res, 400, { error: error.message || '操作失敗' }); }
});
server.requestTimeout = 30000;
server.on('error', async error => {
  if (error.code === 'EADDRINUSE' && process.argv.includes('--open')) {
    try {
      const identity = await (await fetch(`${origin}/api/identity`, { signal: AbortSignal.timeout(1000) })).json();
      if (identity.app === 'codex-ambient') { openPanel(); return; }
    } catch {}
  }
  console.error(error.code === 'EADDRINUSE' ? `連接埠 ${port} 已被使用。` : error.message); process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Codex Ambient: ${origin}`);
  console.log('Keep this window open while using the control panel. Press Ctrl+C to stop.');
  if (process.argv.includes('--open')) openPanel();
});
