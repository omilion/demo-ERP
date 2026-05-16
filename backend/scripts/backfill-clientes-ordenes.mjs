// Match Orden.clienteId via rutCliente cuando esté ausente.
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

const normRut = s => (s || '').trim().toUpperCase().replace(/[.\-\s]/g, '')

async function main() {
  console.log(`\n=== Backfill clienteId en Ordenes (${APPLY ? 'APLICANDO' : 'DRY RUN'}) ===\n`)

  const clientes = await prisma.cliente.findMany({ select: { id: true, rut: true } })
  const byRut = new Map()
  for (const c of clientes) {
    if (!c.rut) continue
    const k = normRut(c.rut)
    if (!byRut.has(k)) byRut.set(k, c.id)
  }
  console.log(`Clientes indexados por RUT: ${byRut.size}`)

  const ords = await prisma.orden.findMany({
    where: { clienteId: null, rutCliente: { not: null } },
    select: { id: true, rutCliente: true },
  })
  console.log(`Ordenes sin clienteId pero con rutCliente: ${ords.length}`)

  const matches = []
  for (const o of ords) {
    const k = normRut(o.rutCliente)
    if (k && byRut.has(k)) matches.push({ id: o.id, clienteId: byRut.get(k) })
  }
  console.log(`Cruces: ${matches.length}`)

  if (!APPLY) {
    console.log(`\n→ Re-ejecutar con --apply para escribir.`)
    return
  }
  const chunk = 500
  let done = 0
  for (let i = 0; i < matches.length; i += chunk) {
    const slice = matches.slice(i, i + chunk)
    await prisma.$transaction(slice.map(m =>
      prisma.orden.update({ where: { id: m.id }, data: { clienteId: m.clienteId } })
    ))
    done += slice.length
    console.log(`  ${done}/${matches.length}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
