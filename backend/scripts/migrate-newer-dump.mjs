// Migra deltas del dump 13-may-2026 (formato phpMyAdmin 5.2 nuevo).
//   - clientes nuevos (rut no en v2)
//   - ordenes nuevas (n_interno no en v2) + items
//   - guias_despachos nuevos (link via n_interno)
//   - historico_cobranza nuevos (link via interno)
//   - despachos nuevos (link via interno=legacy_id → necesita map de orden_compra_sistema.id→n_interno)
//
// Uso:
//   node scripts/migrate-newer-dump.mjs              → dry-run
//   node scripts/migrate-newer-dump.mjs --apply
//   node scripts/migrate-newer-dump.mjs --apply --only=clientes,ordenes

import { readFileSync, createReadStream } from 'fs'
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
const APPLY = process.argv.includes('--apply')
const ONLY = (process.argv.find(a => a.startsWith('--only='))?.split('=')[1] || '').split(',').filter(Boolean)
const want = t => ONLY.length === 0 || ONLY.includes(t)

const DUMP = 'D:/downloads/plastim2_plastimar2014 (1).sql'
const normRut = s => (s || '').trim().toUpperCase().replace(/[.\-\s]/g, '')

// ──────────────────────────────────────────────────────────────
// PARSER streaming: ubica INSERT INTO `table` y consume hasta ;
// Devuelve array de filas como arrays de strings (NULL→null)
// ──────────────────────────────────────────────────────────────
async function parseTable(file, table) {
  const startMarker = `INSERT INTO \`${table}\` `
  const rows = []
  const stream = createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 })

  let pending = ''  // buffer text not yet processed
  let mode = 'scan' // 'scan' (looking for marker) | 'header' (consume up to VALUES) | 'rows'
  let row = null
  let cur = ''
  let inStr = false
  let strCh = ''

  for await (const chunk of stream) {
    pending += chunk
    while (true) {
      if (mode === 'scan') {
        const idx = pending.indexOf(startMarker)
        if (idx < 0) {
          // mantén tail por si marker cruza chunk
          if (pending.length > startMarker.length) pending = pending.slice(-startMarker.length)
          break
        }
        pending = pending.slice(idx + startMarker.length)
        mode = 'header'
      }
      if (mode === 'header') {
        const idx = pending.indexOf('VALUES')
        if (idx < 0) {
          if (pending.length > 1000) pending = pending.slice(-1000)
          break
        }
        pending = pending.slice(idx + 'VALUES'.length)
        mode = 'rows'
        row = null
      }
      if (mode === 'rows') {
        let i = 0
        const n = pending.length
        let consumed = 0
        while (i < n) {
          const c = pending[i]
          if (row === null) {
            if (c === ' ' || c === '\n' || c === '\r' || c === ',' || c === '\t') { i++; continue }
            if (c === '(') { row = []; cur = ''; inStr = false; i++; continue }
            if (c === ';') {
              // section terminó
              mode = 'scan'
              i++
              consumed = i
              break
            }
            // unexpected, skip
            i++
            continue
          }
          if (inStr) {
            if (c === '\\') {
              if (i + 1 >= n) break // need more data
              cur += pending[i + 1]; i += 2; continue
            }
            if (c === strCh) { inStr = false; i++; continue }
            cur += c; i++; continue
          }
          if (c === "'" || c === '"') { inStr = true; strCh = c; i++; continue }
          if (c === ',') { row.push(cur === 'NULL' ? null : cur.trim()); cur = ''; i++; continue }
          if (c === ')') {
            row.push(cur === 'NULL' ? null : cur.trim())
            rows.push(row)
            row = null
            cur = ''
            i++
            continue
          }
          cur += c; i++
        }
        if (mode === 'scan') {
          pending = pending.slice(consumed)
          continue
        }
        // consumir hasta i (lo que se procesó), guardar el resto que quizás necesita más data
        pending = pending.slice(i)
        break
      }
    }
  }
  return rows
}

const parseDate = s => {
  if (!s || s === '0000-00-00' || s.startsWith('0000-00-00')) return null
  const d = new Date(s.replace(' ', 'T'))
  return isNaN(d) ? null : d
}
const parseInt0 = v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n }
const parseIntN = v => { if (v == null || v === '') return null; const n = parseInt(v, 10); return isNaN(n) ? null : n }

