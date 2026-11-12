import { GifClient, readGIFFile } from './gif/client.js';
import { GifError, normalizeError } from './gif/errors.js';
import { inspectGIF } from './gif/inspect.js';
import { scaleDimension, validateResize } from './gif/resize.js';

const $ = id => document.getElementById(id);
const client = new GifClient();
const form = $('resize-form');
const stage = $('stage');
const frame = $('resize-frame');
const modes = form.elements['resize-mode'];
const width = $('width');
const height = $('height');
const percentage = $('percentage');
const lock = $('lock-ratio');
const original = $('original');
const preview = $('result');
const download = $('download');
const submit = $('resize-submit');
const file = $('file');
const example = 'gif-resize-sailboat-before.gif';
const exampleButton = document.querySelector('[data-resize-example]');
let source, target, sourceURL, resultURL, drag;
let busy = false;
let lastDimension = width;

function message(text, error = false) {
  const status = $('status');
  status.textContent = text;
  status.classList.toggle('error', error);
  status.setAttribute('role', error ? 'alert' : 'status');
}

function setBusy(value) {
  busy = value;
  if (busy) endDrag();
  $('choose').disabled = $('replace-file').disabled = $('clear-file').disabled = file.disabled = busy;
  $('file-actions').hidden = !source;
  exampleButton.disabled = busy;
  $('resize-controls').disabled = busy || !source;
  submit.disabled = busy || !target;
  $('editor').setAttribute('aria-busy', String(busy));
}

function clearResult() {
  if (resultURL) URL.revokeObjectURL(resultURL);
  resultURL = undefined;
  preview.removeAttribute('src');
  download.removeAttribute('href');
  download.removeAttribute('download');
  $('result-filled').hidden = true;
  $('result-empty').hidden = false;
}

function syncRatio(field) {
  if (!source || !lock.checked) return;
  const value = field.valueAsNumber;
  if (!Number.isSafeInteger(value) || value < 1) return;
  const { meta } = source;
  if (field === width) height.value = scaleDimension(meta.height, value / meta.width);
  else width.value = scaleDimension(meta.width, value / meta.height);
}

function fitFrame() {
  if (!source) return;
  const { width, height } = target ?? source.meta;
  const style = getComputedStyle(stage);
  const maxWidth = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const maxHeight = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const scale = Math.min(Math.max(1, 48 / Math.max(width, height)), maxWidth / width, maxHeight / height);
  frame.style.width = `${width * scale}px`;
  frame.style.height = `${height * scale}px`;
}

function updateSettings() {
  const percentMode = modes.value === 'percentage';
  $('dimension-controls').hidden = percentMode;
  $('percentage-controls').hidden = !percentMode;
  clearResult();
  target = undefined;
  $('resize-target').textContent = '';
  $('size-error').textContent = '';
  if (source) {
    try {
      const scale = percentage.valueAsNumber / 100;
      if (percentMode && (!Number.isFinite(scale) || scale <= 0)) {
        $('size-error').textContent = 'Enter a percentage greater than zero.';
      } else {
        const { meta } = source;
        const next = percentMode
          ? { width: scaleDimension(meta.width, scale), height: scaleDimension(meta.height, scale) }
          : { width: width.valueAsNumber, height: height.valueAsNumber };
        validateResize(meta, next);
        target = next;
        $('resize-target').textContent = `Output: ${next.width} × ${next.height} px`;
      }
    } catch (error) {
      $('size-error').textContent = normalizeError(error).message;
    }
  }
  submit.disabled = busy || !target;
  fitFrame();
}

async function openGIF(name, read, isExample = false) {
  if (busy) return;
  setBusy(true);
  message('Opening your GIF…');
  $('file-error').textContent = '';
  let url;
  try {
    const buffer = await read();
    const meta = inspectGIF(buffer);
    url = URL.createObjectURL(new Blob([buffer], { type: 'image/gif' }));
    const image = new Image();
    image.src = url;
    await image.decode();
    if (sourceURL) URL.revokeObjectURL(sourceURL);
    sourceURL = url;
    url = undefined;
    source = { buffer, meta, name };
    original.src = sourceURL;
    frame.hidden = false;
    $('resize-hint').hidden = false;
    $('upload-prompt').hidden = true;
    $('filename').textContent = name;
    $('file-summary').textContent = `${meta.width} × ${meta.height} · ${meta.frames.length} frames`;
    form.reset();
    width.value = meta.width;
    height.value = meta.height;
    lastDimension = width;
    if (isExample) {
      modes.value = 'percentage';
      percentage.value = 50;
    }
    updateSettings();
    message('Ready to resize.');
    setBusy(false);
    (isExample ? percentage : width).focus({ preventScroll: true });
  } catch (error) {
    const text = isExample ? 'Could not open the example. Try again or choose a local GIF.' : normalizeError(error).message;
    $('file-error').textContent = text;
    message(source ? 'The current GIF is still ready to resize.' : 'Choose a GIF to begin.');
  } finally {
    if (url) URL.revokeObjectURL(url);
    file.value = '';
    setBusy(false);
  }
}

function openLocalFile(selected) {
  if (selected) openGIF(selected.name, () => readGIFFile(selected));
}

