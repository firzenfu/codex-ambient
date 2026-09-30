import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export function pluginClient(script, env) {
  const child = spawn(process.execPath, [script], { env: { ...process.env, ...env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let nextId = 0, stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  createInterface({ input: child.stdout }).on('line', line => {
    const message = JSON.parse(line), request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  child.on('exit', code => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(`MCP exited ${code}: ${stderr}`)); }
    pending.clear();
  });
  child.on('error', error => { for (const request of pending.values()) request.reject(error); });
  const send = message => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP timeout: ${method}: ${stderr}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); send({ id, method, params });
  });
  return {
    child, request,
    async initialize() {
      const result = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'ambient-test', version: '1.0.0' } });
      send({ method: 'notifications/initialized' }); return result;
    },
    call: (name, args = {}) => request('tools/call', { name, arguments: args }),
    async close() {
      if (child.exitCode !== null) return;
      await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 3000); child.once('exit', () => { clearTimeout(timer); resolve(); }); child.stdin.end(); });
    }
  };
}
