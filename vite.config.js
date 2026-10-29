import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const frontendRoot = fileURLToPath(new URL('./frontend', import.meta.url));

export default defineConfig({
  root: frontendRoot,
  build: {
    chunkSizeWarningLimit: 1000,
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./frontend/index.html', import.meta.url)),
        editor: fileURLToPath(new URL('./frontend/editor.html', import.meta.url)),
        about: fileURLToPath(new URL('./frontend/about.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./frontend/privacy.html', import.meta.url)),
        terms: fileURLToPath(new URL('./frontend/terms.html', import.meta.url)),
        refunds: fileURLToPath(new URL('./frontend/refunds.html', import.meta.url))
      }
    }
  }
});