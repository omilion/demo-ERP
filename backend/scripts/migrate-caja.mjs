// Migra el histórico de movimientos de caja desde el dump SQL legacy (tabla `caja`)
// al modelo nuevo caja.movimientos_caja.
//
// Usage:
//   node scripts/migrate-caja.mjs                       → dry-run (no escribe)
//   node scripts/migrate-caja.mjs --apply               → ejecuta
//   node scripts/migrate-caja.mjs --sql=<ruta> --apply  → ruta de dump explícita
//
// Mapeo legacy → nuevo:
//   ingreso>0 / egreso>0 (columnas separadas)  →  tipo ('ingreso'|'egreso') + monto único
//   n_interno  → ordenId (vía Orden.nInterno; null si no hay match)
//   sucursal   → sucursalId
//   fecha_hora → fecha ; fecham → fecham ; user → userMod
//
// Idempotente: detecta una corrida previa por el rango de `fecha` ya presente y
// aborta si ya hay movimientos legacy importados (para no duplicar).

import { readFileSync, createReadStream } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(resolve(__dirname, '../.env'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    // No pisar variables ya presentes en el entorno (p.ej. DATABASE_URL via túnel).
    if (m && process.env[m[1].trim()] === undefined) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch {}

const sqlArg = process.argv.find(a => a.startsWith('--sql='))
const SQL_PATH = sqlArg
  ? sqlArg.slice('--sql='.length)
  : 'C:/Users/flipe/Downloads/plastim2_plastimar2014.sql/plastim2_plastimar2014.sql'
const APPLY = process.argv.includes('--apply')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// Lee todas las secciones INSERT INTO `tabla` (multilínea) y las concatena.
async function readInsertSection(table) {
  const rl = readline.createInterface({ input: createReadStream(SQL_PATH, { encoding: 'utf8' }) })
  const marker = `INSERT INTO \`${table}\``
  const sections = []
  let collected = []
  let inside = false
  for await (const line of rl) {
    if (!inside && line.startsWith(marker)) {
      inside = true
      collected = [line]
      if (line.trimEnd().endsWith(';')) { sections.push(collected.join('\n')); inside = false; collected = [] }
    } else if (inside) {
      collected.push(line)
      if (line.trimEnd().endsWith(';')) { sections.push(collected.join('\n')); inside = false; collected = [] }
    }
  }
  rl.close()
  return sections.join('\n')
}

function parseRows(insertText) {
  const text = insertText
    .replace(/INSERT INTO `[^`]+`\s*\([^)]*\)\s*VALUES\s*/g, ',')
    .replace(/;\s*/g, ',')
  const rows = []
  let i = 0
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i])) i++
    if (text[i] !== '(') break
    i++
    const row = []
    let cur = ''
    let inStr = false
    let started = false
    while (i < text.length) {
      const c = text[i]
      if (inStr) {
        if (c === '\\' && i + 1 < text.length) { cur += text[i + 1]; i += 2; continue }
        if (c === "'") { inStr = false; i++; continue }
        cur += c; i++
      } else {
        if (c === "'") { inStr = true; started = true; i++; continue }
        if (c === ',') { row.push(started ? cur : (cur.trim() === 'NULL' ? null : cur.trim())); cur = ''; started = false; i++; continue }
        if (c === ')') { row.push(started ? cur : (cur.trim() === 'NULL' ? null : cur.trim())); i++; break }
        cur += c; i++
      }
    }
    rows.push(row)
  }
  return rows
}

const num = v => v == null || v === '' ? null : Number(v)
const str = v => v == null || v === '' ? null : String(v)
const dat = v => {
  if (!v || v === '0000-00-00' || v === '0000-00-00 00:00:00') return null
  const d = new Date(String(v).replace(' ', 'T'))
  return isNaN(d) ? null : d
}
const bool = v => v == 1 || v === '1'

// Columnas de la tabla legacy `caja` (en orden del INSERT):
// 0 id, 1 n_interno, 2 sucursal, 3 ingreso, 4 egreso, 5 medio_pago, 6 cuotas,
// 7 fecha_hora, 8 fecha_ingreso, 9 documento, 10 n_doc, 11 tipo_documento,
// 12 estado_doc, 13 estado_pago_doc, 14 paga_con, 15 usuario, 16 operacion,
// 17 tipo, 18 origen_medio_pago, 19 n_medio_pago, 20 fecha_pago_fac,
// 21 numero_nota_credito_interna, 22 eliminado, 23 fecham, 24 user
function mapRow(r, ordenIdByNInterno) {
  const ingreso = num(r[3]) || 0
  const egreso = num(r[4]) || 0
  const esEgreso = egreso > 0
  const nInterno = num(r[1])
  return {
    tipo: esEgreso ? 'egreso' : 'ingreso',
    monto: esEgreso ? egreso : ingreso,
    medioPago: str(r[5]) || 'Sin',
    cuotas: num(r[6]),
    referencia: str(r[16]), // operacion legacy = descripción del movimiento
    ordenId: nInterno ? (ordenIdByNInterno.get(nInterno) ?? null) : null,
    sucursalId: num(r[2]),
    documento: str(r[9]),
    nDoc: str(r[10]),
    tipoDocumento: str(r[11]),
    estadoDoc: str(r[12]),
    estadoPagoDoc: str(r[13]),
    pagaCon: num(r[14]),
    nMedioPago: str(r[19]),
    origenMedioPago: str(r[18]),
    numeroNCInterna: str(r[21]),
    origenTipo: str(r[17]), // tipo legacy (Venta sala / Cierre Caja / Gasto)
    usuario: str(r[15]),
    fecha: dat(r[7]),
    eliminado: bool(r[22]),
    fecham: dat(r[23]),
    userMod: str(r[24]),
  }
}

async function main() {
  console.log(`\n=== Migrar caja (${APPLY ? 'APLICANDO' : 'DRY RUN'}) ===`)
  console.log(`Dump: ${SQL_PATH}\n`)

  // Guard idempotencia: si ya hay movimientos importados del legacy, abortar.
  const yaImportados = await prisma.movimientoCaja.count({ where: { turnoId: null } })
  if (yaImportados > 0) {
    console.log(`⚠ Ya existen ${yaImportados} movimientos sin turno (posible import previo).`)
    if (APPLY) {
      console.log('Abortando para no duplicar. Si querés re-importar, limpiá antes los movimientos legacy.')
      await prisma.$disconnect()
      process.exit(1)
    }
  }

  // Índice nInterno → orden.id para enlazar ventas.
  const ordenes = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } })
  const ordenIdByNInterno = new Map(ordenes.map(o => [o.nInterno, o.id]))
  console.log(`Órdenes indexadas por nInterno: ${ordenes.length}`)

  console.log('Leyendo tabla `caja` del dump (puede tardar)…')
  const text = await readInsertSection('caja')
  const rows = parseRows(text)
  console.log(`Filas legacy parseadas: ${rows.length}`)

  // Decisión de negocio: solo se importan ingresos limpios. Los 44 egresos
  // legacy (cierres de caja / gastos) incluyen montos corruptos (hasta INT_MAX)
  // que inflarían los reportes, así que se descartan por completo.
  let ingresos = 0, egresosDescartados = 0, conOrden = 0
  const mapped = []
  for (const r of rows) {
    const m = mapRow(r, ordenIdByNInterno)
    if (m.tipo === 'egreso') { egresosDescartados++; continue }
    ingresos++
    if (m.ordenId) conOrden++
    mapped.push(m)
  }

  console.log(`\nResumen:`)
  console.log(`  ingresos a importar: ${ingresos}`)
  console.log(`  egresos descartados: ${egresosDescartados}`)
  console.log(`  enlazados a orden: ${conOrden}`)
  const totalIngreso = mapped.reduce((s, m) => s + (m.monto || 0), 0)
  const montoMax = mapped.reduce((mx, m) => Math.max(mx, m.monto || 0), 0)
  console.log(`  total ingreso: ${totalIngreso.toLocaleString('es-CL')}`)
  console.log(`  monto máximo individual: ${montoMax.toLocaleString('es-CL')}`)
  console.log(`\nMuestra (primeras 3):`)
  for (const m of mapped.slice(0, 3)) console.log('  ', JSON.stringify({ tipo: m.tipo, monto: m.monto, medioPago: m.medioPago, fecha: m.fecha, ordenId: m.ordenId, ref: m.referencia }))

  if (!APPLY) {
    console.log(`\n(DRY RUN) No se escribió nada. Re-ejecutá con --apply para importar.`)
    await prisma.$disconnect()
    return
  }

  console.log(`\nInsertando ${mapped.length} movimientos en lotes…`)
  const BATCH = 1000
  let inserted = 0
  for (let i = 0; i < mapped.length; i += BATCH) {
    const chunk = mapped.slice(i, i + BATCH)
    await prisma.movimientoCaja.createMany({ data: chunk })
    inserted += chunk.length
    process.stdout.write(`\r  ${inserted}/${mapped.length}`)
  }
  console.log(`\n✓ Importación completada: ${inserted} movimientos.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
