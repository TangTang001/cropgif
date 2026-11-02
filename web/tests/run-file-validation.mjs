import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const edge = process.argv.includes('--edge');
const label = process.argv.find(a => a.startsWith('--label='))?.slice(8) || 'file-validation';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid output label.');
const out = resolve(root, `../test-resources/crop-benchmark/runs/${label}-${edge ? 'edge' : 'chrome'}`);
await mkdir(out);
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/Users/itang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const server = await preview({ root, configFile: resolve(root, 'vite.config.js'), preview: { host: '127.0.0.1', port: edge ? 4197 : 4196, strictPort: true } });
let browser;
try {
  browser = await chromium.launch({ channel: edge ? 'msedge' : 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  const gif = await readFile(resolve(root, '../design-v1/art/coastal-loop.gif'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7eoAAAAASUVORK5CYII=', 'base64');
  const invalidFiles = [
    { name: 'photo.png', mimeType: 'image/png', buffer: png },
    { name: 'renamed.gif', mimeType: 'image/gif', buffer: png },
    { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('a') },
    { name: 'empty.gif', mimeType: 'image/gif', buffer: Buffer.alloc(0) },
  ];
  for (const file of invalidFiles) {
    await page.locator('#file').setInputFiles(file);
    await page.waitForFunction(() => document.getElementById('file-dialog').open);
    assert.match(await page.locator('#file-error').textContent(), /Only GIF files/);
    assert.equal(await page.locator('#filename').textContent(), 'No GIF selected');
    assert.equal(await page.locator('#crop').isDisabled(), true);
    assert.equal(await page.locator('#download').getAttribute('href'), null);
    assert.equal(await page.locator('#image-wrap').isHidden(), true);
    await page.locator('#file-dialog button').first().click();
  }
  // Verify retry is a real file-picker action, then recover with a valid GIF
  // even when its extension and MIME do not advertise GIF.
  await page.locator('#file').setInputFiles(invalidFiles[0]);
  await page.waitForFunction(() => document.getElementById('file-dialog').open);
  await page.screenshot({ path: resolve(out, 'invalid-format-mobile.png') });
  const chooserEvent = page.waitForEvent('filechooser'); await page.locator('#choose-again').click();
  await (await chooserEvent).setFiles({ name: 'real-animation.bin', mimeType: '', buffer: gif });
  await page.waitForFunction(() => !document.getElementById('crop').disabled);
  assert.equal(await page.locator('#filename').textContent(), 'real-animation.bin');
  assert.equal(await page.locator('#file-error').textContent(), '');
  assert.equal(await page.locator('#file-dialog').evaluate(el => el.open), false);
  await page.locator('#crop').click();
  await page.waitForFunction(() => !document.getElementById('result-filled').hidden, { timeout: 65000 });
  await page.locator('#file').setInputFiles(invalidFiles[1]);
  await page.waitForFunction(() => document.getElementById('file-dialog').open);
  assert.equal(await page.locator('#download').getAttribute('href'), null);
  assert.equal(await page.locator('#result-filled').isHidden(), true);
  await page.locator('#file-dialog button').first().click();
  await page.locator('#file').setInputFiles({ name: 'damaged.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await page.waitForFunction(() => document.getElementById('status').classList.contains('error') && document.getElementById('editor').getAttribute('aria-busy') === 'false');
  assert.match(await page.locator('#file-error').textContent(), /damaged or incomplete/);
  assert.equal(await page.locator('#file-dialog').evaluate(el => el.open), false);
  assert.deepEqual(errors, []);
  const report = { browser: browser.version(), rejectedFiles: invalidFiles.map(f => f.name), modalAndInlineError: true, invalidNameNotDisplayed: true, actualRetryPicker: true, headerOverridesMimeAndExtension: true, recoveryAndCrop: true, staleResultRemoved: true, damagedGifClassifiedSeparately: true, errors };
  await writeFile(resolve(out, 'checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
