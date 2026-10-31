// Compare every successful crop against the browser's composited source frames.
// Decode one frame pair at a time; do not export large RGBA frame collections.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const directory = resolve(process.argv[2]);
const edge = process.argv.includes('--edge');
const destination = resolve(directory, `browser-verification-${edge ? 'edge' : 'chrome'}.json`);
const rows = JSON.parse(await readFile(resolve(directory, 'runs.json'), 'utf8'));
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/Users/itang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 4175, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: edge ? 'msedge' : 'chrome', headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4175');
  const results = [];
  for (const row of rows) {
    if (!row.output || row.kind === 'invalid') continue;
    const source = (await readFile(row.source)).toString('base64');
    const output = (await readFile(resolve(directory, row.output))).toString('base64');
    const result = await page.evaluate(async ({ source, output, rect }) => {
      const decode = base64 => new ImageDecoder({ data: Uint8Array.from(atob(base64), c => c.charCodeAt(0)), type: 'image/gif' });
      const a = decode(source), b = decode(output);
      try {
        await Promise.all([a.tracks.ready, b.tracks.ready]);
        async function timeline(decoder) {
          const ends = [0];
          for (let i = 0; i < decoder.tracks.selectedTrack.frameCount; i++) {
            const { image } = await decoder.decode({ frameIndex: i });
            ends.push(ends.at(-1) + image.duration); image.close();
          }
          return ends;
        }
        const [ta, tb] = await Promise.all([timeline(a), timeline(b)]);
        const cuts = [...new Set([...ta, ...tb])].filter(t => t < Math.min(ta.at(-1), tb.at(-1))).sort((x, y) => x-y);
        const canvasA = new OffscreenCanvas(rect.width, rect.height), canvasB = new OffscreenCanvas(rect.width, rect.height);
        const ctxA = canvasA.getContext('2d', { willReadFrequently: true }), ctxB = canvasB.getContext('2d', { willReadFrequently: true });
        let i = 0, j = 0, alphaDifferences = 0, visibleRgbDifferences = 0, sizeOk = true;
        for (const time of cuts) {
          while (ta[i+1] <= time && i+1 < ta.length-1) i++;
          while (tb[j+1] <= time && j+1 < tb.length-1) j++;
          const [{ image: frameA }, { image: frameB }] = await Promise.all([a.decode({ frameIndex: i }), b.decode({ frameIndex: j })]);
          sizeOk &&= frameB.displayWidth === rect.width && frameB.displayHeight === rect.height;
          ctxA.clearRect(0, 0, rect.width, rect.height); ctxB.clearRect(0, 0, rect.width, rect.height);
          ctxA.drawImage(frameA, -rect.x, -rect.y); ctxB.drawImage(frameB, 0, 0);
          frameA.close(); frameB.close();
          const expected = ctxA.getImageData(0, 0, rect.width, rect.height).data;
          const actual = ctxB.getImageData(0, 0, rect.width, rect.height).data;
          for (let p = 0; p < expected.length; p+=4) {
            if (expected[p+3] !== actual[p+3]) alphaDifferences++;
            if (expected[p+3] && actual[p+3] && (expected[p] !== actual[p] || expected[p+1] !== actual[p+1] || expected[p+2] !== actual[p+2])) visibleRgbDifferences++;
          }
        }
        const durationOk = ta.at(-1) === tb.at(-1);
        return { pass: sizeOk && durationOk && !alphaDifferences && !visibleRgbDifferences, sizeOk, durationOk, sourceFrames: ta.length-1, outputFrames: tb.length-1, sourceDurationUs: ta.at(-1), outputDurationUs: tb.at(-1), comparedIntervals: cuts.length, alphaDifferences, visibleRgbDifferences };
      } finally { a.close(); b.close(); }
    }, { source, output, rect: row.rect });
    results.push({ sample: row.sample, engine: row.engine, case: row.case, ...result });
    console.log(`${results.length} ${row.sample} ${row.case}: ${result.pass ? 'PASS' : 'DIFF'}`);
  }
  await writeFile(destination, JSON.stringify({ browser: browser.version(), headless: true, note: 'Browser ImageDecoder compositing and Canvas RGBA; alpha and visible RGB compared on combined playback timeline. Same decoder family is not independent cross-engine evidence.', results }, null, 2), { flag: 'wx' });
  console.log(`PASS ${results.filter(r => r.pass).length}/${results.length}: ${destination}`);
} finally { await browser?.close(); await server.close(); }
