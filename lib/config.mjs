export const defaults = Object.freeze({ mode: 'aurora', strength: 35, blur: 3, speed: 1, paused: false, media: null });
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
export function validateConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('設定格式錯誤');
  const c = { ...defaults };
  if (!['aurora', 'ocean', 'stars', 'media'].includes(input.mode)) throw new Error('不支援的背景類型');
  c.mode = input.mode;
  for (const [key, min, max] of [['strength', 0, 80], ['blur', 0, 20], ['speed', 0.25, 2]]) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < min || input[key] > max) throw new Error(`${key} 超出範圍`);
    c[key] = input[key];
  }
  c.paused = input.paused === true;
  if (c.mode === 'media') {
    const m = input.media;
    if (!m || typeof m.data !== 'string' || !/^data:(video\/(mp4|webm)|image\/(gif|png|jpeg|webp));base64,[A-Za-z0-9+/]+={0,2}$/.test(m.data)) throw new Error('請選擇 MP4、WebM、GIF 或圖片');
    if (Buffer.byteLength(m.data.split(',')[1], 'base64') > MAX_MEDIA_BYTES) throw new Error('素材上限為 20 MB');
    c.media = { data: m.data, name: String(m.name || '本機素材').slice(0, 180) };
  }
  return c;
}
