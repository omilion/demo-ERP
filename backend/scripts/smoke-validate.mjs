// Validación integridad datos v2: counts, FKs huérfanas, integridad referencial.
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

const fmt = n => String(n).padStart(7)
const fmtP = (a, b) => b ? `${((a / b) * 100).toFixed(1)}%` : '0%'

async function q(sql) {
  const r = await prisma.$queryRawUnsafe(sql)
  return Number(r[0]?.c || 0)
}

async function main() {
  console.log(`\n=== Smoke validation v2 ===\n`)

  // 1. Counts por módulo
  console.log(`--- Volumen por módulo ---`)
  const tables = [
    ['auth.users', 'usuarios'],
    ['auth.sucursales', 'sucursales'],
    ['clientes.clientes', 'clientes'],
    ['clientes.regiones', 'regiones'],
    ['clientes.comunas', 'comunas'],
    ['catalogo.productos', 'productos'],
    ['catalogo.proveedores', 'proveedores'],
    ['catalogo.pagos_proveedores', 'pagos_proveedor'],
    ['catalogo.categorias', 'categorias'],
    ['catalogo.subcategorias', 'subcategorias'],
    ['ventas.ordenes', 'ordenes'],
    ['ventas.orden_items', 'orden_items'],
    ['ventas.cotizacion_licitacion', 'cotiz_licitacion'],
    ['ventas.crm_registros', 'crm_registros'],
    ['ventas.multas', 'multas'],
    ['ventas.descuentos_marco', 'descuentos_marco'],
    ['ventas.historial_email', 'historial_email'],
    ['taller.odts', 'odts'],
    ['taller.odt_items', 'odt_items'],
    ['taller.bitacora_taller', 'bitacora_taller'],
    ['bodega.despachos', 'despachos'],
    ['bodega.guias_despachos', 'guias'],
    ['caja.movimientos_caja', 'mov_caja'],
    ['ventas.cobranza_historico', 'cobranza'],
  ]
  for (const [t, label] of tables) {
    try {
      const c = await q(`SELECT count(*)::int as c FROM ${t}`)
      console.log(`  ${label.padEnd(22)} ${fmt(c)}`)
    } catch (e) {
      console.log(`  ${label.padEnd(22)} ERROR ${e.message.slice(0, 40)}`)
    }
  }

  // 2. FKs huérfanas (no NULL pero apuntan a id inexistente)
  console.log(`\n--- FKs huérfanas (apuntan a id inexistente) ---`)
  const fkChecks = [
    ['ordenes.cliente_id → clientes', `SELECT count(*)::int as c FROM ventas.ordenes o WHERE o.cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clientes.clientes c WHERE c.id = o.cliente_id)`],
    ['orden_items.orden_id → ordenes', `SELECT count(*)::int as c FROM ventas.orden_items i WHERE NOT EXISTS (SELECT 1 FROM ventas.ordenes o WHERE o.id = i.orden_id)`],
    ['odts.orden_id → ordenes', `SELECT count(*)::int as c FROM taller.odts d WHERE d.orden_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas.ordenes o WHERE o.id = d.orden_id)`],
    ['odt_items.odt_id → odts', `SELECT count(*)::int as c FROM taller.odt_items i WHERE NOT EXISTS (SELECT 1 FROM taller.odts d WHERE d.id = i.odt_id)`],
    ['despachos.orden_id → ordenes', `SELECT count(*)::int as c FROM bodega.despachos d WHERE d.orden_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas.ordenes o WHERE o.id = d.orden_id)`],
    ['guias.orden_id → ordenes', `SELECT count(*)::int as c FROM bodega.guias_despachos g WHERE g.orden_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas.ordenes o WHERE o.id = g.orden_id)`],
    ['mov_caja.orden_id → ordenes', `SELECT count(*)::int as c FROM caja.movimientos_caja m WHERE m.orden_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas.ordenes o WHERE o.id = m.orden_id)`],
    ['cobranza.orden_id → ordenes', `SELECT count(*)::int as c FROM ventas.cobranza_historico h WHERE h.orden_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas.ordenes o WHERE o.id = h.orden_id)`],
    ['pagos_prov.proveedor_id → proveedores', `SELECT count(*)::int as c FROM catalogo.pagos_proveedores p WHERE p.proveedor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalogo.proveedores v WHERE v.id = p.proveedor_id)`],
    ['cotiz_licitacion.orden_id → ordenes', `SELECT count(*)::int as c FROM ventas.cotizacion_licitacion c WHERE c.orden_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas.ordenes o WHERE o.id = c.orden_id)`],
    ['descuentos_marco.orden_id → ordenes', `SELECT count(*)::int as c FROM ventas.descuentos_marco d WHERE NOT EXISTS (SELECT 1 FROM ventas.ordenes o WHERE o.id = d.orden_id)`],
    ['multas.orden_id → ordenes', `SELECT count(*)::int as c FROM ventas.multas m WHERE m.orden_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas.ordenes o WHERE o.id = m.orden_id)`],
    ['bitacora_taller.odt_id → odts', `SELECT count(*)::int as c FROM taller.bitacora_taller b WHERE b.odt_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taller.odts d WHERE d.id = b.odt_id)`],
  ]
  let anyOrphan = false
  for (const [label, sql] of fkChecks) {
    try {
      const c = await q(sql)
      const status = c === 0 ? '✓' : '⚠ HUÉRFANAS'
      if (c > 0) anyOrphan = true
      console.log(`  ${label.padEnd(40)} ${fmt(c)}  ${status}`)
    } catch (e) {
      console.log(`  ${label.padEnd(40)} ERROR ${e.message.slice(0, 50)}`)
    }
  }
  console.log(anyOrphan ? `\n⚠ Hay FKs huérfanas — investigar` : `\n✓ Integridad referencial OK`)

  // 3. Cobertura cuadre crítica
  console.log(`\n--- Cobertura cuadre crítica ---`)
  const ordCount = await q(`SELECT count(*)::int as c FROM ventas.ordenes`)
  const ordSinCliente = await q(`SELECT count(*)::int as c FROM ventas.ordenes WHERE cliente_id IS NULL`)
  const ordSinNi = await q(`SELECT count(*)::int as c FROM ventas.ordenes WHERE n_interno IS NULL`)
  const despConOrd = await q(`SELECT count(*)::int as c FROM bodega.despachos WHERE orden_id IS NOT NULL`)
  const despTotal = await q(`SELECT count(*)::int as c FROM bodega.despachos`)
  const guiConOrd = await q(`SELECT count(*)::int as c FROM bodega.guias_despachos WHERE orden_id IS NOT NULL`)
  const guiTotal = await q(`SELECT count(*)::int as c FROM bodega.guias_despachos`)
  const cobConOrd = await q(`SELECT count(*)::int as c FROM ventas.cobranza_historico WHERE orden_id IS NOT NULL`)
  const cobTotal = await q(`SELECT count(*)::int as c FROM ventas.cobranza_historico`)
  const pagoConProv = await q(`SELECT count(*)::int as c FROM catalogo.pagos_proveedores WHERE proveedor_id IS NOT NULL`)
  const pagoTotal = await q(`SELECT count(*)::int as c FROM catalogo.pagos_proveedores`)
  console.log(`  ordenes con cliente_id            ${fmt(ordCount - ordSinCliente)}/${fmt(ordCount)}  ${fmtP(ordCount - ordSinCliente, ordCount)}`)
  console.log(`  ordenes con n_interno             ${fmt(ordCount - ordSinNi)}/${fmt(ordCount)}  ${fmtP(ordCount - ordSinNi, ordCount)}`)
  console.log(`  despachos con orden               ${fmt(despConOrd)}/${fmt(despTotal)}  ${fmtP(despConOrd, despTotal)}`)
  console.log(`  guías con orden                   ${fmt(guiConOrd)}/${fmt(guiTotal)}  ${fmtP(guiConOrd, guiTotal)}`)
  console.log(`  cobranzas con orden               ${fmt(cobConOrd)}/${fmt(cobTotal)}  ${fmtP(cobConOrd, cobTotal)}`)
  console.log(`  pagos_prov con proveedor          ${fmt(pagoConProv)}/${fmt(pagoTotal)}  ${fmtP(pagoConProv, pagoTotal)}`)

  // 4. Productos con duplicado / sin código
  console.log(`\n--- Sanity productos/clientes ---`)
  const prodSinCod = await q(`SELECT count(*)::int as c FROM catalogo.productos WHERE codigo_interno IS NULL OR codigo_interno = ''`)
  const cliSinRut = await q(`SELECT count(*)::int as c FROM clientes.clientes WHERE rut IS NULL OR rut = ''`)
  console.log(`  productos sin codigo_interno      ${fmt(prodSinCod)}`)
  console.log(`  clientes sin rut                  ${fmt(cliSinRut)}`)

  // 5. Sequences (next id alineado con max)
  console.log(`\n--- Sequences vs MAX(id) ---`)
  const seqs = [
    ['ventas.ordenes', 'id'],
    ['ventas.orden_items', 'id'],
    ['taller.odts', 'id'],
    ['catalogo.productos', 'id'],
    ['clientes.clientes', 'id'],
    ['bodega.despachos', 'id'],
    ['bodega.guias_despachos', 'id'],
  ]
  for (const [t, col] of seqs) {
    try {
      const r = await prisma.$queryRawUnsafe(`SELECT (SELECT last_value FROM ${t}_${col}_seq) as seq, (SELECT max(${col}) FROM ${t}) as maxid`)
      const seq = Number(r[0].seq), maxid = Number(r[0].maxid || 0)
      const ok = seq >= maxid
      console.log(`  ${t.padEnd(30)} seq=${fmt(seq)} max=${fmt(maxid)}  ${ok ? '✓' : '⚠ ALINEAR'}`)
    } catch (e) {
      console.log(`  ${t.padEnd(30)} ERROR ${e.message.slice(0, 40)}`)
    }
  }

  console.log(`\n=== Fin validación ===\n`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
