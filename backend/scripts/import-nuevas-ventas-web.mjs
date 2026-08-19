/**
 * Crea ÚNICAMENTE las órdenes "Venta Web" que existen en el dump legacy pero
 * no en el ERP (nunca actualiza órdenes ya existentes, a diferencia de
 * reconcile-legacy-sales.mjs que reconcilia TODO tipo de venta). Crea también
 * los clientes/productos que esas órdenes nuevas necesiten, con la misma
 * lógica ya probada en reconcile-legacy-sales.mjs.
 *
 * Dry-run:
 *   node scripts/import-nuevas-ventas-web.mjs --dump=D:/downloads/venta-web-nuevas-combined.sql
 * Aplicar:
 *   node scripts/import-nuevas-ventas-web.mjs --dump=... --apply --confirm=IMPORTAR_VENTA_WEB
 */
import { createReadStream, existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
for (const envPath of [resolve(process.cwd(), '.env'), resolve(__dirname, '../.env')]) {
  if (!existsSync(envPath)) continue
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '')
  }
}

const DUMP = process.argv.find(arg => arg.startsWith('--dump='))?.slice(7)
  || 'D:/downloads/venta-web-nuevas-combined.sql'
const APPLY = process.argv.includes('--apply')
const CONFIRM = 'IMPORTAR_VENTA_WEB'
const confirmation = process.argv.find(arg => arg.startsWith('--confirm='))?.slice(10)
const WEB_TYPES = new Set(['venta web', 'ventaweb', 'oc online', 'web'])

if (!existsSync(DUMP)) throw new Error(`No existe el dump: ${DUMP}`)
if (APPLY && confirmation !== CONFIRM) throw new Error(`Para aplicar agrega --confirm=${CONFIRM}`)

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  transactionOptions: { timeout: 60000, maxWait: 15000 },
})

const int = value => { const n = Number.parseInt(String(value ?? ''), 10); return Number.isFinite(n) ? n : 0 }
const num = value => { const n = Number.parseFloat(String(value ?? '')); return Number.isFinite(n) ? n : 0 }
const text = value => String(value ?? '').trim()
const norm = value => text(value).toUpperCase()
const normType = value => text(value).toLowerCase().replace(/\s+/g, ' ')
const isVentaWeb = value => WEB_TYPES.has(normType(value)) || WEB_TYPES.has(normType(value).replace(/\s/g, ''))
const normRut = value => norm(value).replace(/[.\-\s]/g, '')
const bool = value => ['1', 'si', 'sí', 'true'].includes(norm(value).toLowerCase())
const calendarDate = (year, month, day, hour = 0, minute = 0, second = 0) => {
  const parts = [year, month, day, hour, minute, second].map(Number)
  if (parts.some(part => !Number.isInteger(part))) return null
  const [y, m, d, h, min, s] = parts
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const parsed = new Date(Date.UTC(y, m - 1, d, h, min, s))
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) return null
  return parsed
}
const date = value => {
  const raw = text(value)
  if (!raw || raw.startsWith('0000-00-00')) return null
  let match = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (match) return calendarDate(match[3], match[2], match[1], match[4] || 0, match[5] || 0, match[6] || 0)
  match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (match) return calendarDate(match[1], match[2], match[3], match[4] || 0, match[5] || 0, match[6] || 0)
  return null
}
const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

function parseTuples(line) {
  const tuples = []
  let index = line.indexOf('VALUES')
  index = index >= 0 ? index + 6 : 0
  while (index < line.length) {
    while (index < line.length && line[index] !== '(') index++
    if (index >= line.length) break
    index++
    const values = []
    while (index < line.length) {
      while (index < line.length && /\s/.test(line[index])) index++
      if (line[index] === ')') { index++; break }
      if (line[index] === ',') { index++; continue }
      if (line.slice(index, index + 4) === 'NULL') { values.push(null); index += 4; continue }
      if (line[index] === "'") {
        let value = ''
        index++
        while (index < line.length) {
          const char = line[index++]
          if (char === '\\') { const escaped = line[index++] || ''; value += ({ n: '\n', r: '\r', t: '\t' }[escaped] || escaped) }
          else if (char === "'") { if (line[index] === "'") { value += "'"; index++ } else break }
          else value += char
        }
        values.push(value)
        continue
      }
      let value = ''
      while (index < line.length && line[index] !== ',' && line[index] !== ')') value += line[index++]
      values.push(value.trim())
    }
    if (values.length) tuples.push(values)
  }
  return tuples
}

