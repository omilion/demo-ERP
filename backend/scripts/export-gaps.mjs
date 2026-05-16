// Exporta a CSV todos los registros que no pudieron cruzarse automáticamente.
// Para revisión manual y cuadre.
// Usage: node scripts/export-gaps.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
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

const OUT = resolve(__dirname, '../gaps')
mkdirSync(OUT, { recursive: true })

function csvCell(v) {
  if (v == null) return ''
  let s = typeof v === 'object' ? (v instanceof Date ? v.toISOString() : JSON.stringify(v)) : String(v)
  s = s.replace(/"/g, '""').replace(/\r?\n/g, ' ')
  if (/[",;\n]/.test(s)) s = `"${s}"`
  return s
}
function toCsv(rows, cols) {
  const head = cols.join(',')
  const body = rows.map(r => cols.map(c => csvCell(r[c])).join(',')).join('\n')
  return head + '\n' + body
}
function bucket(it) {
  const txt = ((it.nombre || '') + ' ' + (it.obs || '')).toLowerCase()
  if (/madera|pino|melamin|mdf|tablero|mueble|escritori|repis|estante|silla|mesa|cajoner|locker|panel|puerta/.test(txt)) return 'madera'
  if (/confecc|tela|cortin|funda|saco|bolso|costur|cubre|sabana|mantel|deland|alfombra/.test(txt)) return 'confecciones'
  if (/espum|colch|cojin|relle|almohad|colchonet/.test(txt)) return 'espumas'
  if (/extern|terc|provee/.test(txt)) return 'externo'
  return null
}

async function main() {
  console.log(`Exportando gaps a ${OUT}\n`)

  // 1. OdtItems sin taller (los "otros" sin clasificación heurística)
  const items = await prisma.odtItem.findMany({
    include: { talleres: true, odt: { select: { id: true, ordenId: true, descripcion: true } } },
  })
  const sinTaller = items
    .filter(i => i.talleres.length === 0 && !bucket(i))
    .map(i => ({
      odtItemId: i.id,
      odtId: i.odtId,
      odtOrdenId: i.odt?.ordenId,
      odtDescripcion: i.odt?.descripcion,
      productoId: i.productoId,
      codigoInterno: i.codigoInterno,
      nombre: i.nombre,
      cantidad: i.cantidad,
      estado: i.estado,
      obs: i.obs,
    }))
  writeFileSync(
    resolve(OUT, 'odt_items_sin_taller.csv'),
    toCsv(sinTaller, ['odtItemId', 'odtId', 'odtOrdenId', 'odtDescripcion', 'productoId', 'codigoInterno', 'nombre', 'cantidad', 'estado', 'obs']),
  )
  console.log(`✓ odt_items_sin_taller.csv (${sinTaller.length} filas)`)

  // 2. ODTs sin ordenId
  const odts = await prisma.odt.findMany({
    where: { ordenId: null },
    select: { id: true, descripcion: true, estado: true, prioridad: true, plazo: true, createdAt: true },
  })
  writeFileSync(
    resolve(OUT, 'odts_sin_orden.csv'),
    toCsv(odts, ['id', 'descripcion', 'estado', 'prioridad', 'plazo', 'createdAt']),
  )
  console.log(`✓ odts_sin_orden.csv (${odts.length} filas)`)

  // 3. Despachos sin ordenId
  const desps = await prisma.despacho.findMany({
    where: { ordenId: null },
    select: { id: true, interno: true, fechaInterno: true, fechaEntrega: true, tipoDespacho: true, transporte: true, direccion: true, contacto: true, region: true, comuna: true, usuario: true },
  })
  writeFileSync(
    resolve(OUT, 'despachos_sin_orden.csv'),
    toCsv(desps, ['id', 'interno', 'fechaInterno', 'fechaEntrega', 'tipoDespacho', 'transporte', 'direccion', 'contacto', 'region', 'comuna', 'usuario']),
  )
  console.log(`✓ despachos_sin_orden.csv (${desps.length} filas)`)

  // 4. Guías sin ordenId
  const guias = await prisma.guiaDespacho.findMany({
    where: { ordenId: null },
    select: { id: true, nInterno: true, nGuia: true, fechaGuia: true, origen: true },
  })
  writeFileSync(
    resolve(OUT, 'guias_sin_orden.csv'),
    toCsv(guias, ['id', 'nInterno', 'nGuia', 'fechaGuia', 'origen']),
  )
  console.log(`✓ guias_sin_orden.csv (${guias.length} filas)`)

  // 5. Licitaciones con OC/idLicitacion no cruzable (excluyendo las sin referencia útil)
  const cots = await prisma.cotizacionLicitacion.findMany({
    where: { ordenId: null },
    select: { id: true, idLicitacion: true, ordenCompra: true, estado: true, rutCliente: true, referencia: true, fecha: true, plazo: true, usuario: true },
  })
  // separar: con OC/idLicitacion vs vacíos
  const conRef = cots.filter(c => (c.ordenCompra && c.ordenCompra.trim()) || (c.idLicitacion && c.idLicitacion.trim()))
  const sinRef = cots.filter(c => !((c.ordenCompra && c.ordenCompra.trim()) || (c.idLicitacion && c.idLicitacion.trim())))
  writeFileSync(
    resolve(OUT, 'licitaciones_con_ref_sin_orden.csv'),
    toCsv(conRef, ['id', 'idLicitacion', 'ordenCompra', 'estado', 'rutCliente', 'referencia', 'fecha', 'plazo', 'usuario']),
  )
  writeFileSync(
    resolve(OUT, 'licitaciones_sin_referencia.csv'),
    toCsv(sinRef, ['id', 'estado', 'rutCliente', 'referencia', 'fecha', 'plazo', 'usuario']),
  )
  console.log(`✓ licitaciones_con_ref_sin_orden.csv (${conRef.length} filas)`)
  console.log(`✓ licitaciones_sin_referencia.csv (${sinRef.length} filas)`)

  // 6. Resumen
  const resumen = [
    { archivo: 'odt_items_sin_taller.csv', filas: sinTaller.length, descripcion: 'OdtItems sin asignación de taller (no clasificables por texto)' },
    { archivo: 'odts_sin_orden.csv', filas: odts.length, descripcion: 'ODTs sin orden de venta vinculada' },
    { archivo: 'despachos_sin_orden.csv', filas: desps.length, descripcion: 'Despachos sin orden vinculada (apuntan a órdenes nunca migradas)' },
    { archivo: 'guias_sin_orden.csv', filas: guias.length, descripcion: 'Guías de despacho sin orden vinculada' },
    { archivo: 'licitaciones_con_ref_sin_orden.csv', filas: conRef.length, descripcion: 'Licitaciones con OC/idLicitacion pero sin Orden cruzable' },
    { archivo: 'licitaciones_sin_referencia.csv', filas: sinRef.length, descripcion: 'Licitaciones sin OC/idLicitacion (cotizaciones nunca adjudicadas)' },
  ]
  writeFileSync(resolve(OUT, 'README.csv'), toCsv(resumen, ['archivo', 'filas', 'descripcion']))
  console.log(`\n✓ README.csv generado`)
  console.log(`\nTotal: ${resumen.reduce((s, r) => s + r.filas, 0)} filas pendientes de cuadre`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
