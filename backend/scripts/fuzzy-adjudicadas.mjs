// Fuzzy match para las 30 adjudicadas sin orden:
//   tokens compartidos entre licitacion.idLicitacion/ordenCompra y orden.licitacion
//   + mismo rutCliente
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

const tokenize = s => (s || '').toUpperCase().match(/[A-Z0-9]{3,}/g) || []

async function main() {
  console.log(`\n=== Fuzzy adjudicadas (${APPLY ? 'APLICANDO' : 'DRY RUN'}) ===\n`)
  const cots = await prisma.cotizacionLicitacion.findMany({
    where: { estado: 'Adjudicada', ordenId: null },
    select: { id: true, idLicitacion: true, ordenCompra: true, rutCliente: true },
  })
  console.log(`Adjudicadas sin orden: ${cots.length}`)

  const ordenes = await prisma.orden.findMany({
    where: { licitacion: { not: null } },
    select: { id: true, licitacion: true, rutCliente: true },
  })

  // Index orden tokens por rutCliente
  const byRut = new Map()
  for (const o of ordenes) {
    const r = (o.rutCliente || '').trim()
    if (!r) continue
    if (!byRut.has(r)) byRut.set(r, [])
    byRut.get(r).push({ id: o.id, tokens: new Set(tokenize(o.licitacion)) })
  }

  const matches = []
  const noMatch = []
  for (const c of cots) {
    const tks = new Set([...tokenize(c.idLicitacion), ...tokenize(c.ordenCompra)])
    const candidates = byRut.get(c.rutCliente) || []
    let best = null
    let bestScore = 0
    for (const cand of candidates) {
      let score = 0
      for (const t of tks) if (cand.tokens.has(t)) score++
      if (score > bestScore) { bestScore = score; best = cand }
    }
    if (best && bestScore >= 2) matches.push({ id: c.id, ordenId: best.id, score: bestScore })
    else noMatch.push({ id: c.id, idLic: c.idLicitacion, oc: c.ordenCompra, rut: c.rutCliente })
  }
  console.log(`Matches (score>=2): ${matches.length}`)
  console.log(`Sin match:`, noMatch.length)
  for (const m of matches) console.log(`  cot ${m.id} → orden ${m.ordenId} (score ${m.score})`)

  if (!APPLY) {
    console.log(`\n→ Re-ejecutar con --apply para escribir.`)
    return
  }
  for (const m of matches) {
    await prisma.cotizacionLicitacion.update({ where: { id: m.id }, data: { ordenId: m.ordenId } })
  }
  console.log(`✓ ${matches.length} actualizadas`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