// ──────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Migración dump 13-may-2026 (${APPLY ? 'APLICANDO' : 'DRY RUN'}) ===\n`)
  if (ONLY.length) console.log(`Filtro: ${ONLY.join(', ')}\n`)

  // ── CLIENTES ────────────────────────────────────────────────
  if (want('clientes')) {
    console.log(`▸ Clientes`)
    const rows = await parseTable(DUMP, 'clientes')
    console.log(`  legacy: ${rows.length} rows`)
    const v2Cli = await prisma.cliente.findMany({ select: { rut: true } })
    const v2Ruts = new Set(v2Cli.map(c => normRut(c.rut)))
    const toInsert = []
    const seen = new Set()
    for (const r of rows) {
      const rut = (r[4] || '').trim()
      if (!rut) continue
      const k = normRut(rut)
      if (!k || v2Ruts.has(k) || seen.has(k)) continue
      seen.add(k)
      toInsert.push({
        rut: rut,
        nombre: (r[1] || '').trim() || rut,
        email: (r[2] || '').trim() || null,
        telefono: (r[3] || '').trim() || null,
        razonSocial: (r[5] || '').trim() || null,
        giro: (r[6] || '').trim() || null,
        direccion: (r[7] || '').trim() || null,
        region: (r[8] || '').trim() || null,
        comuna: (r[9] || '').trim() || null,
      })
    }
    console.log(`  nuevos (rut no en v2): ${toInsert.length}`)
    if (APPLY && toInsert.length) {
      for (let i = 0; i < toInsert.length; i += 200) {
        await prisma.cliente.createMany({ data: toInsert.slice(i, i + 200), skipDuplicates: true })
      }
      console.log(`  ✓ insertados`)
    }
  }

  // ── ORDENES ─────────────────────────────────────────────────
  let nInternoToNewOrdenId = new Map()
  let legacyIdToNInterno = new Map()  // para despachos
  if (want('ordenes')) {
    console.log(`\n▸ Ordenes`)
    const rows = await parseTable(DUMP, 'orden_compra_sistema')
    console.log(`  legacy: ${rows.length} rows`)
    const v2Ords = await prisma.orden.findMany({ select: { nInterno: true } })
    const v2NIs = new Set(v2Ords.map(o => o.nInterno).filter(x => x != null))
    // Mapa rut→cliente_id (debe re-leerse después de insertar clientes nuevos)
    const clientes = await prisma.cliente.findMany({ select: { id: true, rut: true } })
    const rutToCliId = new Map()
    for (const c of clientes) if (c.rut) rutToCliId.set(normRut(c.rut), c.id)

    const toInsert = []
    for (const r of rows) {
      const legacyId = parseInt0(r[0])
      const ni = parseInt0(r[1])
      if (legacyId && ni) legacyIdToNInterno.set(legacyId, ni)
      if (!ni || v2NIs.has(ni)) continue
      if (r[15] === '1') continue  // eliminada
      const rutLegacy = (r[8] || '').trim()
      const fecha = parseDate(r[3])
      const fecham = parseDate(r[16])
      toInsert.push({
        nInterno: ni,
        tipo: r[9] || 'Venta sala',
        estado: r[6] || 'Activa',
        estadoPago: r[7] || 'No pagada',
        estadoEntrega: r[12] || 'Pendiente entrega',
        fechaEstadoEntrega: parseDate(r[13]),
        clienteId: rutLegacy ? (rutToCliId.get(normRut(rutLegacy)) || null) : null,
        rutCliente: rutLegacy || null,
        emailCliente: (r[14] || '').trim() || null,
        userId: 1,
        sucursalId: parseInt0(r[4]) || null,
        creadorNombre: (r[5] || '').trim() || null,
        observaciones: (r[10] || '').trim() || null,
        licitacion: (r[2] || '').trim() || null,
        eliminada: r[15] === '1',
        userMod: (r[17] || '').trim() || null,
        fecham: fecham,
        createdAt: fecha || new Date(),
      })
    }
    console.log(`  ordenes nuevas a insertar: ${toInsert.length}`)
    console.log(`  legacyId→nInterno map: ${legacyIdToNInterno.size}`)

    if (APPLY && toInsert.length) {
      for (let i = 0; i < toInsert.length; i += 200) {
        await prisma.orden.createMany({ data: toInsert.slice(i, i + 200), skipDuplicates: true })
        if ((i + 200) % 1000 === 0 || i + 200 >= toInsert.length) console.log(`  ${Math.min(i + 200, toInsert.length)}/${toInsert.length}`)
      }
      // Build map nInterno→nuevoId
      const newOrds = await prisma.orden.findMany({
        where: { nInterno: { in: toInsert.map(o => o.nInterno) } },
        select: { id: true, nInterno: true },
      })
      for (const o of newOrds) nInternoToNewOrdenId.set(o.nInterno, o.id)
      console.log(`  ✓ insertadas; map nInterno→nuevoId: ${nInternoToNewOrdenId.size}`)
    }
  }

  // ── ITEMS (productos_comprados_local) ───────────────────────
  if (want('items') && APPLY) {
    console.log(`\n▸ Items (productos_comprados_local)`)
    const itemRows = await parseTable(DUMP, 'productos_comprados_local')
    console.log(`  legacy items: ${itemRows.length}`)
    // Mapa niInterno→ordenId para TODAS las ordenes en v2
    const allOrds = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } })
    const niToOrdId = new Map()
    for (const o of allOrds) niToOrdId.set(o.nInterno, o.id)
    // Solo insertar items para ordenes que NO tienen items aún (recién migradas)
    const ordsConItems = await prisma.$queryRawUnsafe(`SELECT DISTINCT orden_id FROM ventas.orden_items`)
    const ordsConItemsSet = new Set(ordsConItems.map(r => r.orden_id))
    const prods = await prisma.producto.findMany({ select: { id: true, codigoInterno: true } })
    const codToProdId = new Map()
    for (const p of prods) if (p.codigoInterno) codToProdId.set(p.codigoInterno.trim().toUpperCase(), p.id)

    const toInsert = []
    let sinProducto = 0, skippedHasItems = 0
    for (const r of itemRows) {
      const ni = parseInt0(r[1])
      if (!ni) continue
      const ordenId = niToOrdId.get(ni)
      if (!ordenId) continue
      if (ordsConItemsSet.has(ordenId)) { skippedHasItems++; continue }
      if (r[10] === '1') continue  // eliminado
      const codigo = (r[2] || '').trim()
      const productoId = codToProdId.get(codigo.toUpperCase()) || 0
      if (productoId === 0) sinProducto++
      toInsert.push({
        ordenId,
        productoId,
        codigoInterno: codigo || null,
        nombre: (r[3] || '').trim() || null,
        descripcion: (r[8] || '').trim() || null,
        cantidad: parseInt0(r[4]),
        precioUnitario: parseFloat(r[5]) || 0,
        precioConIva: parseFloat(r[6]) || null,
        nEntregados: parseInt0(r[7]),
        cargoTransporte: parseFloat(r[9]) || 0,
        eliminado: r[10] === '1',
        userMod: r[12] || null,
        fecham: parseDate(r[11]),
      })
    }
    console.log(`  items para ordenes sin items previos: ${toInsert.length}`)
    console.log(`  items saltados (orden ya tiene items): ${skippedHasItems}`)
    console.log(`  items con codigo no en catálogo (productoId=0): ${sinProducto}`)

    if (toInsert.length) {
      for (let i = 0; i < toInsert.length; i += 500) {
        await prisma.ordenItem.createMany({ data: toInsert.slice(i, i + 500) })
        if ((i + 500) % 2000 === 0 || i + 500 >= toInsert.length) console.log(`  ${Math.min(i + 500, toInsert.length)}/${toInsert.length}`)
      }
      console.log(`  ✓ items insertados`)
    }
  }

  // ── GUIAS ───────────────────────────────────────────────────
  if (want('guias')) {
    console.log(`\n▸ Guías de despacho`)
    const rows = await parseTable(DUMP, 'guias_despachos')
    console.log(`  legacy: ${rows.length}`)
    // map nInterno→ordenId (existentes en v2)
    const allOrds = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } })
    const niToOrdId = new Map()
    for (const o of allOrds) niToOrdId.set(o.nInterno, o.id)
    // existing guias by (nInterno, nGuia) to skip duplicates
    const v2Guias = await prisma.guiaDespacho.findMany({ select: { nInterno: true, nGuia: true } })
    const v2Set = new Set(v2Guias.map(g => `${g.nInterno}|${g.nGuia}`))
    const toInsert = []
    for (const r of rows) {
      const ni = parseInt0(r[2])
      const nGuia = (r[3] || '').trim()
      if (!ni || !nGuia) continue
      const k = `${ni}|${nGuia}`
      if (v2Set.has(k)) continue
      const fechaG = parseDate(r[1]) || parseDate(r[4]) || new Date('2020-01-01')
      toInsert.push({
        ordenId: niToOrdId.get(ni) || null,
        nInterno: ni,
        nGuia: nGuia,
        fechaGuia: fechaG,
        origen: (r[5] || '').trim() || null,
        createdAt: parseDate(r[4]) || new Date(),
      })
    }
    console.log(`  nuevas a insertar: ${toInsert.length}`)
    if (APPLY && toInsert.length) {
      for (let i = 0; i < toInsert.length; i += 500) {
        await prisma.guiaDespacho.createMany({ data: toInsert.slice(i, i + 500), skipDuplicates: true })
      }
      console.log(`  ✓ insertadas`)
    }
  }

  // ── COBRANZA ────────────────────────────────────────────────
  if (want('cobranza')) {
    console.log(`\n▸ Cobranza histórico`)
    const rows = await parseTable(DUMP, 'historico_cobranza')
    console.log(`  legacy: ${rows.length}`)
    // existing by id since id is unique
    const v2Ids = new Set((await prisma.cobranzaHistorico.findMany({ select: { id: true } })).map(c => c.id))
    const allOrds = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } })
    const niToOrdId = new Map()
    for (const o of allOrds) niToOrdId.set(o.nInterno, o.id)

    const toInsert = []
    for (const r of rows) {
      const legId = parseInt0(r[0])
      if (!legId || v2Ids.has(legId)) continue
      const interno = parseIntN(r[2])
      toInsert.push({
        // id: legId,  // dejar autoincrement para evitar colisiones
        ejecutiva: r[1] || null,
        interno: interno,
        ndoc: parseIntN(r[3]),
        monto: parseIntN(r[4]),
        montoMenos: parseIntN(r[5]),
        nc: parseIntN(r[6]),
        valorFactura: parseIntN(r[7]),
        multas: parseIntN(r[8]),
        cliente: r[9] || null,
        rut: r[10] || null,
        fechaFactura: parseDate(r[11]),
        mesAnio: r[12] || null,
        estado: r[13] || null,
        comision: r[14] || null,
        pagoCom: parseDate(r[15]),
        despacho: parseDate(r[16]),
        fechaGestion: parseDate(r[17]),
        ingresoPago: parseDate(r[18]),
        fechaPago: parseDate(r[19]),
        banco: r[20] || null,
        reclamo: r[21] || null,
        observacion: r[22] || null,
        ordenId: interno ? (niToOrdId.get(interno) || null) : null,
      })
    }
    console.log(`  nuevas a insertar: ${toInsert.length}`)
    if (APPLY && toInsert.length) {
      for (let i = 0; i < toInsert.length; i += 500) {
        await prisma.cobranzaHistorico.createMany({ data: toInsert.slice(i, i + 500) })
      }
      console.log(`  ✓ insertadas`)
    }
  }

  // ── CAJA (movimientos) ──────────────────────────────────────
  if (want('caja')) {
    console.log(`\n▸ Caja / movimientos`)
    const rows = await parseTable(DUMP, 'caja')
    console.log(`  legacy: ${rows.length}`)
    const allOrds = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } })
    const niToOrdId = new Map()
    for (const o of allOrds) niToOrdId.set(o.nInterno, o.id)
    // Existing movimientos by (ordenId, fecha, monto, medio_pago) heuristic — simpler: get distinct orden_ids that have movimientos
    const ordsConMov = new Set((await prisma.$queryRawUnsafe(`SELECT DISTINCT orden_id FROM caja.movimientos_caja WHERE orden_id IS NOT NULL`)).map(r => r.orden_id))
    const toInsert = []
    let skipped = 0
    for (const r of rows) {
      const ni = parseInt0(r[1])
      const ordenId = niToOrdId.get(ni)
      if (!ordenId) continue
      if (ordsConMov.has(ordenId)) { skipped++; continue }
      if (r[23] === '1') continue  // eliminado
      const ingreso = parseInt0(r[3])
      const egreso = parseInt0(r[4])
      const monto = ingreso - egreso  // positivo ingreso, negativo egreso
      toInsert.push({
        ordenId,
        tipo: ingreso > 0 ? 'ingreso' : 'egreso',
        monto: Math.abs(monto),
        medioPago: r[5] || '',
        cuotas: parseIntN(r[6]),
        fecha: parseDate(r[7]),
        documento: r[9] || null,
        nDoc: r[10] || null,
        tipoDocumento: r[11] || null,
        estadoDoc: r[12] || null,
        estadoPagoDoc: r[13] || null,
        pagaCon: parseIntN(r[14]),
        usuario: r[15] || null,
        origenMedioPago: r[18] || null,
        nMedioPago: r[19] || null,
        numeroNCInterna: r[21] || null,
        eliminado: r[23] === '1',
        userMod: r[25] || null,
        fecham: parseDate(r[24]),
      })
    }
    console.log(`  movimientos para ordenes nuevas: ${toInsert.length}`)
    console.log(`  saltados (orden ya tiene movimientos): ${skipped}`)
    if (APPLY && toInsert.length) {
      for (let i = 0; i < toInsert.length; i += 500) {
        await prisma.movimientoCaja.createMany({ data: toInsert.slice(i, i + 500) })
      }
      console.log(`  ✓ insertados`)
    }
  }

  // ── DESPACHOS ───────────────────────────────────────────────
  if (want('despachos')) {
    console.log(`\n▸ Despachos`)
    const rows = await parseTable(DUMP, 'despachos')
    console.log(`  legacy: ${rows.length}`)
    // Re-cargar legacyIdToNInterno si está vacío
    if (legacyIdToNInterno.size === 0) {
      const ordRows = await parseTable(DUMP, 'orden_compra_sistema')
      for (const r of ordRows) {
        const lid = parseInt0(r[0])
        const ni = parseInt0(r[1])
        if (lid && ni) legacyIdToNInterno.set(lid, ni)
      }
    }
    const allOrds = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } })
    const niToOrdId = new Map()
    for (const o of allOrds) niToOrdId.set(o.nInterno, o.id)
    const v2Desp = await prisma.despacho.findMany({ select: { interno: true, fechaInterno: true } })
    const v2Set = new Set(v2Desp.map(d => `${d.interno}|${d.fechaInterno?.toISOString()?.slice(0,10) || ''}`))

    const toInsert = []
    for (const r of rows) {
      const internoStr = (r[1] || '').trim()
      const fInt = parseDate(r[3])
      const k = `${internoStr}|${fInt?.toISOString()?.slice(0,10) || ''}`
      if (v2Set.has(k)) continue
      const legId = parseInt(internoStr, 10)
      const ni = !isNaN(legId) ? legacyIdToNInterno.get(legId) : null
      toInsert.push({
        ordenId: ni ? (niToOrdId.get(ni) || null) : null,
        interno: internoStr || null,
        plazoEntrega: (r[2] || '').trim() || null,
        fechaInterno: fInt,
        fechaEntrega: parseDate(r[4]),
        tipoDespacho: r[5] || null,
        transporte: r[6] || null,
        montoEnvio: parseIntN(r[7]),
        direccion: r[8] || null,
        contacto: r[9] || null,
        region: r[10] || null,
        comuna: r[11] || null,
        parcial: r[12] === '1',
        tieneMulta: r[13] === '1',
        usuario: r[14] || null,
      })
    }
    console.log(`  nuevos a insertar: ${toInsert.length}`)
    if (APPLY && toInsert.length) {
      for (let i = 0; i < toInsert.length; i += 200) {
        await prisma.despacho.createMany({ data: toInsert.slice(i, i + 200) })
      }
      console.log(`  ✓ insertados`)
    }
  }

  console.log(`\n═══════════════════════════════\n`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