$('choose').onclick = $('replace-file').onclick = () => file.click();
file.onchange = () => openLocalFile(file.files[0]);
exampleButton.onclick = () => {
  $('editor').scrollIntoView();
  openGIF(example, async () => {
    const response = await fetch(`/examples/${example}`);
    if (!response.ok) throw new GifError('PROCESSING_FAILED');
    return response.arrayBuffer();
  }, true);
};
$('clear-file').onclick = () => {
  if (busy || !source) return;
  endDrag();
  URL.revokeObjectURL(sourceURL);
  source = sourceURL = undefined;
  original.removeAttribute('src');
  frame.hidden = true;
  $('resize-hint').hidden = true;
  $('upload-prompt').hidden = false;
  $('filename').textContent = 'No GIF selected';
  $('file-summary').textContent = '';
  $('file-error').textContent = '';
  stage.classList.remove('drag-over');
  file.value = '';
  form.reset();
  lastDimension = width;
  updateSettings();
  setBusy(false);
  message('Choose a local GIF to begin.');
  $('choose').focus({ preventScroll: true });
};
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

for (const field of [width, height]) {
  field.oninput = () => {
    lastDimension = field;
    syncRatio(field);
    updateSettings();
    message('Ready to resize.');
  };
}
lock.onchange = () => {
  syncRatio(lastDimension);
  updateSettings();
  message('Ready to resize.');
};
percentage.oninput = () => {
  updateSettings();
  message('Ready to resize.');
};
for (const mode of modes) {
  mode.onchange = () => {
    updateSettings();
    message('Ready to resize.');
  };
}

function endDrag() {
  if (!drag) return;
  const { pointer } = drag;
  drag = undefined;
  if (stage.hasPointerCapture(pointer)) stage.releasePointerCapture(pointer);
}

frame.addEventListener('pointerdown', event => {
  const edge = event.target.dataset.resizeHandle;
  if (!edge || busy || drag || event.button !== 0) return;
  event.preventDefault();
  const { width, height } = target ?? source.meta;
  const bounds = frame.getBoundingClientRect();
  const fromPercentage = modes.value === 'percentage';
  drag = {
    pointer: event.pointerId, x: event.clientX, y: event.clientY,
    horizontal: edge.includes('e') ? 1 : edge.includes('w') ? -1 : 0,
    vertical: edge.includes('s') ? 1 : edge.includes('n') ? -1 : 0,
    width, height, screenWidth: bounds.width, screenHeight: bounds.height,
    fromPercentage, locked: fromPercentage || lock.checked,
  };
  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener('pointermove', event => {
  if (event.pointerId !== drag?.pointer) return;
  const dx = (event.clientX - drag.x) * 2 * drag.horizontal;
  const dy = (event.clientY - drag.y) * 2 * drag.vertical;
  const xScale = 1 + dx / drag.screenWidth;
  const yScale = 1 + dy / drag.screenHeight;
  const next = {
    width: scaleDimension(drag.width, xScale),
    height: scaleDimension(drag.height, yScale),
  };
  const changed = drag.horizontal ? width : height;
  if (drag.locked) {
    // Project corner movement onto the displayed diagonal for a uniform scale.
    const factor = drag.horizontal && drag.vertical
      ? 1 + (dx * drag.screenWidth + dy * drag.screenHeight) / (drag.screenWidth ** 2 + drag.screenHeight ** 2)
      : drag.horizontal ? xScale : yScale;
    const { meta } = source;
    if (drag.horizontal) {
      next.width = scaleDimension(drag.width, factor);
      next.height = scaleDimension(meta.height, next.width / meta.width);
    } else {
      next.height = scaleDimension(drag.height, factor);
      next.width = scaleDimension(meta.width, next.height / meta.height);
    }
  }
  if (next.width === target?.width && next.height === target?.height) return;
  try {
    validateResize(source.meta, next);
  } catch (error) {
    message(normalizeError(error).message, true);
    return;
  }
  if (drag.fromPercentage) lock.checked = true;
  modes.value = 'dimensions';
  width.value = next.width;
  height.value = next.height;
  lastDimension = changed;
  updateSettings();
  message('Ready to resize.');
});

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  stage.addEventListener(type, event => {
    if (event.pointerId === drag?.pointer) endDrag();
  });
}
new ResizeObserver(() => { endDrag(); fitFrame(); }).observe(stage);

form.onsubmit = async event => {
  event.preventDefault();
  if (!source || !target || busy) return;
  const { width, height } = target;
  clearResult();
  setBusy(true);
  message('Resizing GIF…');
  try {
    const { bytes, meta } = await client.resize(source.buffer, target);
    resultURL = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
    preview.src = resultURL;
    await preview.decode();
    download.href = resultURL;
    const base = Array.from(source.name.replace(/\.gif$/i, '')).slice(0, 72).join('') || 'animation';
    download.download = `${base}-resized-${width}x${height}.gif`;
    const fileSize = bytes.byteLength < 1024 ? `${bytes.byteLength} B` : `${(bytes.byteLength / 1024).toFixed(1)} KiB`;
    $('result-info').textContent = `${width} × ${height} px · ${meta.frames.length} frames · ${fileSize}`;
    $('result-empty').hidden = true;
    $('result-filled').hidden = false;
    message('Your resized GIF is ready to download.');
  } catch (error) {
    clearResult();
    message(normalizeError(error).message, true);
  } finally {
    setBusy(false);
  }
};

addEventListener('pagehide', event => {
  if (event.persisted) return;
  client.close();
  clearResult();
  if (sourceURL) URL.revokeObjectURL(sourceURL);
});
