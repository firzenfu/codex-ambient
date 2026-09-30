// Optional integration check. Pass the absolute path to an installed playwright package.
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { evaluate } from '../lib/cdp.mjs';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
// An isolated fake CDP discovery endpoint ensures tests never touch a real Codex window.
const discovery = http.createServer((req, res) => { res.writeHead(503); res.end('Offline fixture'); });
await new Promise(resolve => discovery.listen(0, '127.0.0.1', resolve));
const testServer = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, AMBIENT_PORT: '43130', AMBIENT_DEBUG_PORT: String(discovery.address().port), AMBIENT_DATA_DIR: fileURLToPath(new URL(`../test-results/browser-settings-${process.pid}`, import.meta.url)) },
  stdio: ['ignore', 'pipe', 'pipe']
});
await new Promise((resolve, reject) => { testServer.stdout.once('data', resolve); testServer.once('error', reject); testServer.once('exit', code => reject(new Error(`Test server exited: ${code}`))); });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--remote-debugging-port=9334', '--remote-debugging-address=127.0.0.1'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:43130');
  await page.locator('#connection-label').filter({ hasText: '尚未連接 Codex' }).waitFor();
  assert.equal(await page.locator('#ambient-preview-layer').count(), 1);
  await page.locator('[data-mode=ocean]').click();
  await page.locator('#pause').click();
  assert.equal(await page.locator('#paused-badge').isVisible(), true);
  assert.equal(await page.evaluate(() => document.querySelector('#ambient-preview-layer').getAnimations({ subtree: true }).every(a => a.playState === 'paused')), true);
  await page.locator('#pause').click();
  await page.locator('[data-mode=stars]').click();
  assert.equal(await page.locator('#ambient-preview-layer canvas').count(), 1);
  await page.locator('#light-preview').click();
  assert.equal(await page.locator('#preview').getAttribute('data-theme'), 'light');
  await page.locator('#dark-preview').click();
  await page.locator('[data-mode=aurora]').click();
  await page.locator('#apply').click();
  await page.locator('#toast').filter({ hasText: '尚未連接 Codex' }).waitFor();
  await page.locator('#language').selectOption('en');
  await page.waitForFunction(() => !document.getElementById('language').disabled);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('#connection-label').innerText(), 'Codex not connected');
  await page.locator('#toast').filter({ hasText: 'Codex is not connected' }).waitFor();
  await page.reload();
  await page.locator('#connection-label').filter({ hasText: 'Codex not connected' }).waitFor();
  assert.equal(await page.locator('#language').inputValue(), 'en');
  await page.locator('#save').click();
  await page.locator('#toast').filter({ hasText: 'Preferences saved' }).waitFor();
  await page.locator('[data-mode=ocean]').click();
  await page.locator('#pause').click();
  await page.locator('#language').selectOption('zh-Hant');
  await page.waitForFunction(() => !document.getElementById('language').disabled);
  assert.equal(await page.locator('#effect-name').innerText(), '深海呼吸');
  assert.equal(await page.locator('#pause').innerText(), '▷ 繼續動畫');
  assert.equal(await page.locator('#paused-badge').isVisible(), true);
  await page.route('**/api/language', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fixture"}' }));
  await page.locator('#language').selectOption('en');
  await page.locator('#toast').filter({ hasText: '語言偏好儲存失敗' }).waitFor();
  assert.equal(await page.locator('#language').inputValue(), 'zh-Hant');
  await page.unroute('**/api/language');
  await page.locator('#language').selectOption('en');
  await page.waitForFunction(() => !document.getElementById('language').disabled);
  assert.equal(await page.locator('#pause').innerText(), '▷ Resume animation');
  await page.locator('#pause').click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOZkAAAAASUVORK5CYII=', 'base64');
  await page.locator('#media-file').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: png });
  await page.locator('#media-name').filter({ hasText: 'fixture.png' }).waitFor();
  assert.equal(await page.locator('#ambient-preview-layer img').count(), 1);
  await page.locator('#media-file').setInputFiles({ name: 'fixture.gif', mimeType: 'image/gif', buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') });
  await page.locator('#media-name').filter({ hasText: 'fixture.gif' }).waitFor();
  await page.locator('#pause').click();
  await page.locator('#ambient-preview-layer canvas').waitFor({ state: 'visible' });
  await page.locator('#pause').click();
  const movie = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const stream = canvas.captureStream(10), recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    const finished = new Promise(resolve => { recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = resolve; });
    recorder.start();
    for (let i = 0; i < 10; i++) {
      canvas.getContext('2d').fillStyle = `rgb(${i * 20},80,90)`;
      canvas.getContext('2d').fillRect(0, 0, 64, 64);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    recorder.stop(); await finished; stream.getTracks().forEach(t => t.stop());
    return [...new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer())];
  });
  await page.locator('#media-file').setInputFiles({ name: 'fixture.webm', mimeType: 'video/webm', buffer: Buffer.from(movie) });
  await page.locator('#media-name').filter({ hasText: 'fixture.webm' }).waitFor();
  await page.waitForFunction(() => { const v = document.querySelector('#ambient-preview-layer video'); return v && v.readyState >= 2 && !v.paused; });
  const videoBefore = await page.locator('#ambient-preview-layer video').elementHandle();
  await page.locator('#language').selectOption('zh-Hant');
  await page.waitForFunction(() => !document.getElementById('language').disabled);
  assert.equal(await videoBefore.evaluate(v => v === document.querySelector('#ambient-preview-layer video') && !v.paused), true);
  assert.equal(await page.locator('#media-name').innerText(), 'fixture.webm');
  await page.locator('#language').selectOption('en');
  await page.waitForFunction(() => !document.getElementById('language').disabled);
  await page.locator('#pause').click();
  assert.equal(await page.locator('#ambient-preview-layer video').evaluate(v => v.paused), true);
  await page.locator('#pause').click();
  await page.locator('[data-mode=aurora]').click();
  await page.locator('#strength').fill('45');
  await page.locator('#blur').fill('3');
  await page.locator('#toast').evaluate(el => { el.hidden = true; });
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/control-panel.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => /\p{Script=Han}/u.test(document.body.innerText.replace('繁體中文', ''))), false);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.locator('#language').selectOption('zh-Hant');
  await page.waitForFunction(() => !document.getElementById('language').disabled);
  await page.screenshot({ path: 'test-results/control-panel-zh.png', fullPage: true });
  // Exercise desktop mounting/cleanup against an isolated shell fixture, not the user's app.
  await page.goto('about:blank');
  await page.setContent('<html data-theme="dark"><head></head><body style="background:red"><div id="root"><main data-app-shell-main-surface="default">Unchanged application content</main></div></body></html>');
  await page.addScriptTag({ content: await readFile('public/runtime.js', 'utf8') });
  const debuggingPages = await (await fetch('http://127.0.0.1:9334/json/list')).json();
  const fixtureTarget = debuggingPages.find(t => t.url === 'about:blank');
  assert.equal(await evaluate(fixtureTarget.webSocketDebuggerUrl, 'document.getElementById("root") !== null'), true);
  const result = await page.evaluate(() => {
    const config = { mode: 'aurora', strength: 40, blur: 3, speed: 1, paused: false, media: null };
    installAmbient(config);
    installAmbient({ ...config, mode: 'ocean' });
    const mounted = document.querySelectorAll('#codex-ambient-layer').length;
    const style = document.querySelectorAll('#codex-ambient-style').length;
    const animations = document.getAnimations().length;
    installAmbient(null);
    return { mounted, style, animations, layersAfter: document.querySelectorAll('#codex-ambient-layer').length, styleAfter: document.querySelectorAll('#codex-ambient-style').length, animationsAfter: document.getAnimations().length, markerAfter: document.documentElement.hasAttribute('data-codex-ambient'), original: document.body.getAttribute('style'), text: document.querySelector('main').textContent };
  });
  assert.deepEqual(result, { mounted: 1, style: 1, animations: 3, layersAfter: 0, styleAfter: 0, animationsAfter: 0, markerAfter: false, original: 'background:red', text: 'Unchanged application content' });
  assert.deepEqual(errors, []);
  console.log('PASS: presets, pause, themes, offline messaging, image/GIF/video upload and pause, responsive layout, live CDP transport, desktop mount/switch/restore, no browser errors.');
} finally { await browser.close(); testServer.kill(); discovery.close(); }

