// Migra tablas legacy faltantes detectadas por check-coverage.
//   Independientes: sucursales, regiones, comunas, cargo_transporte, competencia, banner
//   Orden-linked:   descuentos_marco, descuentos_ventas, multas, historial_email
//   ODT (n_interno→orden→primer odt): taller_materiales, taller_historial_materiales
//   Sin link:       bitacora_taller (odtId null tras schema fix)
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
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean)
const DUMP = 'D:/downloads/plastim2_plastimar2014 (1).sql'

// ── Streaming parser para INSERT INTO `t` ... VALUES (...),(...);  ────
async function* parseRows(file, table) {
  const startMarker = `INSERT INTO \`${table}\` `
  const stream = createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 })
  let pending = ''
  let mode = 'scan'
  for await (const chunk of stream) {
    pending += chunk
    while (true) {
      if (mode === 'scan') {
        const idx = pending.indexOf(startMarker)
        if (idx < 0) {
          if (pending.length > startMarker.length) pending = pending.slice(-startMarker.length)
          break
        }
        pending = pending.slice(idx + startMarker.length)
        const vIdx = pending.indexOf('VALUES')
        if (vIdx < 0) { if (pending.length > 4000) pending = pending.slice(-4000); break }
        pending = pending.slice(vIdx + 6)
        mode = 'rows'
      }
      if (mode === 'rows') {
        let i = 0
        while (i < pending.length && pending[i] !== '(') i++
        if (i >= pending.length) { pending = ''; break }
        // parse one row
        if (pending[i] !== '(') break
        const row = []
        let buf = ''
        let inStr = false
        let strCh = ''
        let j = i + 1
        let done = false
        while (j < pending.length) {
          const c = pending[j]
          if (inStr) {
            if (c === '\\' && j + 1 < pending.length) { buf += pending[j + 1]; j += 2; continue }
            if (c === strCh) { inStr = false; j++; continue }
            buf += c; j++; continue
          }
          if (c === "'" || c === '"') { inStr = true; strCh = c; j++; continue }
          if (c === ',') { row.push(buf.trim()); buf = ''; j++; continue }
          if (c === ')') { row.push(buf.trim()); j++; done = true; break }
          buf += c; j++
        }
        if (!done) {
          // need more data
          break
        }
        yield row
        // skip whitespace, comma or ;
        while (j < pending.length && /[\s,]/.test(pending[j])) j++
        if (pending[j] === ';') { mode = 'scan'; j++ }
        pending = pending.slice(j)
      }
    }
  }
}

const toInt = s => { const n = parseInt(s, 10); return Number.isFinite(n) ? n : null }
const toFloat = s => { const n = parseFloat(s); return Number.isFinite(n) ? n : null }
const toStr = s => (s === 'NULL' || s == null) ? null : String(s)
const toDate = s => {
  if (!s || s === 'NULL' || s === '0000-00-00' || s === '0000-00-00 00:00:00') return null
  const d = new Date(s.replace(' ', 'T') + (s.length === 10 ? 'T00:00:00' : '') + 'Z')
  return isNaN(d.getTime()) ? null : d
}
const toBool = s => s === '1' || s === 'true'

const should = t => !ONLY.length || ONLY.includes(t)

