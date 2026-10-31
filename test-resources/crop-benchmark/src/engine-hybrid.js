import { cropBDiagnostic } from './engine-b.js';
import { cropA } from './engine-a.js';
import { inspectGIF } from './gif-meta.js';

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
  const primary = await cropBDiagnostic(buffer, rect);
  const reasons = mismatches(primary.bytes, meta, rect);
  const route = { primary: 'B', final: 'B', fallbackReasons: reasons, primaryDetails: primary.details };
  if (!reasons.length) return { ...primary, details: route };
  const fallback = cropA(buffer, rect, meta);
  route.final = 'A'; route.fallbackDetails = fallback.details;
  if (fallback.details.quantizedFrames || mismatches(fallback.bytes, meta, rect).length) {
    throw Object.assign(new Error('兼容处理不能保留颜色或动画元数据，拒绝输出'), { details: route });
  }
  return { ...fallback, details: route };
}
