import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { preview } from 'vite';
import { inspectGIF } from '../../test-resources/crop-benchmark/src/gif-meta.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const edge = process.argv.includes('--edge');
const label = process.argv.find(a => a.startsWith('--label='))?.slice(8) || 'stage2';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a lowercase letters/numbers/hyphens label.');
const out = resolve(root, `../test-resources/crop-benchmark/runs/${label}-${edge ? 'edge' : 'chrome'}`);
await mkdir(out); // Keep prior evidence intact.
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/Users/itang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const sourceFile = resolve(root, '../design-v1/art/coastal-loop.gif');
const sourceBytes = await readFile(sourceFile);
const rawSource = inspectGIF(sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength));
const hash = data => createHash('sha256').update(data).digest('hex');
const server = await preview({ root, configFile: resolve(root, 'vite.config.js'), preview: { host: '127.0.0.1', port: edge ? 4195 : 4194, strictPort: true } });
let browser;
const report = { checks: [], errors: [], remoteRequests: [] };
try {
  browser = await chromium.launch({ channel: edge ? 'msedge' : 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.__uiEvidence = { workers: 0, revoked: [] };
    const NativeWorker = Worker, revoke = URL.revokeObjectURL.bind(URL);
    window.Worker = class extends NativeWorker { constructor(...args) { super(...args); window.__uiEvidence.workers++; } };
    URL.revokeObjectURL = url => { window.__uiEvidence.revoked.push(url); revoke(url); };
  });
  const page = await context.newPage();
  const watch = p => {
    p.on('pageerror', e => report.errors.push(e.message));
    p.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(server.resolvedUrls.local[0])) report.remoteRequests.push(request.url()); });
  };
  watch(page);
  const ready = p => p.waitForFunction(() => !document.getElementById('crop').disabled);
  const rect = p => p.evaluate(() => {
    const el = document.getElementById('selection'), img = document.getElementById('original');
    return { x: Math.round(parseFloat(el.style.left) / 100 * img.naturalWidth), y: Math.round(parseFloat(el.style.top) / 100 * img.naturalHeight), width: Number(document.getElementById('width').value), height: Number(document.getElementById('height').value) };
  });
  async function drag(p, selector, dx, dy) {
    await p.locator(selector).scrollIntoViewIfNeeded();
    const box = await p.locator(selector).boundingBox();
    const image = await p.locator('#image-wrap').boundingBox();
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await p.mouse.move(start.x, start.y); await p.mouse.down();
    await p.mouse.move(start.x + dx * image.width / 800, start.y + dy * image.height / 500, { steps: 4 });
    await p.mouse.up();
  }
  async function setRect(width = 300, height = 200, x = 100, y = 80) {
    await page.locator('#reset').click();
    await page.locator('#width').fill(String(width)); await page.locator('#height').fill(String(height));
    if (x || y) await drag(page, '#selection', x, y);
    assert.deepEqual(await rect(page), { x, y, width, height });
  }
  await page.goto(server.resolvedUrls.local[0]);
  assert.equal(await page.locator('#crop').isDisabled(), true);
  assert.equal(await page.locator('#upload-prompt').isVisible(), true);
  await page.screenshot({ path: resolve(out, 'empty.png') });
  await page.locator('#file').setInputFiles(sourceFile); await ready(page);
  assert.deepEqual(await rect(page), { x: 0, y: 0, width: 800, height: 500 });
  assert.equal(await page.locator('#original').evaluate(el => el.naturalWidth), 800);
  const palette = await page.evaluate(() => ({ page: getComputedStyle(document.body).backgroundColor, stage: getComputedStyle(document.getElementById('stage')).backgroundColor, primary: getComputedStyle(document.getElementById('crop')).backgroundColor }));
  assert.deepEqual(palette, { page: 'rgb(255, 255, 255)', stage: 'rgb(245, 246, 248)', primary: 'rgb(37, 99, 235)' });
  await page.screenshot({ path: resolve(out, 'full-image.png') });
  report.checks.push('empty upload state; non-square full-image default; approved palette');

  const cases = [
    ['nw', -20, -10, { x: 80, y: 70, width: 320, height: 210 }],
    ['n', 0, -10, { x: 100, y: 70, width: 300, height: 210 }],
    ['ne', 20, -10, { x: 100, y: 70, width: 320, height: 210 }],
    ['e', 20, 0, { x: 100, y: 80, width: 320, height: 200 }],
    ['se', 20, 10, { x: 100, y: 80, width: 320, height: 210 }],
    ['s', 0, 10, { x: 100, y: 80, width: 300, height: 210 }],
    ['sw', -20, 10, { x: 80, y: 80, width: 320, height: 210 }],
    ['w', -20, 0, { x: 80, y: 80, width: 320, height: 200 }],
  ];
  for (const [handle, dx, dy, expected] of cases) {
    await setRect(); await drag(page, `.handle.${handle}`, dx, dy);
    assert.deepEqual(await rect(page), expected, handle);
  }
  await setRect(); await drag(page, '#selection', 10000, 10000);
  assert.deepEqual(await rect(page), { x: 500, y: 300, width: 300, height: 200 });
  await drag(page, '#selection', -10000, -10000);
  assert.deepEqual(await rect(page), { x: 0, y: 0, width: 300, height: 200 });
  await setRect(); await drag(page, '.handle.nw', 10000, 10000);
  assert.deepEqual(await rect(page), { x: 399, y: 279, width: 1, height: 1 });
  await page.locator('#selection').press('ArrowRight');
  assert.equal((await rect(page)).x, 400);
  report.checks.push('all eight freeform handles; movement to all boundaries; one-pixel minimum');

  await setRect();
  for (const value of ['', '-3', '1.5', '801', '0']) {
    await page.locator('#width').fill(value);
    assert.equal(await page.locator('#crop').isDisabled(), true, value);
    assert.equal(await page.locator('#width').getAttribute('aria-invalid'), 'true');
    assert.ok(await page.locator('#dimension-error').textContent());
  }
  await page.locator('#width').fill(''); await page.locator('#height').fill('180');
  assert.equal(await page.locator('#width').inputValue(), '');
  assert.equal(await page.locator('#crop').isDisabled(), true);
  await page.locator('#width').press('Escape');
  assert.deepEqual(await rect(page), { x: 100, y: 80, width: 300, height: 200 });
  await setRect(300, 200, 500, 300);
  await page.locator('#width').fill('600'); await page.locator('#height').fill('400');
  assert.deepEqual(await rect(page), { x: 200, y: 100, width: 600, height: 400 });
  report.checks.push('empty/negative/fractional/oversized dimensions blocked; independent drafts; Escape; inward position adjustment');

  await setRect(); await page.locator('#square').click();
  assert.deepEqual(await rect(page), { x: 150, y: 80, width: 200, height: 200 });
  await drag(page, '.handle.nw', 50, 80);
  assert.deepEqual(await rect(page), { x: 230, y: 160, width: 120, height: 120 });
  await drag(page, '.handle.e', 20, 0);
  assert.deepEqual(await rect(page), { x: 230, y: 150, width: 140, height: 140 });
  await page.locator('#height').fill('301');
  assert.equal(await page.locator('#width').inputValue(), '301');
  await page.locator('#free').click();
  assert.equal((await rect(page)).width, 301);
  await page.locator('#selection').press('Shift+ArrowLeft');
  assert.equal((await rect(page)).x, 220);
  const beforeKey = await rect(page);
  await page.locator('.handle.se').press('ArrowRight');
  assert.deepEqual(await rect(page), { ...beforeKey, width: 302 });
  report.checks.push('square corner and side resizing; linked numeric dimensions; freeform switch; move/resize keyboard');

  await page.setViewportSize({ width: 1000, height: 700 });
  await setRect(); await page.evaluate(() => scrollTo({ top: 150, behavior: 'instant' }));
  await drag(page, '#selection', 40, 30);
  assert.deepEqual(await rect(page), { x: 140, y: 110, width: 300, height: 200 });
  // Scroll while the pointer is captured: the rectangle follows the pointer's
  // current image position, rather than a stale viewport origin.
  await page.locator('#selection').scrollIntoViewIfNeeded();
  const startBox = await page.locator('#selection').boundingBox();
  const imageBox = await page.locator('#image-wrap').boundingBox();
  const startScroll = await page.evaluate(() => scrollY);
  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2); await page.mouse.down();
  await page.evaluate(() => scrollBy({ top: 20, behavior: 'instant' }));
  const scrolled = await page.evaluate(() => scrollY);
  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2 + 5);
  await page.mouse.up();
  assert.equal((await rect(page)).y, 110 + Math.round((5 + scrolled - startScroll) * 500 / imageBox.height));
  await page.evaluate(() => document.body.style.zoom = '1.25');
  await setRect(); await drag(page, '#selection', 40, 30);
  assert.deepEqual(await rect(page), { x: 140, y: 110, width: 300, height: 200 });
  await page.evaluate(() => document.body.style.zoom = '');
  await page.setViewportSize({ width: 1440, height: 1050 });
  report.checks.push('responsive viewport; scroll before/during capture; CSS 125% zoom coordinate mapping');

  await setRect(560, 360, 120, 70);
  const workersBefore = await page.evaluate(() => window.__uiEvidence.workers);
  assert.equal(workersBefore, 0, 'selection changes must not encode');
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: resolve(out, 'selection.png') });
  await page.locator('#crop').click();
  await page.waitForFunction(() => !document.getElementById('result-filled').hidden && !document.getElementById('crop').disabled, { timeout: 65000 });
  await page.locator('#result').evaluate(img => img.decode());
  const downloadEvent = page.waitForEvent('download'); await page.locator('#download').click();
  const download = await downloadEvent; await download.saveAs(resolve(out, 'crop-560x360.gif'));
  const output = await readFile(resolve(out, 'crop-560x360.gif'));
  const decoded = inspectGIF(output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength));
  assert.equal(decoded.width, 560); assert.equal(decoded.height, 360);
  assert.equal(decoded.frames.length, rawSource.frames.length);
  assert.deepEqual(decoded.frames.map(f => f.delay), rawSource.frames.map(f => f.delay)); assert.equal(decoded.loop, rawSource.loop);
  const comparePixels = async (output, crop) => page.evaluate(async ({ source, result, crop }) => {
    const { x: cropX, y: cropY, width, height } = crop;
    const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const original = new ImageDecoder({ data: bytes(source), type: 'image/gif' });
    const cropped = new ImageDecoder({ data: bytes(result), type: 'image/gif' });
    await Promise.all([original.tracks.ready, cropped.tracks.ready]);
    const a = new OffscreenCanvas(width, height), b = new OffscreenCanvas(width, height);
    const ca = a.getContext('2d'), cb = b.getContext('2d');
    let mismatches = 0;
    for (let i = 0; i < original.tracks.selectedTrack.frameCount; i++) {
      const [src, dst] = await Promise.all([original.decode({ frameIndex: i }), cropped.decode({ frameIndex: i })]);
      ca.clearRect(0, 0, width, height); cb.clearRect(0, 0, width, height);
      ca.drawImage(src.image, cropX, cropY, width, height, 0, 0, width, height); cb.drawImage(dst.image, 0, 0);
      const x = ca.getImageData(0, 0, width, height).data, y = cb.getImageData(0, 0, width, height).data;
      for (let j = 0; j < x.length; j += 4) if (x[j + 3] !== y[j + 3] || (x[j + 3] && (x[j] !== y[j] || x[j + 1] !== y[j + 1] || x[j + 2] !== y[j + 2]))) mismatches++;
      src.image.close(); dst.image.close();
    }
    const frames = original.tracks.selectedTrack.frameCount; original.close(); cropped.close();
    return { frames, mismatches };
  }, { source: sourceBytes.toString('base64'), result: output.toString('base64'), crop });
  const pixelCheck = await comparePixels(output, { x: 120, y: 70, width: 560, height: 360 });
  assert.equal(pixelCheck.mismatches, 0);
  const oldURL = await page.locator('#download').getAttribute('href');
  await page.screenshot({ path: resolve(out, 'result.png'), fullPage: true });
  const workerCount = await page.evaluate(() => window.__uiEvidence.workers);
  await page.locator('#width').fill('');
  assert.equal(await page.locator('#result-filled').isHidden(), true);
  assert.equal(await page.locator('#download').getAttribute('href'), null);
  assert.equal(await page.evaluate(url => window.__uiEvidence.revoked.includes(url), oldURL), true);
  assert.equal(await page.evaluate(() => window.__uiEvidence.workers), workerCount);
  await page.locator('#width').fill('560');
  await page.locator('#square').click(); assert.equal(await page.locator('#download').getAttribute('href'), null);
  await page.locator('#width').fill('240');
  const squareCrop = await rect(page);
  assert.deepEqual(squareCrop, { x: 220, y: 70, width: 240, height: 240 });
  await page.locator('#crop').click();
  await page.waitForFunction(() => !document.getElementById('result-filled').hidden && !document.getElementById('crop').disabled, { timeout: 65000 });
  const squareEvent = page.waitForEvent('download'); await page.locator('#download').click();
  await (await squareEvent).saveAs(resolve(out, 'crop-square.gif'));
  const squareBytes = await readFile(resolve(out, 'crop-square.gif'));
  const squareMeta = inspectGIF(squareBytes.buffer.slice(squareBytes.byteOffset, squareBytes.byteOffset + squareBytes.byteLength));
  assert.equal(squareMeta.width, 240); assert.equal(squareMeta.height, 240);
  assert.deepEqual(squareMeta.frames.map(f => f.delay), rawSource.frames.map(f => f.delay)); assert.equal(squareMeta.loop, rawSource.loop);
  const squarePixels = await comparePixels(squareBytes, squareCrop); assert.equal(squarePixels.mismatches, 0);
  report.squareDownload = { rect: squareCrop, sha256: hash(squareBytes), ...squarePixels };
  report.download = { rect: { x: 120, y: 70, width: 560, height: 360 }, frames: decoded.frames.length, delays: decoded.frames.map(f => f.delay), loop: decoded.loop, sha256: hash(output), ...pixelCheck };
  report.checks.push('no automatic encoding; production Worker download; every-frame visible RGB/alpha; raw animation metadata; stale result URL revoked');

  await page.locator('#file').setInputFiles(resolve(root, '../test-resources/codec-corpus/invalid/empty.gif'));
  await page.waitForFunction(() => document.getElementById('status').classList.contains('error'));
  assert.equal(await page.locator('#crop').isDisabled(), true); assert.equal(await page.locator('#image-wrap').isHidden(), true);
  await page.locator('#file').setInputFiles(sourceFile); await ready(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(out, 'narrow.png'), fullPage: true });
  report.checks.push('damaged input recovery; 390px layout without horizontal overflow');

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const touch = await touchContext.newPage(); watch(touch);
  await touch.goto(server.resolvedUrls.local[0]); await touch.locator('#file').setInputFiles(sourceFile); await ready(touch);
  await touch.locator('#width').fill('300'); await touch.locator('#height').fill('200');
  await touch.locator('#selection').scrollIntoViewIfNeeded();
  const touchBox = await touch.locator('#selection').boundingBox(), touchImage = await touch.locator('#image-wrap').boundingBox();
  const cdp = await touchContext.newCDPSession(touch);
  const point = { x: touchBox.x + touchBox.width / 2, y: touchBox.y + touchBox.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 40 * touchImage.width / 800, y: point.y + 30 * touchImage.height / 500 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(await rect(touch), { x: 40, y: 30, width: 300, height: 200 });
  const touchHandle = await touch.locator('.handle.se').boundingBox();
  const handlePoint = { x: touchHandle.x + touchHandle.width / 2, y: touchHandle.y + touchHandle.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [handlePoint] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: handlePoint.x + 50 * touchImage.width / 800, y: handlePoint.y + 30 * touchImage.height / 500 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.deepEqual(await rect(touch), { x: 40, y: 30, width: 350, height: 230 });
  // Exercise compositor/pinch zoom as well as CSS layout scaling.
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 });
  assert.equal(await touch.evaluate(() => visualViewport.scale), 1.25);
  const zoomBox = await touch.locator('#selection').boundingBox();
  const zoomImage = await touch.locator('#image-wrap').boundingBox();
  const zoomPoint = { x: zoomBox.x + zoomBox.width / 2, y: zoomBox.y + zoomBox.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [zoomPoint] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: zoomPoint.x + 40 * zoomImage.width / 800, y: zoomPoint.y + 30 * zoomImage.height / 500 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(await rect(touch), { x: 80, y: 60, width: 350, height: 230 });
  report.checks.push('CDP touch move/resize/cancel and 125% compositor zoom; not a physical phone test');
  report.browser = browser.version(); report.date = new Date().toISOString(); report.palette = palette;
  report.sourceSHA256 = hash(sourceBytes);
  report.productionHTMLSHA256 = hash(await readFile(resolve(root, 'dist/index.html')));
  report.files = {};
  const files = ['index.html', 'package.json', 'package-lock.json', ...(await readdir(resolve(root, 'src'), { recursive: true })).map(name => `src/${name.replaceAll('\\', '/')}`), ...(await readdir(resolve(root, 'dist'), { recursive: true })).map(name => `dist/${name.replaceAll('\\', '/')}`)];
  for (const name of files) {
    try { report.files[name] = hash(await readFile(resolve(root, name))); }
    catch (error) { if (error.code !== 'EISDIR') throw error; }
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.remoteRequests, []);
  await writeFile(resolve(out, 'checks.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
