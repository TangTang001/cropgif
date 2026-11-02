import './styles.css';
import { GifClient, readGIFFile } from './gif/client.js';
import { inspectGIF } from './gif/inspect.js';
import { GifError, normalizeError } from './gif/errors.js';
import { imagePoint, move, resize, squareRect, dimensions } from './crop/geometry.js';
import { cropFilename } from './crop/filename.js';

const $ = id => document.getElementById(id);
const client = new GifClient();
let buffer, meta, selection, sourceURL, resultURL, drag, sourceName;
let taskId = 0;
let square = false, busy = false;
const size = n => n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(2)} MB`;
function message(text, error = false) {
  $('status').setAttribute('role', error ? 'alert' : 'status');
  $('status').textContent = text; $('status').classList.toggle('error', error);
}
function clearResult() {
  if (resultURL) URL.revokeObjectURL(resultURL);
  resultURL = undefined;
  $('result').removeAttribute('src'); $('download').removeAttribute('href');
  $('download').removeAttribute('download');
  $('result-filled').hidden = true; $('result-empty').hidden = false;
  $('result-label').textContent = 'Adjust the frame, then click Crop GIF.';
}
function validDimensions() {
  if (!meta) return false;
  return ['width', 'height'].every(id => {
    const n = $(id).valueAsNumber;
    return Number.isInteger(n) && n >= 1 && n <= (square ? Math.min(meta.width, meta.height) : meta[id]);
  }) && (!square || $('width').valueAsNumber === $('height').valueAsNumber);
}
function controls() {
  $('choose').disabled = $('file').disabled = busy;
  for (const id of ['width', 'height', 'reset', 'free', 'square']) $(id).disabled = busy || !buffer;
  $('crop').disabled = busy || !buffer || !validDimensions();
  $('selection').setAttribute('aria-disabled', busy || !buffer);
  $('editor').setAttribute('aria-busy', busy);
}
function setState(state) {
  $('editor').dataset.state = state;
  busy = state === 'loading' || state === 'processing';
  controls(); $('crop').querySelector('span').textContent = busy ? 'Please wait…' : 'Crop GIF';
}
function fitImage() {
  if (!meta) return;
  const stage = $('stage'), style = getComputedStyle(stage);
  const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const scale = Math.min(1, width / meta.width, height / meta.height);
  $('image-wrap').style.width = `${meta.width * scale}px`;
  $('image-wrap').style.height = `${meta.height * scale}px`; render(false);
}
function render(syncInputs = true) {
  if (!selection) return;
  const r = selection;
  Object.assign($('selection').style, { left: `${r.x / meta.width * 100}%`, top: `${r.y / meta.height * 100}%`, width: `${r.width / meta.width * 100}%`, height: `${r.height / meta.height * 100}%` });
  const bounds = $('image-wrap').getBoundingClientRect();
  $('selection').classList.toggle('compact', r.width / meta.width * bounds.width < 90 || r.height / meta.height * bounds.height < 44);
  $('selection-tag').textContent = `${r.width} × ${r.height}`;
  $('selection').setAttribute('aria-label', `Crop selection, ${r.width} by ${r.height} pixels. Use arrow keys to move.`);
  if (syncInputs) {
    $('width').value = r.width; $('height').value = r.height; $('dimension-error').textContent = '';
    $('width').removeAttribute('aria-invalid'); $('height').removeAttribute('aria-invalid');
  }
  for (const id of ['width', 'height']) $(id).max = square ? Math.min(meta.width, meta.height) : meta[id];
  for (const [id, active] of [['free', !square], ['square', square]]) {
    $(id).classList.toggle('active', active); $(id).setAttribute('aria-pressed', active);
  }
}
function update(rect) { selection = rect; clearResult(); render(); setState('ready'); message('Ready to crop.'); }
$('choose').onclick = () => $('file').click();
$('choose-again').onclick = () => { $('file-dialog').close(); $('file').click(); };
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file || busy) return;
  const id = ++taskId;
  $('file-dialog').close(); $('file-error').textContent = '';
  clearResult(); buffer = meta = selection = sourceName = undefined; drag = undefined;
  if (sourceURL) URL.revokeObjectURL(sourceURL);
  sourceURL = undefined; $('original').removeAttribute('src');
  $('image-wrap').hidden = true; $('upload-prompt').hidden = false;
  $('filename').textContent = 'No GIF selected'; $('file-summary').textContent = '';
  $('dimension-error').textContent = ''; $('width').value = $('height').value = '';
  setState('loading'); message('Opening your GIF…');
  try {
    const bytes = await readGIFFile(file);
    if (id !== taskId) return;
    // Classify even short non-GIF files before the full container scan.
    const signature = String.fromCharCode(...new Uint8Array(bytes).subarray(0, 6));
    if (!['GIF87a', 'GIF89a'].includes(signature)) throw new GifError('INVALID_GIF');
    const found = inspectGIF(bytes);
    sourceURL = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
    $('original').src = sourceURL; await $('original').decode();
    if (id !== taskId) return;
    buffer = bytes; meta = found; square = false;
    sourceName = file.name;
    $('filename').textContent = file.name;
    $('image-wrap').hidden = false; $('upload-prompt').hidden = true;
    $('file-summary').textContent = `${meta.width} × ${meta.height} · ${meta.frames.length} frames · ${size(bytes.byteLength)}`;
    update({ x: 0, y: 0, width: meta.width, height: meta.height }); fitImage();
  } catch (error) {
    if (id !== taskId) return;
    if (sourceURL) URL.revokeObjectURL(sourceURL);
    sourceURL = undefined; $('original').removeAttribute('src');
    const failure = normalizeError(error);
    const text = failure.code === 'INVALID_GIF' ? 'Only GIF files are supported. Please choose a GIF file.' : failure.message;
    $('file-error').textContent = text; message(text, true);
    setState('error');
    if (failure.code === 'INVALID_GIF') $('file-dialog').showModal();
  } finally { if (id === taskId) { controls(); $('file').value = ''; } }
};
for (const id of ['width', 'height']) {
  $(id).oninput = () => {
    clearResult(); const n = $(id).valueAsNumber;
    const limit = square ? Math.min(meta.width, meta.height) : meta[id];
    if (square && Number.isInteger(n) && n >= 1 && n <= limit) $('width').value = $('height').value = n;
    const valid = validDimensions();
    for (const field of ['width', 'height']) {
      const value = $(field).valueAsNumber, max = square ? Math.min(meta.width, meta.height) : meta[field];
      $(field).setAttribute('aria-invalid', !(Number.isInteger(value) && value >= 1 && value <= max));
    }
    $('dimension-error').textContent = valid ? '' : `Enter whole pixels: width 1–${$('width').max}, height 1–${$('height').max}.`;
    if (valid) {
      selection = dimensions(selection, $('width').valueAsNumber, $('height').valueAsNumber, meta);
      render(false); message('Ready to crop.');
    }
    if (!valid) message('Enter valid crop dimensions before cropping.', true);
    setState(valid ? 'ready' : 'error');
  };
  $(id).onkeydown = event => { if (event.key === 'Escape') { update({ ...selection }); event.preventDefault(); } };
}
$('free').onclick = () => { square = false; update({ ...selection }); };
$('square').onclick = () => { square = true; update(squareRect(selection)); };
$('reset').onclick = () => { square = false; update({ x: 0, y: 0, width: meta.width, height: meta.height }); };
for (const el of document.querySelectorAll('.handle')) {
  el.tabIndex = 0; el.setAttribute('role', 'button');
  const names = { nw: 'top left', n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left' };
  el.setAttribute('aria-label', `Resize ${names[el.dataset.handle]} edge. Use arrow keys.`);
}
function endDrag() {
  if (drag && $('selection').hasPointerCapture(drag.id)) $('selection').releasePointerCapture(drag.id);
  drag = undefined;
}
$('selection').onpointerdown = event => {
  if (busy || !meta || drag || event.button !== 0 || !event.isPrimary) return;
  event.preventDefault();
  (event.target.closest('.handle') || $('selection')).focus({ preventScroll: true });
  drag = { id: event.pointerId, start: imagePoint(event.clientX, event.clientY, $('image-wrap').getBoundingClientRect(), meta), rect: { ...selection }, handle: event.target.closest('.handle')?.dataset.handle };
  $('selection').setPointerCapture(event.pointerId);
};
$('selection').onpointermove = event => {
  if (!drag || busy || drag.id !== event.pointerId) return;
  // Current bounds account for scroll, zoom and responsive layout.
  const point = imagePoint(event.clientX, event.clientY, $('image-wrap').getBoundingClientRect(), meta);
  const dx = point.x - drag.start.x, dy = point.y - drag.start.y;
  update(drag.handle ? resize(drag.rect, drag.handle, dx, dy, meta, square) : move(drag.rect, dx, dy, meta));
};
$('selection').onpointerup = $('selection').onpointercancel = event => { if (drag?.id === event.pointerId) endDrag(); };
$('selection').onlostpointercapture = () => { drag = undefined; };
$('selection').onkeydown = event => {
  if (busy || !selection || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault(); const distance = event.shiftKey ? 10 : 1;
  const dx = event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0;
  const dy = event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0;
  const handle = event.target.dataset.handle;
  update(handle ? resize(selection, handle, dx, dy, meta, square) : move(selection, dx, dy, meta));
};
$('crop').onclick = async () => {
  if (busy || !buffer || !validDimensions()) return;
  const id = ++taskId;
  endDrag(); clearResult(); setState('processing'); message('Cropping GIF. Please wait…');
  try {
    const result = await client.run(buffer, { ...selection });
    if (id !== taskId) return;
    resultURL = URL.createObjectURL(new Blob([result.bytes], { type: 'image/gif' }));
    $('result').src = resultURL; $('download').href = resultURL;
    $('download').download = cropFilename(sourceName, result.meta.width, result.meta.height);
    $('result-info').textContent = `${result.meta.width} × ${result.meta.height} px · ${result.meta.frames.length} frames · ${size(result.bytes.length)}`;
    $('result-filled').hidden = false; $('result-empty').hidden = true;
    $('result-label').textContent = 'Crop complete. Ready to download.';
    setState('success'); message('Your cropped GIF is ready below.');
  } catch (error) { if (id === taskId) { clearResult(); setState('error'); message(normalizeError(error).message, true); } }
  finally { if (id === taskId) controls(); }
};
const observer = new ResizeObserver(() => { endDrag(); fitImage(); }); observer.observe($('stage'));
addEventListener('pagehide', () => { ++taskId; endDrag(); client.close(); clearResult(); if (sourceURL) URL.revokeObjectURL(sourceURL); sourceURL = undefined; });
addEventListener('pageshow', event => {
  if (!event.persisted) return;
  if (buffer) {
    sourceURL = URL.createObjectURL(new Blob([buffer], { type: 'image/gif' }));
    $('original').src = sourceURL; setState('ready'); message('Ready to crop.');
  } else { setState('empty'); message('Choose a local GIF to begin.'); }
});
setState('empty');
