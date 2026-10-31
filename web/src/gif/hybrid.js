import { GifError, normalizeError } from './errors.js';
import { cropBDiagnostic } from './engine-b.js';
import { cropA } from './engine-a.js';
import { inspectGIF } from './inspect.js';

function mismatches(bytes, input, rect) {
  const output = inspectGIF(bytes.buffer);
  const reasons = [];
  if (output.width !== rect.width || output.height !== rect.height) reasons.push('dimensions');
  if (output.frames.length !== input.frames.length) reasons.push('frame-count');
  if (output.frames.some((f, i) => f.delay !== input.frames[i]?.delay)) reasons.push('frame-delays');
  if (output.loop !== input.loop) reasons.push('loop');
  return reasons;
}

export async function cropHybrid(buffer, rect, meta) {
  // Never turn known corrupt data or an unknown failure into fallback success.
  let primary;
  try { primary = await cropBDiagnostic(buffer, rect); }
  catch (error) {
    error.details = { primary: 'B', final: null, fallbackReasons: [], primaryDetails: error.details };
    throw error;
  }
  const reasons = mismatches(primary.bytes, meta, rect);
  const route = { primary: 'B', final: 'B', fallbackReasons: reasons, primaryDetails: primary.details };
  if (!reasons.length) return { ...primary, details: route };
  let fallback;
  try { fallback = cropA(buffer, rect, meta); }
  catch (error) {
    const failure = normalizeError(error);
    if (failure.code === 'RESOURCE_LIMIT') throw failure;
    throw new GifError('UNSUPPORTED_CROP', { ...route, reason: String(error.message || error) });
  }
  route.final = 'A'; route.fallbackDetails = fallback.details;
  if (fallback.details.quantizedFrames || mismatches(fallback.bytes, meta, rect).length) {
    throw new GifError('UNSUPPORTED_CROP', route);
  }
  return { ...fallback, details: route };
}
