import { defineConfig } from 'vitest/config';

// Separate from the unit-test Vite config: no coverage, one browser, one server.
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
  },
});
