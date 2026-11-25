/// <reference types="vitest" />
import { defineConfig } from 'vite';

// Local and CI builds keep relative asset paths. The Pages workflow sets
// VITE_BASE=/usage-dashboard-trial/ so assets resolve on the project site.
const base = process.env.VITE_BASE || './';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
