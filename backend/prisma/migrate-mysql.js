// One-time migration script: MySQL (plastim2_plastimar2014) → PostgreSQL
// Run: node backend/prisma/migrate-mysql.js
// Requires DATABASE_URL in backend/.env pointing to the target DB

import { createReadStream, readFileSync } from 'fs'
import { createInterface } from 'readline'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env manually (no dotenv dep needed — just parse it)
try {
  const env = readFileSync(resolve(__dirname, '../.env'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const SQL_FILE = resolve('D:/downloads/plastim2_plastimar2014.sql')
const BATCH_SIZE = 200

// ─── SQL parser ──────────────────────────────────────────────────────────────

function parseTuples(line) {
  const tuples = []
  let i = 0

  // Skip to after VALUES keyword if present
  const vi = line.indexOf('VALUES ')
  if (vi !== -1) i = vi + 7

  while (i < line.length) {
    // Find start of next tuple
    while (i < line.length && line[i] !== '(') i++
    if (i >= line.length) break

    i++ // skip '('
    const values = []

    while (i < line.length) {
      // Skip spaces
      while (i < line.length && line[i] === ' ') i++
      if (i >= line.length) break

      const ch = line[i]

      if (ch === ')') { i++; break } // end of tuple
      if (ch === ',') { i++; continue } // next value

      if (ch === "'") {
        // String value
        let s = ''
        i++
        while (i < line.length) {
          const c = line[i]
          if (c === '\\') {
            i++
            const esc = line[i++]
            if (esc === 'n') s += '\n'
            else if (esc === 'r') s += '\r'
            else if (esc === 't') s += '\t'
            else s += esc
          } else if (c === "'") {
            i++
            if (line[i] === "'") { s += "'"; i++ } // escaped ''
            else break // end of string
          } else {
            s += c
            i++
          }
        }
        values.push(s)
      } else if (line.slice(i, i + 4) === 'NULL') {
        values.push(null)
        i += 4
      } else {
        // Number
        let num = ''
        while (i < line.length && line[i] !== ',' && line[i] !== ')') {
          num += line[i++]
        }
        const f = parseFloat(num.trim())
        values.push(isNaN(f) ? null : f)
      }
    }

    if (values.length > 0) tuples.push(values)
  }

  return tuples
}

// ─── Stream parser ────────────────────────────────────────────────────────────

async function parseTable(tableName) {
  const rows = []
  let columns = null
  let inTable = false

  const rl = createInterface({
    input: createReadStream(SQL_FILE, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    // Detect INSERT for our table
    const insertMatch = line.match(new RegExp(`^INSERT INTO \`${tableName}\` \\(([^)]+)\\) VALUES `))
    if (insertMatch) {
      inTable = true
      columns = insertMatch[1].split(',').map(c => c.trim().replace(/`/g, ''))
      // Parse first row (on same line as INSERT)
      const tuples = parseTuples(line)
      for (const t of tuples) rows.push(Object.fromEntries(columns.map((c, i) => [c, t[i] ?? null])))
      continue
    }

    if (inTable) {
      if (line.startsWith('(') || line.startsWith(' (')) {
        const tuples = parseTuples(line)
        for (const t of tuples) rows.push(Object.fromEntries(columns.map((c, i) => [c, t[i] ?? null])))
      } else if (line.startsWith('INSERT INTO') || line.startsWith('--') || line.startsWith('/*') || line === '') {
        // Next table or section — stop if we hit another INSERT for a different table
        if (!line.includes(`\`${tableName}\``)) inTable = false
      }
    }
  }

  return rows
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapBodega(estadoInventario) {
  if (!estadoInventario) return 'Inventario'
  const v = estadoInventario.toLowerCase()
  if (v === 'transitorio' || v.includes('taller')) return 'Taller'
  return 'Inventario'
}

function str(v, fallback = '') {
  if (v === null || v === undefined || v === 'NULL') return fallback || null
  const s = String(v).trim()
  return s === '' ? (fallback !== '' ? fallback : null) : s
}

function num(v, fallback = 0) {
  if (v === null || v === undefined) return fallback
  const n = parseFloat(v)
  return isNaN(n) ? fallback : n
}

function intVal(v, fallback = 0) {
  if (v === null || v === undefined) return fallback
  const n = parseInt(v, 10)
  return isNaN(n) ? fallback : n
}

// ─── Batch upsert helpers ─────────────────────────────────────────────────────

async function batchRun(items, fn, label) {
  let done = 0
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    await fn(batch)
    done += batch.length
    process.stdout.write(`\r  ${label}: ${done}/${items.length}`)
  }
  console.log()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Plastimar MySQL → PostgreSQL Migration ===\n')

  // ── 1. Categorias map ─────────────────────────────────────────────────────
  console.log('Parsing categorias...')
  const categoriasRows = await parseTable('categorias')
  const categoriaMap = {}
  for (const r of categoriasRows) {
    categoriaMap[r.id] = r.nombre
  }
  console.log(`  ${Object.keys(categoriaMap).length} categorías cargadas`)

  // ── 2. Productos ──────────────────────────────────────────────────────────
  console.log('\nParsing catalogo...')
  const catalogoRows = await parseTable('catalogo')
  console.log(`  ${catalogoRows.length} filas encontradas`)

  const productos = []
  const seenCodigos = new Set()
  for (const r of catalogoRows) {
    const codigo = str(r.codigo_interno)
    if (!codigo) continue
    const codigoClean = codigo.trim()
    if (!codigoClean || seenCodigos.has(codigoClean)) continue
    seenCodigos.add(codigoClean)

    productos.push({
      codigoInterno: codigoClean,
      nombre: str(r.nombre) || codigoClean,
      categoria: r.categoria ? (categoriaMap[r.categoria] || null) : null,
      bodega: mapBodega(r.estado_inventario),
      stock: intVal(r.stock),
      stockCritico: Math.max(0, intVal(r.stock_critico)),
      precioLista: num(r.precio1),
      precioMarco: num(r.precio_marco),
      codigoBarra: str(r.codigo_barra),
      visibleWeb: intVal(r.web) === 1,
      activo: true,
    })
  }

  console.log(`  ${productos.length} productos válidos`)
  await batchRun(productos, async (batch) => {
    for (const p of batch) {
      await prisma.producto.upsert({
        where: { codigoInterno: p.codigoInterno },
        create: p,
        update: p,
      })
    }
  }, 'Productos')

  // ── 3. Clientes ────────────────────────────────────────────────────────────
  console.log('\nParsing clientes...')
  const clientesRows = await parseTable('clientes')
  console.log(`  ${clientesRows.length} filas encontradas`)

  const clientesMap = {} // rut → DB id (populated after insert)
  const seenRuts = new Set()
  const clientes = []

  for (const r of clientesRows) {
    const rut = str(r.rut)
    if (!rut || seenRuts.has(rut)) continue
    seenRuts.add(rut)

    clientes.push({
      rut,
      nombre: str(r.nombre) || rut,
      email: str(r.email),
      telefono: str(r.fono1),
      ciudad: str(r.comuna),
      razonSocial: str(r.razon_social),
      activo: true,
    })
  }

  console.log(`  ${clientes.length} clientes únicos`)
  await batchRun(clientes, async (batch) => {
    for (const c of batch) {
      const saved = await prisma.cliente.upsert({
        where: { rut: c.rut },
        create: c,
        update: { nombre: c.nombre, email: c.email, telefono: c.telefono, ciudad: c.ciudad, razonSocial: c.razonSocial },
        select: { id: true, rut: true },
      })
      clientesMap[saved.rut] = saved.id
    }
  }, 'Clientes')

  // ── 4. Ordenes ─────────────────────────────────────────────────────────────
  console.log('\nParsing orden_compra_sistema...')
  const ordenesRows = await parseTable('orden_compra_sistema')
  console.log(`  ${ordenesRows.length} filas encontradas`)

  // Find admin user id
  const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } })
  if (!adminUser) throw new Error('No admin user found. Run seed first.')
  const adminId = adminUser.id

  const STATE_MAP = {
    'Activa': 'Activa',
    'Nula': 'Nula',
    'Completada': 'Completada',
    'En proceso': 'En proceso',
  }

  const PAGO_MAP = {
    'Pagada': 'Pagada',
    'No pagada': 'No pagada',
    'Parcial': 'Parcial',
  }

  const ENTREGA_MAP = {
    'Entregado': 'Entregado',
    'Pendiente entrega': 'Pendiente entrega',
    'En despacho': 'En despacho',
    'Parcial': 'Parcial',
  }

  let skippedDeleted = 0
  let skippedNoCliente = 0
  let importedOrdenes = 0

  const ordenesBatch = []
  for (const r of ordenesRows) {
    if (intVal(r.eliminada) === 1) { skippedDeleted++; continue }

    const rutCliente = str(r.rut_cliente)
    const clienteId = rutCliente ? (clientesMap[rutCliente] || null) : null
    if (rutCliente && !clienteId) { skippedNoCliente++; continue }

    const tipo = str(r.tipo) || 'Venta sala'
    const estado = STATE_MAP[str(r.estado)] || str(r.estado) || 'Activa'
    const estadoPago = PAGO_MAP[str(r.estado_pago)] || str(r.estado_pago) || 'No pagada'
    const estadoEntrega = ENTREGA_MAP[str(r.estado_entrega)] || str(r.estado_entrega) || 'Pendiente entrega'

    let createdAt = new Date()
    if (r.fecha_hora) {
      const d = new Date(r.fecha_hora)
      if (!isNaN(d.getTime())) createdAt = d
    }

    ordenesBatch.push({
      tipo,
      estado,
      estadoPago,
      estadoEntrega,
      clienteId,
      userId: adminId,
      creadorNombre: str(r.usuario),
      licitacion: str(r.id_licitacion),
      observaciones: str(r.obs),
      abono: 0,
      createdAt,
    })
  }

  console.log(`  ${ordenesBatch.length} ordenes válidas (omitidas: ${skippedDeleted} eliminadas, ${skippedNoCliente} sin cliente)`)
  await batchRun(ordenesBatch, async (batch) => {
    await prisma.orden.createMany({ data: batch, skipDuplicates: false })
    importedOrdenes += batch.length
  }, 'Ordenes')

  // ── 5. Taller / ODTs ──────────────────────────────────────────────────────
  console.log('\nParsing taller...')
  const tallerRows = await parseTable('taller')
  console.log(`  ${tallerRows.length} filas encontradas`)

  const ESTADO_ODT_MAP = {
    'Listo': 'Terminada',
    'Terminado': 'Terminada',
    'Terminada': 'Terminada',
    'En proceso': 'En proceso',
    'En Proceso': 'En proceso',
    'Pendiente': 'Pendiente',
  }
  const PRIORIDAD_MAP = {
    'Alta': 'alta',
    'Normal': 'normal',
    'Baja': 'normal',
    'Urgente': 'urgente',
  }

  const odtsBatch = []
  for (const r of tallerRows) {
    if (intVal(r.eliminado) === 1) continue

    const estadoRaw = str(r.estado_general) || 'Pendiente'
    const estado = ESTADO_ODT_MAP[estadoRaw] || 'Pendiente'
    const prioridad = PRIORIDAD_MAP[str(r.prioridad)] || 'normal'
    const nInterno = r.n_interno ? `OT #${r.n_interno}` : null
    const obs = str(r.obs_general)
    const descripcion = [nInterno, obs].filter(Boolean).join(' — ') || 'Sin descripción'

    let createdAt = new Date()
    if (r.fecha_ingreso && r.fecha_ingreso !== '0000-00-00' && r.fecha_ingreso !== '0000-00-00 00:00:00') {
      const d = new Date(r.fecha_ingreso)
      if (!isNaN(d.getTime())) createdAt = d
    }

    let plazo = null
    if (r.fecha_termino && r.fecha_termino !== '0000-00-00' && r.fecha_termino !== '0000-00-00 00:00:00') {
      const d = new Date(r.fecha_termino)
      if (!isNaN(d.getTime())) plazo = d
    }

    odtsBatch.push({
      descripcion,
      estado,
      prioridad,
      plazo: plazo || undefined,
      createdAt,
    })
  }

  console.log(`  ${odtsBatch.length} ODTs válidas`)
  await batchRun(odtsBatch, async (batch) => {
    await prisma.odt.createMany({ data: batch, skipDuplicates: false })
  }, 'ODTs')

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n=== Migración completada ===')
  const [pCount, cCount, oCount, odtCount] = await Promise.all([
    prisma.producto.count(),
    prisma.cliente.count(),
    prisma.orden.count(),
    prisma.odt.count(),
  ])
  console.log(`  Productos en DB: ${pCount}`)
  console.log(`  Clientes en DB:  ${cCount}`)
  console.log(`  Ordenes en DB:   ${oCount}`)
  console.log(`  ODTs en DB:      ${odtCount}`)
}

main()
  .catch(e => { console.error('\n✗ Error:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
