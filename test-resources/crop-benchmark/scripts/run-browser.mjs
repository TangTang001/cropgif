import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const { values: options } = parseArgs({ options: { edge: { type: 'boolean' }, label: { type: 'string' }, sample: { type: 'string' }, engines: { type: 'string' }, suite: { type: 'string' } } });
const browserName = options.edge ? 'edge' : 'chrome';
const label = options.label || process.env.RUN_LABEL || new Date().toISOString().replaceAll(/[:.]/g, '-');
if (!/^[\w.-]+$/.test(label) || label === '.' || label === '..') throw new Error('运行标签只能包含字母、数字、下划线、点和短横线');
const sampleFilter = options.sample ?? process.env.ONLY_SAMPLE;
const engines = (options.engines || process.env.ENGINE_VARIANTS || 'A,B').split(',').map(e => e.trim());
if (engines.some(e => !['A', 'B', 'B-strict', 'B-U-strict', 'W198', 'W196', 'H'].includes(e))) throw new Error('未知方案，允许 A,B,B-strict,B-U-strict,W198,W196,H');
if (engines.includes('W198')) {
  for (const artifact of ['gifsicle-1.98.mjs', 'gifsicle-1.98.wasm']) {
    try { await readFile(resolve('public/wasm', artifact)); }
    catch { throw new Error('1.98 WASM 尚未构建；当前工具链下载已暂停。'); }
  }
}
const outDir = resolve('runs', `${label}-${browserName}`);
try {
  await readFile(resolve(outDir, 'runs.json'));
  throw new Error(`运行结果已存在，未覆盖：${outDir}。请用 --label 指定新标签。`);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(outDir, { recursive: true });
const playwrightPath = process.env.PLAYWRIGHT_MODULE || 'C:/Users/itang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath));
const server = await createServer({ server: { host: '127.0.0.1', port: 4175, strictPort: true } });
await server.listen();
let browser;
const records = [], browserErrors = [];
try {
  browser = await chromium.launch({ headless: true, channel: browserName === 'edge' ? 'msedge' : 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('pageerror', error => browserErrors.push(String(error)));
  page.on('console', msg => { if (msg.type() === 'error') browserErrors.push(msg.text().slice(0, 500)); });
  await page.goto('http://127.0.0.1:4175');
  await page.waitForFunction(() => window.benchmark, { timeout: 30_000 });
  const suite = JSON.parse(await readFile(options.suite || 'suite.json', 'utf8'));
  if (sampleFilter && !suite.some(s => s.name.includes(sampleFilter))) throw new Error(`没有匹配样本：${sampleFilter}`);
  const environment = { browser: browserName, version: browser.version(), os: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryGB: os.totalmem() / 2 ** 30, headless: true, date: new Date().toISOString(), packages: JSON.parse(await readFile('package.json', 'utf8')).dependencies, memoryMeasurement: 'not measured (JS heap is not total WASM/process memory)' };
  environment.sourceSha256 = {};
  for (const file of ['index.html', 'vite.config.js', 'package-lock.json', ...((await readdir('src')).map(f => `src/${f}`)), ...((await readdir('scripts')).filter(f => /\.(mjs|py)$/.test(f)).map(f => `scripts/${f}`))]) {
    environment.sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex');
  }
  await writeFile(resolve(outDir, 'environment.json'), JSON.stringify(environment, null, 2));
  let sampleIndex = 0;
  for (const sample of suite) {
    if (sampleFilter && !sample.name.includes(sampleFilter)) continue;
    for (const engine of engines) {
      const result = await page.evaluate(async ({ sample, engine }) => {
        const { EngineClient, samples } = window.benchmark;
        const entry = samples.find(s => s.name === sample.name);
        if (!entry) return { error: 'fixture not found', rows: [] };
        const buffer = await fetch(entry.url).then(r => r.arrayBuffer());
        const client = new EngineClient(engine), rows = [];
        const W = sample.width || 1, H = sample.height || 1;
        const w = Math.max(1, Math.floor(W / 2)), h = Math.max(1, Math.floor(H / 2));
        let cases = [
          ['full', { x: 0, y: 0, width: W, height: H }],
          ['center', { x: Math.floor((W - w) / 2), y: Math.floor((H - h) / 2), width: w, height: h }],
          ['edge', { x: W - w, y: H - h, width: w, height: h }],
          ['pixel', { x: 0, y: 0, width: 1, height: 1 }],
        ];
        cases.push(...(sample.crops || []).map(c => [c.name, c.rect]));
        if (sample.kind === 'invalid') cases = cases.slice(0, 1);
        cases = cases.filter((c, i, all) => all.findIndex(a => JSON.stringify(a[1]) === JSON.stringify(c[1])) === i);
        function encode(bytes) {
          let str = '';
          for (let i = 0; i < bytes.length; i += 16384) str += String.fromCharCode(...bytes.subarray(i, i + 16384));
          return btoa(str);
        }
        try {
          await client.init();
          for (const [name, rect] of cases) {
            const row = { case: name, rect, initMs: client.initMs };
            try {
              let lastTick = performance.now(), maxTickGapMs = 0, uiTicks = 0;
              const pulse = setInterval(() => { const now = performance.now(); maxTickGapMs = Math.max(maxTickGapMs, now - lastTick); lastTick = now; uiTicks++; }, 20);
              let first;
              try { first = await client.run(buffer, rect); }
              finally { clearInterval(pulse); }
              Object.assign(row, { uiTicks, maxTickGapMs, responsivenessNote: '20ms interval on page; short tasks may finish before first tick' });
              Object.assign(row, { firstRoundtripMs: first.roundtripMs, processingMs: first.processingMs, outputBytes: first.bytes.length, outputMeta: first.meta, details: first.details, base64: encode(first.bytes) });
              if (sample.performance && name === 'center') {
                row.warmRoundtripMs = [];
                for (let j = 0; j < 3; j++) {
                  const repeat = await client.run(buffer, rect);
                  row.warmRoundtripMs.push(repeat.roundtripMs);
                  if (repeat.bytes.length !== first.bytes.length || repeat.bytes.some((v, k) => v !== first.bytes[k])) row.nondeterministic = true;
                }
                row.warmMedianMs = [...row.warmRoundtripMs].sort((a, b) => a - b)[1];
              }
            } catch (e) { row.error = e.message; row.failureDetails = e.details; }
            rows.push(row);
          }
          if (sample.kind === 'invalid') {
            try {
              const baseline = samples.find(s => s.name === 'valid/anim_3frame_rgb.gif');
              const probe = await fetch(baseline.url).then(r => r.arrayBuffer());
              await client.run(probe, { x: 0, y: 0, width: 4, height: 4 });
              rows[0].recovery = 'same worker accepted subsequent valid file';
            } catch (e) { rows[0].recovery = `failed: ${e.message}`; }
          }
        } catch (e) { rows.push({ case: 'init', error: e.message }); }
        finally { client.close(); }
        return { rows };
      }, { sample, engine });
      for (const row of result.rows) {
        if (row.base64) {
          row.output = `${sample.id}-${engine}-${row.case}.gif`;
          await writeFile(resolve(outDir, row.output), Buffer.from(row.base64, 'base64'));
          delete row.base64;
        }
        records.push({ sample: sample.name, source: sample.path, sourceSha256: sample.sha256, kind: sample.kind, performance: sample.performance, engine, ...row });
      }
      await writeFile(resolve(outDir, 'runs.json'), JSON.stringify(records, null, 2));
      console.log(`${++sampleIndex} ${engine} ${sample.name}: ${result.rows.map(r => `${r.case}=${r.error ? 'ERROR ' + r.error.split('\n')[0] : r.firstRoundtripMs.toFixed(1) + 'ms'}`).join(', ')}`);
    }
  }
  // Exercise real UI: file picker, both engines, invalidation, error and recovery.
  if (engines.includes('H')) await page.locator('#b-mode').selectOption('H');
  if (engines.includes('W196')) await page.locator('#b-mode').selectOption('W196');
  if (engines.includes('W198')) {
    await page.locator('option[value="W198"]').evaluate(option => { option.disabled = false; });
    await page.locator('#b-mode').selectOption('W198');
  }
  await page.locator('#file').setInputFiles(resolve('../codec-corpus/testdata/anim_3frame_rgb.gif'));
  await page.waitForFunction(() => document.querySelector('#info').textContent.includes('3 帧'));
  await page.locator('#center').click();
  for (const engine of ['a', 'b']) {
    await page.locator(`#${engine}`).click();
    await page.waitForFunction(e => !document.querySelector(`#download-${e}`).hidden || document.querySelector('#status').textContent.includes('Error'), engine, { timeout: 65_000 });
    if (await page.locator(`#download-${engine}`).isHidden()) throw new Error(`UI ${engine} failed`);
  }
  await page.screenshot({ path: resolve(outDir, 'page.png'), fullPage: true });
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download-b').click();
  const download = await downloadEvent;
  await download.saveAs(resolve(outDir, 'ui-downloaded-B.gif'));
  const logDownloadEvent = page.waitForEvent('download');
  await page.locator('#logs').click();
  const logDownload = await logDownloadEvent;
  const logPath = resolve(outDir, 'ui-downloaded-log.json');
  await logDownload.saveAs(logPath);
  const downloadedLogs = JSON.parse(await readFile(logPath, 'utf8'));
  if (downloadedLogs.length !== 2) throw new Error('UI JSON log download has unexpected content');
  await page.locator('#width').fill('2');
  const staleHidden = await page.locator('#download-a').isHidden() && await page.locator('#download-b').isHidden();
  await page.locator('#file').setInputFiles(resolve('../codec-corpus/invalid/empty.gif'));
  await page.waitForFunction(() => document.querySelector('#info').textContent === '加载失败');
  await page.locator('#file').setInputFiles(resolve('../codec-corpus/testdata/anim_3frame_rgb.gif'));
  await page.waitForFunction(() => document.querySelector('#info').textContent.includes('3 帧'));
  await page.setViewportSize({ width: 390, height: 844 });
  const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  await page.screenshot({ path: resolve(outDir, 'narrow-layout.png'), fullPage: true });
  await writeFile(resolve(outDir, 'ui-checks.json'), JSON.stringify({ bothEnginesRendered: true, browserDownload: download.suggestedFilename(), jsonLogDownload: logDownload.suggestedFilename(), downloadedLogRecords: downloadedLogs.length, staleDownloadHidden: staleHidden, invalidFileAndRecovery: true, noHorizontalOverflow, narrowViewport: 'layout screenshot only; not mobile device testing', browserErrors }, null, 2));
  if (!noHorizontalOverflow) throw new Error('Narrow layout has horizontal overflow');
  console.log(`Saved ${records.length} cases to ${outDir}`);
} finally {
  await browser?.close(); await server.close();
}
