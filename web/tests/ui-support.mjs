import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { preview } from 'vite';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const bench = resolve(root, '../test-resources/crop-benchmark');
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function startRun(label, edge) {
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid label');
  const out = resolve(bench, 'runs', `${label}-${edge ? 'edge' : 'chrome'}`);
  await mkdir(out);
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/Users/itang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
  const server = await preview({ root, preview: { host: '127.0.0.1', port: edge ? 4203 : 4202, strictPort: true } });
  const browser = await chromium.launch({ channel: edge ? 'msedge' : 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
  const errors = [], remoteRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(server.resolvedUrls.local[0])) remoteRequests.push(r.url()); });
  await page.addInitScript(() => {
    const evidence = window.__uiTest = { created: 0, terminated: 0, live: new Set(), urls: new Set(), last: null, mode: '', ticks: 0, maxGap: 0 };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); evidence.urls.add(url); return url; };
    URL.revokeObjectURL = url => { evidence.urls.delete(url); revoke(url); };
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        const main = String(url).includes('/assets/worker-');
        let controlledURL;
        if (main && evidence.mode === 'timeout') {
          controlledURL = create(new Blob([`self.onmessage=()=>{const u=URL.createObjectURL(new Blob(["const c=new BroadcastChannel('gif-ui-timeout');setInterval(()=>c.postMessage('pulse'),10)"],{type:'text/javascript'}));self.postMessage({child:{type:'create',id:1,url:u}});setTimeout(()=>{while(true){}},80)}`], { type: 'text/javascript' }));
        }
        super(controlledURL || url, options);
        if (controlledURL) revoke(controlledURL);
        evidence.created++; evidence.live.add(this);
        this.addEventListener('message', ({ data }) => {
          if (main && !data.child) {
            evidence.last = data; evidence.completed = performance.now();
            evidence.completedTicks = evidence.ticks; evidence.completedMaxGap = evidence.maxGap;
          }
        });
      }
      postMessage(data, ...rest) {
        if (data.buffer && data.rect) { evidence.last = null; evidence.requestRect = data.rect; evidence.started = performance.now(); evidence.ticks = 0; evidence.maxGap = 0; }
        return super.postMessage(data, ...rest);
      }
      terminate() { if (evidence.live.delete(this)) evidence.terminated++; return super.terminate(); }
    };
    const timeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...rest) => timeout(callback, evidence.mode === 'timeout' && delay === 60000 ? 350 : delay, ...rest);
    let last = performance.now();
    const tick = now => { evidence.ticks++; evidence.maxGap = Math.max(evidence.maxGap, now - last); last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.goto(server.resolvedUrls.local[0]);
  const hashes = {};
  for (const folder of ['src', 'dist']) for (const name of await readdir(resolve(root, folder), { recursive: true })) {
    const path = resolve(root, folder, name);
    try { hashes[relative(root, path).replaceAll('\\', '/')] = sha(await readFile(path)); } catch (e) { if (e.code !== 'EISDIR') throw e; }
  }
  for (const name of ['index.html', 'package.json', 'package-lock.json']) hashes[name] = sha(await readFile(resolve(root, name)));
  await writeFile(resolve(out, 'environment.json'), JSON.stringify({ browser: browser.version(), date: new Date().toISOString(), platform: os.platform(), cpu: os.cpus()[0].model, systemMemoryBytes: os.totalmem(), sourceSha256: hashes, productionStaticPreview: true, memoryMeasurement: 'Process memory peak not measured.' }, null, 2));
  return { page, out, errors, remoteRequests, browser, async close() { await browser.close(); await new Promise(done => server.httpServer.close(done)); } };
}
export async function loadFile(page, file) {
  await page.evaluate(() => { window.__uiTest.last = null; });
  await page.locator('#file').setInputFiles(file);
  await page.waitForFunction(() => ['ready', 'error'].includes(document.getElementById('editor').dataset.state));
  return page.locator('#editor').getAttribute('data-state');
}
export async function selectRect(page, rect) {
  await page.evaluate(rect => {
    document.getElementById('reset').click();
    for (const key of ['width', 'height']) {
      const field = document.getElementById(key); field.value = rect[key]; field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const selection = document.getElementById('selection');
    for (const [n, key] of [[rect.x, 'ArrowRight'], [rect.y, 'ArrowDown']]) {
      for (let i = 0; i < Math.floor(n / 10); i++) selection.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: true, bubbles: true }));
      for (let i = 0; i < n % 10; i++) selection.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
  }, rect);
}
export async function cropAndRead(page) {
  await page.locator('#crop').click();
  await page.waitForFunction(() => ['success', 'error'].includes(document.getElementById('editor').dataset.state), { timeout: 65000 });
  return page.evaluate(async () => {
    const e = window.__uiTest, last = e.last;
    const href = document.getElementById('download').getAttribute('href');
    const encode = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 16384) s += String.fromCharCode(...bytes.subarray(i, i + 16384)); return btoa(s); };
    const downloaded = href ? new Uint8Array(await (await fetch(href)).arrayBuffer()) : null;
    return { state: document.getElementById('editor').dataset.state, message: document.getElementById('status').textContent,
      base64: downloaded ? encode(downloaded) : null, matchesWorker: downloaded ? encode(last.bytes) === encode(downloaded) : null,
      requestRect: e.requestRect, details: last?.details, errorCode: last?.error?.code, failureDetails: last?.error?.details,
      outputMeta: last?.meta, processingMs: last?.processingMs, firstRoundtripMs: e.completed - e.started,
      outputBytes: downloaded?.length, filename: document.getElementById('download').getAttribute('download'),
      liveWorkers: e.live.size, created: e.created, terminated: e.terminated, activePageURLs: e.urls.size, animationTicks: e.completedTicks, maxAnimationGapMs: e.completedMaxGap };
  });
}
export async function actualDownload(page, out, filename, expected) {
  const event = page.waitForEvent('download'); await page.locator('#download').click();
  const download = await event; await download.saveAs(resolve(out, filename));
  assert.equal(sha(await readFile(resolve(out, filename))), sha(Buffer.from(expected, 'base64')));
  return download.suggestedFilename();
}
