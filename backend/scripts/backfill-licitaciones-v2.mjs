// Backfill ordenId en CotizacionLicitacion usando match flexible:
//   - idLicitacion ↔ orden.licitacion
//   - ordenCompra  ↔ orden.licitacion
//   - misma licitacion + mismo rutCliente como tiebreaker
// Usage:
//   node scripts/backfill-licitaciones-v2.mjs           → dry-run
//   node scripts/backfill-licitaciones-v2.mjs --apply

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

const norm = s => (s || '').trim().toUpperCase().replace(/\s+/g, '')

async function main() {
  console.log(`\n=== Backfill licitaciones v2 (${APPLY ? 'APLICANDO' : 'DRY RUN'}) ===\n`)

  const ordenes = await prisma.orden.findMany({
    where: { licitacion: { not: null } },
    select: { id: true, licitacion: true, rutCliente: true, createdAt: true },
  })
  const ordsConLic = ordenes.filter(o => o.licitacion && o.licitacion.trim())
  console.log(`Órdenes con licitacion: ${ordsConLic.length}`)

  // index: key → [ordenes]
  const byKey = new Map()
  for (const o of ordsConLic) {
    const k = norm(o.licitacion)
    if (!k) continue
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(o)
  }
  console.log(`Claves únicas de licitacion: ${byKey.size}`)

  const cots = await prisma.cotizacionLicitacion.findMany({
    where: { ordenId: null },
    select: { id: true, idLicitacion: true, ordenCompra: true, rutCliente: true, fecha: true },
  })
  console.log(`Cotizaciones sin ordenId: ${cots.length}`)

  const matches = []
  const ambiguous = []
  let triedIdLic = 0, triedOC = 0
  for (const c of cots) {
    const k1 = norm(c.idLicitacion)
    const k2 = norm(c.ordenCompra)
    let candidatos = []
    if (k1 && byKey.has(k1)) { candidatos = byKey.get(k1); triedIdLic++ }
    else if (k2 && byKey.has(k2)) { candidatos = byKey.get(k2); triedOC++ }
    if (candidatos.length === 0) continue
    // si hay varias, preferir misma rutCliente
    let pick = candidatos[0]
    if (candidatos.length > 1 && c.rutCliente) {
      const same = candidatos.find(o => o.rutCliente === c.rutCliente)
      if (same) pick = same
      else ambiguous.push({ cotId: c.id, idLicitacion: c.idLicitacion, ordenCompra: c.ordenCompra, n: candidatos.length })
    }
    matches.push({ id: c.id, ordenId: pick.id })
  }
  console.log(`Cruces encontrados: ${matches.length} (idLic: ${triedIdLic}, OC: ${triedOC})`)
  console.log(`Ambiguos (varias orden mismo key, no pude desempatar): ${ambiguous.length}`)

  if (!APPLY) {
    console.log(`\n→ Re-ejecutar con --apply para escribir.`)
    return
  }
  console.log(`\n--- APLICANDO ---`)
  const chunk = 500
  let done = 0
  for (let i = 0; i < matches.length; i += chunk) {
    const slice = matches.slice(i, i + chunk)
    await prisma.$transaction(slice.map(m =>
      prisma.cotizacionLicitacion.update({ where: { id: m.id }, data: { ordenId: m.ordenId } })
    ))
    done += slice.length
    console.log(`  ${done}/${matches.length}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