async function loadDump(tables) {
  const data = Object.fromEntries([...tables].map(table => [table, []]))
  const input = createInterface({ input: createReadStream(DUMP, { encoding: 'utf8' }), crlfDelay: Infinity })
  let activeTable = null
  let columns = []
  for await (const line of input) {
    const header = line.match(/^INSERT INTO `([^`]+)` \(([^)]+)\) VALUES/)
    if (header) {
      activeTable = tables.has(header[1]) ? header[1] : null
      columns = activeTable ? header[2].split(',').map(c => c.trim().replace(/`/g, '')) : []
    }
    if (!activeTable) continue
    for (const tuple of parseTuples(line)) data[activeTable].push(Object.fromEntries(columns.map((c, i) => [c, tuple[i] ?? null])))
    if (line.trimEnd().endsWith(';')) activeTable = null
  }
  return data
}

function legacyOrder(row, clienteId) {
  return {
    nInterno: int(row.n_interno),
    tipo: 'Venta Web',
    estado: text(row.estado) || 'Activa',
    estadoPago: text(row.estado_pago) || 'No pagada',
    estadoEntrega: text(row.estado_entrega) || 'Pendiente entrega',
    fechaEstadoEntrega: date(row.fecha_estado_entrega),
    clienteId,
    rutCliente: text(row.rut_cliente) || null,
    emailCliente: text(row.email) || null,
    userId: 1,
    sucursalId: int(row.sucursal) || null,
    creadorNombre: text(row.usuario) || null,
    observaciones: text(row.obs) || null,
    licitacion: text(row.orden_compra) || null,
    eliminada: bool(row.eliminada),
    userMod: text(row.user) || null,
    fecham: date(row.fecham),
    createdAt: date(row.fecha_hora) || new Date(),
  }
}

function legacyItem(row, orderId, productId) {
  return {
    ordenId: orderId,
    productoId: productId,
    codigoInterno: text(row.codigo_interno) || null,
    nombre: text(row.nombre) || null,
    descripcion: text(row.descripcion) || null,
    cantidad: int(row.cant),
    nEntregados: int(row.n_entregados),
    precioUnitario: num(row.precio),
    precioConIva: row.precio_coniva == null || text(row.precio_coniva) === '' ? null : num(row.precio_coniva),
    cargoTransporte: num(row.cargo_transporte),
    eliminado: bool(row.eliminado),
    userMod: text(row.user) || null,
    fecham: date(row.fecham),
  }
}

