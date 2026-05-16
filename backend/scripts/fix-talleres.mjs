// Crear taller "madera" si no existe, y asignar OdtItems sin taller según heurística de texto.
// Usage:
//   node scripts/fix-talleres.mjs          → dry-run
//   node scripts/fix-talleres.mjs --apply  → ejecutar

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(resolve(__dirname, '../.env'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
const APPLY = process.argv.includes('--apply')

function bucket(it) {
  const txt = ((it.nombre || '') + ' ' + (it.obs || '')).toLowerCase()
  if (/madera|pino|melamin|mdf|tablero|mueble|escritori|repis|estante|silla|mesa|cajoner|locker|panel|puerta/.test(txt)) return 'madera'
  if (/confecc|tela|cortin|funda|saco|bolso|costur|cubre|sabana|mantel|deland|alfombra/.test(txt)) return 'confecciones'
  if (/espum|colch|cojin|relle|almohad|colchonet/.test(txt)) return 'espumas'
  if (/extern|terc|provee/.test(txt)) return 'externo'
  return null
}

async function main() {
  console.log(`\n=== Fix talleres (${APPLY ? 'APLICANDO' : 'DRY RUN'}) ===\n`)

  // 1. Asegurar talleres base
  for (const nombre of ['confecciones', 'espumas', 'externo', 'madera']) {
    const t = await prisma.taller.findUnique({ where: { nombre } })
    if (!t) {
      if (APPLY) await prisma.taller.create({ data: { nombre } })
      console.log(`  ${APPLY ? '✓ creado' : 'crearía'} taller "${nombre}"`)
    }
  }

  const talleres = await prisma.taller.findMany()
  const byNombre = Object.fromEntries(talleres.map(t => [t.nombre, t.id]))
  // si no se aplicó, simular id de madera
  if (!byNombre.madera) byNombre.madera = -1

  // 2. OdtItems sin asignación
  const items = await prisma.odtItem.findMany({ include: { talleres: true } })
  const sinTaller = items.filter(i => i.talleres.length === 0)
  const asignaciones = []
  const stats = { madera: 0, confecciones: 0, espumas: 0, externo: 0, otros: 0 }
  for (const it of sinTaller) {
    const b = bucket(it)
    if (!b) { stats.otros++; continue }
    stats[b]++
    asignaciones.push({ odtItemId: it.id, tallerId: byNombre[b] })
  }
  console.log(`\nOdtItems sin taller: ${sinTaller.length}`)
  console.log(`Asignaciones a crear:`, stats)

  if (!APPLY) {
    console.log(`\n→ Re-ejecutar con --apply para crear ${asignaciones.length} asignaciones.`)
    return
  }

  console.log(`\n--- APLICANDO ---`)
  let done = 0
  // createMany rápido, en chunks
  const chunk = 1000
  for (let i = 0; i < asignaciones.length; i += chunk) {
    const slice = asignaciones.slice(i, i + chunk)
    await prisma.odtItemTaller.createMany({ data: slice, skipDuplicates: true })
    done += slice.length
    if (done % 2000 === 0 || done === asignaciones.length) console.log(`  ${done}/${asignaciones.length}`)
  }
  console.log(`✓ ${done} asignaciones creadas.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
