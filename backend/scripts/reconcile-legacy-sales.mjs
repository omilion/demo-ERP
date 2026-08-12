/**
 * Reconciles the current legacy MySQL dump with the ERP PostgreSQL database.
 *
 * The parser reads column names from the dump, so it remains compatible when
 * phpMyAdmin adds columns (the previous delta importer used fixed positions).
 *
 * Usage:
 *   node scripts/reconcile-legacy-sales.mjs
 *   node scripts/reconcile-legacy-sales.mjs --apply
 *   node scripts/reconcile-legacy-sales.mjs --apply --only=ordenes,items,guias,caja,despachos
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

const DUMP = process.argv.find(arg => arg.startsWith('--dump='))?.slice(7) || 'D:/downloads/plastim2_plastimar2014 (3).sql'
const APPLY = process.argv.includes('--apply')
const ONLY = new Set((process.argv.find(arg => arg.startsWith('--only='))?.slice(7) || 'ordenes,items,guias,caja,despachos').split(',').filter(Boolean))
const want = section => ONLY.has(section)
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  // Batched interactive transactions run over an SSH-tunneled connection
  // (higher per-round-trip latency than a local socket); the 5s default
  // timeout is too tight for a 100-row batch.
  transactionOptions: { timeout: 60000, maxWait: 15000 },
})

const int = value => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : 0
}
const num = value => {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}
const text = value => String(value ?? '').trim()
const norm = value => text(value).toUpperCase()
const normRut = value => norm(value).replace(/[.\-\s]/g, '')
const bool = value => ['1', 'si', 'sí', 'true'].includes(norm(value).toLowerCase())
const date = value => {
  const raw = text(value)
  if (!raw || raw.startsWith('0000-00-00')) return null
  const parsed = new Date(raw.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
const day = value => {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}
const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))

function parseTuples(line) {
  const tuples = []
  let index = line.indexOf('VALUES')
  if (index >= 0) index += 6
  else index = 0
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
          if (char === '\\') {
            const escaped = line[index++] || ''
            value += ({ n: '\n', r: '\r', t: '\t' }[escaped] || escaped)
          } else if (char === "'") {
            if (line[index] === "'") { value += "'"; index++ } else break
          } else value += char
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
      columns = activeTable ? header[2].split(',').map(column => column.trim().replace(/`/g, '')) : []
    }
    if (!activeTable) continue
    for (const tuple of parseTuples(line)) {
      data[activeTable].push(Object.fromEntries(columns.map((column, index) => [column, tuple[index] ?? null])))
    }
    if (line.trimEnd().endsWith(';')) activeTable = null
  }
  return data
}

function legacyOrder(row, clienteId) {
  const rut = text(row.rut_cliente)
  return {
    nInterno: int(row.n_interno),
    tipo: text(row.tipo) || 'Venta sala',
    estado: text(row.estado) || 'Activa',
    estadoPago: text(row.estado_pago) || 'No pagada',
    estadoEntrega: text(row.estado_entrega) || 'Pendiente entrega',
    fechaEstadoEntrega: date(row.fecha_estado_entrega),
    clienteId: clienteId || null,
    rutCliente: rut || null,
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

const comparableOrderFields = ['tipo', 'estado', 'estadoPago', 'estadoEntrega', 'rutCliente', 'emailCliente', 'sucursalId', 'creadorNombre', 'observaciones', 'licitacion', 'eliminada', 'userMod']
function orderChanged(current, next) {
  if (comparableOrderFields.some(field => (current[field] ?? null) !== (next[field] ?? null))) return true
  return day(current.fechaEstadoEntrega) !== day(next.fechaEstadoEntrega)
}
function changedOrderFields(current, next) {
  const changed = comparableOrderFields.filter(field => (current[field] ?? null) !== (next[field] ?? null))
  if (day(current.fechaEstadoEntrega) !== day(next.fechaEstadoEntrega)) changed.push('fechaEstadoEntrega')
  return changed
}

function itemKey(item) {
  return `${int(item.nInterno ?? item.orden?.nInterno)}|${norm(item.codigoInterno ?? item.codigo_interno)}|${norm(item.nombre)}`
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
function itemChanged(current, next) {
  return ['codigoInterno', 'nombre', 'descripcion', 'cantidad', 'nEntregados', 'precioUnitario', 'precioConIva', 'cargoTransporte', 'eliminado', 'userMod']
    .some(field => (current[field] ?? null) !== (next[field] ?? null)) || day(current.fecham) !== day(next.fecham)
}

function cajaKey(row) {
  const legacy = Object.hasOwn(row, 'ingreso')
  const ingreso = legacy ? num(row.ingreso) : (row.tipo === 'ingreso' ? num(row.monto) : 0)
  const egreso = legacy ? num(row.egreso) : (row.tipo === 'egreso' ? num(row.monto) : 0)
  const kind = ingreso > 0 ? 'ingreso' : 'egreso'
  const amount = Math.abs(ingreso - egreso)
  const ni = legacy ? int(row.n_interno) : int(row.orden?.nInterno)
  const rawDate = legacy ? row.fecha_hora : row.fecha
  return [ni, day(rawDate), kind, amount.toFixed(2), norm(row.medio_pago ?? row.medioPago), norm(row.n_doc ?? row.nDoc), norm(row.numero_nota_credito_interna ?? row.numeroNCInterna)].join('|')
}

async function main() {
  if (!existsSync(DUMP)) throw new Error(`No existe el dump: ${DUMP}`)
  console.log(`Reconciliación legacy (${APPLY ? 'APLICANDO' : 'SIMULACIÓN'})\nDump: ${DUMP}`)
  const dump = await loadDump(new Set(['orden_compra_sistema', 'productos_comprados_local', 'caja', 'guias_despachos', 'despachos', 'clientes']))
  for (const [table, rows] of Object.entries(dump)) console.log(`  ${table}: ${rows.length}`)

  const legacyOrders = dump.orden_compra_sistema.filter(row => int(row.n_interno) > 0 && !bool(row.eliminada))
  const clientes = await prisma.cliente.findMany({ select: { id: true, rut: true } })
  const clientByRut = new Map(clientes.filter(client => client.rut).map(client => [normRut(client.rut), client.id]))
  const consumidorFinalId = clientByRut.get(normRut('66666666-6')) || null

  // `ordenes.cliente_id` is NOT NULL for any row written from here on (check
  // constraint ordenes_cliente_id_required_new, NOT VALID but enforced on
  // every new insert/update). Legacy orders reference ruts that don't have a
  // Cliente row yet: create them for real (using the legacy clientes table
  // for name/contact data) instead of leaving cliente_id null.
  const legacyClienteByRut = new Map()
  for (const row of dump.clientes) {
    const rut = normRut(row.rut || row.rut_cliente)
    if (rut && !legacyClienteByRut.has(rut)) legacyClienteByRut.set(rut, row)
  }
  const missingClientes = new Map()
  for (const source of legacyOrders) {
    const rut = normRut(source.rut_cliente)
    if (!rut || clientByRut.has(rut) || missingClientes.has(rut)) continue
    const legacy = legacyClienteByRut.get(rut)
    missingClientes.set(rut, {
      rut: text(legacy?.rut || legacy?.rut_cliente || source.rut_cliente),
      nombre: text(legacy?.nombre) || text(source.email) || text(source.rut_cliente),
      email: text(legacy?.email) || text(source.email) || null,
      telefono: text(legacy?.fono1) || null,
      giro: text(legacy?.giro) || null,
      direccion: text(legacy?.direccion) || null,
      region: text(legacy?.region) || null,
      comuna: text(legacy?.comuna) || null,
      razonSocial: text(legacy?.razon_social) || null,
    })
  }
  console.log(`Clientes nuevos a crear desde ventas legacy: ${missingClientes.size} ruts`)
  if (APPLY && missingClientes.size) {
    for (const batch of chunks([...missingClientes.values()], 300)) await prisma.cliente.createMany({ data: batch, skipDuplicates: true })
    const created = await prisma.cliente.findMany({ where: { rut: { in: [...missingClientes.values()].map(cliente => cliente.rut) } }, select: { id: true, rut: true } })
    for (const cliente of created) clientByRut.set(normRut(cliente.rut), cliente.id)
  }

  const orders = await prisma.orden.findMany({ select: { id: true, nInterno: true, tipo: true, estado: true, estadoPago: true, estadoEntrega: true, fechaEstadoEntrega: true, rutCliente: true, emailCliente: true, sucursalId: true, creadorNombre: true, observaciones: true, licitacion: true, eliminada: true, userMod: true } })
  const orderByInterno = new Map(orders.filter(order => order.nInterno).map(order => [order.nInterno, order]))
  const insertOrders = []
  const updateOrders = []
  const orderDiffs = new Map()
  for (const source of legacyOrders) {
    const rut = normRut(source.rut_cliente)
    const clienteId = (rut && clientByRut.get(rut)) || consumidorFinalId
    const next = legacyOrder(source, clienteId)
    const current = orderByInterno.get(next.nInterno)
    if (!current) insertOrders.push(next)
    else if (orderChanged(current, next)) {
      updateOrders.push({ id: current.id, data: next })
      for (const field of changedOrderFields(current, next)) orderDiffs.set(field, (orderDiffs.get(field) || 0) + 1)
    }
  }
  console.log(`\nÓrdenes: ${insertOrders.length} por insertar; ${updateOrders.length} por actualizar`)
  console.log(`  diferencias: ${[...orderDiffs].map(([field, count]) => `${field}=${count}`).join(', ') || 'ninguna'}`)
  if (APPLY) {
    for (const batch of chunks(insertOrders, 200)) await prisma.orden.createMany({ data: batch, skipDuplicates: true })
    for (const batch of chunks(updateOrders, 100)) await prisma.$transaction(batch.map(change => prisma.orden.update({ where: { id: change.id }, data: change.data })))
  }

  const allOrders = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } })
  const orderIdByInterno = new Map(allOrders.map(order => [order.nInterno, order.id]))

  if (want('items')) {
    const products = await prisma.producto.findMany({ select: { id: true, codigoInterno: true } })
    const productIdByCode = new Map(products.filter(product => product.codigoInterno).map(product => [norm(product.codigoInterno), product.id]))

    // Codes referenced by real sales that don't exist in the current catalog:
    // create them as regular active products (defaults: activo=true, precioLista=0),
    // not as inactive/historical records.
    const missingCodes = new Map()
    for (const source of dump.productos_comprados_local.filter(row => !bool(row.eliminado))) {
      const code = norm(source.codigo_interno)
      if (!code || productIdByCode.has(code)) continue
      if (!orderIdByInterno.get(int(source.n_interno))) continue
      if (!missingCodes.has(code)) missingCodes.set(code, { codigoInterno: text(source.codigo_interno), nombre: text(source.nombre) || text(source.codigo_interno) })
    }
    console.log(`Productos nuevos a crear desde ventas legacy: ${missingCodes.size} códigos`)
    if (APPLY && missingCodes.size) {
      for (const batch of chunks([...missingCodes.values()], 300)) await prisma.producto.createMany({ data: batch, skipDuplicates: true })
      const created = await prisma.producto.findMany({ where: { codigoInterno: { in: [...missingCodes.values()].map(product => product.codigoInterno) } }, select: { id: true, codigoInterno: true } })
      for (const product of created) productIdByCode.set(norm(product.codigoInterno), product.id)
    }

    const existingItems = await prisma.ordenItem.findMany({ select: { id: true, ordenId: true, productoId: true, codigoInterno: true, nombre: true, descripcion: true, cantidad: true, nEntregados: true, precioUnitario: true, precioConIva: true, cargoTransporte: true, eliminado: true, userMod: true, fecham: true, orden: { select: { nInterno: true } } } })
    const byKey = new Map()
    for (const item of existingItems) {
      const key = itemKey(item)
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key).push(item)
    }
    const seenByKey = new Map()
    const insertItems = []
    const updateItems = []
    let unresolvedNewItems = 0
    let reusedExistingProduct = 0
    for (const source of dump.productos_comprados_local.filter(row => !bool(row.eliminado))) {
      const ni = int(source.n_interno)
      const orderId = orderIdByInterno.get(ni)
      if (!orderId) continue
      const key = `${ni}|${norm(source.codigo_interno)}|${norm(source.nombre)}`
      const position = seenByKey.get(key) || 0
      seenByKey.set(key, position + 1)
      const current = byKey.get(key)?.[position]
      const productId = current?.productoId || productIdByCode.get(norm(source.codigo_interno))
      if (!productId) { unresolvedNewItems++; continue }
      if (current && !productIdByCode.get(norm(source.codigo_interno))) reusedExistingProduct++
      const next = legacyItem(source, orderId, productId)
      if (!current) insertItems.push(next)
      else if (itemChanged(current, next)) updateItems.push({ id: current.id, data: next })
    }
    console.log(`Items: ${insertItems.length} por insertar; ${updateItems.length} por actualizar; ${unresolvedNewItems} nuevos sin producto resuelto; ${reusedExistingProduct} existentes preservan su producto histórico`)
    if (APPLY) {
      for (const batch of chunks(insertItems, 300)) await prisma.ordenItem.createMany({ data: batch })
      for (const batch of chunks(updateItems, 100)) await prisma.$transaction(batch.map(change => prisma.ordenItem.update({ where: { id: change.id }, data: change.data })))
    }
  }

  if (want('guias')) {
    const existing = await prisma.guiaDespacho.findMany({ select: { nInterno: true, nGuia: true } })
    const keys = new Set(existing.map(row => `${int(row.nInterno)}|${norm(row.nGuia)}`))
    const insert = []
    for (const source of dump.guias_despachos.filter(row => !bool(row.eliminado))) {
      const ni = int(source.n_interno)
      const nGuia = text(source.n_guia)
      const key = `${ni}|${norm(nGuia)}`
      if (!ni || !nGuia || keys.has(key)) continue
      keys.add(key)
      insert.push({ ordenId: orderIdByInterno.get(ni) || null, nInterno: ni, nGuia, fechaGuia: date(source.fecha_guia) || date(source.fecha_hora) || new Date('2000-01-01'), origen: text(source.origen) || null, eliminado: false, userMod: text(source.user) || null, fecham: date(source.fecham), createdAt: date(source.fecha_hora) || new Date() })
    }
    console.log(`Guías: ${insert.length} por insertar`)
    if (APPLY) for (const batch of chunks(insert, 300)) await prisma.guiaDespacho.createMany({ data: batch })
  }

  if (want('caja')) {
    const existing = await prisma.movimientoCaja.findMany({ select: { tipo: true, monto: true, medioPago: true, nDoc: true, numeroNCInterna: true, fecha: true, orden: { select: { nInterno: true } } } })
    const existingCounts = new Map()
    for (const movement of existing) { const key = cajaKey(movement); existingCounts.set(key, (existingCounts.get(key) || 0) + 1) }
    const consumed = new Map()
    const insert = []
    for (const source of dump.caja.filter(row => !bool(row.eliminado))) {
      const ni = int(source.n_interno)
      const orderId = orderIdByInterno.get(ni)
      if (!ni || !orderId) continue
      const key = cajaKey(source)
      const used = consumed.get(key) || 0
      consumed.set(key, used + 1)
      if (used < (existingCounts.get(key) || 0)) continue
      const ingreso = num(source.ingreso)
      const egreso = num(source.egreso)
      insert.push({ ordenId: orderId, tipo: ingreso > 0 ? 'ingreso' : 'egreso', monto: Math.abs(ingreso - egreso), medioPago: text(source.medio_pago), cuotas: source.cuotas == null ? null : int(source.cuotas), fecha: date(source.fecha_hora), documento: text(source.documento) || null, nDoc: text(source.n_doc) || null, tipoDocumento: text(source.tipo_documento) || null, estadoDoc: text(source.estado_doc) || null, estadoPagoDoc: text(source.estado_pago_doc) || null, pagaCon: source.paga_con == null ? null : num(source.paga_con), usuario: text(source.usuario) || null, origenMedioPago: text(source.origen_medio_pago) || null, nMedioPago: text(source.n_medio_pago) || null, numeroNCInterna: text(source.numero_nota_credito_interna) || null, eliminado: false, userMod: text(source.user) || null, fecham: date(source.fecham) })
    }
    console.log(`Caja: ${insert.length} movimientos por insertar`)
    if (APPLY) for (const batch of chunks(insert, 300)) await prisma.movimientoCaja.createMany({ data: batch })
  }

  if (want('despachos')) {
    const existing = await prisma.despacho.findMany({ select: { interno: true, fechaInterno: true } })
    const keys = new Set(existing.map(row => `${text(row.interno)}|${day(row.fechaInterno)}`))
    const legacyIdToInterno = new Map(legacyOrders.map(row => [int(row.id), int(row.n_interno)]))
    const insert = []
    for (const source of dump.despachos.filter(row => !bool(row.eliminado))) {
      const sourceInterno = text(source.interno)
      const key = `${sourceInterno}|${day(source.fecha_interno)}`
      if (keys.has(key)) continue
      keys.add(key)
      const ni = legacyIdToInterno.get(int(sourceInterno))
      insert.push({ ordenId: ni ? orderIdByInterno.get(ni) || null : null, interno: sourceInterno || null, plazoEntrega: text(source.plazo_entrega) || null, fechaInterno: date(source.fecha_interno), fechaEntrega: date(source.fecha_entrega), tipoDespacho: text(source.tipo_despacho) || null, transporte: text(source.transporte) || null, montoEnvio: source.monto_envio == null ? null : int(source.monto_envio), direccion: text(source.direccion) || null, contacto: text(source.contacto) || null, region: text(source.region) || null, comuna: text(source.comuna) || null, parcial: bool(source.parcial), tieneMulta: bool(source.tiene_multa), usuario: text(source.usuario) || null, eliminado: false, userMod: text(source.user) || null, fecham: date(source.fecham) })
    }
    console.log(`Despachos: ${insert.length} por insertar`)
    if (APPLY) for (const batch of chunks(insert, 200)) await prisma.despacho.createMany({ data: batch })
  }

  const [ordersCount, itemsCount, movementsCount, guidesCount, dispatchesCount] = await Promise.all([
    prisma.orden.count({ where: { eliminada: false } }), prisma.ordenItem.count({ where: { eliminado: false } }), prisma.movimientoCaja.count({ where: { eliminado: false } }), prisma.guiaDespacho.count({ where: { eliminado: false } }), prisma.despacho.count({ where: { eliminado: false } }),
  ])
  console.log(`\nConteos ERP: órdenes ${ordersCount}; ítems ${itemsCount}; caja ${movementsCount}; guías ${guidesCount}; despachos ${dispatchesCount}`)
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
