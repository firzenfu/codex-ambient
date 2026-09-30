export function isAppTarget(target) {
  try {
    const u = new URL(target.url);
    return target.type === 'page' && u.protocol === 'app:' && u.hostname === '-' && (u.pathname === '/' || u.pathname === '/index.html');
  } catch { return false; }
}
export function localSocket(raw, port) {
  const u = new URL(raw);
  if (u.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || Number(u.port) !== port || u.username || u.password || !u.pathname.startsWith('/devtools/page/')) throw new Error('拒絕非本機的偵錯連線');
  u.hostname = '127.0.0.1';
  return u.href;
}
export function selectTarget(list, targetId) {
  if (targetId) {
    const match = list.find(t => t.id === targetId);
    if (!match) throw new Error('選定的 Codex 視窗已關閉，請重新偵測並選擇視窗');
    return match;
  }
  if (list.length === 1) return list[0];
  throw new Error(list.length ? '請選擇要套用的 Codex 視窗' : '找不到相容的 Codex 主視窗');
}
export async function targets(port = 9223) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1800), redirect: 'error' });
  if (!response.ok) throw new Error('無法取得 Codex 視窗');
  const list = await response.json();
  if (!Array.isArray(list)) throw new Error('偵錯服務回應錯誤');
  return list.filter(isAppTarget).map(t => ({ id: t.id, title: t.title || 'Codex', url: t.url, socket: localSocket(t.webSocketDebuggerUrl, port) }));
}
export async function evaluate(socket, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(socket);
    const timer = setTimeout(() => finish(new Error('套用逾時，請重新連接')), 20000);
    let done = false;
    function finish(error, value) {
      if (done) return;
      done = true; clearTimeout(timer); ws.close();
      error ? reject(error) : resolve(value);
    }
    ws.addEventListener('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } })));
    ws.addEventListener('error', () => finish(new Error('偵錯連線失敗')));
    ws.addEventListener('close', () => { if (!done) finish(new Error('Codex 已中斷連線')); });
    ws.addEventListener('message', ({ data }) => {
      try {
        const reply = JSON.parse(data);
        if (reply.id !== 1) return;
        if (reply.error || reply.result?.exceptionDetails) return finish(new Error(reply.error?.message || reply.result.exceptionDetails.exception?.description || '背景執行失敗'));
        finish(null, reply.result?.result?.value);
      } catch (e) { finish(e); }
    });
  });
}
