import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    forks: {
      execArgv: ['--max-old-space-size=4096'],
    },
    testTimeout: 30000,
    exclude: ['node_modules/**', 'dist/**'],
  },
});