async function migrateIndependent() {
  // sucursales: id_sucursal, nombre_sucursal
  if (should('sucursales')) {
    const rows = []
    for await (const r of parseRows(DUMP, 'sucursales')) {
      rows.push({ id: toInt(r[0]), nombre: toStr(r[1]) || 'Sin nombre' })
    }
    console.log(`sucursales: ${rows.length} legacy`)
    if (APPLY) {
      for (const r of rows) {
        await prisma.sucursal.upsert({ where: { id: r.id }, create: r, update: { nombre: r.nombre } })
      }
      await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('auth.sucursales', 'id'), GREATEST((SELECT MAX(id) FROM auth.sucursales), 1))`)
      console.log(`  ✓ ${rows.length} sucursales`)
    }
  }

  // regiones: id, codigo, region, estado
  if (should('regiones')) {
    const rows = []
    for await (const r of parseRows(DUMP, 'regiones')) {
      rows.push({ id: toInt(r[0]), codigo: toInt(r[1]), nombre: toStr(r[2]) || 'Sin nombre', activo: toBool(r[3]) })
    }
    console.log(`regiones: ${rows.length} legacy`)
    if (APPLY) {
      for (const r of rows) {
        await prisma.region.upsert({ where: { id: r.id }, create: r, update: { codigo: r.codigo, nombre: r.nombre, activo: r.activo } })
      }
      await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('clientes.regiones', 'id'), GREATEST((SELECT MAX(id) FROM clientes.regiones), 1))`)
      console.log(`  ✓ ${rows.length} regiones`)
    }
  }

  // comunas: id, codigo_region, codigo_provincia, codigo_comuna, comuna, estado
  if (should('comunas')) {
    const rows = []
    for await (const r of parseRows(DUMP, 'comunas')) {
      rows.push({
        id: toInt(r[0]), codigoRegion: toInt(r[1]), codigoProvincia: toInt(r[2]),
        codigoComuna: toInt(r[3]), nombre: toStr(r[4]) || 'Sin nombre', activo: toBool(r[5]),
      })
    }
    console.log(`comunas: ${rows.length} legacy`)
    if (APPLY) {
      for (const r of rows) {
        await prisma.comuna.upsert({ where: { id: r.id }, create: r, update: { codigoRegion: r.codigoRegion, codigoProvincia: r.codigoProvincia, codigoComuna: r.codigoComuna, nombre: r.nombre, activo: r.activo } })
      }
      await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('clientes.comunas', 'id'), GREATEST((SELECT MAX(id) FROM clientes.comunas), 1))`)
      console.log(`  ✓ ${rows.length} comunas`)
    }
  }

  // cargo_transporte: id, nombre, valor
  if (should('cargo_transporte')) {
    const rows = []
    for await (const r of parseRows(DUMP, 'cargo_transporte')) {
      rows.push({ id: toInt(r[0]), nombre: toStr(r[1]) || 'Sin nombre', valor: toFloat(r[2]) || 0 })
    }
    console.log(`cargo_transporte: ${rows.length} legacy`)
    if (APPLY) {
      for (const r of rows) {
        await prisma.cargoTransporte.upsert({ where: { id: r.id }, create: r, update: { nombre: r.nombre, valor: r.valor } })
      }
      await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('catalogo.cargo_transporte', 'id'), GREATEST((SELECT MAX(id) FROM catalogo.cargo_transporte), 1))`)
      console.log(`  ✓ ${rows.length} cargo_transporte`)
    }
  }

  // competencia: id, rut, email, nombre, razon_social
  if (should('competencia')) {
    const rows = []
    for await (const r of parseRows(DUMP, 'competencia')) {
      rows.push({ id: toInt(r[0]), rut: toStr(r[1]), email: toStr(r[2]), nombre: toStr(r[3]), razonSocial: toStr(r[4]) })
    }
    console.log(`competencia: ${rows.length} legacy`)
    if (APPLY) {
      for (const r of rows) {
        await prisma.competencia.upsert({ where: { id: r.id }, create: r, update: { rut: r.rut, email: r.email, nombre: r.nombre, razonSocial: r.razonSocial } })
      }
      await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('clientes.competencia', 'id'), GREATEST((SELECT MAX(id) FROM clientes.competencia), 1))`)
      console.log(`  ✓ ${rows.length} competencia`)
    }
  }

  // banner: id, imagen, Titulo, texto, orden
  if (should('banner')) {
    const rows = []
    for await (const r of parseRows(DUMP, 'banner')) {
      rows.push({ id: toInt(r[0]), imagenUrl: toStr(r[1]), titulo: toStr(r[2]) || 'Banner', subtitulo: toStr(r[3]), orden: toInt(r[4]) || 0 })
    }
    console.log(`banner: ${rows.length} legacy`)
    if (APPLY) {
      for (const r of rows) {
        await prisma.banner.upsert({ where: { id: r.id }, create: r, update: { imagenUrl: r.imagenUrl, titulo: r.titulo, subtitulo: r.subtitulo, orden: r.orden } })
      }
      await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('catalogo.banners', 'id'), GREATEST((SELECT MAX(id) FROM catalogo.banners), 1))`)
      console.log(`  ✓ ${rows.length} banner`)
    }
  }
}

