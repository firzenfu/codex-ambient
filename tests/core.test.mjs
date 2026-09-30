import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, validateConfig, MAX_MEDIA_BYTES } from '../lib/config.mjs';
import { isAppTarget, localSocket, selectTarget } from '../lib/cdp.mjs';

test('accepts presets and discards unrecognized properties', () => {
  assert.deepEqual(validateConfig({ ...defaults, executable: 'ignored' }), defaults);
  for (const mode of ['aurora', 'ocean', 'stars']) assert.equal(validateConfig({ ...defaults, mode }).mode, mode);
});
test('rejects invalid numeric input and unknown effects', () => {
  for (const value of [-1, 81, NaN, Infinity, '35']) assert.throws(() => validateConfig({ ...defaults, strength: value }));
  assert.throws(() => validateConfig({ ...defaults, mode: 'javascript' }));
});
test('media accepts only bounded embedded image/video data', () => {
  const image = { data: 'data:image/png;base64,aGVsbG8=', name: 'test.png' };
  assert.equal(validateConfig({ ...defaults, mode: 'media', media: image }).media.name, 'test.png');
  for (const data of ['file:///secret', 'https://example.com/video.mp4', 'data:image/svg+xml;base64,aGVsbG8=', 'data:text/html;base64,aGVsbG8=']) assert.throws(() => validateConfig({ ...defaults, mode: 'media', media: { data } }));
  assert.throws(() => validateConfig({ ...defaults, mode: 'media', media: { data: 'data:video/mp4;base64,' + Buffer.alloc(MAX_MEDIA_BYTES + 1).toString('base64') } }));
});
test('target matching excludes embedded browser pages and detached windows', () => {
  for (const url of ['app://-/', 'app://-/index.html', 'app://-/index.html?thread=test']) assert.equal(isAppTarget({ type: 'page', url }), true);
  for (const url of ['https://chatgpt.com', 'app://fs/index.html', 'app://-/detached-window.html', 'app://-/login.html', 'file:///index.html', 'not a URL']) assert.equal(isAppTarget({ type: 'page', url }), false);
  assert.equal(isAppTarget({ type: 'iframe', url: 'app://-/' }), false);
});
test('websocket endpoint cannot redirect to other machines or ports', () => {
  assert.equal(localSocket('ws://localhost:9223/devtools/page/123', 9223), 'ws://127.0.0.1:9223/devtools/page/123');
  for (const url of ['ws://192.168.1.2:9223/devtools/page/123', 'ws://127.0.0.1:9222/devtools/page/123', 'ws://127.0.0.1:9223/devtools/browser/123', 'wss://127.0.0.1:9223/devtools/page/123', 'ws://user@127.0.0.1:9223/devtools/page/123']) assert.throws(() => localSocket(url, 9223));
});
test('never applies to another window when a selected target has disappeared', () => {
  const remaining = [{ id: 'other-window' }];
  assert.throws(() => selectTarget(remaining, 'closed-window'), /已關閉/);
  assert.equal(selectTarget(remaining, ''), remaining[0]);
  assert.throws(() => selectTarget([{ id: 'a' }, { id: 'b' }], ''), /請選擇/);
});
