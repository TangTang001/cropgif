import { GifClient, readGIFFile } from './gif/client.js';
import { inspectGIF } from './gif/inspect.js';
import { GifError, normalizeError } from './gif/errors.js';
import { imagePoint, move, resize, squareRect, dimensions } from './crop/geometry.js';
import { cropFilename } from './crop/filename.js';

const $ = id => document.getElementById(id);
const exampleButtons = document.querySelectorAll('[data-example]');
const circlePage = Boolean($('circle'));
const stage = $('stage');
const shapeButtons = [$(circlePage ? 'circle' : 'free'), $('square')];
const examples = {
  circle: { name: 'gif-crop-before.gif' },
  'cat-circle': { name: 'avatar-cat-before.gif', shape: 'circle' },
  'avatar-circle': { name: 'avatar-robot-before.gif', shape: 'circle' },
  square: { name: 'gif-crop-before.gif', square: true },
  freeform: { name: 'gif-freeform-before.gif', rect: { x: 104, y: 0, width: 216, height: 180 } },
};
const client = new GifClient();
let buffer, meta, selection, sourceURL, resultURL, drag, sourceName;
let taskId = 0;
let shape = circlePage ? 'circle' : 'free';
let square = circlePage, busy = false;
const size = n => n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(2)} MB`;
function message(text, error = false) {
  $('status').setAttribute('role', error ? 'alert' : 'status');
  $('status').textContent = text; $('status').classList.toggle('error', error);
}
function clearResult() {
  if (resultURL) URL.revokeObjectURL(resultURL);
  resultURL = undefined;
  for (const attribute of ['src', 'width', 'height']) $('result').removeAttribute(attribute);
  $('download').removeAttribute('href');
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
  $('choose').disabled = $('replace-file').disabled = $('clear-file').disabled = $('file').disabled = busy;
  $('file-actions').hidden = !buffer;
  for (const button of exampleButtons) button.disabled = busy;
  for (const control of [$('width'), $('height'), $('reset'), ...shapeButtons]) control.disabled = busy || !buffer;
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
  const style = getComputedStyle(stage);
  const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const scale = Math.min(1, width / meta.width, height / meta.height);
  $('image-wrap').style.width = `${meta.width * scale}px`;
  $('image-wrap').style.height = `${meta.height * scale}px`; render(false);
}
function render(syncInputs = true) {
  if (!selection) return;
  const r = selection;
  const image = $('image-wrap');
  image.classList.toggle('circle-crop', shape === 'circle');
  image.style.setProperty('--crop-left', `${r.x / meta.width * 100}%`);
  image.style.setProperty('--crop-top', `${r.y / meta.height * 100}%`);
  image.style.setProperty('--crop-width', `${r.width / meta.width * 100}%`);
  image.style.setProperty('--crop-height', `${r.height / meta.height * 100}%`);
  const bounds = image.getBoundingClientRect();
  $('selection').classList.toggle('compact', r.width / meta.width * bounds.width < 90 || r.height / meta.height * bounds.height < 44);
  $('selection-tag').textContent = `${r.width} × ${r.height}`;
  $('selection').setAttribute('aria-label', `Crop selection, ${r.width} by ${r.height} pixels. Use arrow keys to move.`);
  if (syncInputs) {
    $('width').value = r.width; $('height').value = r.height; $('dimension-error').textContent = '';
    $('width').removeAttribute('aria-invalid'); $('height').removeAttribute('aria-invalid');
  }
  for (const id of ['width', 'height']) $(id).max = square ? Math.min(meta.width, meta.height) : meta[id];
  syncShapeButtons();
}
function syncShapeButtons() {
  for (const button of shapeButtons) {
    const active = button.id === shape;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  }
}
function update(rect) { selection = rect; clearResult(); render(); setState('ready'); message('Ready to crop.'); }
$('choose').onclick = $('replace-file').onclick = () => $('file').click();
$('choose-again').onclick = () => { $('file-dialog').close(); $('file').click(); };
function openLocalFile(file) {
  if (file) openGIF(file.name, () => readGIFFile(file));
}
$('file').onchange = () => openLocalFile($('file').files[0]);
stage.addEventListener('dragover', event => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
  if (!busy) stage.classList.add('drag-over');
});
stage.addEventListener('dragleave', event => {
  if (!stage.contains(event.relatedTarget)) stage.classList.remove('drag-over');
});
stage.addEventListener('drop', event => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  stage.classList.remove('drag-over');
  openLocalFile(event.dataTransfer.files[0]);
});
function openExample(key) {
  const example = examples[key];
  $('editor').scrollIntoView();
  openGIF(example.name, async () => {
    const response = await fetch(`/examples/${example.name}`);
    if (!response.ok) throw new Error('Example unavailable');
    return response.arrayBuffer();
  }, example);
}
for (const button of exampleButtons) {
  button.onclick = () => openExample(button.dataset.example);
}
function clearSource() {
  endDrag();
  $('file-dialog').close();
  $('file-error').textContent = '';
  clearResult();
  buffer = meta = selection = sourceName = undefined;
  if (sourceURL) URL.revokeObjectURL(sourceURL);
  sourceURL = undefined; $('original').removeAttribute('src');
  $('image-wrap').hidden = true; $('upload-prompt').hidden = false;
  $('filename').textContent = 'No GIF selected'; $('file-summary').textContent = '';
  $('dimension-error').textContent = '';
  for (const id of ['width', 'height']) {
    $(id).value = '';
    $(id).removeAttribute('aria-invalid');
    $(id).removeAttribute('max');
  }
  stage.classList.remove('drag-over');
}
$('clear-file').onclick = () => {
  if (busy || !buffer) return;
  clearSource();
  $('file').value = '';
  shape = circlePage ? 'circle' : 'free';
  square = circlePage;
  syncShapeButtons();
  setState('empty');
  message('Choose a local GIF to begin.');
  $('choose').focus({ preventScroll: true });
};
async function openGIF(name, readBytes, example) {
  if (busy) return;
  const id = ++taskId;
  clearSource();
  setState('loading'); message('Opening your GIF…');
  try {
    const bytes = await readBytes();
    if (id !== taskId) return;
    // Classify even short non-GIF files before the full container scan.
    const signature = String.fromCharCode(...new Uint8Array(bytes).subarray(0, 6));
    if (!['GIF87a', 'GIF89a'].includes(signature)) throw new GifError('INVALID_GIF');
    const found = inspectGIF(bytes);
    sourceURL = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
    $('original').width = found.width;
    $('original').height = found.height;
    $('original').src = sourceURL; await $('original').decode();
    if (id !== taskId) return;
    buffer = bytes; meta = found;
    if (circlePage) {
      if (example) shape = example.shape ?? 'circle';
    } else {
      shape = example?.square ? 'square' : 'free';
    }
    square = shape !== 'free';
    sourceName = name;
    $('filename').textContent = name;
    $('image-wrap').hidden = false; $('upload-prompt').hidden = true;
    $('file-summary').textContent = `${meta.width} × ${meta.height} · ${meta.frames.length} frames · ${size(bytes.byteLength)}`;
    const full = { x: 0, y: 0, width: meta.width, height: meta.height };
    update(square ? squareRect(full) : example?.rect ?? full); fitImage();
    if (example) $('crop').focus({ preventScroll: true });
  } catch (error) {
    if (id !== taskId) return;
    if (sourceURL) URL.revokeObjectURL(sourceURL);
    sourceURL = undefined; $('original').removeAttribute('src');
    const failure = normalizeError(error);
    const text = example ? 'Could not open the example GIF. Try again or choose a local GIF.'
      : failure.code === 'INVALID_GIF' ? 'Only GIF files are supported. Please choose a GIF file.' : failure.message;
    $('file-error').textContent = text; message(text, true);
    setState('error');
    if (!example && failure.code === 'INVALID_GIF') $('file-dialog').showModal();
  } finally { if (id === taskId) { controls(); $('file').value = ''; } }
}
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
for (const button of shapeButtons) {
  button.onclick = () => {
    shape = button.id;
    square = shape !== 'free';
    update(square ? squareRect(selection) : { ...selection });
  };
}
$('reset').onclick = () => {
  if (!circlePage) { shape = 'free'; square = false; }
  const full = { x: 0, y: 0, width: meta.width, height: meta.height };
  update(square ? squareRect(full) : full);
};
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
    const result = await client.run(buffer, { ...selection }, shape);
    if (id !== taskId) return;
    resultURL = URL.createObjectURL(new Blob([result.bytes], { type: 'image/gif' }));
    $('result').classList.toggle('round-result', shape === 'circle');
    $('result').width = result.meta.width;
    $('result').height = result.meta.height;
    $('result').src = resultURL; $('download').href = resultURL;
    $('download').download = cropFilename(sourceName, result.meta.width, result.meta.height, shape);
    $('result-info').textContent = `${result.meta.width} × ${result.meta.height} px · ${result.meta.frames.length} frames · ${size(result.bytes.length)}`;
    if (shape === 'circle' && result.details.quantizedFrames) {
      $('result-info').textContent += '. Some colors were adjusted to make room for transparency.';
    }
    $('result-filled').hidden = false; $('result-empty').hidden = true;
    $('result-label').textContent = 'Crop complete. Ready to download.';
    setState('success'); message('Your cropped GIF is ready below.');
  } catch (error) { if (id === taskId) { clearResult(); setState('error'); message(normalizeError(error).message, true); } }
  finally { if (id === taskId) controls(); }
};
const observer = new ResizeObserver(() => { endDrag(); fitImage(); }); observer.observe(stage);
addEventListener('pagehide', () => { ++taskId; endDrag(); client.close(); clearResult(); if (sourceURL) URL.revokeObjectURL(sourceURL); sourceURL = undefined; });
addEventListener('pageshow', event => {
  if (!event.persisted) return;
  if (buffer) {
    sourceURL = URL.createObjectURL(new Blob([buffer], { type: 'image/gif' }));
    $('original').src = sourceURL; setState('ready'); message('Ready to crop.');
  } else { setState('empty'); message('Choose a local GIF to begin.'); }
});
setState('empty');
if (circlePage && new URLSearchParams(location.search).get('example') === 'avatar-circle') {
  openExample('avatar-circle');
}
