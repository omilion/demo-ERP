// Limpia mov_caja.orden_id que apunta a orden inexistente.
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
  console.log(`\n=== Fix mov_caja huérfanos (${APPLY ? 'APLICANDO' : 'DRY RUN'}) ===\n`)

  const huerfanos = await prisma.$queryRawUnsafe(`
    SELECT m.id, m.orden_id, m.tipo, m.monto, m.fecha, m.usuario, m.referencia
    FROM caja.movimientos_caja m
    WHERE m.orden_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ventas.ordenes o WHERE o.id = m.orden_id)
    ORDER BY m.id
  `)
  console.log(`Huérfanos: ${huerfanos.length}`)
  for (const h of huerfanos.slice(0, 10)) {
    console.log(`  mov_id=${h.id} orden_id=${h.orden_id} tipo=${h.tipo} monto=${h.monto} fecha=${h.fecha} ref=${(h.referencia || '').slice(0, 40)}`)
  }
  if (huerfanos.length > 10) console.log(`  ... +${huerfanos.length - 10} más`)

  // Reintento via n_interno si el orden_id parece ser un n_interno
  const ords = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } })
  const niToId = new Map(ords.map(o => [o.nInterno, o.id]))

  let reasigned = 0
  let setNull = 0
  const updates = []
  for (const h of huerfanos) {
    const maybeNi = niToId.get(h.orden_id)
    if (maybeNi && maybeNi !== h.orden_id) {
      updates.push({ id: h.id, ordenId: maybeNi, action: 'reasigned' })
      reasigned++
    } else {
      updates.push({ id: h.id, ordenId: null, action: 'setNull' })
      setNull++
    }
  }
  console.log(`\nPlan: ${reasigned} reasignados via n_interno → id, ${setNull} a NULL`)

  if (!APPLY) {
    console.log(`\n→ Re-ejecutar con --apply para escribir.`)
    return
  }
  for (const u of updates) {
    if (u.action === 'reasigned') {
      await prisma.$executeRawUnsafe(`UPDATE caja.movimientos_caja SET orden_id = ${u.ordenId} WHERE id = ${u.id}`)
    } else {
      await prisma.$executeRawUnsafe(`UPDATE caja.movimientos_caja SET orden_id = NULL WHERE id = ${u.id}`)
    }
  }
  console.log(`✓ Aplicado`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
