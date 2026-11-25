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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'scripts/**/*.ts'],
      // Browser entry is exercised by end-to-end tests, not unit tests.
      exclude: ['src/app/main.ts', 'src/ui/main.ts', 'scripts/run-*.ts', 'scripts/collect-run.ts'],
      thresholds: {
        lines: 88,
        statements: 88,
        functions: 88,
        branches: 80,
      },
    },
  },
});
