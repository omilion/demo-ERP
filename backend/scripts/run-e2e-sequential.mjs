import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testFiles = [
  'test/crm-cotizaciones-flujo.test.js',
  'test/cotizaciones-flow.test.js',
  'test/ventas.test.js',
  'test/pasar-taller.test.js',
  'test/despachos-flujo-integral.test.js',
  'test/despachos-traceability.test.js',
  'test/flujo-roles-e2e.test.js',
  'test/notificaciones-bodega-facturacion.test.js',
]

const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
// En estaciones donde C: está lleno, Vitest/esbuild no debe escribir sus
// temporales fuera del proyecto. `tmp/` ya está ignorado por Git.
const tempDir = resolve(process.cwd(), 'tmp')
await mkdir(tempDir, { recursive: true })

function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--env-file=.env.test.docker', vitest, 'run', file], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...process.env, TEMP: tempDir, TMP: tempDir, TMPDIR: tempDir },
    })
    child.on('error', reject)
    child.on('exit', code => code === 0
      ? resolve()
      : reject(new Error(`Falló ${file} (código ${code ?? 'desconocido'})`)))
  })
}

for (const file of testFiles) {
  console.log(`\n[E2E secuencial] ${file}`)
  await run(file)
}
