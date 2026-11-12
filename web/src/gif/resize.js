import { LIMITS } from '../config.js';
import { GifError } from './errors.js';

export function validateResize(meta, { width, height }, limits = LIMITS) {
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new GifError('INVALID_RESIZE');
  }
  const pixels = width * height;
  if (width > 65_535 || height > 65_535 || pixels > limits.maxCanvasPixels ||
      pixels * meta.frames.length > limits.maxTotalFramePixels) {
    throw new GifError('RESIZE_LIMIT');
  }
}

export function scaleDimension(original, scale) {
  return Math.max(1, Math.round(original * scale));
}
