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

async function main() {
  const talleres = await prisma.taller.findMany({ orderBy: { id: 'asc' } })
  console.log(`\nTalleres (${talleres.length}):`)
  for (const t of talleres) console.log(`  #${t.id} ${t.nombre} (activo:${t.activo})`)

  const totalOdtItems = await prisma.odtItem.count()
  const items = await prisma.odtItem.findMany({ include: { talleres: true } })
  const sinTaller = items.filter(i => i.talleres.length === 0)
  console.log(`\nOdtItems: ${totalOdtItems} total | ${sinTaller.length} sin asignación`)

  // categorize sinTaller by hint in nombre/obs
  const buckets = {}
  for (const it of sinTaller) {
    const txt = ((it.nombre || '') + ' ' + (it.obs || '')).toLowerCase()
    let bucket = 'otros'
    if (/madera|pino|melamin|mdf|tablero|mueble|escritori|repis|estante|silla|mesa/.test(txt)) bucket = 'madera'
    else if (/confecc|tela|cortin|funda|saco|bolso|costur/.test(txt)) bucket = 'confecciones'
    else if (/espum|colch|cojin|relle/.test(txt)) bucket = 'espumas'
    else if (/extern|terc|provee/.test(txt)) bucket = 'externo'
    buckets[bucket] = (buckets[bucket] || 0) + 1
  }
  console.log(`OdtItems sin taller por bucket:`, buckets)

  const despachos = await prisma.despacho.count()
  const guias = await prisma.guiaDespacho.count()
  console.log(`\nDespachos en DB: ${despachos}`)
  console.log(`GuiaDespacho en DB: ${guias}`)

  const cots = await prisma.cotizacionLicitacion.count()
  const cotsConOrden = await prisma.cotizacionLicitacion.count({ where: { ordenId: { not: null } } })
  console.log(`\nLicitaciones: ${cots} | con ordenId: ${cotsConOrden}`)

  const odts = await prisma.odt.count()
  const odtsConOrden = await prisma.odt.count({ where: { ordenId: { not: null } } })
  console.log(`ODTs: ${odts} | con ordenId: ${odtsConOrden}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
