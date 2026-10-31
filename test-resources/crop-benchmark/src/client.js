export class EngineClient {
  constructor(engine) { this.engine = engine; }
  async request(data, transfer = []) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.close(); reject(new Error('Worker 超时（60 秒），已终止')); }, 60_000);
      this.worker.onmessage = ({ data: response }) => {
        clearTimeout(timer);
        if (response.error) reject(Object.assign(new Error(response.error), { details: response.details })); else resolve(response);
      };
      this.worker.onerror = error => { clearTimeout(timer); reject(new Error(error.message)); };
      this.worker.postMessage(data, transfer);
    });
  }
  async init() {
    const start = performance.now();
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const response = await this.request({ type: 'init', engine: this.engine });
    this.initMs = performance.now() - start;
    return response;
  }
  async run(buffer, rect) {
    const copy = buffer.slice(0), start = performance.now();
    const result = await this.request({ buffer: copy, rect }, [copy]);
    return { ...result, roundtripMs: performance.now() - start };
  }
  close() { this.worker?.terminate(); this.worker = null; }
}
