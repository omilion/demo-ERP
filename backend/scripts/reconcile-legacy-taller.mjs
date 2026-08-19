/**
 * Reconciliacion legacy `taller` (MySQL) -> `taller.odts` (v2), usando
 * legacy_n_interno como clave estable (backfilleada via orden_id ->
 * ventas.ordenes.n_interno, ya que taller.n_interno == n_interno de la
 * venta que origino la OT en el 99.8% de los casos).
 *
 * Solo INSERTA las OTs de legacy que no existen en v2. Nunca actualiza
 * estado/prioridad de una OT existente (el staff puede haber avanzado el
 * flujo en v2 mas alla de lo que refleja legacy).
 *
 * Dry-run:  node scripts/reconcile-legacy-taller.mjs
 * Aplicar:  node scripts/reconcile-legacy-taller.mjs --apply --confirm=RECONCILE_TALLER
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const APPLY = process.argv.includes('--apply')
const CONFIRM = process.argv.find(a => a.startsWith('--confirm='))?.slice(10)
if (APPLY && CONFIRM !== 'RECONCILE_TALLER') throw new Error('Falta --confirm=RECONCILE_TALLER')

const text = v => String(v ?? '').trim()
const ESTADO_MAP = { 'Listo': 'Listo', 'Pendiente': 'Pendiente' }
const PRIO_MAP = { 'Alta': 'Alta', 'Media': 'Media', 'Baja': 'normal' }

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
  const legacyRows = (await q(`SELECT * FROM taller WHERE eliminado = 0`)).filter(r => Number(r.n_interno) > 0)
  console.log(`Legacy taller (no eliminadas, n_interno>0): ${legacyRows.length}`)

  const existing = await prisma.odt.findMany({ where: { legacyNInterno: { not: null } }, select: { legacyNInterno: true } })
  const existingSet = new Set(existing.map(o => o.legacyNInterno))
  console.log(`v2 odts con legacy_n_interno: ${existingSet.size}`)

  const ordenes = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } })
  const ordenIdByNInterno = new Map(ordenes.map(o => [o.nInterno, o.id]))

  const missing = []
  const blockedNoOrden = []
  for (const row of legacyRows) {
    const nInterno = Number(row.n_interno)
    if (existingSet.has(nInterno)) continue
    const ordenId = ordenIdByNInterno.get(nInterno)
    if (!ordenId) { blockedNoOrden.push(nInterno); continue }
    missing.push({
      legacyNInterno: nInterno,
      ordenId,
      sucursalId: 2,
      estado: ESTADO_MAP[text(row.estado_general)] || 'Pendiente',
      prioridad: PRIO_MAP[text(row.prioridad)] || 'normal',
      obsGeneral: text(row.obs_general) || null,
      createdAt: parseDate(row.fecha_ingreso) || new Date(),
      fechaIngreso: parseDate(row.fecha_ingreso),
      fechaInicio: parseDate(row.fecha_inicio),
      fechaTermino: parseDate(row.fecha_termino),
      eliminado: false,
    })
  }

  console.log(`\nOTs legacy faltantes en v2 (a insertar): ${missing.length}`)
  console.log(`Bloqueadas (n_interno legacy sin Orden correspondiente en v2): ${blockedNoOrden.length}`, blockedNoOrden.slice(0, 20))
  console.log('Muestra:', missing.slice(0, 5))
  const porEstado = {}
  for (const m of missing) porEstado[m.estado] = (porEstado[m.estado] || 0) + 1
  console.log('Por estado:', porEstado)

  if (!APPLY) {
    console.log('\nDRY-RUN: nada se modifico. Para aplicar: --apply --confirm=RECONCILE_TALLER')
    process.exit(0)
  }

  for (let i = 0; i < missing.length; i += 200) {
    await prisma.odt.createMany({ data: missing.slice(i, i + 200) })
  }
  console.log(`\nAplicado: ${missing.length} OTs insertadas.`)
} finally {
  await conn.end()
  await prisma.$disconnect()
}