async function migrateOrdenLinked() {
  // mapa n_interno → orden.id
  const ords = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } })
  const niToId = new Map(ords.map(o => [o.nInterno, o.id]))
  console.log(`Map nInterno→ordenId: ${niToId.size}`)

  if (should('descuentos_marco')) {
    const rows = []
    let skipped = 0
    for await (const r of parseRows(DUMP, 'descuentos_marco')) {
      const ni = toInt(r[1])
      const ordenId = niToId.get(ni)
      if (!ordenId) { skipped++; continue }
      rows.push({ ordenId, porcentaje: toFloat(r[2]) || 0 })
    }
    console.log(`descuentos_marco: ${rows.length} válidos, ${skipped} sin orden`)
    if (APPLY && rows.length) {
      await prisma.descuentoMarco.createMany({ data: rows })
      console.log(`  ✓ ${rows.length}`)
    }
  }

  if (should('descuentos_ventas')) {
    const rows = []
    let skipped = 0
    for await (const r of parseRows(DUMP, 'descuentos_ventas')) {
      const ni = toInt(r[1])
      const ordenId = niToId.get(ni)
      if (!ordenId) { skipped++; continue }
      rows.push({ ordenId, porcentaje: toFloat(r[2]) || 0 })
    }
    console.log(`descuentos_ventas: ${rows.length} válidos, ${skipped} sin orden`)
    if (APPLY && rows.length) {
      await prisma.descuentoVenta.createMany({ data: rows })
      console.log(`  ✓ ${rows.length}`)
    }
  }

  if (should('multas')) {
    const rows = []
    for await (const r of parseRows(DUMP, 'multas')) {
      const interno = toStr(r[1])
      const ni = interno ? parseInt(interno, 10) : null
      const ordenId = Number.isFinite(ni) ? (niToId.get(ni) || null) : null
      rows.push({
        ordenId, interno, monto: toInt(r[2]),
        nDocumento: toStr(r[3]), fecha: toDate(r[4]),
        numero: toStr(r[5]), usuario: toStr(r[6]),
      })
    }
    console.log(`multas: ${rows.length} legacy (${rows.filter(r => r.ordenId).length} con orden)`)
    if (APPLY && rows.length) {
      await prisma.multa.createMany({ data: rows })
      console.log(`  ✓ ${rows.length}`)
    }
  }

  if (should('historial_email')) {
    const rows = []
    let withOrden = 0
    for await (const r of parseRows(DUMP, 'historial_email')) {
      const nCompra = toStr(r[1])
      const ni = nCompra ? parseInt(nCompra, 10) : null
      const ordenId = Number.isFinite(ni) ? (niToId.get(ni) || null) : null
      if (ordenId) withOrden++
      rows.push({
        nCompra, ordenId,
        situacion: toStr(r[2]), obs: toStr(r[3]),
        usuario: toStr(r[4]), fechaHora: toDate(r[5]) || new Date(0),
      })
    }
    console.log(`historial_email: ${rows.length} legacy (${withOrden} con orden)`)
    if (APPLY && rows.length) {
      // chunk inserts
      const chunk = 1000
      for (let i = 0; i < rows.length; i += chunk) {
        await prisma.historialEmail.createMany({ data: rows.slice(i, i + chunk) })
      }
      console.log(`  ✓ ${rows.length}`)
    }
  }
}

