// Backfill ordenId using the legacy operational number.
//
// Legacy rule confirmed with the client:
//   ODT number == venta n_interno
//
// Usage:
//   node backend/scripts/backfill-nInterno.mjs
//   node backend/scripts/backfill-nInterno.mjs --apply
//   node backend/scripts/backfill-nInterno.mjs --apply --repair-conflicts

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

try {
  const env = readFileSync(resolve(__dirname, '../.env'), 'utf8')
  for (const line of env.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {
  // The script can also be run with DATABASE_URL already exported.
}

const APPLY = process.argv.includes('--apply')
const REPAIR_CONFLICTS = process.argv.includes('--repair-conflicts')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required. Set it in backend/.env or the shell environment.')
  process.exit(1)
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const OT_RE = /\bOT\s*#?\s*(\d{2,})\b/i
const NUM_RE = /\b(\d{2,})\b/

function extractLegacyOdtNumber(odt) {
  const text = odt.descripcion || ''
  const explicit = OT_RE.exec(text)
  if (explicit) return { value: Number.parseInt(explicit[1], 10), source: 'descripcion:OT' }

  const loose = NUM_RE.exec(text)
  if (loose) return { value: Number.parseInt(loose[1], 10), source: 'descripcion:numero' }

  return { value: odt.id, source: 'odt.id' }
}

function sameOrden(ordenId, expectedOrdenId) {
  return Number(ordenId || 0) === Number(expectedOrdenId || 0)
}

async function buildOdtMatches(byNInterno) {
  const odts = await prisma.odt.findMany({
    select: { id: true, ordenId: true, descripcion: true },
    orderBy: { id: 'asc' },
  })

  const matches = []
  const alreadyOk = []
  const conflicts = []
  const missingOrden = []

  for (const odt of odts) {
    const legacy = extractLegacyOdtNumber(odt)
    const orden = byNInterno.get(legacy.value)
    if (!orden) {
      missingOrden.push({ odtId: odt.id, legacyOdt: legacy.value, source: legacy.source, ordenIdActual: odt.ordenId })
      continue
    }

    const candidate = {
      odtId: odt.id,
      legacyOdt: legacy.value,
      source: legacy.source,
      ordenId: orden.id,
      ordenNInterno: orden.nInterno,
      ordenIdActual: odt.ordenId,
    }

    if (!odt.ordenId) matches.push(candidate)
    else if (sameOrden(odt.ordenId, orden.id)) alreadyOk.push(candidate)
    else conflicts.push(candidate)
  }

  return { odts, matches, alreadyOk, conflicts, missingOrden }
}

async function buildDespachoMatches(byNInterno) {
  const desps = await prisma.despacho.findMany({ select: { id: true, ordenId: true, interno: true } })
  const matches = []
  const missingOrden = []
  for (const d of desps.filter(d => d.ordenId == null)) {
    const raw = String(d.interno || '')
    const match = OT_RE.exec(raw) || NUM_RE.exec(raw)
    if (!match) continue
    const nInterno = Number.parseInt(match[1], 10)
    const orden = byNInterno.get(nInterno)
    if (orden) matches.push({ id: d.id, ordenId: orden.id, nInterno })
    else missingOrden.push({ id: d.id, nInterno })
  }
  return { total: desps.length, matches, missingOrden }
}

async function buildGuiaMatches(byNInterno) {
  const guias = await prisma.guiaDespacho.findMany({ select: { id: true, ordenId: true, nInterno: true } })
  const candidates = guias.filter(g => g.ordenId == null && g.nInterno != null)
  const matches = []
  const missingOrden = []
  for (const g of candidates) {
    const orden = byNInterno.get(g.nInterno)
    if (orden) matches.push({ id: g.id, ordenId: orden.id, nInterno: g.nInterno })
    else missingOrden.push({ id: g.id, nInterno: g.nInterno })
  }
  return { total: guias.length, candidates: candidates.length, matches, missingOrden }
}

async function buildCotizacionMatches(ordenes) {
  const cots = await prisma.cotizacionLicitacion.findMany({
    select: { id: true, idLicitacion: true, ordenCompra: true, ordenId: true },
  })
  const byLicitacion = new Map()
  for (const orden of ordenes) {
    if (orden.licitacion) byLicitacion.set(orden.licitacion.trim().toUpperCase(), orden.id)
  }

  const matches = []
  let cruzables = 0
  for (const cot of cots) {
    const key = (cot.ordenCompra || cot.idLicitacion || '').trim().toUpperCase()
    const ordenId = key ? byLicitacion.get(key) : null
    if (ordenId) cruzables += 1
    if (!cot.ordenId && ordenId) matches.push({ id: cot.id, ordenId })
  }
  return { total: cots.length, cruzables, matches }
}

function sample(list, count = 10) {
  return list.slice(0, count).map(row => JSON.stringify(row)).join('\n')
}

async function main() {
  console.log(`\n=== Backfill legacy ODT/n_interno -> ordenId (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`)
  if (REPAIR_CONFLICTS) console.log('Conflict repair enabled: existing ODT ordenId mismatches will be overwritten.\n')

  const ordenes = await prisma.orden.findMany({
    where: { nInterno: { not: null } },
    select: { id: true, nInterno: true, licitacion: true },
  })
  const byNInterno = new Map(ordenes.map(orden => [orden.nInterno, orden]))
  console.log(`Ordenes con n_interno: ${ordenes.length}`)

  const odt = await buildOdtMatches(byNInterno)
  const despacho = await buildDespachoMatches(byNInterno)
  const guia = await buildGuiaMatches(byNInterno)
  const cotizacion = await buildCotizacionMatches(ordenes)

  console.log(`\nODTs: ${odt.odts.length} total`)
  console.log(`  ya correctas: ${odt.alreadyOk.length}`)
  console.log(`  para backfill: ${odt.matches.length}`)
  console.log(`  conflictos: ${odt.conflicts.length}`)
  console.log(`  sin orden por n_interno: ${odt.missingOrden.length}`)

  if (odt.conflicts.length) {
    console.log('\nMuestra conflictos ODT:')
    console.log(sample(odt.conflicts))
  }
  if (odt.matches.length) {
    console.log('\nMuestra ODT backfill:')
    console.log(sample(odt.matches))
  }

  console.log(`\nDespachos: ${despacho.total} total | ${despacho.matches.length} para backfill | ${despacho.missingOrden.length} sin match`)
  console.log(`Guias: ${guia.total} total | ${guia.candidates} candidatas | ${guia.matches.length} para backfill | ${guia.missingOrden.length} sin match`)
  console.log(`Licitaciones: ${cotizacion.total} total | ${cotizacion.cruzables} cruzables | ${cotizacion.matches.length} para backfill`)

  const conflictRepairs = REPAIR_CONFLICTS ? odt.conflicts : []
  const totalWrites = odt.matches.length + conflictRepairs.length + despacho.matches.length + guia.matches.length + cotizacion.matches.length

  if (!APPLY) {
    console.log(`\nDry-run listo. Reejecutar con --apply para escribir ${totalWrites} cambios.`)
    if (odt.conflicts.length) console.log('Para reparar conflictos existentes agregar tambien --repair-conflicts.')
    return
  }

  await prisma.$transaction(async tx => {
    for (const match of odt.matches) {
      await tx.odt.update({ where: { id: match.odtId }, data: { ordenId: match.ordenId } })
    }
    for (const match of conflictRepairs) {
      await tx.odt.update({ where: { id: match.odtId }, data: { ordenId: match.ordenId } })
    }
    for (const match of despacho.matches) {
      await tx.despacho.update({ where: { id: match.id }, data: { ordenId: match.ordenId } })
    }
    for (const match of guia.matches) {
      await tx.guiaDespacho.update({ where: { id: match.id }, data: { ordenId: match.ordenId } })
    }
    for (const match of cotizacion.matches) {
      await tx.cotizacionLicitacion.update({ where: { id: match.id }, data: { ordenId: match.ordenId } })
    }
  }, { timeout: 120000 })

  console.log(`\nAplicado:`)
  console.log(`  ODTs backfill: ${odt.matches.length}`)
  console.log(`  ODTs conflictos reparados: ${conflictRepairs.length}`)
  console.log(`  Despachos: ${despacho.matches.length}`)
  console.log(`  Guias: ${guia.matches.length}`)
  console.log(`  Licitaciones: ${cotizacion.matches.length}`)
}

main()
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
