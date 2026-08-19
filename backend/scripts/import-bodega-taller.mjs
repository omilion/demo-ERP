/**
 * Migra la tabla legacy `bodega_taller` (MySQL, 1194 filas) hacia
 * catalogo.productos (bodega='Taller') en el v2. Nunca migrada: v2 solo
 * tenia 8 productos demo en bodega=Taller.
 *
 * Codigos que colisionan con un producto existente en bodega=Inventario
 * (mismo codigo_interno usado en ambas tablas legacy) se importan con
 * sufijo "-TALLER" para respetar el unique constraint de codigo_interno.
 * Codigos duplicados dentro del propio bodega_taller: se queda la fila de
 * mayor id (mas reciente).
 *
 * Dry-run:  node scripts/import-bodega-taller.mjs
 * Aplicar:  node scripts/import-bodega-taller.mjs --apply --confirm=IMPORT_BODEGA_TALLER
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const APPLY = process.argv.includes('--apply')
const CONFIRM = process.argv.find(a => a.startsWith('--confirm='))?.slice(10)
if (APPLY && CONFIRM !== 'IMPORT_BODEGA_TALLER') throw new Error('Falta --confirm=IMPORT_BODEGA_TALLER')

const text = v => String(v ?? '').trim()
const norm = v => text(v).toUpperCase()

const conn = await mysql.createConnection({ host: 'plastimar.cl', port: 3306, user: 'plastim2_diego', password: 'plastimar2014', database: 'plastim2_plastimar2014' })
async function q(sql) { const [rows] = await conn.query(sql); return rows }
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

try {
  const legacyRows = await q(`SELECT * FROM bodega_taller`)
  const legacyCats = await q(`SELECT id, nombre FROM categorias`)
  const legacyProvs = await q(`SELECT id, nombre FROM proveedores`)
  const legacyCatById = new Map(legacyCats.map(c => [c.id, text(c.nombre)]))
  const legacyProvById = new Map(legacyProvs.map(p => [p.id, text(p.nombre)]))

  // Dedupe: mismo codigo_interno repetido dentro de bodega_taller -> se queda el id mas alto.
  const byCode = new Map()
  for (const row of legacyRows) {
    const code = text(row.codigo_interno)
    if (!code) continue
    const prev = byCode.get(code)
    if (!prev || row.id > prev.id) byCode.set(code, row)
  }
  const dedupedRows = [...byCode.values()]
  console.log(`Filas legacy: ${legacyRows.length}, tras dedupe por codigo_interno: ${dedupedRows.length}`)

  const v2Categorias = await prisma.categoria.findMany({ select: { id: true, nombre: true } })
  const v2Proveedores = await prisma.proveedor.findMany({ select: { id: true, nombre: true } })
  const catByName = new Map(v2Categorias.map(c => [norm(c.nombre), c.id]))
  const provByName = new Map(v2Proveedores.map(p => [norm(p.nombre), p.id]))

  const existingCodes = new Set(
    (await prisma.producto.findMany({ select: { codigoInterno: true } })).map(p => norm(p.codigoInterno))
  )

  const toInsert = []
  const skippedNoCode = []
  let suffixed = 0
  for (const row of dedupedRows) {
    const code = text(row.codigo_interno)
    if (!code) { skippedNoCode.push(row.id); continue }
    let codigoInterno = code
    if (existingCodes.has(norm(code))) {
      codigoInterno = `${code}-TALLER`
      suffixed++
    }
    existingCodes.add(norm(codigoInterno))

    toInsert.push({
      codigoInterno,
      codigoBarra: text(row.codigo_barra) || null,
      nombre: text(row.nombre) || code,
      unidadMedida: text(row.unidad_medida) || null,
      stock: Number.isFinite(Number(row.stock)) ? Math.trunc(Number(row.stock)) : 0,
      stockCritico: Number.isFinite(Number(row.stock_critico)) ? Math.trunc(Number(row.stock_critico)) : 0,
      bodega: 'Taller',
      categoria: legacyCatById.get(row.categoria) || null,
      categoriaId: catByName.get(norm(legacyCatById.get(row.categoria))) || null,
      proveedor: legacyProvById.get(row.proveedor) || null,
      proveedorId: provByName.get(norm(legacyProvById.get(row.proveedor))) || null,
      precioLista: Number.isFinite(Number(row.precio1)) ? Number(row.precio1) : 0,
      activo: true,
    })
  }

  console.log(`A insertar: ${toInsert.length} (sufijo -TALLER aplicado a ${suffixed} por colision de codigo)`)
  console.log(`Sin codigo_interno (omitidos): ${skippedNoCode.length}`)
  console.log('Muestra:', toInsert.slice(0, 5))

  const demo = await prisma.producto.findMany({ where: { bodega: 'Taller' }, select: { id: true, codigoInterno: true } })
  console.log(`Productos demo actuales en bodega=Taller a reemplazar: ${demo.length}`, demo.map(d => d.codigoInterno))

  if (!APPLY) {
    console.log('\nDRY-RUN: nada se modifico. Para aplicar: --apply --confirm=IMPORT_BODEGA_TALLER')
    process.exit(0)
  }

  const demoIds = demo.map(d => d.id)
  await prisma.$transaction(async tx => {
    if (demoIds.length) await tx.producto.deleteMany({ where: { id: { in: demoIds } } })
    for (let i = 0; i < toInsert.length; i += 200) {
      await tx.producto.createMany({ data: toInsert.slice(i, i + 200) })
    }
  }, { timeout: 60000, maxWait: 15000 })

  console.log(`\nAplicado: ${demoIds.length} demo eliminados, ${toInsert.length} productos Taller insertados.`)
} finally {
  await conn.end()
  await prisma.$disconnect()
}
