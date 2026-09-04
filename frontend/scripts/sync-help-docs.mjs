import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../../docs/marcha-blanca')
const target = resolve(here, '../public/ayuda')

if (!existsSync(source)) {
  console.warn('[ayuda] No se encontró docs/marcha-blanca; se conserva la copia incluida en frontend/public/ayuda.')
  process.exit(0)
}

mkdirSync(target, { recursive: true })
cpSync(source, target, { recursive: true, force: true })
console.log(`[ayuda] Documentación sincronizada en ${target}`)
