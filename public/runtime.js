/* The same renderer runs in the preview and the desktop app. No network or app data access. */
function installAmbient(config, previewHost) {
  const app = !previewHost;
  const slot = app ? '__codexAmbient' : '__codexAmbientPreview';
  const previous = window[slot];
  if (config === null) { previous?.destroy(); return { ok: true, removed: true }; }
  const host = previewHost || document.body;
  if (!host || (app && !document.getElementById('root'))) throw new Error('不相容的視窗：找不到 Codex 主介面');
  const dark = previewHost ? previewHost.dataset.theme !== 'light' : (document.documentElement.dataset.theme === 'dark' || document.documentElement.classList.contains('dark') || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches));
  const base = dark ? '13,18,23' : '245,247,249';
  const layer = document.createElement('div');
  layer.id = app ? 'codex-ambient-layer' : 'ambient-preview-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = `position:${app ? 'fixed' : 'absolute'};inset:0;overflow:hidden;pointer-events:none;z-index:0;background:rgb(${base});`;
  const visual = document.createElement('div');
  visual.style.cssText = `position:absolute;inset:-30px;opacity:${config.strength / 100};filter:blur(${config.blur}px);`;
  const style = document.createElement('style');
  let frame = 0, destroyed = false, last = 0, time = 0, video, mediaURL;
  const animations = [];
  const listeners = [];
  function on(target, event, fn) { target.addEventListener(event, fn); listeners.push(() => target.removeEventListener(event, fn)); }
  const shouldPause = () => config.paused || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function sync() {
    animations.forEach(a => shouldPause() ? a.pause() : a.play());
    if (video) { if (shouldPause()) video.pause(); else video.play().catch(() => {}); }
  }
  if (config.mode === 'media') {
    const [head, data] = config.media.data.split(',');
    const type = head.slice(5, head.indexOf(';'));
    const binary = atob(data), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
    mediaURL = URL.createObjectURL(new Blob([bytes], { type }));
    const media = document.createElement(type.startsWith('video/') ? 'video' : 'img');
    media.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    media.src = mediaURL;
    if (media.tagName === 'VIDEO') {
      video = media; video.muted = true; video.loop = true; video.playsInline = true; video.playbackRate = config.speed;
    } else if (type === 'image/gif') {
      // Freeze a decoded GIF frame on a canvas when paused; resume the image when playing.
      const still = document.createElement('canvas');
      still.style.cssText = media.style.cssText + 'position:absolute;inset:0;display:none';
      visual.append(still);
      const freeze = () => {
        if (!media.naturalWidth) return;
        if (shouldPause()) {
          still.width = media.naturalWidth; still.height = media.naturalHeight;
          still.getContext('2d').drawImage(media, 0, 0); still.style.display = 'block'; media.style.visibility = 'hidden';
        } else { still.style.display = 'none'; media.style.visibility = ''; }
      };
      on(media, 'load', freeze); on(document, 'visibilitychange', freeze);
      on(matchMedia('(prefers-reduced-motion: reduce)'), 'change', freeze);
    }
    visual.append(media);
  } else if (config.mode === 'stars') {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;'; visual.append(canvas);
    const ctx = canvas.getContext('2d');
    const points = Array.from({ length: 90 }, (_, i) => ({ x: ((i * 73 + 19) % 997) / 997, y: ((i * 139 + 37) % 991) / 991, r: 0.5 + (i % 4) * 0.4 }));
    function paint(stamp) {
      if (destroyed) return;
      if (stamp - last >= 33) {
        const rect = layer.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        if (!shouldPause()) time += Math.min(100, stamp - last) * config.speed;
        last = stamp;
        ctx.fillStyle = '#071326'; ctx.fillRect(0, 0, w, h);
        points.forEach((p, i) => {
          ctx.beginPath(); ctx.fillStyle = `rgba(184,224,255,${0.45 + 0.5 * Math.sin(i + time / 1800) ** 2})`;
          ctx.arc((p.x * w + time * 0.004 * p.r) % w, p.y * h, p.r, 0, Math.PI * 2); ctx.fill();
        });
      }
      frame = requestAnimationFrame(paint);
    }
    frame = requestAnimationFrame(paint);
  } else {
    const colors = config.mode === 'ocean' ? ['#057b9e', '#103b8b', '#46e0cd'] : ['#329b81', '#4562aa', '#967449'];
    visual.style.background = config.mode === 'ocean' ? '#061a2b' : '#0e191f';
    colors.forEach((color, i) => {
      const blob = document.createElement('div');
      blob.style.cssText = `position:absolute;width:90%;height:100%;left:${i * 27 - 30}%;top:${i * 16 - 20}%;background:radial-gradient(ellipse,${color} 0%,transparent 67%);`;
      visual.append(blob);
      animations.push(blob.animate([
        { transform: 'translate(-8%, -8%) rotate(-12deg) scale(1)' },
        { transform: 'translate(12%, 9%) rotate(18deg) scale(1.2)' },
        { transform: 'translate(-8%, -8%) rotate(-12deg) scale(1)' }
      ], { duration: (25000 + i * 9000) / config.speed, iterations: Infinity, easing: 'ease-in-out' }));
    });
  }
  layer.append(visual);
  if (app) {
    style.id = 'codex-ambient-style';
    style.textContent = `
      html[data-codex-ambient] body { background:rgb(${base}) !important; isolation:isolate; }
      html[data-codex-ambient] #root { position:relative; z-index:1; background:transparent !important; }
      html[data-codex-ambient] #root {
        --color-surface:rgba(${base},.18);
        --app-color-background-shell:transparent;
        --app-color-background-surface:transparent;
        --app-shell-panel-background:rgba(${base},.65);
      }
      html[data-codex-ambient] [data-app-shell-main-surface],
      html[data-codex-ambient] [class*="_FullHeightPageSurfaceLayout_"],
      html[data-codex-ambient] [class*="_PageSurface_"],
      html[data-codex-ambient] [class*="_WorkspaceContent_"]::before { background:transparent !important; }
      html[data-codex-ambient] :is([role="dialog"],[role="menu"],[data-radix-popper-content-wrapper]) {
        --color-surface:rgb(${base}); --app-shell-panel-background:rgb(${base});
      }
    `;
  }
  // Build first; remove the old background only after all media decoding succeeds.
  previous?.destroy();
  host.prepend(layer);
  if (app) { document.head.append(style); document.documentElement.setAttribute('data-codex-ambient', ''); }
  on(document, 'visibilitychange', sync);
  on(matchMedia('(prefers-reduced-motion: reduce)'), 'change', sync);
  sync();
  const state = {
    mode: config.mode,
    destroy() {
      if (destroyed) return;
      destroyed = true; cancelAnimationFrame(frame); animations.forEach(a => a.cancel()); listeners.forEach(f => f());
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
      if (mediaURL) URL.revokeObjectURL(mediaURL);
      layer.remove(); style.remove();
      if (app) document.documentElement.removeAttribute('data-codex-ambient');
      if (window[slot] === state) delete window[slot];
    }
  };
  window[slot] = state;
  return { ok: true, mode: config.mode, dark, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
}
if (typeof window !== 'undefined') window.installAmbient = installAmbient;
