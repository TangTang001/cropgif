import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const benchmark = resolve(root, '../test-resources/crop-benchmark');
const { values: options } = parseArgs({ options: { edge: { type: 'boolean' }, label: { type: 'string' }, sample: { type: 'string' } } });
const channel = options.edge ? 'edge' : 'chrome';
const label = options.label;
if (!label || !/^[\w-]+$/.test(label)) throw new Error('Use a unique --label with letters, numbers, hyphens or underscores.');
const outDir = resolve(benchmark, 'runs', `${label}-${channel}`);
await mkdir(outDir); // Never overwrite an existing run, including a partial one.
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const suite = JSON.parse(await readFile(resolve(benchmark, 'suite-hybrid.json'), 'utf8'));
for (const sample of suite) if (sha(await readFile(sample.path)) !== sample.sha256) throw new Error(`Changed fixture: ${sample.path}`);
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/Users/itang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const server = await createServer({ root, configFile: resolve(root, 'vite.config.js'), server: { host: '127.0.0.1', port: 4191, strictPort: true } });
let browser;
const rows = [];
// This profile preserves the old scanner's correctness bounds; product limits are tested separately.
const limits = { maxFileBytes: Number.MAX_SAFE_INTEGER, maxCanvasPixels: 16_777_216, maxFrames: Number.MAX_SAFE_INTEGER, maxTotalFramePixels: 300_000_000, timeoutMs: 60_000 };
try {
  await server.listen();
  browser = await chromium.launch({ channel: options.edge ? 'msedge' : 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4191/');
  await page.evaluate(async limits => {
    const { GifClient } = await import('/src/gif/client.js');
    window.productionClient = new GifClient({ limits });
  }, limits);
  const sourceSha256 = {};
  async function hashFiles(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = resolve(folder, entry.name);
      if (entry.isDirectory()) await hashFiles(file);
      else sourceSha256[relative(root, file).replaceAll('\\', '/')] = sha(await readFile(file));
    }
  }
  await hashFiles(resolve(root, 'src'));
  for (const file of ['package.json', 'package-lock.json', 'vite.config.js', 'index.html', 'tests/run-regression.mjs']) sourceSha256[file] = sha(await readFile(resolve(root, file)));
  const environment = { version: browser.version(), browser: channel, date: new Date().toISOString(), profile: 'correctness-regression', limits, sourceSha256, packages: JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).dependencies, suiteSha256: sha(await readFile(resolve(benchmark, 'suite-hybrid.json'))), processingEntry: 'web/src/gif/client.js -> production worker -> H', memoryMeasurement: 'not measured' };
  await writeFile(resolve(outDir, 'environment.json'), JSON.stringify(environment, null, 2));
  for (const sample of suite.filter(s => !options.sample || new RegExp(options.sample).test(s.name))) {
    const encoded = (await readFile(sample.path)).toString('base64');
    const w = Math.max(1, Math.floor((sample.width || 1) / 2)), h = Math.max(1, Math.floor((sample.height || 1) / 2));
    let cases = [
      ['full', { x: 0, y: 0, width: sample.width || 1, height: sample.height || 1 }],
      ['center', { x: Math.floor(((sample.width || 1) - w) / 2), y: Math.floor(((sample.height || 1) - h) / 2), width: w, height: h }],
      ['edge', { x: (sample.width || 1) - w, y: (sample.height || 1) - h, width: w, height: h }],
      ['pixel', { x: 0, y: 0, width: 1, height: 1 }],
      ...(sample.crops || []).map(c => [c.name, c.rect]),
    ];
    if (sample.kind === 'invalid') cases = cases.slice(0, 1);
    cases = cases.filter((c, i, all) => all.findIndex(a => JSON.stringify(a[1]) === JSON.stringify(c[1])) === i);
    for (const [name, rect] of cases) {
      const row = { sample: sample.name, source: sample.path, sourceSha256: sample.sha256, kind: sample.kind, performance: sample.performance, engine: 'H-production', case: name, rect };
      const result = await page.evaluate(async ({ encoded, rect }) => {
        const buffer = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)).buffer;
        try {
          const result = await window.productionClient.run(buffer, rect);
          let string = '';
          for (let i = 0; i < result.bytes.length; i += 16384) string += String.fromCharCode(...result.bytes.subarray(i, i + 16384));
          return { base64: btoa(string), firstRoundtripMs: result.roundtripMs, processingMs: result.processingMs, outputMeta: result.meta, outputBytes: result.bytes.length, details: result.details, originalBufferRetained: buffer.byteLength > 0, workerReleased: window.productionClient.worker === null };
        } catch (error) { return { error: error.message, errorCode: error.code, failureDetails: error.details, workerReleased: window.productionClient.worker === null }; }
      }, { encoded, rect });
      if (result.base64) {
        row.output = `${sample.id}-H-production-${name}.gif`;
        await writeFile(resolve(outDir, row.output), Buffer.from(result.base64, 'base64'));
        delete result.base64;
      }
      Object.assign(row, result);
      rows.push(row);
    }
    // Reuse the client after every rejected/unsupported file, not only corrupt input.
    if (rows.some(r => r.sample === sample.name && r.error) || sample.kind === 'invalid') {
      const valid = suite.find(s => s.name === 'testdata/anim_3frame_rgb.gif');
      const probe = (await readFile(valid.path)).toString('base64');
      const recovered = await page.evaluate(async encoded => {
        const buffer = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)).buffer;
        await window.productionClient.run(buffer, { x: 0, y: 0, width: 4, height: 4 });
        return window.productionClient.worker === null;
      }, probe);
      for (const row of rows.filter(r => r.sample === sample.name)) row.recovery = recovered ? 'new production task accepted subsequent valid file' : 'FAILED';
    }
    await writeFile(resolve(outDir, 'runs.json'), JSON.stringify(rows, null, 2));
    console.log(`${sample.name}: ${cases.length} cases, ${rows.filter(r => r.sample === sample.name && r.error).length} rejected`);
  }
  await writeFile(resolve(outDir, 'runtime-checks.json'), JSON.stringify({ errors, allTasksReleased: rows.every(r => r.workerReleased), originalBuffersRetained: rows.filter(r => r.output).every(r => r.originalBufferRetained) }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Saved ${rows.length} production records: ${outDir}`);
} finally { await browser?.close(); await server.close(); }
