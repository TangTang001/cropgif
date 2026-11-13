import { GifClient, readGIFFile } from './gif/client.js';
import { GifError, normalizeError } from './gif/errors.js';
import { inspectGIF } from './gif/inspect.js';
import { scaleDimension } from './gif/resize.js';

const $ = id => document.getElementById(id);
const client = new GifClient();
const form = $('compress-form');
const stage = $('stage');
const frame = $('source-frame');
const original = $('original');
const preview = $('result');
const download = $('download');
const submit = $('compress-submit');
const file = $('file');
const example = 'gif-resize-sailboat-before.gif';
const exampleButton = document.querySelector('[data-compress-example]');
let source, sourceURL, resultURL;
let busy = false;

function message(text, error = false) {
  const status = $('status');
  status.textContent = text;
  status.classList.toggle('error', error);
  status.setAttribute('role', error ? 'alert' : 'status');
}

function setBusy(value) {
  busy = value;
  $('choose').disabled = $('replace-file').disabled = $('clear-file').disabled = file.disabled = busy;
  $('file-actions').hidden = !source;
  exampleButton.disabled = busy;
  $('compress-controls').disabled = busy || !source;
  submit.disabled = busy || !source;
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

function settings() {
  return {
    scale: Number(form.elements.scale.value),
    colors: Number(form.elements.colors.value),
    step: Number(form.elements.step.value),
  };
}

function updateSettings() {
  clearResult();
  const summary = $('compress-target');
  summary.textContent = '';
  if (!source) return;
  const { scale, step } = settings();
  const { meta } = source;
  const width = scaleDimension(meta.width, scale / 100);
  const height = scaleDimension(meta.height, scale / 100);
  summary.textContent = `Output: ${width} × ${height} px · ${Math.ceil(meta.frames.length / step)} frames`;
}

function fileSize(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`;
}

form.onchange = () => {
  updateSettings();
  message('Ready to compress.');
};

form.onsubmit = async event => {
  event.preventDefault();
  if (!source || busy) return;
  clearResult();
  setBusy(true);
  message('Compressing GIF…');
  try {
    const { bytes, meta, details } = await client.compress(source.buffer, settings());
    resultURL = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
    preview.src = resultURL;
    await preview.decode();
    const base = Array.from(source.name.replace(/\.gif$/i, '')).slice(0, 72).join('') || 'animation';
    download.href = resultURL;
    download.download = `${base}-compressed.gif`;
    const originalSize = source.buffer.byteLength;
    const saved = originalSize - bytes.byteLength;
    const percent = Math.abs(100 * saved / originalSize).toFixed(1);
    $('result-info').textContent = `${fileSize(originalSize)} → ${fileSize(bytes.byteLength)} · ${meta.width} × ${meta.height} px · ${meta.frames.length} frames`;
    $('result-savings').textContent = saved > 0
      ? `${percent}% smaller (${saved.toLocaleString('en-US')} bytes saved)`
      : saved < 0 ? `${percent}% larger. Keep the original or try different settings.`
        : 'Same file size. Keep the original or try different settings.';
    $('result-note').textContent = details.quantizedFrames
      ? 'Some frames needed a smaller palette after frame reduction.' : '';
    $('result-empty').hidden = true;
    $('result-filled').hidden = false;
    message('Your result is ready to download.');
  } catch (error) {
    clearResult();
    message(normalizeError(error).message, true);
  } finally {
    setBusy(false);
  }
};

$('reset-settings').onclick = () => {
  if (busy || !source) return;
  form.reset();
  updateSettings();
  message('Ready to compress.');
};

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
    $('upload-prompt').hidden = true;
    $('filename').textContent = name;
    $('file-summary').textContent = `${meta.width} × ${meta.height} · ${meta.frames.length} frames`;
    form.reset();
    for (const option of form.elements.step.options) {
      option.disabled = option.value !== '1' && Math.ceil(meta.frames.length / Number(option.value)) < 2;
    }
    if (isExample) {
      form.elements.scale.value = '50';
      form.elements.colors.value = '64';
      form.elements.step.value = '2';
    }
    updateSettings();
    message('Ready to compress.');
    setBusy(false);
    form.elements.scale.focus({ preventScroll: true });
  } catch (error) {
    const text = isExample ? 'Could not open the example. Try again or choose a local GIF.' : normalizeError(error).message;
    $('file-error').textContent = text;
    message(source ? 'The current GIF is still selected.' : 'Choose a GIF to begin.');
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
  URL.revokeObjectURL(sourceURL);
  source = sourceURL = undefined;
  original.removeAttribute('src');
  frame.hidden = true;
  $('upload-prompt').hidden = false;
  $('filename').textContent = 'No GIF selected';
  $('file-summary').textContent = '';
  $('file-error').textContent = '';
  stage.classList.remove('drag-over');
  file.value = '';
  form.reset();
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

addEventListener('pagehide', event => {
  if (event.persisted) return;
  client.close();
  clearResult();
  if (sourceURL) URL.revokeObjectURL(sourceURL);
});
