const $ = id => document.getElementById(id);
const labels = { aurora: ['極光漫遊', '緩慢流動的冷暖光暈'], ocean: ['深海呼吸', '像潮汐一樣，緩緩呼吸'], stars: ['星際留白', '讓微小的光，陪你想得更遠'], media: ['自己的風景', '把喜歡的片刻，留在工作裡'] };
let config = { mode: 'aurora', strength: 35, blur: 3, speed: 1, paused: false, media: null };
let drawTimer, toastTimer;
function toast(message, error = false) {
  $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 15000 : 5500);
}
function render() {
  $('effect-name').textContent = labels[config.mode][0]; $('effect-description').textContent = labels[config.mode][1];
  document.querySelectorAll('.preset').forEach(el => { el.classList.toggle('selected', el.dataset.mode === config.mode); el.setAttribute('aria-pressed', String(el.dataset.mode === config.mode)); });
  $('media-controls').hidden = config.mode !== 'media';
  $('pause').textContent = config.paused ? '▷ 繼續動畫' : 'Ⅱ 暫停動畫';
  $('paused-badge').hidden = !config.paused;
  for (const key of ['strength', 'blur', 'speed']) { $(key).value = config[key]; $(key + '-value').textContent = config[key] + ({ strength: '%', blur: ' px', speed: '×' }[key]); }
  if (config.mode === 'media' && !config.media) return;
  try { window.installAmbient(config, $('preview')); } catch (e) { toast(e.message, true); }
}
async function request(url, data) {
  const options = data ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ambient-Token': document.querySelector('meta[name=ambient-token]').content }, body: JSON.stringify(data) } : {};
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '操作失敗');
  return result;
}
async function detect() {
  $('reconnect').disabled = true;
  try {
    const result = await request('/api/status');
    $('connection-label').textContent = result.connected ? 'Codex 已連接' : '尚未連接 Codex';
    $('connection-dot').classList.toggle('connected', result.connected);
    const old = $('target').value; $('target').replaceChildren();
    result.windows.forEach((w, i) => { const option = document.createElement('option'); option.value = w.id; option.textContent = `${i + 1}. ${w.title}`; $('target').append(option); });
    if (result.windows.some(w => w.id === old)) $('target').value = old;
    $('target').hidden = $('window-label').hidden = result.windows.length <= 1;
    $('setup').hidden = result.connected;
  } catch (e) { $('connection-label').textContent = '控制台連線中斷'; toast(e.message, true); }
  finally { $('reconnect').disabled = false; }
}
document.querySelectorAll('.preset').forEach(el => el.addEventListener('click', () => {
  config.mode = el.dataset.mode;
  if (config.mode === 'stars') config.blur = 0;
  if (config.mode === 'media' && !config.media) {
    window.installAmbient(null, $('preview'));
    $('media-file').click();
  }
  render();
}));
for (const key of ['strength', 'blur', 'speed']) $(key).addEventListener('input', () => {
  config[key] = Number($(key).value); $(key + '-value').textContent = config[key] + ({ strength: '%', blur: ' px', speed: '×' }[key]);
  clearTimeout(drawTimer); drawTimer = setTimeout(render, 80);
});
$('pause').addEventListener('click', () => { config.paused = !config.paused; render(); });
for (const theme of ['dark', 'light']) $(theme + '-preview').addEventListener('click', () => {
  $('preview').dataset.theme = theme;
  $('dark-preview').classList.toggle('selected', theme === 'dark'); $('light-preview').classList.toggle('selected', theme === 'light'); render();
});
$('media-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (!['video/mp4', 'video/webm', 'image/gif', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024 || !file.size) { toast('請選擇 20 MB 內的 MP4、WebM、GIF 或圖片。', true); event.target.value = ''; return; }
  try {
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('無法讀取素材')); reader.readAsDataURL(file); });
    // Validate the actual media decoder before sending anything to Codex.
    const probe = document.createElement(file.type.startsWith('video/') ? 'video' : 'img');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('無法解碼素材，請改用其他檔案')), 12000);
      probe[file.type.startsWith('video/') ? 'onloadeddata' : 'onload'] = () => { clearTimeout(timer); resolve(); };
      probe.onerror = () => { clearTimeout(timer); reject(new Error('此素材無法播放，請改用其他編碼')); }; probe.src = data;
    });
    probe.removeAttribute('src');
    config.media = { data, name: file.name }; config.mode = 'media'; $('media-name').textContent = file.name; render();
  } catch (e) { toast(e.message, true); }
});
$('reconnect').addEventListener('click', detect);
for (const action of ['apply', 'restore', 'save']) $(action).addEventListener('click', async () => {
  const buttons = ['apply', 'restore', 'save'].map($); buttons.forEach(b => { b.disabled = true; });
  try {
    if (action !== 'restore' && config.mode === 'media' && !config.media) throw new Error('請先選擇本機素材');
    const result = await request('/api/' + action, { config, targetId: $('target').value });
    toast(action === 'apply' ? `已套用至 Codex${result.reducedMotion ? '（依系統設定減少動畫）' : ''}。` : action === 'restore' ? '已移除 Codex 動態背景。' : '已儲存偏好；本機素材需在下次開啟時重新選擇。');
    if (action !== 'save') await detect();
  } catch (e) { toast(e.message, true); }
  finally { buttons.forEach(b => { b.disabled = false; }); }
});
(async () => { try { config = { ...config, ...await request('/api/settings') }; } catch {} render(); detect(); })();
