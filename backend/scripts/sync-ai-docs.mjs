import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = path.resolve(here, '../../docs/marcha-blanca')
const target = path.resolve(here, '../src/routes/ai/docs/marcha-blanca')

async function exists(value) {
  try { await stat(value); return true } catch { return false }
}

async function copyMarkdown(from, to) {
  await mkdir(to, { recursive: true })
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const sourcePath = path.join(from, entry.name)
    const targetPath = path.join(to, entry.name)
    if (entry.isDirectory()) await copyMarkdown(sourcePath, targetPath)
    else if (entry.isFile() && entry.name.endsWith('.md')) await cp(sourcePath, targetPath)
  }
}

if (await exists(source)) {
  await copyMarkdown(source, target)
  console.log(`[ai] Manuales de Marcha Blanca sincronizados en ${target}`)
} else if (await exists(target)) {
  console.log('[ai] Fuente externa no disponible; se conserva la copia empaquetada.')
} else {
  console.warn('[ai] No se encontró documentación de Marcha Blanca para sincronizar.')
}
