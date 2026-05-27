import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup-env.js'],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
})
