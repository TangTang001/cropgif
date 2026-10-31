// Cross-check small compositing fixtures with Chrome's own GIF decoder.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const directory = resolve(process.argv[2] || 'runs/baseline-chrome');
let rows;
try {
  rows = JSON.parse(await readFile(resolve(directory, 'runs.json'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const available = [];
  for (const name of await readdir(resolve('runs'))) {
    try { await readFile(resolve('runs', name, 'runs.json')); available.push(name); } catch { /* incomplete runs are not inputs */ }
  }
  console.error(`缺少测试结果：${resolve(directory, 'runs.json')}\n请先运行 run-browser.mjs；本命令生成 chrome-reference/index.json，不会自动生成裁剪结果。\n已有结果目录：\n${available.map(n => `  runs/${n}`).join('\n')}`);
  process.exit(1);
}
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/Users/itang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const server = await createServer({ server: { host: '127.0.0.1', port: 4175, strictPort: true } });
let browser;
const out = resolve(directory, 'chrome-reference');
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  await mkdir(out, { recursive: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4175');
  await page.waitForFunction(() => window.benchmark);
  const names = ['dispose_previous.gif', 'dispose_background.gif', 'dispose_none.gif', 'overlapping_frames.gif', 'small_frame_big_canvas.gif', 'transparent_frame.gif', 'palette-union-511colors.gif'];
  const selected = rows.filter(r => r.output && names.some(n => r.sample.endsWith('/' + n)));
  const sources = [...new Set(selected.map(r => r.source))];
  const files = [...sources.map((p, i) => ({ path: p, id: `source-${i}` })), ...selected.map(r => ({ path: resolve(directory, r.output), id: r.output.replace('.gif', '') }))];
  const decoded = [];
  for (const file of files) {
    const base64 = (await readFile(file.path)).toString('base64');
    const result = await page.evaluate(async base64 => {
      if (typeof ImageDecoder === 'undefined') return { error: 'ImageDecoder unavailable' };
      const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const decoder = new ImageDecoder({ data, type: 'image/gif' });
      await decoder.tracks.ready;
      const frames = [];
      try {
        for (let i = 0; i < decoder.tracks.selectedTrack.frameCount; i++) {
          const { image } = await decoder.decode({ frameIndex: i });
          const canvas = new OffscreenCanvas(image.displayWidth, image.displayHeight);
          const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
          const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let str = ''; for (let p = 0; p < rgba.length; p += 16384) str += String.fromCharCode(...rgba.subarray(p, p + 16384));
          frames.push({ width: canvas.width, height: canvas.height, durationUs: image.duration, rgba: btoa(str) });
          image.close();
        }
        return { frames };
      } finally { decoder.close(); }
    }, base64);
    for (let i = 0; i < (result.frames || []).length; i++) {
      const frame = result.frames[i];
      frame.file = `${file.id}-${i}.rgba`;
      await writeFile(resolve(out, frame.file), Buffer.from(frame.rgba, 'base64'));
      delete frame.rgba;
    }
    decoded.push({ ...file, ...result });
  }
  await writeFile(resolve(out, 'index.json'), JSON.stringify({ browser: browser.version(), files: decoded }, null, 2));
  console.log(`Chrome ImageDecoder cross-check: ${decoded.length} files -> ${out}`);
} finally { await browser?.close(); await server.close(); }
