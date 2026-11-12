import { inspectGIF, validateCrop } from './inspect.js';
import { cropHybrid } from './hybrid.js';
import { cropA } from './engine-a.js';
import { cropBDiagnostic, resizeB } from './engine-b.js';
import { validateResize } from './resize.js';
import { LIMITS } from '../config.js';
import { GifError, normalizeError } from './errors.js';
import { handleChildMessage } from './child-worker.js';

// Only one request is sent to this worker. All processing resources die with it.
self.onmessage = async ({ data }) => {
  if (data.type === 'child-response') { handleChildMessage(data); return; }
  const started = performance.now();
  try {
    const limits = { ...LIMITS, ...data.limits };
    const meta = inspectGIF(data.buffer, limits);
    if (data.operation === 'resize') {
      const target = data.rect;
      validateResize(meta, target, limits);
      if (meta.plainText) throw new GifError('UNSUPPORTED_RESIZE');
      const result = await resizeB(data.buffer, target);
      const outputMeta = inspectGIF(result.bytes.buffer, { ...limits, maxFileBytes: Number.MAX_SAFE_INTEGER });
      if (outputMeta.width !== target.width || outputMeta.height !== target.height ||
          outputMeta.frames.length !== meta.frames.length || outputMeta.loop !== meta.loop ||
          outputMeta.frames.some((frame, i) => frame.delay !== meta.frames[i].delay)) {
        throw new GifError('UNSUPPORTED_RESIZE');
      }
      self.postMessage({ ...result, meta: outputMeta, processingMs: performance.now() - started }, [result.bytes.buffer]);
      return;
    }
    validateCrop(meta, data.rect);
    const circle = data.shape === 'circle';
    if (circle && (data.rect.width !== data.rect.height || meta.plainText)) {
      throw new GifError('UNSUPPORTED_CROP');
    }
    // gifuct-js can silently fill invalid LZW data. Keep the same input diagnostics as the rectangular route.
    if (circle) await cropBDiagnostic(data.buffer, data.rect);
    const result = circle ? cropA(data.buffer, data.rect, meta, true) : await cropHybrid(data.buffer, data.rect, meta);
    const outputMeta = inspectGIF(result.bytes.buffer, {
      ...limits, maxFileBytes: Number.MAX_SAFE_INTEGER,
    });
    if (circle && (outputMeta.width !== data.rect.width || outputMeta.height !== data.rect.height ||
      outputMeta.frames.length !== meta.frames.length || outputMeta.loop !== meta.loop ||
      outputMeta.frames.some((frame, i) => frame.delay !== meta.frames[i].delay))) {
      throw new GifError('UNSUPPORTED_CROP');
    }
    self.postMessage({ ...result, meta: outputMeta, processingMs: performance.now() - started }, [result.bytes.buffer]);
  } catch (error) {
    const failure = normalizeError(error);
    self.postMessage({ error: { code: failure.code, message: failure.message, details: failure.details } });
  } finally {
    self.close();
  }
};
