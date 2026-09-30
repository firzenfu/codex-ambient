import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BackgroundResume } from '../lib/resume.mjs';
import { preferences } from '../lib/preferences.mjs';
import { defaults } from '../lib/config.mjs';

test('resume recovers new/reloaded windows without restarting an installed background', async () => {
  const contexts = new Map();
  const make = () => vm.createContext({ window: {}, document: { getElementById: () => true }, installations: 0 });
  contexts.set('one', make());
  const controller = new BackgroundResume({
    list: async () => [...contexts.keys()].map(socket => ({ socket })),
    evaluate: async (socket, expression) => vm.runInContext(expression, contexts.get(socket)),
    runtime: 'function installAmbient(config) { installations++; window.__codexAmbient = { mode: config.mode }; return {ok:true}; }'
  });
  controller.set(defaults);
  await controller.tick(); assert.equal(contexts.get('one').installations, 0);
  controller.armed = true;
  await controller.tick(); await controller.tick();
  assert.equal(contexts.get('one').installations, 1);
  contexts.set('one', make()); contexts.set('two', make());
  await controller.tick();
  assert.equal(contexts.get('one').installations, 1);
  assert.equal(contexts.get('two').installations, 1);
  controller.set({ ...defaults, mode: 'ocean' });
  await controller.tick(); assert.equal(contexts.get('one').window.__codexAmbient.mode, 'ocean');
  controller.set(null); contexts.set('one', make());
  await controller.tick(); assert.equal(contexts.get('one').installations, 0);
});

test('resume tolerates offline discovery and later reconnects', async () => {
  let offline = true, applied = 0;
  const controller = new BackgroundResume({ list: async () => { if (offline) throw new Error('offline'); return [{ socket: 'one' }]; }, evaluate: async (socket, expression) => { if (expression.startsWith('Boolean')) return false; applied++; return { ok: true }; }, runtime: '' });
  controller.set(defaults); controller.armed = true;
  await controller.tick(); assert.equal(controller.error, 'offline');
  offline = false; await controller.tick(); assert.equal(applied, 1); assert.equal(controller.error, null);
});

test('media and restore-off state survive restart; corrupt settings do not auto-apply', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ambient-resume-'));
  try {
    const store = preferences(dir);
    assert.equal((await store.load()).resumeEnabled, true);
    const media = { ...defaults, mode: 'media', media: { name: 'fixture.png', data: 'data:image/png;base64,YWJj' } };
    await store.save(media);
    assert.deepEqual((await preferences(dir).load()).config, media);
    await store.save(media, false);
    assert.equal((await preferences(dir).load()).resumeEnabled, false);
    await writeFile(path.join(dir, 'settings.json'), 'corrupted');
    assert.equal((await preferences(dir).load()).resumeEnabled, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
