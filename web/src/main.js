import './styles.css';
import { GifClient, readGIFFile } from './gif/client.js';
import { inspectGIF } from './gif/inspect.js';
import { normalizeError } from './gif/errors.js';

const $ = id => document.getElementById(id);
const client = new GifClient();
let buffer, meta, resultURL;
function clearResult() {
  if (resultURL) URL.revokeObjectURL(resultURL);
  resultURL = null;
  $('preview').removeAttribute('src'); $('preview').hidden = true;
  $('download').removeAttribute('href'); $('download').hidden = true;
}
function busy(value) { $('file').disabled = value; $('crop').disabled = value || !buffer; }
$('file').onchange = async () => {
  clearResult(); buffer = null; meta = null; $('info').textContent = '';
  const file = $('file').files[0];
  if (!file) { busy(false); return; }
  busy(true);
  try {
    const bytes = await readGIFFile(file);
    const found = inspectGIF(bytes);
    buffer = bytes; meta = found;
    $('info').textContent = `${found.width} × ${found.height} · ${found.frames.length} frames · ${file.size} bytes`;
    $('status').textContent = 'Ready to crop.';
  } catch (error) { $('status').textContent = normalizeError(error).message; }
  finally { busy(false); }
};
$('crop').onclick = async () => {
  clearResult(); busy(true); $('status').textContent = 'Processing…';
  try {
    const result = await client.run(buffer, { x: 0, y: 0, width: meta.width, height: meta.height });
    resultURL = URL.createObjectURL(new Blob([result.bytes], { type: 'image/gif' }));
    $('preview').src = resultURL; $('preview').hidden = false;
    $('download').href = resultURL; $('download').hidden = false;
    $('status').textContent = 'Your GIF is ready.';
  } catch (error) { $('status').textContent = normalizeError(error).message; }
  finally { busy(false); }
};
addEventListener('pagehide', () => { client.close(); clearResult(); });
