import { LIMITS } from '../config.js';
import { GifError, normalizeError } from './errors.js';

export async function readGIFFile(file, limits = LIMITS) {
  if (file.size > limits.maxFileBytes) throw new GifError('RESOURCE_LIMIT', { limit: 'maxFileBytes', actual: file.size, allowed: limits.maxFileBytes });
  return file.arrayBuffer();
}

export class GifClient {
  constructor({ limits = {}, workerFactory = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }) } = {}) {
    this.limits = { ...LIMITS, ...limits };
    this.workerFactory = workerFactory;
    this.worker = null;
  }

  resize(buffer, target) {
    return this.run(buffer, target, undefined, 'resize');
  }

  async run(buffer, rect, shape, operation = 'crop') {
    if (this.worker) throw new GifError('PROCESSING_FAILED', { reason: 'A task is already running.' });
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') throw new GifError('UNSUPPORTED_ENV');
    if (buffer.byteLength > this.limits.maxFileBytes) throw new GifError('RESOURCE_LIMIT', { limit: 'maxFileBytes', actual: buffer.byteLength, allowed: this.limits.maxFileBytes });
    const started = performance.now();
    return new Promise((resolve, reject) => {
      let settled = false;
      const children = new Map();
      const stopChild = id => {
        const child = children.get(id);
        if (!child) return;
        child.worker.onmessage = child.worker.onerror = child.worker.onmessageerror = null;
        child.worker.terminate();
        URL.revokeObjectURL(child.url);
        children.delete(id);
      };
      const settle = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(this.timer);
        if (this.worker) this.worker.onmessage = this.worker.onerror = this.worker.onmessageerror = null;
        this.worker?.terminate();
        for (const id of children.keys()) stopChild(id);
        this.worker = null;
        this.cancel = null;
        if (error) reject(error); else resolve({ ...result, roundtripMs: performance.now() - started });
      };
      this.cancel = () => settle(new GifError('PROCESSING_FAILED', { reason: 'Task cancelled.' }));
      try {
        this.worker = this.workerFactory();
        this.worker.onmessage = ({ data }) => {
          if (settled) return;
          if (data.child) {
            const message = data.child;
            try {
              if (message.type === 'create') {
                const child = new Worker(message.url);
                children.set(message.id, { worker: child, url: message.url });
                child.onmessage = ({ data }) => this.worker?.postMessage({ type: 'child-response', id: message.id, data });
                child.onerror = event => {
                  event.preventDefault();
                  this.worker?.postMessage({ type: 'child-response', id: message.id, error: event.message });
                };
                child.onmessageerror = () => settle(new GifError('PROCESSING_FAILED', { reason: 'Child worker response could not be decoded.' }));
              } else if (message.type === 'post') children.get(message.id)?.worker.postMessage(message.data);
              else if (message.type === 'terminate') stopChild(message.id);
            } catch (error) { settle(new GifError('UNSUPPORTED_ENV', { reason: error.message })); }
            return;
          }
          if (data.error) settle(new GifError(data.error.code, data.error.details)); else settle(null, data);
        };
        this.worker.onerror = error => {
          error.preventDefault();
          settle(new GifError('UNSUPPORTED_ENV', { reason: error.message }));
        };
        this.worker.onmessageerror = () => settle(new GifError('PROCESSING_FAILED', { reason: 'Worker response could not be decoded.' }));
        this.timer = setTimeout(() => settle(new GifError('TIMEOUT')), this.limits.timeoutMs);
        const copy = buffer.slice(0);
        this.worker.postMessage({ buffer: copy, rect, shape, operation, limits: this.limits }, [copy]);
      } catch (error) {
        settle(error.name === 'SecurityError' ? new GifError('UNSUPPORTED_ENV') : normalizeError(error));
      }
    });
  }

  close() { this.cancel?.(); }
}
