import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths make the production build easy to host from
  // a subfolder or simple static server.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true
  }
});
