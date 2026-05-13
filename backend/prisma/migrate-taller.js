// One-time: import taller (ODTs) from MySQL dump
// node backend/prisma/migrate-taller.js [path-to-sql-file]

import { createReadStream, readFileSync } from 'fs'
import { createInterface } from 'readline'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
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

const SQL_FILE = process.argv[2] || resolve('D:/downloads/plastim2_plastimar2014.sql')
const BATCH = 200

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

function parseTuples(line) {
  const tuples = []
  let i = line.indexOf('VALUES ') !== -1 ? line.indexOf('VALUES ') + 7 : 0
  while (i < line.length) {
    while (i < line.length && line[i] !== '(') i++
    if (i >= line.length) break
    i++
    const values = []
    while (i < line.length) {
      while (i < line.length && line[i] === ' ') i++
      const ch = line[i]
      if (ch === ')') { i++; break }
      if (ch === ',') { i++; continue }
      if (ch === "'") {
        let s = ''; i++
        while (i < line.length) {
          const c = line[i]
          if (c === '\\') { i++; const e = line[i++]; s += e === 'n' ? '\n' : e === 'r' ? '\r' : e }
          else if (c === "'") { i++; if (line[i] === "'") { s += "'"; i++ } else break }
          else { s += c; i++ }
        }
        values.push(s)
      } else if (line.slice(i, i+4) === 'NULL') { values.push(null); i += 4 }
      else {
        let num = ''
        while (i < line.length && line[i] !== ',' && line[i] !== ')') num += line[i++]
        const f = parseFloat(num.trim()); values.push(isNaN(f) ? null : f)
      }
    }
    if (values.length > 0) tuples.push(values)
  }
  return tuples
}

async function parseTable(tableName) {
  const rows = []; let columns = null; let inTable = false
  const rl = createInterface({ input: createReadStream(SQL_FILE, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of rl) {
    const m = line.match(new RegExp(`^INSERT INTO \`${tableName}\` \\(([^)]+)\\) VALUES `))
    if (m) {
      inTable = true
      columns = m[1].split(',').map(c => c.trim().replace(/`/g, ''))
      for (const t of parseTuples(line)) rows.push(Object.fromEntries(columns.map((c, i) => [c, t[i] ?? null])))
      continue
    }
    if (inTable) {
      if (line.startsWith('(') || line.startsWith(' (')) {
        for (const t of parseTuples(line)) rows.push(Object.fromEntries(columns.map((c, i) => [c, t[i] ?? null])))
      } else if (line.startsWith('INSERT INTO') && !line.includes(`\`${tableName}\``)) inTable = false
    }
  }
  return rows
}

function str(v) { if (v === null || v === undefined) return null; const s = String(v).trim(); return s === '' ? null : s }
function intVal(v) { const n = parseInt(v, 10); return isNaN(n) ? 0 : n }

const ESTADO_MAP = { 'Listo': 'Terminada', 'Terminado': 'Terminada', 'Terminada': 'Terminada', 'En proceso': 'En proceso', 'En Proceso': 'En proceso', 'Pendiente': 'Pendiente' }
const PRIO_MAP = { 'Alta': 'alta', 'Normal': 'normal', 'Baja': 'normal', 'Urgente': 'urgente' }

function parseDate(v) {
  if (!v || v === '0000-00-00' || v === '0000-00-00 00:00:00') return null
  const d = new Date(v); return isNaN(d.getTime()) ? null : d
}

async function main() {
  console.log('=== Migración Taller → ODTs ===')
  console.log(`SQL: ${SQL_FILE}\n`)

  console.log('Parsing taller...')
  const rows = await parseTable('taller')
  console.log(`  ${rows.length} filas encontradas`)

  const batch = []
  let skipped = 0
  for (const r of rows) {
    if (intVal(r.eliminado) === 1) { skipped++; continue }
    const nInterno = r.n_interno ? `OT #${r.n_interno}` : null
    const obs = str(r.obs_general)
    const descripcion = [nInterno, obs].filter(Boolean).join(' — ') || 'Sin descripción'
    const estado = ESTADO_MAP[str(r.estado_general)] || 'Pendiente'
    const prioridad = PRIO_MAP[str(r.prioridad)] || 'normal'
    const createdAt = parseDate(r.fecha_ingreso) || new Date()
    const plazo = parseDate(r.fecha_termino)
    batch.push({ descripcion, estado, prioridad, createdAt, ...(plazo ? { plazo } : {}) })
  }

  console.log(`  ${batch.length} válidas, ${skipped} eliminadas omitidas`)

  let done = 0
  for (let i = 0; i < batch.length; i += BATCH) {
    await prisma.odt.createMany({ data: batch.slice(i, i + BATCH), skipDuplicates: false })
    done += Math.min(BATCH, batch.length - i)
    process.stdout.write(`\r  ODTs: ${done}/${batch.length}`)
  }
  console.log()

  const total = await prisma.odt.count()
  console.log(`\n✓ ODTs en DB: ${total}`)
}

main()
  .catch(e => { console.error('\n✗', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
