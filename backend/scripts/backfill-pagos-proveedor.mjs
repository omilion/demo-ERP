// Backfill proveedor_id en pagos_proveedores via legacy_id → rut → v2_id.
import { readFileSync, createReadStream } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'
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

const DUMP = 'D:/downloads/plastim2_plastimar2014.sql'
const normRut = s => (s || '').trim().toUpperCase().replace(/[.\-\s]/g, '')

function parseValues(text) {
  const rows = []
  let i = 0
  const n = text.length
  while (i < n) {
    if (text[i] !== '(') { i++; continue }
    i++
    const row = []
    let buf = ''
    let inStr = false
    let strCh = ''
    while (i < n) {
      const c = text[i]
      if (inStr) {
        if (c === '\\' && i + 1 < n) { buf += text[i + 1]; i += 2; continue }
        if (c === strCh) { inStr = false; i++; continue }
        buf += c; i++; continue
      }
      if (c === "'" || c === '"') { inStr = true; strCh = c; i++; continue }
      if (c === ',') { row.push(buf); buf = ''; i++; continue }
      if (c === ')') { row.push(buf); i++; rows.push(row); break }
      buf += c; i++
    }
  }
  return rows
}

async function readTableInserts(file, table) {
  const marker = `INSERT INTO \`${table}\` `
  const sections = []
  let collected = []
  let inside = false
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!inside && line.startsWith(marker)) {
      inside = true; collected = [line]
      if (line.trimEnd().endsWith(';')) { sections.push(collected.join('\n')); inside = false; collected = [] }
    } else if (inside) {
      collected.push(line)
      if (line.trimEnd().endsWith(';')) { sections.push(collected.join('\n')); inside = false; collected = [] }
    }
  }
  return sections.join('\n')
}

async function main() {
  console.log(`\n=== Backfill pagos.proveedor_id (${APPLY ? 'APLICANDO' : 'DRY RUN'}) ===\n`)

  // 1. Parse legacy proveedores: legacy_id → rut
  const raw = await readTableInserts(DUMP, 'proveedores')
  const cleaned = raw.replace(/INSERT INTO `proveedores`[^V]*VALUES\s*/g, '').replace(/;\s*$/g, '')
  const rows = parseValues(cleaned)
  console.log(`Legacy proveedores parseados: ${rows.length}`)
  const legacyIdToRut = new Map()
  for (const r of rows) {
    const id = parseInt(r[0], 10)
    const rut = r[2]
    if (id && rut) legacyIdToRut.set(id, normRut(rut))
  }
  console.log(`Map legacyId→rut: ${legacyIdToRut.size}`)

  // 2. v2 proveedores: rut → id
  const provs = await prisma.proveedor.findMany({ select: { id: true, rut: true } })
  const rutToV2Id = new Map()
  for (const p of provs) if (p.rut) rutToV2Id.set(normRut(p.rut), p.id)
  console.log(`V2 proveedores con rut: ${rutToV2Id.size}`)

  // 3. legacy_id → v2_id
  const legacyToV2 = new Map()
  for (const [legId, rut] of legacyIdToRut) {
    const v2 = rutToV2Id.get(rut)
    if (v2) legacyToV2.set(legId, v2)
  }
  console.log(`Map legacyId→v2Id: ${legacyToV2.size}`)

  // 4. pagos sin proveedor_id
  const pagos = await prisma.$queryRawUnsafe(
    `SELECT id, codigo_proveedor FROM catalogo.pagos_proveedores WHERE proveedor_id IS NULL AND codigo_proveedor IS NOT NULL`
  )
  console.log(`Pagos sin proveedor_id: ${pagos.length}`)

  const updates = []
  for (const p of pagos) {
    const v2 = legacyToV2.get(p.codigo_proveedor)
    if (v2) updates.push({ id: p.id, proveedorId: v2 })
  }
  console.log(`Cruces: ${updates.length}`)

  if (!APPLY) {
    console.log(`\n→ Re-ejecutar con --apply para escribir.`)
    return
  }
  const chunk = 500
  let done = 0
  for (let i = 0; i < updates.length; i += chunk) {
    const slice = updates.slice(i, i + chunk)
    await prisma.$transaction(slice.map(m =>
      prisma.$executeRawUnsafe(`UPDATE catalogo.pagos_proveedores SET proveedor_id = ${m.proveedorId} WHERE id = ${m.id}`)
    ))
    done += slice.length
    console.log(`  ${done}/${updates.length}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
