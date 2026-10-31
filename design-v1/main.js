import { EngineClient } from '@gif-client';
import { inspectGIF } from '@gif-meta';

const $ = id => document.getElementById(id);
let buffer, meta, selection, square = false, busy = false, sourceURL, resultURL, drag;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const size = n => n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(2)} MB`;

function message(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}
function clearResult() {
  if (resultURL) URL.revokeObjectURL(resultURL);
  resultURL = undefined;
  $('result').removeAttribute('src'); $('download').removeAttribute('href');
  $('result-filled').hidden = true; $('result-empty').hidden = false;
  $('result-label').textContent = 'Adjust the frame, then click Crop GIF.';
}
function render() {
  if (!selection || !meta) return;
  const r = selection, el = $('selection');
  Object.assign(el.style, { left: `${r.x / meta.width * 100}%`, top: `${r.y / meta.height * 100}%`, width: `${r.width / meta.width * 100}%`, height: `${r.height / meta.height * 100}%` });
  el.classList.toggle('square', square);
  $('selection-tag').textContent = `${r.width} × ${r.height}`;
  $('width').value = r.width; $('height').value = r.height;
  $('width').max = square ? Math.min(meta.width, meta.height) : meta.width;
  $('height').max = square ? Math.min(meta.width, meta.height) : meta.height;
  for (const [id, active] of [['free', !square], ['square', square]]) {
    $(id).classList.toggle('active', active); $(id).setAttribute('aria-pressed', active);
  }
}
function update(r) {
  selection = r; clearResult(); render();
  message('Ready to crop.'); $('crop').disabled = busy;
}
function processing(value) {
  busy = value;
  for (const id of ['choose', 'width', 'height', 'reset', 'free', 'square', 'crop']) $(id).disabled = value;
  $('selection').setAttribute('aria-disabled', value);
  $('crop').querySelector('span').textContent = value ? 'Cropping GIF…' : 'Crop GIF';
}
async function load(bytes, filename, demo = false) {
  const found = inspectGIF(bytes);
  if (sourceURL) URL.revokeObjectURL(sourceURL);
  buffer = bytes; meta = found; square = false;
  sourceURL = URL.createObjectURL(new Blob([buffer], { type: 'image/gif' }));
  $('original').src = sourceURL; await $('original').decode();
  $('filename').textContent = filename;
  $('file-summary').textContent = `${meta.width} × ${meta.height}  ·  ${meta.frames.length} frames  ·  ${size(bytes.byteLength)}`;
  $('demo-label').hidden = !demo;
  update({ x: 0, y: 0, width: meta.width, height: meta.height });
}
$('choose').onclick = () => $('file').click();
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file) return;
  try {
    if (file.size > 20 * 1048576) throw new Error('file-limit');
    processing(true); message('Opening your GIF…');
    await load(await file.arrayBuffer(), file.name);
  } catch (error) {
    clearResult(); message(error.message === 'file-limit' ? 'Please choose a GIF under 20 MB for this preview.' : 'We could not open that file. Please choose a valid GIF.', true);
  } finally { processing(false); $('file').value = ''; }
};
for (const id of ['width', 'height']) $(id).oninput = () => {
  const value = $(id).valueAsNumber;
  const limit = square ? Math.min(meta.width, meta.height) : meta[id];
  if (!Number.isInteger(value) || value < 1 || value > limit) {
    clearResult(); message(`Enter a whole number from 1 to ${limit}.`, true); $('crop').disabled = true; return;
  }
  const r = { ...selection, [id]: value };
  if (square) r.width = r.height = value;
  r.x = Math.min(r.x, meta.width-r.width); r.y = Math.min(r.y, meta.height-r.height);
  update(r);
};
$('free').onclick = () => { square = false; update({ ...selection }); };
$('square').onclick = () => {
  square = true;
  const side = Math.min(selection.width, selection.height);
  update({ x: clamp(Math.round(selection.x+(selection.width-side)/2), 0, meta.width-side), y: clamp(Math.round(selection.y+(selection.height-side)/2), 0, meta.height-side), width: side, height: side });
};
$('reset').onclick = () => { square = false; update({ x: 0, y: 0, width: meta.width, height: meta.height }); };
$('selection').onpointerdown = e => {
  if (busy || !meta || e.button !== 0) return;
  e.preventDefault(); $('selection').focus();
  drag = { x: e.clientX, y: e.clientY, rect: { ...selection }, bounds: $('image-wrap').getBoundingClientRect(), handle: e.target.dataset.handle };
  $('selection').setPointerCapture(e.pointerId);
};
$('selection').onpointermove = e => {
  if (!drag || busy) return;
  const dx = Math.round((e.clientX-drag.x)/drag.bounds.width*meta.width), dy = Math.round((e.clientY-drag.y)/drag.bounds.height*meta.height);
  const r = drag.rect, h = drag.handle;
  if (!h) { update({ ...r, x: clamp(r.x+dx, 0, meta.width-r.width), y: clamp(r.y+dy, 0, meta.height-r.height) }); return; }
  if (square) {
    const west = h.includes('w'), north = h.includes('n');
    const anchorX = west ? r.x+r.width : r.x, anchorY = north ? r.y+r.height : r.y;
    const proposed = Math.abs(dx) > Math.abs(dy) ? r.width+(west ? -dx : dx) : r.height+(north ? -dy : dy);
    const side = clamp(proposed, 1, Math.min(west ? anchorX : meta.width-anchorX, north ? anchorY : meta.height-anchorY));
    update({ x: west ? anchorX-side : anchorX, y: north ? anchorY-side : anchorY, width: side, height: side }); return;
  }
  let left = r.x, right = r.x+r.width, top = r.y, bottom = r.y+r.height;
  if (h.includes('w')) left = clamp(r.x+dx, 0, right-1);
  if (h.includes('e')) right = clamp(r.x+r.width+dx, left+1, meta.width);
  if (h.includes('n')) top = clamp(r.y+dy, 0, bottom-1);
  if (h.includes('s')) bottom = clamp(r.y+r.height+dy, top+1, meta.height);
  update({ x: left, y: top, width: right-left, height: bottom-top });
};
$('selection').onpointerup = $('selection').onpointercancel = $('selection').onlostpointercapture = () => { drag = undefined; };
$('selection').onkeydown = e => {
  if (busy || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
  e.preventDefault(); const distance = e.shiftKey ? 10 : 1;
  update({ ...selection, x: clamp(selection.x+(e.key==='ArrowRight' ? distance : e.key==='ArrowLeft' ? -distance : 0), 0, meta.width-selection.width), y: clamp(selection.y+(e.key==='ArrowDown' ? distance : e.key==='ArrowUp' ? -distance : 0), 0, meta.height-selection.height) });
};
$('crop').onclick = async () => {
  if (busy || !buffer) return;
  clearResult(); processing(true); message('Cropping GIF. Please wait…');
  const client = new EngineClient('H');
  try {
    await client.init(); const result = await client.run(buffer, { ...selection });
    resultURL = URL.createObjectURL(new Blob([result.bytes], { type: 'image/gif' }));
    $('result').src = resultURL; $('download').href = resultURL;
    $('result-info').textContent = `${result.meta.width} × ${result.meta.height} px  ·  ${result.meta.frames.length} frames  ·  ${size(result.bytes.length)}`;
    $('result-filled').hidden = false; $('result-empty').hidden = true;
    $('result-label').textContent = 'Crop complete. Ready to download.';
    message('Your cropped GIF is ready below.');
    $('result-section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
  } catch (error) {
    const unsupported = /量化|保留颜色|兼容处理|不支持/.test(error.message);
    message(unsupported ? 'We cannot preserve this crop’s colors and animation. Try a different frame.' : /read error|corrupt|截断|有效的 GIF/.test(error.message) ? 'This GIF appears damaged or incomplete. Please try another file.' : 'We could not process this GIF. Please try a different file.', true);
  } finally { client.close(); processing(false); }
};
window.addEventListener('pagehide', () => { if (sourceURL) URL.revokeObjectURL(sourceURL); if (resultURL) URL.revokeObjectURL(resultURL); });
try { await load(await fetch('/art/coastal-loop.gif').then(r => r.arrayBuffer()), 'coastal-loop.gif', true); }
catch { message('Please choose a GIF to get started.', true); }
window.designPreview = { get selection() { return { ...selection }; }, get meta() { return meta; }, get busy() { return busy; } };
