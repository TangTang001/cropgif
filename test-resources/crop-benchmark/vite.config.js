import { defineConfig } from 'vite';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const corpus = resolve('../codec-corpus');
const generated = resolve('generated');
export default defineConfig({
  worker: { format: 'es' },
  optimizeDeps: { include: ['gifuct-js', 'gifenc', 'gifsicle-wasm-browser'] },
  plugins: [{
    name: 'read-only-fixtures',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url, 'http://localhost');
          if (url.pathname === '/api/samples') {
            const groups = ['testdata', 'valid', 'invalid', 'edge-cases'];
            const samples = [];
            for (const group of groups) {
              for (const file of await readdir(resolve(corpus, group))) {
                if (file.endsWith('.gif')) samples.push({ name: `${group}/${file}`, url: `/fixtures/${group}/${encodeURIComponent(file)}` });
              }
            }
            for (const file of await readdir(generated).catch(() => [])) {
              if (file.endsWith('.gif')) samples.push({ name: `generated/${file}`, url: `/generated/${encodeURIComponent(file)}` });
            }
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(samples));
          } else if (url.pathname.startsWith('/fixtures/') || url.pathname.startsWith('/generated/')) {
            const isGenerated = url.pathname.startsWith('/generated/');
            const root = isGenerated ? generated : corpus;
            const prefix = isGenerated ? '/generated/' : '/fixtures/';
            const path = resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)));
            if (relative(root, path).startsWith('..') || !path.startsWith(root + sep) || !path.endsWith('.gif')) {
              res.statusCode = 403; return res.end('Forbidden');
            }
            res.setHeader('Content-Type', 'image/gif');
            res.end(await readFile(path));
          } else next();
        } catch (error) {
          res.statusCode = 500; res.end(String(error));
        }
      });
    },
  }],
});
