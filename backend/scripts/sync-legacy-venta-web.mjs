/**
 * Sincroniza únicamente cabeceras de ventas web ya existentes desde
 * orden_compra_sistema.sql. Nunca crea órdenes: para crear ventas completas
 * también se necesita productos_comprados_local.
 *
 * Dry-run:
 *   node scripts/sync-legacy-venta-web.mjs --dump=D:/downloads/orden_compra_sistema.sql
 *
 * Aplicar:
 *   node scripts/sync-legacy-venta-web.mjs --dump=... --apply --confirm=SYNC_VENTA_WEB
 */
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
// El legacy escribe otra grafia de los mismos estados ("Entregado" por
// "Entregada"). Se normaliza al importar para no reponer en la base valores
// que despues bloquean la edicion desde la API.
import { normalizeEstadoEntrega, normalizeEstadoPago } from '../src/routes/ventas/estados-normalize.js'

const scriptDir = dirname(fileURLToPath(import.meta.url))
for (const envPath of [resolve(process.cwd(), '.env'), resolve(scriptDir, '../.env')]) {
  if (!existsSync(envPath)) continue
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}

const dumpPath = process.argv.find(value => value.startsWith('--dump='))?.slice(7)
  || 'D:/downloads/orden_compra_sistema.sql'
const apply = process.argv.includes('--apply')
const confirmation = process.argv.find(value => value.startsWith('--confirm='))?.slice(10)
const APPLY_CONFIRMATION = 'SYNC_VENTA_WEB'
const WEB_TYPES = new Set(['venta web', 'ventaweb', 'oc online', 'web'])
const UPDATE_FIELDS = [
  'tipo', 'estado', 'estadoPago', 'estadoEntrega', 'fechaEstadoEntrega',
  'rutCliente', 'emailCliente', 'sucursalId', 'creadorNombre',
  'observaciones', 'licitacion', 'eliminada', 'userMod', 'fecham',
]

if (!dumpPath || !existsSync(dumpPath)) throw new Error(`No existe el SQL: ${dumpPath}`)
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL')
if (apply && confirmation !== APPLY_CONFIRMATION) {
  throw new Error(`Para aplicar agrega --confirm=${APPLY_CONFIRMATION}`)
}

const text = value => String(value ?? '').trim()
const int = value => {
  const parsed = Number.parseInt(text(value), 10)
  return Number.isFinite(parsed) ? parsed : 0
}
const bool = value => ['1', 'si', 'sí', 'true'].includes(text(value).toLowerCase())
const normType = value => text(value).toLowerCase().replace(/\s+/g, ' ')
const isVentaWeb = value => WEB_TYPES.has(normType(value)) || WEB_TYPES.has(normType(value).replace(/\s/g, ''))
const normRut = value => text(value).toUpperCase().replace(/[.\-\s]/g, '')

function parseCalendarDate(value) {
  const raw = text(value)
  if (!raw || raw.startsWith('0000-00-00')) return null
  let match = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (match) return buildUtcDate(match[3], match[2], match[1], match[4], match[5], match[6])
  match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (match) return buildUtcDate(match[1], match[2], match[3], match[4], match[5], match[6])
  return null
}

function buildUtcDate(year, month, day, hour = 0, minute = 0, second = 0) {
  const parts = [year, month, day, hour || 0, minute || 0, second || 0].map(Number)
  if (parts.some(part => !Number.isInteger(part))) return null
  const [y, m, d, h, min, sec] = parts
  const parsed = new Date(Date.UTC(y, m - 1, d, h, min, sec))
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) return null
  return parsed
}

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

