import { createHash } from 'node:crypto';

// A lightweight probe avoids resending large media or restarting playback on every poll.
export class BackgroundResume {
  constructor({ list, evaluate, runtime }) {
    this.list = list; this.evaluate = evaluate; this.runtime = runtime;
    this.armed = false; this.config = null; this.error = null;
  }
  set(config) {
    this.config = config;
    this.key = config ? createHash('sha256').update(JSON.stringify(config)).digest('hex') : null;
    this.error = null;
  }
  async apply(target, config) {
    const key = config ? createHash('sha256').update(JSON.stringify(config)).digest('hex') : null;
    const result = await this.evaluate(target.socket, `(() => { ${this.runtime}\n const result = installAmbient(${JSON.stringify(config)}); if (result.ok && window.__codexAmbient) window.__codexAmbient.resumeKey = ${JSON.stringify(key)}; return result; })()`);
    if (!result?.ok) throw new Error('Codex 未確認套用結果');
    return result;
  }
  async tick(discoveredWindows) {
    if (!this.armed || !this.config) return;
    try {
      const windows = discoveredWindows || await this.list();
      for (const target of windows) {
        try {
          const installed = await this.evaluate(target.socket, `Boolean(window.__codexAmbient?.resumeKey === ${JSON.stringify(this.key)} && document.getElementById('codex-ambient-layer'))`);
          if (!installed) await this.apply(target, this.config);
          this.error = null;
        } catch (error) { this.error = error.message; }
      }
    } catch (error) { this.error = error.message; }
  }
}
