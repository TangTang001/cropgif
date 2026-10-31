import { createServer } from '../test-resources/crop-benchmark/node_modules/vite/dist/node/index.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const source = resolve(root, '../test-resources/crop-benchmark/src');
const server = await createServer({
  root, configFile: false, worker: { format: 'es' },
  resolve: { alias: { '@gif-client': resolve(source, 'client.js'), '@gif-meta': resolve(source, 'gif-meta.js') } },
  server: { host: '127.0.0.1', port: 4186, strictPort: true, fs: { allow: [root, resolve(source, '..')] } },
});
await server.listen();
server.printUrls();
