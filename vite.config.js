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
        portfolio: fileURLToPath(new URL('./frontend/buildymyportfolio.html', import.meta.url)),
        about: fileURLToPath(new URL('./frontend/about.html', import.meta.url))
      }
    }
  }
});