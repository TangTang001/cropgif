// Initial protective limits, not a claim of validated device capacity.
export const LIMITS = Object.freeze({
  maxFileBytes: 20 * 1024 * 1024,
  maxCanvasPixels: 4_194_304,
  maxFrames: 500,
  maxTotalFramePixels: 60_000_000,
  timeoutMs: 60_000,
});
