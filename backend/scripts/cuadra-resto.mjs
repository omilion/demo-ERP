// Cuadra residuos: despachos.ordenId via interno→n_interno,
//                  guias.ordenId via nInterno,
//                  historial_email.ordenId via n_compra (timestamp legacy) → cotizacion.fecha
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

async function main() {
  console.log(`\n=== Cuadra residuos (${APPLY ? 'APLICANDO' : 'DRY RUN'}) ===\n`)

  const ords = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } })
  const niToId = new Map(ords.map(o => [o.nInterno, o.id]))

  // Despachos sin ordenId
  const desp = await prisma.despacho.findMany({ where: { ordenId: null, interno: { not: null } }, select: { id: true, interno: true } })
  let dMatch = 0
  for (const d of desp) {
    const ni = parseInt(d.interno, 10)
    const id = Number.isFinite(ni) ? niToId.get(ni) : null
    if (id) {
      if (APPLY) await prisma.despacho.update({ where: { id: d.id }, data: { ordenId: id } })
      dMatch++
    }
  }
  console.log(`Despachos: ${desp.length} sin ordenId → ${dMatch} cruces`)

  // Guías sin ordenId
  const gui = await prisma.guiaDespacho.findMany({ where: { ordenId: null, nInterno: { not: null } }, select: { id: true, nInterno: true } })
  let gMatch = 0
  for (const g of gui) {
    const id = niToId.get(g.nInterno)
    if (id) {
      if (APPLY) await prisma.guiaDespacho.update({ where: { id: g.id }, data: { ordenId: id } })
      gMatch++
    }
  }
  console.log(`Guías: ${gui.length} sin ordenId → ${gMatch} cruces`)

  // historial_email: n_compra timestamp legacy → cotizacion.fecha matching
  const hist = await prisma.historialEmail.findMany({ where: { ordenId: null, nCompra: { not: null } }, select: { id: true, nCompra: true } })
  console.log(`HistorialEmail sin ordenId: ${hist.length} — n_compra es timestamp, cuadre vía cotizacion no implementado (legacy data antiguo)`)

  // Multas sin ordenId
  const multas = await prisma.multa.findMany({ where: { ordenId: null, interno: { not: null } }, select: { id: true, interno: true } })
  let mMatch = 0
  for (const m of multas) {
    const ni = parseInt(m.interno, 10)
    const id = Number.isFinite(ni) ? niToId.get(ni) : null
    if (id) {
      if (APPLY) await prisma.multa.update({ where: { id: m.id }, data: { ordenId: id } })
      mMatch++
    }
  }
  console.log(`Multas: ${multas.length} sin ordenId → ${mMatch} cruces`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