async function main() {
  console.log(`Import ventas web nuevas (${APPLY ? 'APLICANDO' : 'SIMULACIÓN'})\nDump: ${DUMP}`)
  const dump = await loadDump(new Set(['orden_compra_sistema', 'productos_comprados_local', 'clientes']))
  for (const [table, rows] of Object.entries(dump)) console.log(`  ${table}: ${rows.length}`)

  const webOrders = dump.orden_compra_sistema.filter(row => int(row.n_interno) > 0 && !bool(row.eliminada) && isVentaWeb(row.tipo))
  console.log(`\nÓrdenes "venta web" en el dump: ${webOrders.length}`)

  const existingOrders = await prisma.orden.findMany({ select: { nInterno: true } })
  const existingSet = new Set(existingOrders.filter(o => o.nInterno).map(o => o.nInterno))
  const newOrders = webOrders.filter(row => !existingSet.has(int(row.n_interno)))
  console.log(`Ya existen en el ERP: ${webOrders.length - newOrders.length}`)
  console.log(`Nuevas a crear: ${newOrders.length}`)
  if (!newOrders.length) { console.log('Nada que importar.'); return }

  const clientes = await prisma.cliente.findMany({ select: { id: true, rut: true } })
  const clientByRut = new Map(clientes.filter(c => c.rut).map(c => [normRut(c.rut), c.id]))
  const consumidorFinalId = clientByRut.get(normRut('66666666-6')) || null

  const legacyClienteByRut = new Map()
  for (const row of dump.clientes) {
    const rut = normRut(row.rut || row.rut_cliente)
    if (rut && !legacyClienteByRut.has(rut)) legacyClienteByRut.set(rut, row)
  }
  const missingClientes = new Map()
  for (const row of newOrders) {
    const rut = normRut(row.rut_cliente)
    if (!rut || clientByRut.has(rut) || missingClientes.has(rut)) continue
    const legacy = legacyClienteByRut.get(rut)
    missingClientes.set(rut, {
      rut: text(legacy?.rut || legacy?.rut_cliente || row.rut_cliente),
      nombre: text(legacy?.nombre) || text(row.email) || text(row.rut_cliente),
      email: text(legacy?.email) || text(row.email) || null,
      telefono: text(legacy?.fono1) || null,
      giro: text(legacy?.giro) || null,
      direccion: text(legacy?.direccion) || null,
      region: text(legacy?.region) || null,
      comuna: text(legacy?.comuna) || null,
      razonSocial: text(legacy?.razon_social) || null,
    })
  }
  console.log(`Clientes nuevos a crear: ${missingClientes.size}`)
  if (APPLY && missingClientes.size) {
    for (const batch of chunks([...missingClientes.values()], 300)) await prisma.cliente.createMany({ data: batch, skipDuplicates: true })
    const created = await prisma.cliente.findMany({ where: { rut: { in: [...missingClientes.values()].map(c => c.rut) } }, select: { id: true, rut: true } })
    for (const c of created) clientByRut.set(normRut(c.rut), c.id)
  }

  const ordersToInsert = []
  const blockedNoCliente = []
  for (const row of newOrders) {
    const rut = normRut(row.rut_cliente)
    const clienteId = (rut && clientByRut.get(rut)) || consumidorFinalId
    if (!clienteId) { blockedNoCliente.push({ nInterno: int(row.n_interno), rut: text(row.rut_cliente) || null }); continue }
    ordersToInsert.push(legacyOrder(row, clienteId))
  }
  console.log(`Órdenes bloqueadas (sin cliente resoluble ni Consumidor Final): ${blockedNoCliente.length}`)
  if (blockedNoCliente.length) console.log(JSON.stringify(blockedNoCliente.slice(0, 15), null, 2))
  console.log(`Órdenes a insertar: ${ordersToInsert.length}`)

  if (APPLY && ordersToInsert.length) {
    for (const batch of chunks(ordersToInsert, 200)) await prisma.orden.createMany({ data: batch, skipDuplicates: true })
  }

  // En dry-run las órdenes nuevas no tienen id real todavía: para poder
  // previsualizar sus ítems igual, se resuelve el mapa de ids SOLO después
  // de haber aplicado (o, en simulación, se deja vacío a propósito y el
  // conteo de ítems se basa únicamente en n_interno, no en un id de orden).
  const orderIdByInterno = new Map()
  if (APPLY) {
    const allOrders = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } })
    for (const o of allOrders) orderIdByInterno.set(o.nInterno, o.id)
  }

  const insertedInterno = new Set(ordersToInsert.map(o => o.nInterno))
  const products = await prisma.producto.findMany({ select: { id: true, codigoInterno: true } })
  const productIdByCode = new Map(products.filter(p => p.codigoInterno).map(p => [norm(p.codigoInterno), p.id]))
  const relevantItems = dump.productos_comprados_local.filter(row => !bool(row.eliminado) && insertedInterno.has(int(row.n_interno)))

  const missingCodes = new Map()
  for (const row of relevantItems) {
    const code = norm(row.codigo_interno)
    if (!code || productIdByCode.has(code) || missingCodes.has(code)) continue
    missingCodes.set(code, { codigoInterno: text(row.codigo_interno), nombre: text(row.nombre) || text(row.codigo_interno) })
  }
  console.log(`Productos nuevos a crear (solo de las ventas nuevas): ${missingCodes.size}`)
  if (APPLY && missingCodes.size) {
    for (const batch of chunks([...missingCodes.values()], 300)) await prisma.producto.createMany({ data: batch, skipDuplicates: true })
    const created = await prisma.producto.findMany({ where: { codigoInterno: { in: [...missingCodes.values()].map(p => p.codigoInterno) } }, select: { id: true, codigoInterno: true } })
    for (const p of created) productIdByCode.set(norm(p.codigoInterno), p.id)
  }

  const itemsToInsert = []
  let unresolved = 0
  let matched = 0
  for (const row of relevantItems) {
    const productId = productIdByCode.get(norm(row.codigo_interno))
    if (!productId) { unresolved++; continue }
    matched++
    if (!APPLY) continue
    const orderId = orderIdByInterno.get(int(row.n_interno))
    if (!orderId) continue
    itemsToInsert.push(legacyItem(row, orderId, productId))
  }
  console.log(APPLY
    ? `Ítems a insertar: ${itemsToInsert.length}; sin producto resuelto: ${unresolved}`
    : `Ítems que se crearían: ${matched}; sin producto resuelto: ${unresolved}`)
  if (APPLY && itemsToInsert.length) {
    for (const batch of chunks(itemsToInsert, 300)) await prisma.ordenItem.createMany({ data: batch })
  }

  if (!APPLY) console.log(`\nDRY-RUN: no se modificó nada. Para aplicar: --apply --confirm=${CONFIRM}`)
  else console.log(`\nAplicado: ${ordersToInsert.length} órdenes, ${itemsToInsert.length} ítems, ${missingClientes.size} clientes, ${missingCodes.size} productos.`)
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
