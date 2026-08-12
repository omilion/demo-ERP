/**
 * Surgical remediation for the 2026-08-12 legacy sales reconciliation.
 *
 * Required environment variables:
 *   BEFORE_DATABASE_URL  PostgreSQL restored from the pre-reconcile backup
 *   AFTER_DATABASE_URL   Production PostgreSQL (normally through SSH tunnel)
 *   LEGACY_DUMP          Current MySQL dump
 *
 * Default mode is read-only. Pass --apply to execute one transaction.
 */
import { createReadStream, existsSync } from 'fs'
import { createInterface } from 'readline'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const DUMP = process.env.LEGACY_DUMP || 'D:/downloads/plastim2_plastimar2014 (3).sql'
const BEFORE_URL = process.env.BEFORE_DATABASE_URL
const AFTER_URL = process.env.AFTER_DATABASE_URL
if (!BEFORE_URL || !AFTER_URL) throw new Error('Faltan BEFORE_DATABASE_URL o AFTER_DATABASE_URL')
if (!existsSync(DUMP)) throw new Error(`No existe el dump: ${DUMP}`)

const before = new pg.Client({ connectionString: BEFORE_URL })
const after = new pg.Client({ connectionString: AFTER_URL })
const text = value => String(value ?? '').trim()
const norm = value => text(value).toUpperCase().replace(/\s+/g, ' ')
const normRut = value => norm(value).replace(/[.\-\s]/g, '')
const int = value => Number.parseInt(String(value ?? ''), 10) || 0
const number = value => Number.parseFloat(String(value ?? '')) || 0
const bool = value => ['1', 'SI', 'SÍ', 'TRUE'].includes(norm(value))
const money = value => number(value).toFixed(2)
const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1)

function validIsoDate(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (d > days) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseLegacyDate(value) {
  const raw = text(value)
  if (!raw || raw.startsWith('0000-00-00')) return null
  let match = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/)
  if (match) return validIsoDate(match[3], match[2], match[1])
  match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/)
  if (match) return validIsoDate(match[1], match[2], match[3])
  return undefined
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
      } else {
        let value = ''
        while (index < line.length && line[index] !== ',' && line[index] !== ')') value += line[index++]
        values.push(value.trim())
      }
    }
    if (values.length) tuples.push(values)
  }
  return tuples
}

async function loadDump() {
  const wanted = new Set(['orden_compra_sistema', 'caja', 'despachos'])
  const data = Object.fromEntries([...wanted].map(table => [table, []]))
  const input = createInterface({ input: createReadStream(DUMP, { encoding: 'utf8' }), crlfDelay: Infinity })
  let active = null
  let columns = []
  for await (const line of input) {
    const header = line.match(/^INSERT INTO `([^`]+)` \(([^)]+)\) VALUES/)
    if (header) {
      active = wanted.has(header[1]) ? header[1] : null
      columns = active ? header[2].split(',').map(column => column.trim().replace(/`/g, '')) : []
    }
    if (!active) continue
    for (const tuple of parseTuples(line)) data[active].push(Object.fromEntries(columns.map((column, i) => [column, tuple[i] ?? null])))
    if (line.trimEnd().endsWith(';')) active = null
  }
  return data
}

function cajaKey(row, legacy = false) {
  const ni = int(legacy ? row.n_interno : row.n_interno)
  const ingreso = legacy ? number(row.ingreso) : (norm(row.tipo) === 'INGRESO' ? number(row.monto) : 0)
  const egreso = legacy ? number(row.egreso) : (norm(row.tipo) === 'EGRESO' ? number(row.monto) : 0)
  const tipo = ingreso > 0 ? 'INGRESO' : 'EGRESO'
  const monto = money(Math.abs(ingreso - egreso))
  const fecha = legacy ? text(row.fecha_hora).slice(0, 10) : text(row.fecha_dia)
  return [ni, fecha, tipo, monto, norm(legacy ? row.medio_pago : row.medio_pago), norm(legacy ? row.n_doc : row.n_doc), norm(legacy ? row.numero_nota_credito_interna : row.numero_nc_interna)].join('|')
}

function despachoKey(row, legacy = false) {
  const fecha = parseLegacyDate(legacy ? row.fecha_interno : row.fecha_interno) || ''
  return `${text(row.interno)}|${fecha}`
}

function valuesSql(rows, fields) {
  const params = []
  const tuples = rows.map(row => `(${fields.map(field => { params.push(row[field]); return `$${params.length}` }).join(',')})`)
  return { sql: tuples.join(','), params }
}