async function loadOrders() {
  const rows = []
  const input = createInterface({ input: createReadStream(dumpPath, { encoding: 'utf8' }), crlfDelay: Infinity })
  let columns = []
  let active = false
  for await (const line of input) {
    const header = line.match(/^INSERT INTO `orden_compra_sistema` \(([^)]+)\) VALUES/)
    if (header) {
      columns = header[1].split(',').map(column => column.trim().replace(/`/g, ''))
      active = true
    }
    if (!active) continue
    for (const tuple of parseTuples(line)) {
      const row = Object.fromEntries(columns.map((column, index) => [column, tuple[index] ?? null]))
      if (int(row.n_interno) > 0 && isVentaWeb(row.tipo)) rows.push(row)
    }
    if (line.trimEnd().endsWith(';')) active = false
  }
  return rows
}

function buildUpdate(row) {
  return {
    tipo: 'Venta Web',
    estado: text(row.estado) || 'Activa',
    // Un valor que no corresponde a ningun estado conocido se preserva tal cual
    // en vez de adivinar a cual deberia mapear.
    estadoPago: normalizeEstadoPago(row.estado_pago) ?? (text(row.estado_pago) || 'No pagada'),
    estadoEntrega: normalizeEstadoEntrega(row.estado_entrega) ?? (text(row.estado_entrega) || 'Pendiente entrega'),
    fechaEstadoEntrega: parseCalendarDate(row.fecha_estado_entrega),
    rutCliente: text(row.rut_cliente) || null,
    emailCliente: text(row.email) || null,
    sucursalId: int(row.sucursal) || null,
    creadorNombre: text(row.usuario) || null,
    observaciones: text(row.obs) || null,
    licitacion: text(row.orden_compra) || null,
    eliminada: bool(row.eliminada),
    userMod: text(row.user) || null,
    fecham: parseCalendarDate(row.fecham),
  }
}

function comparable(value) {
  if (value instanceof Date) return value.toISOString()
  return value ?? null
}

function changedFields(current, next) {
  return Object.keys(next).filter(field => comparable(current[field]) !== comparable(next[field]))
}

function chunks(values, size) {
  const result = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

async function main() {
  const sourceRows = await loadOrders()
  const byInterno = new Map()
  const duplicates = []
  for (const row of sourceRows) {
    const nInterno = int(row.n_interno)
    if (byInterno.has(nInterno)) duplicates.push(nInterno)
    byInterno.set(nInterno, row)
  }
  if (duplicates.length) throw new Error(`El SQL contiene n_interno duplicados: ${[...new Set(duplicates)].slice(0, 20).join(', ')}`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), transactionOptions: { timeout: 60000, maxWait: 15000 } })
  try {
    const existing = []
    for (const group of chunks([...byInterno.keys()], 500)) {
      existing.push(...await prisma.orden.findMany({
        where: { nInterno: { in: group } },
        select: Object.fromEntries(['id', 'nInterno', 'clienteId', ...UPDATE_FIELDS].map(field => [field, true])),
      }))
    }
    const clientes = await prisma.cliente.findMany({ select: { id: true, rut: true } })
    const clientByRut = new Map(clientes.filter(cliente => cliente.rut).map(cliente => [normRut(cliente.rut), cliente.id]))
    const consumidorFinalId = clientByRut.get(normRut('66666666-6')) || null
    const currentByInterno = new Map(existing.map(order => [order.nInterno, order]))
    const missing = []
    const blockedMissingClient = []
    const updates = []
    const fieldCounts = {}
    for (const [nInterno, row] of byInterno) {
      const current = currentByInterno.get(nInterno)
      if (!current) {
        missing.push({ nInterno, ordenCompra: text(row.orden_compra), fecha: text(row.fecha_hora), total: int(row.total) })
        continue
      }
      const data = buildUpdate(row)
      if (!current.clienteId) {
        const rut = normRut(row.rut_cliente)
        const resolvedClienteId = rut ? clientByRut.get(rut) : consumidorFinalId
        if (!resolvedClienteId) {
          blockedMissingClient.push({ nInterno, rut: text(row.rut_cliente) || null, email: text(row.email) || null })
          continue
        }
        data.clienteId = resolvedClienteId
      }
      const fields = changedFields(current, data)
      if (!fields.length) continue
      fields.forEach(field => { fieldCounts[field] = (fieldCounts[field] || 0) + 1 })
      updates.push({ id: current.id, nInterno, data, fields })
    }

    const report = {
      mode: apply ? 'apply' : 'dry-run',
      dump: dumpPath,
      sourceVentaWeb: sourceRows.length,
      sourceMaxNInterno: Math.max(...byInterno.keys()),
      matchedExisting: existing.length,
      updateExisting: updates.length,
      missingRequireItems: missing.length,
      blockedMissingClient: blockedMissingClient.length,
      changedFields: fieldCounts,
      missingSample: missing.slice(-15),
      blockedClientSample: blockedMissingClient.slice(-15),
      updateSample: updates.slice(-10).map(change => ({ nInterno: change.nInterno, fields: change.fields })),
    }
    console.log(JSON.stringify(report, null, 2))

    if (!apply) {
      console.log(`DRY-RUN: no se modificaron datos. Para aplicar: --apply --confirm=${APPLY_CONFIRMATION}`)
      return
    }
    for (const group of chunks(updates, 100)) {
      await prisma.$transaction(group.map(change => prisma.orden.update({ where: { id: change.id }, data: change.data })))
    }
    console.log(`Aplicadas ${updates.length} actualizaciones de cabecera. No se crearon las ${missing.length} ventas sin productos.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
