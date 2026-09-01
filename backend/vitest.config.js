import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup-env.js'],
    // Las rutas de integración usan exclusivamente plastimar_test. setup-env
    // rechaza cualquier URL distinta para que una prueba nunca contamine dev.
    testTimeout: 15_000,
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
})
