import { t, esc, icon, toast } from '../core.js';

export function editorView(root) {
  root.innerHTML = `
    <div class="section-head">
      <div><h2>${esc(t('studio.editor_title'))}</h2><p class="sub">${esc(t('studio.editor_sub'))}</p></div>
      <button class="btn sm" id="pickBtn">${icon('upload')}${esc(t('studio.editor_pick'))}</button>
    </div>
    <div class="editor-shell">
      <div class="editor-stage"><canvas id="editorCanvas" width="960" height="540"></canvas></div>
      <aside class="card panel editor-controls">
        <div class="field"><label>${esc(t('studio.editor_brightness'))}</label><input type="range" id="brightness" min="40" max="160" value="100"></div>
        <div class="field"><label>${esc(t('studio.editor_contrast'))}</label><input type="range" id="contrast" min="40" max="180" value="100"></div>
        <div class="field"><label>${esc(t('studio.editor_saturation'))}</label><input type="range" id="saturation" min="0" max="200" value="100"></div>
        <button class="btn" id="rotateBtn">${icon('refresh')}${esc(t('studio.editor_rotate'))}</button>
        <button class="btn ghost" id="resetBtn">${esc(t('studio.editor_reset'))}</button>
        <button class="btn primary" id="exportBtn">${icon('download')}${esc(t('studio.editor_export'))}</button>
        <p class="tiny dim">${esc(t('studio.editor_hint'))}</p>
        <input type="file" id="editorFile" accept="image/*" hidden>
      </aside>
    </div>`;

  const canvas = root.querySelector('#editorCanvas');
  const ctx = canvas.getContext('2d');
  const fileInput = root.querySelector('#editorFile');
  let image = null;
  let rotation = 0;
  const grade = { brightness: 100, contrast: 100, saturation: 100 };

  function placeholder() {
    canvas.width = 960;
    canvas.height = 540;
    const gradient = ctx.createLinearGradient(0, 0, 960, 540);
    gradient.addColorStop(0, '#171128');
    gradient.addColorStop(0.6, '#0b0a14');
    gradient.addColorStop(1, '#1d0f1c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 960, 540);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t('studio.editor_pick'), 480, 276);
  }

  function draw() {
    if (!image) {
      placeholder();
      return;
    }
    const rad = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const rawW = image.naturalWidth * cos + image.naturalHeight * sin;
    const rawH = image.naturalWidth * sin + image.naturalHeight * cos;
    const scale = Math.min(1, 1600 / rawW);
    canvas.width = Math.round(rawW * scale);
    canvas.height = Math.round(rawH * scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.filter = `brightness(${grade.brightness}%) contrast(${grade.contrast}%) saturate(${grade.saturation}%)`;
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    ctx.drawImage(image, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  root.querySelector('#pickBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      image = img;
      rotation = 0;
      draw();
      URL.revokeObjectURL(url);
    };
    img.onerror = () => toast(t('common.error'), 'bad');
    img.src = url;
  });

  for (const key of ['brightness', 'contrast', 'saturation']) {
    root.querySelector(`#${key}`).addEventListener('input', (event) => {
      grade[key] = Number(event.target.value);
      draw();
    });
  }

  root.querySelector('#rotateBtn').addEventListener('click', () => {
    rotation = (rotation + 90) % 360;
    draw();
  });

  root.querySelector('#resetBtn').addEventListener('click', () => {
    grade.brightness = 100;
    grade.contrast = 100;
    grade.saturation = 100;
    rotation = 0;
    root.querySelector('#brightness').value = 100;
    root.querySelector('#contrast').value = 100;
    root.querySelector('#saturation').value = 100;
    draw();
  });

  root.querySelector('#exportBtn').addEventListener('click', () => {
    if (!image) {
      toast(t('studio.editor_pick'), 'warn');
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nova-edit-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  });

  draw();
}