async function migrateTallerOdtLinked() {
  // Map n_interno → odt.id (primer ODT por orden)
  const odts = await prisma.odt.findMany({ where: { ordenId: { not: null } }, select: { id: true, ordenId: true }, orderBy: { id: 'asc' } })
  const ordenToOdt = new Map()
  for (const o of odts) if (!ordenToOdt.has(o.ordenId)) ordenToOdt.set(o.ordenId, o.id)
  const ords = await prisma.orden.findMany({ where: { nInterno: { not: null } }, select: { id: true, nInterno: true } })
  const niToOdt = new Map()
  for (const o of ords) {
    const odtId = ordenToOdt.get(o.id)
    if (odtId) niToOdt.set(o.nInterno, odtId)
  }
  console.log(`Map nInterno→odtId: ${niToOdt.size}`)

  if (should('taller_materiales')) {
    const rows = []
    let skipped = 0
    for await (const r of parseRows(DUMP, 'taller_materiales')) {
      const ni = toInt(r[1])
      const odtId = niToOdt.get(ni) || null
      if (!odtId) { skipped++; continue }
      rows.push({
        odtId,
        codigoInterno: toStr(r[2]), nombre: toStr(r[3]),
        cantidad: toFloat(r[4]) || 0, unidad: toStr(r[5]), taller: toStr(r[6]),
      })
    }
    console.log(`taller_materiales: ${rows.length} válidos, ${skipped} sin odt`)
    if (APPLY && rows.length) {
      await prisma.tallerMaterial.createMany({ data: rows })
      console.log(`  ✓ ${rows.length}`)
    }
  }

  if (should('taller_historial_materiales')) {
    const rows = []
    for await (const r of parseRows(DUMP, 'taller_historial_materiales')) {
      const ni = toInt(r[1])
      const odtId = niToOdt.get(ni) || null
      rows.push({
        odtId,
        codigoInterno: toStr(r[2]), nombre: toStr(r[3]),
        egreso: toFloat(r[4]) || 0, ingreso: toFloat(r[5]) || 0,
        unidad: toStr(r[6]), usuario: toStr(r[7]),
        fecha: toDate(r[8]) || new Date(0),
        taller: toStr(r[9]), sucursalId: toInt(r[10]),
      })
    }
    console.log(`taller_historial_materiales: ${rows.length} legacy (${rows.filter(r => r.odtId).length} con odt)`)
    if (APPLY && rows.length) {
      await prisma.tallerHistorialMaterial.createMany({ data: rows })
      console.log(`  ✓ ${rows.length}`)
    }
  }
}

async function migrateBitacora() {
  if (!should('bitacora_taller')) return
  // Bitacora legacy no tiene FK a ODT — requiere schema con odtId nullable
  const rows = []
  for await (const r of parseRows(DUMP, 'bitacora_taller')) {
    rows.push({
      // odtId no se setea — legacy no tiene link
      usuario: toStr(r[1]) || 'desconocido',
      fecha: toDate(r[2]),
      texto: toStr(r[3]) || '',
      usuarioReporta: toStr(r[4]),
      sucursalId: toInt(r[5]),
    })
  }
  console.log(`bitacora_taller: ${rows.length} legacy (sin link ODT — requiere schema odtId nullable)`)
  if (APPLY && rows.length) {
    const chunk = 1000
    for (let i = 0; i < rows.length; i += chunk) {
      await prisma.bitacoraTaller.createMany({ data: rows.slice(i, i + chunk) })
    }
    console.log(`  ✓ ${rows.length}`)
  }
}

async function main() {
  console.log(`\n=== Migrate missing tables (${APPLY ? 'APLICANDO' : 'DRY RUN'}) ===\n`)
  await migrateIndependent()
  await migrateOrdenLinked()
  await migrateTallerOdtLinked()
  await migrateBitacora()
  if (!APPLY) console.log(`\n→ Re-ejecutar con --apply para escribir.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
