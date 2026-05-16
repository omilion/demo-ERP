// Backfill ordenId via nInterno match on ODTs, Despachos, GuiaDespacho, CotizacionLicitacion.
// Usage:
//   node scripts/backfill-nInterno.mjs           → diagnóstico (read-only)
//   node scripts/backfill-nInterno.mjs --apply   → ejecuta backfill

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

const OT_RE = /OT\s*#?\s*(\d+)/i
const NUM_RE = /(\d{2,})/

function extractNInterno(text) {
  if (!text) return null
  const m = OT_RE.exec(text) || NUM_RE.exec(text)
  return m ? parseInt(m[1], 10) : null
}

async function main() {
  console.log(`\n=== Backfill nInterno → ordenId  (${APPLY ? 'APLICANDO' : 'DRY RUN'}) ===\n`)

  // Cache Orden.nInterno → id
  const ordenes = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true, licitacion: true } })
  const byNInterno = new Map(ordenes.map(o => [o.nInterno, o.id]))
  console.log(`Órdenes con nInterno: ${ordenes.length}`)

  // ── ODTs ──────────────────────────────────────────────────────────────
  const odts = await prisma.odt.findMany({ select: { id: true, ordenId: true, descripcion: true } })
  const odtNull = odts.filter(o => o.ordenId == null)
  const odtMatch = []
  const odtConflict = []
  for (const o of odtNull) {
    const n = extractNInterno(o.descripcion)
    if (!n) continue
    const ordenId = byNInterno.get(n)
    if (ordenId) odtMatch.push({ id: o.id, ordenId, nInterno: n })
    else odtConflict.push({ id: o.id, nInterno: n })
  }
  console.log(`\nODTs: ${odts.length} total | ${odtNull.length} sin ordenId | ${odtMatch.length} cruzan por nInterno | ${odtConflict.length} con nInterno sin match`)

  // ── Despachos ─────────────────────────────────────────────────────────
  const desps = await prisma.despacho.findMany({ select: { id: true, ordenId: true, interno: true } })
  const dNull = desps.filter(d => d.ordenId == null)
  const dMatch = []
  const dConflict = []
  for (const d of dNull) {
    const n = extractNInterno(d.interno)
    if (!n) continue
    const ordenId = byNInterno.get(n)
    if (ordenId) dMatch.push({ id: d.id, ordenId, nInterno: n })
    else dConflict.push({ id: d.id, nInterno: n })
  }
  console.log(`Despachos: ${desps.length} total | ${dNull.length} sin ordenId | ${dMatch.length} cruzan | ${dConflict.length} sin match`)

  // ── GuiaDespacho ──────────────────────────────────────────────────────
  const guias = await prisma.guiaDespacho.findMany({ select: { id: true, ordenId: true, nInterno: true } })
  const gNull = guias.filter(g => g.ordenId == null && g.nInterno != null)
  const gMatch = gNull.map(g => ({ id: g.id, ordenId: byNInterno.get(g.nInterno), nInterno: g.nInterno })).filter(g => g.ordenId)
  const gConflict = gNull.length - gMatch.length
  console.log(`Guías: ${guias.length} total | ${gNull.length} sin ordenId con nInterno | ${gMatch.length} cruzan | ${gConflict} sin match`)

  // ── CotizacionLicitacion ──────────────────────────────────────────────
  const cots = await prisma.cotizacionLicitacion.findMany({ select: { id: true, idLicitacion: true, ordenCompra: true, ordenId: true } })
  const ordByLic = new Map()
  for (const o of ordenes) {
    if (o.licitacion) ordByLic.set(o.licitacion.trim().toUpperCase(), o.id)
  }
  let cotCruzan = 0
  for (const c of cots) {
    const key = (c.ordenCompra || c.idLicitacion || '').trim().toUpperCase()
    if (key && ordByLic.has(key)) cotCruzan++
  }
  const cotMatches = []
  for (const c of cots) {
    if (c.ordenId != null) continue
    const key = (c.ordenCompra || c.idLicitacion || '').trim().toUpperCase()
    if (key && ordByLic.has(key)) cotMatches.push({ id: c.id, ordenId: ordByLic.get(key) })
  }
  console.log(`Licitaciones: ${cots.length} total | ${cotCruzan} con Orden cruzable | ${cotMatches.length} para backfillear (FK ordenId)`)

  if (!APPLY) {
    console.log(`\n→ Re-ejecutar con --apply para escribir los ${odtMatch.length + dMatch.length + gMatch.length} cruces.`)
    return
  }

  // ── APPLY ─────────────────────────────────────────────────────────────
  console.log(`\n--- APLICANDO BACKFILL ---`)
  await prisma.$transaction(async (tx) => {
    for (const m of odtMatch) await tx.odt.update({ where: { id: m.id }, data: { ordenId: m.ordenId } })
    for (const m of dMatch) await tx.despacho.update({ where: { id: m.id }, data: { ordenId: m.ordenId } })
    for (const m of gMatch) await tx.guiaDespacho.update({ where: { id: m.id }, data: { ordenId: m.ordenId } })
    for (const m of cotMatches) await tx.cotizacionLicitacion.update({ where: { id: m.id }, data: { ordenId: m.ordenId } })
  })
  console.log(`✓ ODTs actualizadas: ${odtMatch.length}`)
  console.log(`✓ Despachos actualizados: ${dMatch.length}`)
  console.log(`✓ Guías actualizadas: ${gMatch.length}`)
  console.log(`✓ Licitaciones actualizadas: ${cotMatches.length}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
