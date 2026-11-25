/// <reference types="vitest" />
import { defineConfig } from 'vite';

// Static build only: `npm run build` writes plain files to dist/. Nothing is deployed.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
