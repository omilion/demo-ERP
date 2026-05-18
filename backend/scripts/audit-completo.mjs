// Auditoría completa de integridad referencial y datos huérfanos.
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

const log = (label, val) => console.log(`  ${label.padEnd(60)} ${val}`)

async function main() {
  console.log(`\n═══ AUDITORÍA COMPLETA ═══\n`)

  // ── VENTAS / ORDENES ─────────────────────────────────────────────
  console.log(`▸ Ventas / Órdenes`)
  const totalOrd = await prisma.orden.count()
  const ordSinNI = await prisma.orden.count({ where: { nInterno: null } })
  const ordSinCli = await prisma.orden.count({ where: { AND: [{ clienteId: null }, { rutCliente: null }] } })
  const ordSinUser = await prisma.orden.count({ where: { userId: 0 } })
  log('Total ordenes', totalOrd)
  log('Ordenes sin nInterno', ordSinNI)
  log('Ordenes sin cliente (ni id ni rut)', ordSinCli)

  const ordItems = await prisma.ordenItem.count()
  log('OrdenItems totales', ordItems)
  const ordItemsSinProdRaw = await prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM ventas.orden_items WHERE NOT EXISTS (SELECT 1 FROM catalogo.productos p WHERE p.id = orden_items.producto_id)`)
  log('OrdenItems sin producto válido', ordItemsSinProdRaw[0]?.c ?? '?')

  // ── CAJA / PAGOS ─────────────────────────────────────────────────
  console.log(`\n▸ Caja / Pagos`)
  const mc = await prisma.movimientoCaja.count()
  const mcSinOrd = await prisma.movimientoCaja.count({ where: { ordenId: null } })
  log('MovimientosCaja totales', mc)
  log('MovimientosCaja sin ordenId', mcSinOrd)

  // ── COBRANZA ─────────────────────────────────────────────────────
  console.log(`\n▸ Cobranza`)
  const cobH = await prisma.cobranzaHistorico.count()
  log('CobranzaHistorico total', cobH)
  // Cruzar por relacion directa o por n_interno historico.
  try {
    const cobConVenta = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int as c
      FROM ventas.cobranza_historico ch
      WHERE EXISTS (
        SELECT 1
        FROM ventas.ordenes o
        WHERE o.id = ch.orden_id
           OR (ch.interno IS NOT NULL AND o.n_interno = ch.interno)
      )
    `)
    log('Cobranza con orden cruzable', cobConVenta[0]?.c ?? '?')
  } catch (e) { log('Cobranza cruce', 'n/a') }

  // ── ODT / TALLER ─────────────────────────────────────────────────
  console.log(`\n▸ Taller / ODT`)
  const odts = await prisma.odt.count()
  const odtsSinOrd = await prisma.odt.count({ where: { ordenId: null } })
  const odtItems = await prisma.odtItem.count()
  log('ODTs totales', odts)
  log('ODTs sin orden', odtsSinOrd)
  log('OdtItems totales', odtItems)

  // OdtItems sin asignación de taller
  const allItems = await prisma.odtItem.findMany({ include: { talleres: true } })
  const itemsSinTaller = allItems.filter(i => i.talleres.length === 0).length
  log('OdtItems sin taller', itemsSinTaller)

  // ── DESPACHOS / GUIAS ────────────────────────────────────────────
  console.log(`\n▸ Despachos / Guías`)
  const desp = await prisma.despacho.count()
  const despSinOrd = await prisma.despacho.count({ where: { ordenId: null } })
  const gui = await prisma.guiaDespacho.count()
  const guiSinOrd = await prisma.guiaDespacho.count({ where: { ordenId: null } })
  log('Despachos totales / sin orden', `${desp} / ${despSinOrd}`)
  log('Guías totales / sin orden', `${gui} / ${guiSinOrd}`)

  // ── LICITACIONES ─────────────────────────────────────────────────
  console.log(`\n▸ Licitaciones`)
  const cot = await prisma.cotizacionLicitacion.count()
  const cotConOrd = await prisma.cotizacionLicitacion.count({ where: { ordenId: { not: null } } })
  const cotAdj = await prisma.cotizacionLicitacion.count({ where: { estado: 'Adjudicada' } })
  const cotAdjSinOrd = await prisma.cotizacionLicitacion.count({ where: { AND: [{ estado: 'Adjudicada' }, { ordenId: null }] } })
  log('Cotizaciones totales', cot)
  log('Cotizaciones con ordenId', cotConOrd)
  log('Cotizaciones Adjudicadas', cotAdj)
  log('Cotizaciones Adjudicadas SIN orden ⚠', cotAdjSinOrd)
  const cotItems = await prisma.cotizacionLicitacionItem.count()
  log('CotizacionItems totales', cotItems)
  const cotItemsSinProdRaw = await prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM ventas.cotizacion_licitacion_items WHERE codigo_interno IS NULL OR trim(codigo_interno) = ''`)
  log('CotizacionItems sin código', cotItemsSinProdRaw[0]?.c ?? '?')

  // ── PRODUCTOS ────────────────────────────────────────────────────
  console.log(`\n▸ Productos / Catálogo`)
  const prods = await prisma.producto.count()
  log('Productos totales', prods)
  const prodsSinCodRaw = await prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM catalogo.productos WHERE codigo_interno IS NULL OR codigo_interno = ''`)
  log('Productos sin código interno', prodsSinCodRaw[0]?.c ?? '?')

  // ── CLIENTES ─────────────────────────────────────────────────────
  console.log(`\n▸ Clientes`)
  const cli = await prisma.cliente.count()
  log('Clientes totales', cli)
  const cliSinRutRaw = await prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM clientes.clientes WHERE rut IS NULL OR rut = ''`)
  log('Clientes sin RUT', cliSinRutRaw[0]?.c ?? '?')
  // duplicados por rut
  const dupRut = await prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM (SELECT rut FROM clientes.clientes WHERE rut IS NOT NULL GROUP BY rut HAVING count(*) > 1) x`)
  log('RUTs duplicados', dupRut[0]?.c ?? '?')

  // ── PROVEEDORES ──────────────────────────────────────────────────
  console.log(`\n▸ Proveedores / Pagos`)
  const prov = await prisma.proveedor.count()
  const pagP = await prisma.pagoProveedor.count()
  log('Proveedores', prov)
  log('PagosProveedor totales', pagP)
  const pagPSinProvRaw = await prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM catalogo.pagos_proveedores WHERE proveedor_id IS NULL`)
  log('PagosProveedor sin proveedorId', pagPSinProvRaw[0]?.c ?? '?')

  // ── BODEGA / STOCK ───────────────────────────────────────────────
  console.log(`\n▸ Bodega / Stock`)
  try {
    const stockMov = await prisma.movimientoStock?.count?.() ?? '?'
    log('Movimientos stock', stockMov)
  } catch { log('Movimientos stock', 'n/a') }
  try {
    const ingresos = await prisma.stockIngreso?.count?.() ?? '?'
    log('Ingresos stock', ingresos)
  } catch { log('Ingresos stock', 'n/a') }

  // ── USUARIOS / ACCESOS ───────────────────────────────────────────
  console.log(`\n▸ Usuarios / Accesos`)
  const usr = await prisma.user.count()
  log('Usuarios', usr)
  const ord_no_user = await prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM ventas.ordenes o WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = o.user_id)`)
  log('Ordenes con userId inexistente', ord_no_user[0]?.c ?? '?')

  console.log(`\n═══════════════════════════\n`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
