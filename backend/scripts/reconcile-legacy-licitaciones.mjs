/**
 * Reconciliacion legacy `cotizacion_licitacion` (MySQL) -> v2
 * `ventas.cotizacion_licitacion`, usando id_licitacion (codigo tipo
 * "2583-641-COT26") como clave de cruce.
 *
 * Insert-only: nunca pisa una cotizacion existente en v2.
 * Resuelve clienteId... en realidad este modelo no tiene clienteId FK,
 * solo rutCliente (texto) - se copia tal cual, igual que legacy.
 *
 * Dry-run:  node scripts/reconcile-legacy-licitaciones.mjs
 * Aplicar:  node scripts/reconcile-legacy-licitaciones.mjs --apply --confirm=RECONCILE_LICITACIONES
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const APPLY = process.argv.includes('--apply')
const CONFIRM = process.argv.find(a => a.startsWith('--confirm='))?.slice(10)
if (APPLY && CONFIRM !== 'RECONCILE_LICITACIONES') throw new Error('Falta --confirm=RECONCILE_LICITACIONES')

const text = v => String(v ?? '').trim()

function parseDate(v) {
  if (!v) return null
  const d = new Date(v)
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return null
  return d
}

const conn = await mysql.createConnection({ host: 'plastimar.cl', port: 3306, user: 'plastim2_diego', password: 'plastimar2014', database: 'plastim2_plastimar2014' })
async function q(sql) { const [rows] = await conn.query(sql); return rows }
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

try {
  const legacyRows = await q(`SELECT * FROM cotizacion_licitacion WHERE id_licitacion IS NOT NULL AND id_licitacion <> ''`)
  console.log(`Legacy filas: ${legacyRows.length}`)

  const byCode = new Map()
  for (const r of legacyRows) {
    const prev = byCode.get(r.id_licitacion)
    if (!prev || r.id > prev.id) byCode.set(r.id_licitacion, r)
  }
  console.log(`Tras dedupe por id_licitacion: ${byCode.size}`)

  const v2Codes = await prisma.$queryRaw`SELECT id_licitacion AS "idLicitacion" FROM ventas.cotizacion_licitacion`
  const v2Set = new Set(v2Codes.map(r => r.idLicitacion))
  console.log(`v2 filas: ${v2Codes.length}`)

  const orderByNInterno = new Map(
    (await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } }))
      .map(o => [o.nInterno, o.id])
  )

  const toInsert = []
  for (const row of byCode.values()) {
    if (v2Set.has(row.id_licitacion)) continue
    const ordenCompraText = text(row.orden_compra)
    const nInternoRef = Number(ordenCompraText)
    const ordenId = Number.isFinite(nInternoRef) && nInternoRef > 0 ? (orderByNInterno.get(nInternoRef) || null) : null

    toInsert.push({
      idLicitacion: row.id_licitacion,
      fecha: parseDate(row.fecha),
      fechaCreacion: parseDate(row.fecha_creacion) || new Date(),
      usuario: text(row.usuario) || null,
      estado: text(row.estado) || 'Pendiente',
      rutCliente: text(row.rut_cliente) || null,
      obs: text(row.obs) || null,
      plazo: text(row.plazo) || null,
      ordenCompra: ordenCompraText || null,
      ordenId,
      sucursalId: 2,
    })
  }

  console.log(`\nA insertar: ${toInsert.length}`)
  const porEstado = {}
  for (const t of toInsert) porEstado[t.estado] = (porEstado[t.estado] || 0) + 1
  console.log('por estado:', porEstado)
  console.log('muestra:', toInsert.slice(0, 5))

  if (!APPLY) {
    console.log('\nDRY-RUN: nada se modifico. Para aplicar: --apply --confirm=RECONCILE_LICITACIONES')
    process.exit(0)
  }

  let created = 0
  for (let i = 0; i < toInsert.length; i += 300) {
    await prisma.cotizacionLicitacion.createMany({ data: toInsert.slice(i, i + 300) })
    created += Math.min(300, toInsert.length - i)
    process.stdout.write(`\r  ${created}/${toInsert.length}`)
  }
  console.log(`\nAplicado: ${created} cotizaciones/licitaciones insertadas.`)
} finally {
  await conn.end()
  await prisma.$disconnect()
}
