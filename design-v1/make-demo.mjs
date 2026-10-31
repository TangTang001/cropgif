// Render our original SVG illustration into a real, locally generated GIF.
import { chromium } from 'file:///C:/Users/itang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { GIFEncoder, quantize, applyPalette } from '../test-resources/crop-benchmark/node_modules/gifenc/dist/gifenc.esm.js';
const svg = await readFile(new URL('./art/coastal.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const frames = await page.evaluate(async svg => {
    const image = new Image(); image.src = 'data:image/svg+xml;base64,' + btoa(svg); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 500;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const result = [];
    for (let n = 0; n < 16; n++) {
      ctx.drawImage(image, 0, 0);
      const x = 450 + Math.sin(n / 16 * Math.PI * 2) * 12;
      const y = 367 + Math.cos(n / 16 * Math.PI * 2) * 1.5;
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = '#375d54'; ctx.beginPath(); ctx.moveTo(-19, 0); ctx.lineTo(17, 0); ctx.lineTo(10, 7); ctx.lineTo(-12, 7); ctx.fill();
      ctx.fillStyle = '#f5ead3'; ctx.beginPath(); ctx.moveTo(-1, -42); ctx.lineTo(-1, -5); ctx.lineTo(-18, -5); ctx.fill();
      ctx.fillStyle = '#dbad75'; ctx.beginPath(); ctx.moveTo(2, -33); ctx.lineTo(2, -5); ctx.lineTo(17, -5); ctx.fill(); ctx.restore();
      const rgba = ctx.getImageData(0, 0, 800, 500).data;
      let str = ''; for (let i = 0; i < rgba.length; i += 16384) str += String.fromCharCode(...rgba.subarray(i, i+16384));
      result.push(btoa(str));
    }
    return result;
  }, svg);
  const rgba = frames.map(f => new Uint8Array(Buffer.from(f, 'base64')));
  const palette = quantize(rgba[0], 192);
  const encoder = GIFEncoder();
  for (const pixels of rgba) encoder.writeFrame(applyPalette(pixels, palette), 800, 500, { palette, delay: 100, repeat: 0, dispose: 1 });
  encoder.finish();
  await writeFile(new URL('./art/coastal-loop.gif', import.meta.url), encoder.bytes());
  console.log(`Created original demo GIF: ${encoder.bytes().length} bytes, 800x500, 16 frames`);
} finally { await browser.close(); }
