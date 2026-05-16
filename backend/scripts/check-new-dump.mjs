// Detecta deltas en el dump del 13-may-2026 vs v2 actual.
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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

// Format new: INSERT INTO `T` (cols) VALUES\n(row),\n(row);
async function* scanTable(file, table) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  let active = false
  const startRe = new RegExp(`^INSERT INTO \`${table}\` `)
  for await (const line of rl) {
    if (startRe.test(line)) { active = true; continue }
    if (active) {
      if (/^\(/.test(line)) {
        yield line
        if (line.trimEnd().endsWith(';')) active = false
      } else {
        active = false
      }
    }
  }
}

async function maxInDump(file, table, idCol = 0) {
  let max = 0
  for await (const line of scanTable(file, table)) {
    const m = line.match(/^\((\d+),/)
    if (m) { const v = parseInt(m[1]); if (v > max) max = v }
  }
  return max
}

async function main() {
  const newDump = 'D:/downloads/plastim2_plastimar2014 (1).sql'
  console.log('Analizando dump nuevo...\n')

  // Cruce real: cuáles legacy n_interno NO están en v2
  const v2Ords = await prisma.orden.findMany({ select: { nInterno: true } })
  const v2NIs = new Set(v2Ords.map(o => o.nInterno).filter(x => x != null))
  let totalLegacy = 0, eliminLegacy = 0, missing = 0
  const missingNis = []
  for await (const line of scanTable(newDump, 'orden_compra_sistema')) {
    totalLegacy++
    const m = line.match(/^\((\d+),\s*(\d+),/)
    if (!m) continue
    const ni = parseInt(m[2])
    if (line.includes(", 'si', ")) { eliminLegacy++; continue }
    if (!v2NIs.has(ni)) { missing++; if (missingNis.length < 10) missingNis.push(`ni=${ni} ${line.slice(0, 130)}`) }
  }
  console.log(`orden_compra_sistema:`)
  console.log(`  total rows en dump nuevo: ${totalLegacy}`)
  console.log(`  eliminadas marcadas: ${eliminLegacy}`)
  console.log(`  v2 ordenes con nInterno: ${v2NIs.size}`)
  console.log(`  legacy nInterno NO en v2: ${missing}`)
  missingNis.forEach(s => console.log(`    ${s}`))
  const ocsMax = 0
  const v2Max = await prisma.orden.aggregate({ _max: { id: true, nInterno: true } })
  console.log(`orden_compra_sistema:`)
  console.log(`  legacy max id: ${ocsMax}`)
  console.log(`  v2 max Orden.nInterno: ${v2Max._max.nInterno}`)
  console.log(`  v2 max Orden.id: ${v2Max._max.id}`)

  const guiMax = await maxInDump(newDump, 'guias_despachos')
  const v2Gui = await prisma.guiaDespacho.aggregate({ _count: true })
  console.log(`\nguias_despachos:`)
  console.log(`  legacy max id: ${guiMax}`)
  console.log(`  v2 count: ${v2Gui._count}`)

  const cobMax = await maxInDump(newDump, 'historico_cobranza')
  const v2Cob = await prisma.cobranzaHistorico.aggregate({ _count: true })
  console.log(`\nhistorico_cobranza:`)
  console.log(`  legacy max id: ${cobMax}`)
  console.log(`  v2 count: ${v2Cob._count}`)

  const cliMax = await maxInDump(newDump, 'clientes')
  const v2Cli = await prisma.cliente.aggregate({ _count: true })
  console.log(`\nclientes:`)
  console.log(`  legacy max id: ${cliMax}`)
  console.log(`  v2 count: ${v2Cli._count}`)
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect())
