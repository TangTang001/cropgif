import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  worker: { format: 'es' },
  build: { rollupOptions: { input: {
    home: fileURLToPath(new URL('./index.html', import.meta.url)),
    circle: fileURLToPath(new URL('./crop-gif-to-circle/index.html', import.meta.url)),
    resize: fileURLToPath(new URL('./resize-gif/index.html', import.meta.url)),
    privacy: fileURLToPath(new URL('./privacy/index.html', import.meta.url)),
    licenses: fileURLToPath(new URL('./licenses/index.html', import.meta.url)),
  } } },
});
