import { parseGIF, decompressFrame } from 'gifuct-js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

function indexed(rgba) {
  const palette = [], lookup = new Map(), index = new Uint8Array(rgba.length / 4);
  let transparentIndex = -1;
  for (let p = 0; p < index.length; p++) {
    const i = p * 4;
    const key = rgba[i + 3] === 0 ? -1 : (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    if (!lookup.has(key)) {
      if (palette.length === 256) return quantized(rgba);
      lookup.set(key, palette.length);
      if (key === -1) transparentIndex = palette.length;
      palette.push(key === -1 ? [0, 0, 0] : [rgba[i], rgba[i + 1], rgba[i + 2]]);
    }
    index[p] = lookup.get(key);
  }
  if (palette.length === 1) palette.push([0, 0, 0]);
  return { palette, index, transparentIndex, quantized: false };
}

function quantized(rgba) {
  const opaque = [];
  let hasAlpha = false;
  for (let i = 0; i < rgba.length; i += 4) {
    if (!rgba[i + 3]) hasAlpha = true;
    else opaque.push(rgba[i], rgba[i + 1], rgba[i + 2], 255);
  }
  const palette = quantize(new Uint8Array(opaque), hasAlpha ? 255 : 256);
  const index = applyPalette(rgba, palette);
  const transparentIndex = hasAlpha ? palette.length : -1;
  if (hasAlpha) {
    palette.push([0, 0, 0]);
    for (let i = 0; i < index.length; i++) if (!rgba[i * 4 + 3]) index[i] = transparentIndex;
  }
  return { palette, index, transparentIndex, quantized: true };
}

export function cropA(buffer, rect, meta, circle = false, frameDelays = null) {
  if (meta.plainText) throw new Error('方案 A 暂不支持 GIF Plain Text 扩展');
  const parsed = parseGIF(buffer);
  const sourceFrames = parsed.frames.filter(f => f.image);
  const { width: W, height: H } = meta;
  const canvas = new Uint8ClampedArray(W * H * 4);
  // Browser GIF decoders leave uncovered canvas transparent (Pillow differs
  // on some partial first frames). Match Chrome's independently checked policy.
  function clear(r) {
    for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) {
      const j = (y * W + x) * 4;
      canvas[j] = 0; canvas[j + 1] = 0; canvas[j + 2] = 0; canvas[j + 3] = 0;
    }
  }
  const encoder = GIFEncoder();
  let quantizedFrames = 0;
  for (let n = 0; n < sourceFrames.length; n++) {
    const raw = meta.frames[n];
    const previous = raw.disposal === 3 ? canvas.slice() : null;
    const frame = decompressFrame(sourceFrames[n], parsed.gct, false);
    for (let y = 0; y < raw.height; y++) for (let x = 0; x < raw.width; x++) {
      const pixel = frame.pixels[y * raw.width + x];
      if (pixel === raw.transparentIndex) continue;
      const color = frame.colorTable?.[pixel];
      if (!color) throw new Error('像素引用无效调色板索引');
      const j = ((y + raw.y) * W + x + raw.x) * 4;
      canvas[j] = color[0]; canvas[j + 1] = color[1]; canvas[j + 2] = color[2]; canvas[j + 3] = 255;
    }
    if (!frameDelays || frameDelays.has(n)) {
      const rgba = new Uint8Array(rect.width * rect.height * 4);
      for (let y = 0; y < rect.height; y++) {
        const start = ((rect.y + y) * W + rect.x) * 4;
        rgba.set(canvas.subarray(start, start + rect.width * 4), y * rect.width * 4);
      }
      if (circle) {
        const side = rect.width;
        for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
          if ((2 * x + 1 - side) ** 2 + (2 * y + 1 - side) ** 2 > side ** 2) {
            rgba[(y * side + x) * 4 + 3] = 0;
          }
        }
      }
      const out = indexed(rgba);
      if (out.quantized) quantizedFrames++;
      encoder.writeFrame(out.index, rect.width, rect.height, {
        palette: out.palette, delay: frameDelays?.get(n) ?? raw.delay, repeat: meta.loop ?? -1,
        transparent: out.transparentIndex >= 0, transparentIndex: Math.max(0, out.transparentIndex), dispose: 2,
      });
    }
    if (raw.disposal === 2) clear(raw);
    else if (raw.disposal === 3) canvas.set(previous);
  }
  encoder.finish();
  return { bytes: encoder.bytes(), details: { quantizedFrames, policy: 'exact palette when <=256 RGBA colors; otherwise rgb565 quantization' } };
}