async function main() {
  await Promise.all([before.connect(), after.connect()])
  const dump = await loadDump()
  const legacyOrders = dump.orden_compra_sistema.filter(row => int(row.n_interno) > 0 && !bool(row.eliminada))
  const legacyOrderByInterno = new Map(legacyOrders.map(row => [int(row.n_interno), row]))

  const clients = await after.query('select id, rut from clientes.clientes')
  const clientByRut = new Map(clients.rows.filter(row => row.rut).map(row => [normRut(row.rut), Number(row.id)]))
  const consumidorFinalId = clientByRut.get(normRut('66666666-6'))
  if (!consumidorFinalId) throw new Error('No existe cliente CONSUMIDOR FINAL 66666666-6')

  const prodOrders = await after.query(`
    select id, n_interno, cliente_id, to_char(fecha_estado_entrega::date,'YYYY-MM-DD') fecha_dia
    from ventas.ordenes where n_interno is not null
  `)
  const prodOrderByInterno = new Map(prodOrders.rows.map(row => [Number(row.n_interno), row]))
  const unknownDates = []
  const orderFixes = []
  let dateFixCount = 0, clientFixCount = 0
  for (const source of legacyOrders) {
    const ni = int(source.n_interno)
    const current = prodOrderByInterno.get(ni)
    if (!current) continue
    const rawDate = text(source.fecha_estado_entrega)
    const expectedDate = parseLegacyDate(rawDate)
    if (rawDate && !rawDate.startsWith('0000-00-00') && expectedDate === undefined) unknownDates.push({ nInterno: ni, value: rawDate })
    const setDate = typeof expectedDate === 'string' && current.fecha_dia !== expectedDate
    const sourceRut = normRut(source.rut_cliente)
    const targetClientId = current.cliente_id == null ? (clientByRut.get(sourceRut) || consumidorFinalId) : Number(current.cliente_id)
    const setClient = current.cliente_id == null
    if (setDate || setClient) orderFixes.push({ id: Number(current.id), expectedDate: expectedDate || null, setDate, clientId: targetClientId })
    if (setDate) dateFixCount++
    if (setClient) clientFixCount++
  }

  const beforeCajaMax = Number((await before.query('select coalesce(max(id),0) max from caja.movimientos_caja')).rows[0].max)
  const cajaSelect = `
    select m.id, o.n_interno, to_char(m.fecha,'YYYY-MM-DD') fecha_dia, m.tipo, m.monto,
           m.medio_pago, m.n_doc, m.numero_nc_interna, m.created_at
    from caja.movimientos_caja m join ventas.ordenes o on o.id=m.orden_id
    where not m.eliminado and o.n_interno > 0
  `
  const [beforeCaja, currentCaja] = await Promise.all([before.query(cajaSelect), after.query(cajaSelect)])
  const sourceCajaCounts = new Map()
  for (const row of dump.caja.filter(row => !bool(row.eliminado) && legacyOrderByInterno.has(int(row.n_interno)))) bump(sourceCajaCounts, cajaKey(row, true))
  const beforeCajaCounts = new Map()
  for (const row of beforeCaja.rows) bump(beforeCajaCounts, cajaKey(row))
  const currentCajaGroups = new Map()
  for (const row of currentCaja.rows) {
    const key = cajaKey(row)
    if (!currentCajaGroups.has(key)) currentCajaGroups.set(key, [])
    currentCajaGroups.get(key).push(row)
  }
  const cajaDeleteIds = []
  const cajaProblems = []
  for (const [key, rows] of currentCajaGroups) {
    const target = Math.max(beforeCajaCounts.get(key) || 0, sourceCajaCounts.get(key) || 0)
    const excess = rows.length - target
    if (excess <= 0) continue
    const candidates = rows.filter(row => Number(row.id) > beforeCajaMax).sort((a, b) => Number(a.id) - Number(b.id))
    if (candidates.length < excess) cajaProblems.push({ key, excess, candidates: candidates.length })
    else cajaDeleteIds.push(...candidates.slice(0, excess).map(row => Number(row.id)))
  }

  const beforeDespachoMax = Number((await before.query('select coalesce(max(id),0) max from bodega.despachos')).rows[0].max)
  const currentDespachos = await after.query(`
    select id, interno, to_char(fecha_interno::date,'YYYY-MM-DD') fecha_interno, tiene_multa
    from bodega.despachos where not eliminado and id > $1
  `, [beforeDespachoMax])
  const sourceDespachoByKey = new Map()
  const despachoConflicts = []
  for (const row of dump.despachos) {
    const key = despachoKey(row, true)
    const desired = bool(row.multa)
    if (sourceDespachoByKey.has(key) && sourceDespachoByKey.get(key) !== desired) despachoConflicts.push(key)
    sourceDespachoByKey.set(key, desired)
  }
  const despachoFixes = []
  for (const row of currentDespachos.rows) {
    const desired = sourceDespachoByKey.get(despachoKey(row))
    if (desired !== undefined && Boolean(row.tiene_multa) !== desired) despachoFixes.push({ id: Number(row.id), tieneMulta: desired })
  }

  const testOrders = await after.query(`
    select id, n_interno, rut_cliente, licitacion
    from ventas.ordenes
    where n_interno in (910000042,910000045)
      and rut_cliente like 'mv-kpis-%' and licitacion like 'OC-kpis-%'
  `)
  const testOrderIds = testOrders.rows.map(row => Number(row.id))
  const testRelations = testOrderIds.length ? (await after.query(`
    select
      (select count(*) from ventas.orden_items where orden_id=any($1::int[])) items,
      (select count(*) from caja.movimientos_caja where orden_id=any($1::int[])) caja,
      (select count(*) from bodega.guias_despachos where orden_id=any($1::int[])) guias,
      (select count(*) from bodega.despachos where orden_id=any($1::int[])) despachos,
      (select count(*) from ventas.notas_credito_internas where orden_id=any($1::int[])) notas
  `, [testOrderIds])).rows[0] : { items: 0, caja: 0, guias: 0, despachos: 0, notas: 0 }
  const productionSummary = (await after.query(`
    select
      count(*) filter (where not eliminada) ordenes_activas,
      count(*) filter (where not eliminada and n_interno > 0) ordenes_validas,
      count(*) filter (where not eliminada and estado='Activa' and estado_pago='No pagada' and n_interno > 0) no_pagadas_validas,
      count(*) filter (where not eliminada and estado='Activa' and estado_entrega='Pendiente entrega' and n_interno > 0) pendientes_validas,
      count(*) filter (where not eliminada and estado='Activa' and estado_pago='No pagada' and (n_interno is null or n_interno <= 0)) no_pagadas_anomalas,
      count(*) filter (where not eliminada and estado='Activa' and estado_entrega='Pendiente entrega' and (n_interno is null or n_interno <= 0)) pendientes_anomalas,
      count(*) filter (where not eliminada and n_interno > 0 and cliente_id is null) clientes_nulos_validos
    from ventas.ordenes
  `)).rows[0]

  const report = {
    mode: APPLY ? 'apply' : 'report',
    dump: { orders: legacyOrders.length, caja: dump.caja.length, despachos: dump.despachos.length },
    orders: { dateFixCount, clientFixCount, unknownDates: unknownDates.slice(0, 20), unknownDateCount: unknownDates.length },
    caja: { beforeMaxId: beforeCajaMax, deleteCount: cajaDeleteIds.length, problems: cajaProblems.slice(0, 10) },
    despachos: { beforeMaxId: beforeDespachoMax, newRows: currentDespachos.rows.length, fixCount: despachoFixes.length, conflicts: despachoConflicts },
    tests: { count: testOrderIds.length, nInternos: testOrders.rows.map(row => Number(row.n_interno)), relations: testRelations },
    productionSummary,
  }
  console.log(JSON.stringify(report, null, 2))

  if (!APPLY) return
  if (unknownDates.length || cajaProblems.length || despachoConflicts.length) throw new Error('El reporte contiene ambigüedades; no se aplicaron cambios')
  if (testOrderIds.length !== 2 || Number(testRelations.items) !== 2 || Number(testRelations.notas) !== 0) throw new Error('Las órdenes test no cumplen las precondiciones exactas')

  await after.query('begin')
  try {
    for (let offset = 0; offset < orderFixes.length; offset += 400) {
      const batch = orderFixes.slice(offset, offset + 400)
      const values = valuesSql(batch, ['id', 'expectedDate', 'setDate', 'clientId'])
      await after.query(`
        update ventas.ordenes o set
              fecha_estado_entrega = case when v.set_date::boolean then v.expected_date::date else o.fecha_estado_entrega end,
              cliente_id = coalesce(o.cliente_id, v.client_id::int)
        from (values ${values.sql}) as v(id,expected_date,set_date,client_id)
        where o.id=v.id::int
      `, values.params)
    }
    if (cajaDeleteIds.length) await after.query('delete from caja.movimientos_caja where id=any($1::int[])', [cajaDeleteIds])
    if (despachoFixes.length) {
      const values = valuesSql(despachoFixes, ['id', 'tieneMulta'])
      await after.query(`update bodega.despachos d set tiene_multa=v.tiene_multa::boolean from (values ${values.sql}) v(id,tiene_multa) where d.id=v.id::int`, values.params)
    }
    await after.query('delete from ventas.ordenes where id=any($1::int[])', [testOrderIds])
    await after.query('commit')
  } catch (error) {
    await after.query('rollback')
    throw error
  }

  const verifyOrders = await after.query(`select id,n_interno,cliente_id,to_char(fecha_estado_entrega::date,'YYYY-MM-DD') fecha_dia from ventas.ordenes where n_interno is not null`)
  const verifyByInterno = new Map(verifyOrders.rows.map(row => [Number(row.n_interno), row]))
  let remainingDates = 0, remainingClients = 0
  for (const source of legacyOrders) {
    const current = verifyByInterno.get(int(source.n_interno))
    if (!current) continue
    const expected = parseLegacyDate(source.fecha_estado_entrega)
    if (typeof expected === 'string' && current.fecha_dia !== expected) remainingDates++
    if (current.cliente_id == null) remainingClients++
  }
  const verify = await after.query(`
    select
      (select count(*) from caja.movimientos_caja where id=any($1::int[])) caja_ids_restantes,
      (select count(*) from ventas.ordenes where n_interno in (910000042,910000045)) tests_restantes
  `, [cajaDeleteIds.length ? cajaDeleteIds : [-1]])
  console.log(JSON.stringify({ verification: { remainingDates, remainingClients, ...verify.rows[0] } }, null, 2))
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await Promise.allSettled([before.end(), after.end()])
})
