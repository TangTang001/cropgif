import { inspectGIF, validateCrop } from './gif-meta.js';
import { EngineClient } from './client.js';
const $ = id => document.getElementById(id);
$('b-mode').add(new Option('自动 B → A（验证）', 'H'));
$('b-mode').add(new Option('Gifsicle 1.96（npm 1.96.4 独立评估）', 'W196'));
let buffer, meta, filename = '', busy = false;
const logs = [], urls = new Map();
function showURL(id, bytes, type = 'image/gif') {
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  const url = URL.createObjectURL(new Blob([bytes], { type })); urls.set(id, url); return url;
}
function clearResults() {
  for (const e of ['a', 'b']) { $(`out-${e}`).removeAttribute('src'); $(`download-${e}`).hidden = true; }
}
function rect() { return Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, Number($(k).value)])); }
function setRect(r) { for (const [k, v] of Object.entries(r)) $(k).value = v; clearResults(); }
async function load(bytes, name) {
  clearResults(); buffer = null; meta = null; $('original').removeAttribute('src');
  try {
    const found = inspectGIF(bytes); buffer = bytes; meta = found; filename = name;
    setRect({ x: 0, y: 0, width: meta.width, height: meta.height });
    $('original').src = showURL('original', bytes);
    $('info').textContent = `${name} · ${bytes.byteLength} 字节 · ${meta.width} × ${meta.height} · ${meta.frames.length} 帧 · 循环字段 ${meta.loop ?? '无'}${meta.trailer ? '' : ' · 缺少结束标记'}`;
    $('status').textContent = '已加载，选择方案执行';
  } catch (e) { $('info').textContent = '加载失败'; $('status').textContent = e.message; }
}
const samples = await fetch('/api/samples').then(r => r.json());
for (const s of samples) { const option = new Option(s.name, s.url); $('samples').add(option); }
$('samples').onchange = async () => {
  try { if ($('samples').value) await load(await fetch($('samples').value).then(r => r.arrayBuffer()), $('samples').selectedOptions[0].text); }
  catch (e) { $('status').textContent = e.message; }
};
$('file').onchange = async () => { const f = $('file').files[0]; if (f) await load(await f.arrayBuffer(), f.name); };
for (const k of ['x', 'y', 'width', 'height']) $(k).oninput = () => { clearResults(); $('status').textContent = '选区已修改，请重新运行'; };
$('full').onclick = () => { if (meta) setRect({ x: 0, y: 0, width: meta.width, height: meta.height }); };
$('center').onclick = () => {
  if (!meta) return;
  const width = Math.max(1, Math.floor(meta.width / 2)), height = Math.max(1, Math.floor(meta.height / 2));
  setRect({ x: Math.floor((meta.width - width) / 2), y: Math.floor((meta.height - height) / 2), width, height });
};
async function run(engine) {
  if (busy) return;
  const client = new EngineClient(engine), record = { engine, filename, rect: rect(), timestamp: new Date().toISOString() };
  busy = true;
  for (const id of ['a', 'b', 'b-mode', 'file', 'samples', 'x', 'y', 'width', 'height', 'full', 'center']) $(id).disabled = true;
  try {
    if (!buffer) throw new Error('请先加载有效 GIF');
    validateCrop(meta, record.rect); $('status').textContent = `方案 ${engine} 处理中…`;
    await client.init(); const result = await client.run(buffer, record.rect);
    const id = engine === 'A' ? 'a' : 'b', url = showURL(id, result.bytes);
    $(`out-${id}`).src = url;
    const a = $(`download-${id}`); a.href = url; a.download = `crop-${engine}.gif`; a.hidden = false;
    Object.assign(record, { initMs: client.initMs, processingMs: result.processingMs, roundtripMs: result.roundtripMs, outputBytes: result.bytes.length, outputMeta: result.meta, details: result.details });
    $('status').textContent = `方案 ${engine} 完成：${result.roundtripMs.toFixed(1)} ms，${result.bytes.length} 字节`;
  } catch (error) { record.error = error.message; $('status').textContent = error.message; }
  finally {
    client.close(); busy = false;
    for (const id of ['a', 'b', 'b-mode', 'file', 'samples', 'x', 'y', 'width', 'height', 'full', 'center']) $(id).disabled = false;
    logs.push(record); $('log').textContent = JSON.stringify(logs, null, 2);
  }
}
$('a').onclick = () => run('A'); $('b').onclick = () => run($('b-mode').value);
$('logs').onclick = () => { const a = document.createElement('a'); a.href = showURL('logs', JSON.stringify(logs, null, 2), 'application/json'); a.download = 'manual-runs.json'; a.click(); };
// Local automation uses the same Worker client and scanner as the UI.
window.benchmark = { EngineClient, inspectGIF, validateCrop, samples };
