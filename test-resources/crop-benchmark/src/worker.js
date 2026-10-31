import { inspectGIF, validateCrop } from './gif-meta.js';
let engine;
self.addEventListener('unhandledrejection', event => {
  event.preventDefault();
  self.postMessage({ error: `Worker 内未处理的异常：${event.reason?.stack || event.reason}` });
});
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const start = performance.now();
      if (data.engine === 'A') engine = (await import('./engine-a.js')).cropA;
      else if (data.engine === 'H') engine = (await import('./engine-hybrid.js')).cropHybrid;
      else if (data.engine === 'W196') {
        const { crop196, init196 } = await import('./engine-196.js');
        await init196();
        engine = crop196;
      }
      else if (data.engine === 'W198') {
        const { crop198, init198 } = await import('./engine-198.js');
        await init198();
        engine = crop198;
      }
      else {
        const { cropB } = await import('./engine-b.js');
        engine = (buffer, rect) => cropB(buffer, rect, data.engine.endsWith('-strict'), data.engine.includes('-U'));
      }
      self.postMessage({ ready: true, importMs: performance.now() - start });
      return;
    }
    const start = performance.now();
    const meta = inspectGIF(data.buffer);
    validateCrop(meta, data.rect);
    const out = await engine(data.buffer, data.rect, meta);
    const resultMeta = inspectGIF(out.bytes.buffer);
    self.postMessage({ ...out, processingMs: performance.now() - start, meta: resultMeta }, [out.bytes.buffer]);
  } catch (error) {
    self.postMessage({ error: error.stack || String(error), details: error.details });
  }
};
