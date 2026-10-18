import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const frontendRoot = fileURLToPath(new URL('./frontend', import.meta.url));

export default defineConfig({
  root: frontendRoot,
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./frontend/index.html', import.meta.url)),
        editor: fileURLToPath(new URL('./frontend/editor.html', import.meta.url)),
        about: fileURLToPath(new URL('./frontend/about.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./frontend/privacy.html', import.meta.url))
      }
    }
  }
});