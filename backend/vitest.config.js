import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup-env.js'],
    // Integration routes exercise the populated development database; keep
    // assertions strict while allowing slower aggregate queries to complete.
    testTimeout: 15_000,
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
})
