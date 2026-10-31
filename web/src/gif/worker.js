import { inspectGIF, validateCrop } from './inspect.js';
import { cropHybrid } from './hybrid.js';
import { LIMITS } from '../config.js';
import { normalizeError } from './errors.js';
import { handleChildMessage } from './child-worker.js';

// Only one request is sent to this worker. All processing resources die with it.
self.onmessage = async ({ data }) => {
  if (data.type === 'child-response') { handleChildMessage(data); return; }
  const started = performance.now();
  try {
    const limits = { ...LIMITS, ...data.limits };
    const meta = inspectGIF(data.buffer, limits);
    validateCrop(meta, data.rect);
    const result = await cropHybrid(data.buffer, data.rect, meta);
    const outputMeta = inspectGIF(result.bytes.buffer, {
      ...limits, maxFileBytes: Number.MAX_SAFE_INTEGER,
    });
    self.postMessage({ ...result, meta: outputMeta, processingMs: performance.now() - started }, [result.bytes.buffer]);
  } catch (error) {
    const failure = normalizeError(error);
    self.postMessage({ error: { code: failure.code, message: failure.message, details: failure.details } });
  } finally {
    self.close();
  }
};
