/**
 * Completa items + clasificacion por taller (Confecciones/Espumas/Externo)
 * para las OTs migradas desde legacy que quedaron sin `OdtItem`/`OdtItemTaller`
 * (legacy_n_interno seteado pero 0 items — la migracion original y el
 * reconcile de anoche solo crearon la cabecera de la OT).
 *
 * Fuente: legacy `productos_taller` (flags taller_confecciones/taller_espumas/
 * taller_externo por item). NOTA: legacy no tiene columna "madera" real — el
 * boton "OT TALLER MADERA" del dashboard legacy en realidad consulta
 * taller_externo (bug de esa UI). Acá se clasifica honesto como "externo"
 * (tallerId real en taller.talleres), no se replica el bug.
 *
 * Dry-run:  node scripts/reconcile-legacy-taller-items.mjs
 * Aplicar:  node scripts/reconcile-legacy-taller-items.mjs --apply --confirm=RECONCILE_TALLER_ITEMS
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const APPLY = process.argv.includes('--apply')
const CONFIRM = process.argv.find(a => a.startsWith('--confirm='))?.slice(10)
if (APPLY && CONFIRM !== 'RECONCILE_TALLER_ITEMS') throw new Error('Falta --confirm=RECONCILE_TALLER_ITEMS')

const text = v => String(v ?? '').trim()
const norm = v => text(v).toUpperCase()
const ESTADO_ITEM_MAP = { 'Listo': 'Listo' }
const ESTADO_SUB_MAP = { 'Listo': 'listo' }

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
  const targetOdts = await prisma.$queryRaw`
    SELECT o.id, o.legacy_n_interno AS "legacyNInterno"
    FROM taller.odts o
    WHERE o.legacy_n_interno IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM taller.odt_items i WHERE i.odt_id = o.id)
  `
  console.log(`OTs con legacy_n_interno y 0 items: ${targetOdts.length}`)
  const nInternos = targetOdts.map(o => o.legacyNInterno)

  const legacyItems = nInternos.length
    ? await q(`SELECT * FROM productos_taller WHERE eliminado = 0 AND n_interno IN (${nInternos.join(',')})`)
    : []
  console.log(`Filas legacy productos_taller para esas OTs: ${legacyItems.length}`)

  const talleres = await prisma.taller.findMany({ select: { id: true, nombre: true } })
  const tallerIdByNombre = new Map(talleres.map(t => [norm(t.nombre), t.id]))
  const confeId = tallerIdByNombre.get('CONFECCIONES')
  const espumaId = tallerIdByNombre.get('ESPUMAS')
  const externoId = tallerIdByNombre.get('EXTERNO')

  const productos = await prisma.producto.findMany({ select: { id: true, codigoInterno: true } })
  const productoIdByCode = new Map(productos.map(p => [norm(p.codigoInterno), p.id]))

  const odtIdByNInterno = new Map(targetOdts.map(o => [o.legacyNInterno, o.id]))

  const itemsToCreate = []
  const unmatchedCodes = []
  let subCount = 0
  for (const row of legacyItems) {
    const odtId = odtIdByNInterno.get(Number(row.n_interno))
    if (!odtId) continue
    const codigo = text(row.codigo_interno)
    const productoId = productoIdByCode.get(norm(codigo))
    if (!productoId) { unmatchedCodes.push(codigo); continue }

    const subtalleres = []
    if (text(row.taller_confecciones) && confeId) subtalleres.push({ tallerId: confeId, estado: ESTADO_SUB_MAP[text(row.estado_confecciones)] || 'pendiente', obs: text(row.obs_confecciones) || null, fechaListo: parseDate(row.fecha_listo) })
    if (text(row.taller_espumas) && espumaId) subtalleres.push({ tallerId: espumaId, estado: ESTADO_SUB_MAP[text(row.estado_espumas)] || 'pendiente', obs: text(row.obs_espumas) || null, fechaListo: parseDate(row.fecha_listo_espuma) })
    if (text(row.taller_externo) && externoId) subtalleres.push({ tallerId: externoId, estado: ESTADO_SUB_MAP[text(row.estado_externo)] || 'pendiente', obs: text(row.obs_externo) || null, fechaListo: null })
    subCount += subtalleres.length

    itemsToCreate.push({
      odtId,
      productoId,
      codigoInterno: codigo || null,
      nombre: text(row.nombre) || null,
      obs: text(row.obs) || null,
      estado: ESTADO_ITEM_MAP[text(row.estado)] || 'Pendiente',
      cantidad: Number.isFinite(Number(row.cant)) ? Math.trunc(Number(row.cant)) || 1 : 1,
      fechaListo: parseDate(row.fecha_listo),
      usuario: text(row.usuario_listo_confe) || null,
      subtalleres,
    })
  }

  console.log(`\nOdtItem a crear: ${itemsToCreate.length}`)
  console.log(`OdtItemTaller a crear: ${subCount}`)
  console.log(`Codigos sin match en catalogo.productos (omitidos): ${unmatchedCodes.length}`)
  console.log('muestra sin match:', [...new Set(unmatchedCodes)].slice(0, 20))
  console.log('muestra item:', itemsToCreate.slice(0, 3))

  if (!APPLY) {
    console.log('\nDRY-RUN: nada se modifico. Para aplicar: --apply --confirm=RECONCILE_TALLER_ITEMS')
    process.exit(0)
  }

  let created = 0
  for (const item of itemsToCreate) {
    const { subtalleres, ...itemData } = item
    const createdItem = await prisma.odtItem.create({ data: itemData })
    if (subtalleres.length) {
      await prisma.odtItemTaller.createMany({ data: subtalleres.map(s => ({ odtItemId: createdItem.id, ...s })) })
    }
    created++
    if (created % 500 === 0) process.stdout.write(`\r  ${created}/${itemsToCreate.length}`)
  }
  console.log(`\nAplicado: ${created} OdtItem creados (con sus OdtItemTaller).`)
} finally {
  await conn.end()
  await prisma.$disconnect()
}
