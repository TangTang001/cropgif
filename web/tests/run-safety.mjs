import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, preview } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, '../test-resources/crop-benchmark/runs/stage1-safety-owned-workers');
await mkdir(out); // Do not overwrite previous evidence.
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/Users/itang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const server = await createServer({ root, configFile: resolve(root, 'vite.config.js'), server: { host: '127.0.0.1', port: 4191, strictPort: true } });
let browser, production;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:4191/');
  const validFile = resolve(root, '../test-resources/codec-corpus/testdata/anim_3frame_rgb.gif');
  const bytes = (await readFile(validFile)).toString('base64');
  const results = await page.evaluate(async encoded => {
    const { GifClient, readGIFFile } = await import('/src/gif/client.js');
    const { inspectGIF } = await import('/src/gif/inspect.js');
    const buffer = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)).buffer;
    const rect = { x: 0, y: 0, width: 4, height: 4 };
    const log = {};
    const expectCode = async (operation, expected) => {
      try { await operation(); throw new Error(`Expected ${expected}`); }
      catch (error) { if (error.code !== expected) throw error; }
    };
    let fileRead = false;
    await expectCode(() => readGIFFile({ size: 20 * 1024 * 1024 + 1, arrayBuffer() { fileRead = true; } }), 'RESOURCE_LIMIT');
    log.rejectsBeforeFileRead = !fileRead;
    const client = new GifClient();
    const nativeWorker = window.Worker;
    let created = 0, terminated = 0;
    window.Worker = class extends nativeWorker {
      constructor(...args) { super(...args); created++; }
      terminate() { terminated++; return super.terminate(); }
    };
    try {
      const first = client.run(buffer, rect);
      await expectCode(() => client.run(buffer, rect), 'PROCESSING_FAILED');
      await first;
      log.singleTask = client.worker === null;
      for (let i = 0; i < 3; i++) await client.run(buffer, rect);
      await expectCode(() => client.run(new ArrayBuffer(1), rect), 'CORRUPT_GIF');
      await client.run(buffer, rect);
      log.repeatedTaskResources = { created, terminated, released: client.worker === null };
      const limits = new GifClient({ limits: { maxFrames: 2 } });
      await expectCode(() => limits.run(buffer, rect), 'RESOURCE_LIMIT');
      log.workerEnforcesDefaultProtocolLimits = limits.worker === null;
    } finally { window.Worker = nativeWorker; }
    let pulses = 0;
    const channel = new BroadcastChannel('gif-stage1-worker-termination');
    channel.onmessage = () => pulses++;
    const timeout = new GifClient({ limits: { timeoutMs: 350 }, workerFactory: () => new Worker('/tests/fixtures/timeout-worker.js') });
    const start = performance.now();
    await expectCode(() => timeout.run(buffer, rect), 'TIMEOUT');
    const elapsedMs = performance.now() - start;
    await new Promise(r => setTimeout(r, 100));
    const afterTermination = pulses;
    await new Promise(r => setTimeout(r, 250));
    log.timeout = { elapsedMs, sawChildRunning: afterTermination > 0, childStopped: pulses === afterTermination, workerReleased: timeout.worker === null };
    channel.close();
    timeout.workerFactory = () => new Worker(new URL('/src/gif/worker.js', location.href), { type: 'module' });
    timeout.limits.timeoutMs = 60_000;
    await timeout.run(buffer, rect);
    log.recoveryAfterTimeout = timeout.worker === null;
    const cancel = new GifClient({ workerFactory: () => new Worker('/tests/fixtures/timeout-worker.js') });
    const pending = cancel.run(buffer, rect);
    const cancelled = expectCode(() => pending, 'PROCESSING_FAILED');
    cancel.close();
    await cancelled;
    log.explicitCancellation = cancel.worker === null;
    const emptyMime = new File([buffer], 'real.gif', { type: '' });
    log.emptyMimeAccepted = inspectGIF(await readGIFFile(emptyMime)).frames.length === 3;
    return log;
  }, bytes);
  assert.equal(results.rejectsBeforeFileRead, true);
  assert.equal(results.singleTask, true);
  assert.equal(results.repeatedTaskResources.created, results.repeatedTaskResources.terminated);
  assert.equal(results.repeatedTaskResources.released, true);
  assert.equal(results.workerEnforcesDefaultProtocolLimits, true);
  assert.equal(results.timeout.sawChildRunning, true);
  assert.equal(results.timeout.childStopped, true);
  assert.equal(results.timeout.workerReleased, true);
  assert.equal(results.recoveryAfterTimeout, true);
  assert.equal(results.explicitCancellation, true);
  assert.equal(results.emptyMimeAccepted, true);
  assert.deepEqual(pageErrors, []);
  await server.close();
  production = await preview({ root, configFile: resolve(root, 'vite.config.js'), preview: { host: '127.0.0.1', port: 4192, strictPort: true } });
  const productionPage = await browser.newPage();
  const remoteRequests = [];
  productionPage.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4192/')) remoteRequests.push(request.url()); });
  await productionPage.goto('http://127.0.0.1:4192/');
  await productionPage.locator('#file').setInputFiles(validFile);
  await productionPage.waitForFunction(() => !document.getElementById('crop').disabled);
  await productionPage.locator('#crop').click();
  await productionPage.waitForFunction(() => !document.getElementById('download').hidden);
  const downloadEvent = productionPage.waitForEvent('download');
  await productionPage.locator('#download').click();
  const download = await downloadEvent;
  await download.saveAs(resolve(out, 'production-download.gif'));
  assert.deepEqual(remoteRequests, []);
  await productionPage.locator('#file').setInputFiles(resolve(root, '../test-resources/codec-corpus/invalid/empty.gif'));
  await productionPage.waitForFunction(() => document.getElementById('download').hidden && document.getElementById('crop').disabled);
  await productionPage.locator('#file').setInputFiles(validFile);
  await productionPage.waitForFunction(() => !document.getElementById('crop').disabled);
  await productionPage.locator('#crop').click();
  await productionPage.waitForFunction(() => !document.getElementById('download').hidden);
  results.productionPreview = { actualDownload: true, invalidFileClearsOldResult: true, recovery: true, remoteRequests };
  results.browser = browser.version();
  await writeFile(resolve(out, 'checks.json'), JSON.stringify(results, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(results, null, 2));
} finally { await browser?.close(); await server.close(); await new Promise(resolve => production ? production.httpServer.close(resolve) : resolve()); }
