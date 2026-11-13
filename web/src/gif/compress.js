import { cropA } from './engine-a.js';
import { checkGifsicleInput, compressB } from './engine-b.js';
import { GifError } from './errors.js';
import { inspectGIF } from './inspect.js';
import { scaleDimension, validateResize } from './resize.js';

export async function compressGIF(buffer, meta, { colors, scale, step }, limits) {
  if (![0, 128, 64, 32].includes(colors) || ![100, 75, 50].includes(scale) || ![1, 2, 3].includes(step)) {
    throw new GifError('INVALID_COMPRESSION');
  }
  if (meta.plainText) throw new GifError('UNSUPPORTED_COMPRESSION');

  const target = {
    width: scaleDimension(meta.width, scale / 100),
    height: scaleDimension(meta.height, scale / 100),
  };
  validateResize(meta, target, limits);
  const frameDelays = new Map();
  for (let index = 0; index < meta.frames.length; index += step) {
    const delay = meta.frames.slice(index, index + step).reduce((sum, frame) => sum + frame.delay, 0);
    if (delay > 655_350) throw new GifError('COMPRESSION_DELAY');
    frameDelays.set(index, delay);
  }
  let input = buffer;
  let quantizedFrames = 0;
  if (step > 1) {
    if (frameDelays.size < 2) throw new GifError('COMPRESSION_FRAMES');
    // Check the original LZW data before the compositing decoder reads it.
    await checkGifsicleInput(buffer);
    const sampled = cropA(buffer, { x: 0, y: 0, width: meta.width, height: meta.height }, meta, false, frameDelays);
    input = sampled.bytes.buffer;
    quantizedFrames = sampled.details.quantizedFrames;
  }
  const result = await compressB(input, { colors, target: scale === 100 ? null : target });
  const output = inspectGIF(result.bytes.buffer, { ...limits, maxFileBytes: Number.MAX_SAFE_INTEGER });
  const delays = [...frameDelays.values()];
  if (output.width !== target.width || output.height !== target.height || output.loop !== meta.loop ||
      output.frames.length !== delays.length || output.frames.some((frame, index) => frame.delay !== delays[index])) {
    throw new GifError('UNSUPPORTED_COMPRESSION');
  }
  return { ...result, meta: output, details: { ...result.details, quantizedFrames } };
}
