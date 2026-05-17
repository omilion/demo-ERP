// Importa data legacy desde dump MySQL plastim2_rrhh.sql
// Tablas con prefijo plastimar*/allegro* -> tablas unificadas con empresa discriminator
// Uso: node backend/scripts/rrhh-import.mjs <path-a-rrhh.sql> [--dry]

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

const dumpPath = process.argv[2]
const isDry = process.argv.includes('--dry')
if (!dumpPath) {
  console.error('Uso: node rrhh-import.mjs <path-rrhh.sql> [--dry]')
  process.exit(1)
}

const sql = readFileSync(dumpPath, 'utf8')

// Parser de INSERT INTO `tabla` (cols...) VALUES (...),(...); — multilínea
function parseInserts(table) {
  const out = []
  const marker = `INSERT INTO \`${table}\` (`
  let idx = 0
  while ((idx = sql.indexOf(marker, idx)) !== -1) {
    const colsStart = idx + marker.length
    const colsEnd = sql.indexOf(')', colsStart)
    const cols = sql.slice(colsStart, colsEnd).split(',').map(c => c.trim().replace(/`/g, ''))
    const valuesStart = sql.indexOf(' VALUES ', colsEnd) + 8
    // encontrar fin del INSERT: ; al final fuera de strings
    let end = valuesStart, inStr = false, esc = false
    while (end < sql.length) {
      const ch = sql[end]
      if (esc) { esc = false; end++; continue }
      if (ch === '\\') { esc = true; end++; continue }
      if (ch === "'") { inStr = !inStr; end++; continue }
      if (!inStr && ch === ';') break
      end++
    }
    const valuesText = sql.slice(valuesStart, end)
    const rows = splitTuples(valuesText)
    for (const tuple of rows) {
      const vals = parseTuple(tuple)
      const obj = {}
      cols.forEach((c, i) => { obj[c] = vals[i] })
      out.push(obj)
    }
    idx = end + 1
  }
  return out
}

// Divide una serie de tuplas "(a,b),(c,d)" respetando strings con paréntesis
function splitTuples(text) {
  const tuples = []
  let depth = 0, inStr = false, escape = false, start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === "'" && !escape) inStr = !inStr
    if (inStr) continue
    if (ch === '(') { if (depth++ === 0) start = i + 1 }
    else if (ch === ')') { if (--depth === 0) tuples.push(text.slice(start, i)) }
  }
  return tuples
}

// Parsea valores dentro de una tupla
function parseTuple(text) {
  const vals = []
  let inStr = false, escape = false, current = '', isString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      if (ch === 'n') current += '\n'
      else if (ch === 't') current += '\t'
      else if (ch === 'r') current += '\r'
      else current += ch
      escape = false
      continue
    }
    if (ch === '\\') { escape = true; continue }
    if (ch === "'") {
      if (inStr) { inStr = false; vals.push(current); current = ''; isString = false }
      else { inStr = true; isString = true }
      continue
    }
    if (inStr) { current += ch; continue }
    if (ch === ',') {
      if (!isString) {
        const v = current.trim()
        if (v === 'NULL') vals.push(null)
        else if (v === '') {} // skip separator already pushed
        else vals.push(v)
      }
      current = ''
      isString = false
      continue
    }
    current += ch
  }
  if (current.trim() && !isString) {
    const v = current.trim()
    if (v === 'NULL') vals.push(null)
    else vals.push(v)
  }
  return vals
}

const toInt = v => v == null ? null : parseInt(v, 10)
const toFloat = v => v == null ? null : parseFloat(v)
const toBool = v => v == null ? true : (v === '1' || v === 1 || v === true)
const toDate = v => v == null || v === '0000-00-00' ? null : new Date(v)
const toDateTime = v => v == null || v === '0000-00-00 00:00:00' ? null : new Date(v)
const toTime = v => v == null ? null : new Date(`1970-01-01T${v}Z`)

async function importTrabajadores(empresa) {
  const tabla = `${empresa}trabajadores`
  const rows = parseInserts(tabla)
  console.log(`${tabla}: ${rows.length} filas`)
  const idMap = new Map()
  for (const r of rows) {
    const data = {
      empresa,
      apellidoPaterno: r.apellido_paterno || '',
      apellidoMaterno: r.apellido_materno || '',
      nombres: r.nombres || '',
      rut: r.rut || '',
      fechaNacimiento: r.fecha_nacimiento,
      estadoCivil: r.estado_civil,
      cargasFamiliares: r.cargas_familiares,
      direccion: r.direccion,
      comuna: r.comuna,
      nacionalidad: r.nacionalidad,
      afp: r.afp,
      salud: r.salud,
      telefono: r.telefono,
      contactoEmergencia: r.contacto_emergencia,
      numeroEmergencia: r.numero_emergencia,
      email: r.email,
      banco: r.banco,
      tipoCuenta: r.tipo_cuenta,
      numeroCuenta: r.numero_cuenta,
      cargo: r.cargo,
      fechaIngreso: r.fecha_ingreso,
      fechaTermino: toDate(r.fecha_termino),
      tipoContrato: r.tipo_contrato,
      sueldoLiquido: r.sueldo_liquido,
      observacion: r.observacion,
      user: r.user,
      estado: toBool(r.estado),
      foto: r.foto,
      createdAt: toDateTime(r.created_at) || new Date(),
      updatedAt: toDateTime(r.updated_at) || new Date(),
    }
    if (isDry) { console.log(`  DRY trabajador: ${data.nombres} ${data.apellidoPaterno}`); continue }
    const created = await prisma.trabajador.create({ data })
    idMap.set(parseInt(r.id, 10), created.id)
  }
  return idMap
}

async function importTabla(table, empresa, idMap, mapper) {
  const tabla = `${empresa}${table}`
  const rows = parseInserts(tabla)
  console.log(`${tabla}: ${rows.length} filas`)
  for (const r of rows) {
    const oldTrabId = parseInt(r[`${empresa}trabajadores_id`], 10)
    const newTrabId = idMap.get(oldTrabId)
    if (!newTrabId) { console.warn(`  skip: trabajador ${oldTrabId} no migrado`); continue }
    const data = mapper(r, newTrabId)
    if (isDry) { console.log(`  DRY ${table}: trabajadorId=${newTrabId}`); continue }
    await prisma[mapper.modelName].create({ data })
  }
}

async function importSharedTables() {
  // jornadas
  for (const r of parseInserts('jornadas')) {
    const data = {
      jornada: r.jornada, ingreso: toTime(r.ingreso), salida: toTime(r.salida),
      createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date(),
    }
    if (!isDry) await prisma.jornada.upsert({ where: { id: parseInt(r.id, 10) }, create: { id: parseInt(r.id, 10), ...data }, update: data })
  }
  for (const r of parseInserts('dias')) {
    const data = { dia: r.dia, createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date() }
    if (!isDry) await prisma.diaSemana.upsert({ where: { id: parseInt(r.id, 10) }, create: { id: parseInt(r.id, 10), ...data }, update: data })
  }
  for (const r of parseInserts('tipodias')) {
    const data = { tipo: r.tipo, estado: toBool(r.estado), createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date() }
    if (!isDry) await prisma.tipoDia.upsert({ where: { id: parseInt(r.id, 10) }, create: { id: parseInt(r.id, 10), ...data }, update: data })
  }
  // libros (con empresa)
  for (const r of parseInserts('libros')) {
    const data = {
      documento: r.documento || '', empresa: r.empresa, anio: r.anio, mes: r.mes,
      totalImponible: toInt(r.total_imponible), totalNoImponible: toInt(r.total_no_imponible),
      totalDescuentos: toInt(r.total_descuentos), anticipos: toInt(r.anticipos),
      liquidoPagar: toInt(r.liquido_pagar), totalHorasExtras: toInt(r.total_horas_extras),
      cantidadTrabajadores: toInt(r.cantidad_trabajadores), imagen: r.imagen,
      createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date(),
    }
    if (!isDry) await prisma.libroRemuneracion.create({ data })
  }
  console.log('Shared: jornadas, dias, tipodias, libros importados')
}

async function importEmpresa(empresa) {
  console.log(`\n── Empresa: ${empresa} ──`)
  const idMap = await importTrabajadores(empresa)

  const mappers = {
    contratos: { modelName: 'contrato', fn: (r, tId) => ({ trabajadorId: tId, contrato: r.contrato, plazo: r.plazo, inicio: toDate(r.inicio), termino: toDate(r.termino), estado: toBool(r.estado), imagen: r.imagen, createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date() }) },
    liquidaciones: { modelName: 'liquidacion', fn: (r, tId) => ({ trabajadorId: tId, anio: r.anio, mes: r.mes, sueldoBase: toInt(r.sueldo_base), totalImponible: toInt(r.total_imponible), totalHaberes: toInt(r.total_haberes), totalDescuentos: toInt(r.total_descuentos), liquidoPagar: toInt(r.liquido_pagar), horasExtras: toFloat(r.horas_extras), totalExtras: toInt(r.total_extras), imagen: r.imagen, estado: toBool(r.estado), createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date() }) },
    anticipos: { modelName: 'anticipo', fn: (r, tId) => ({ trabajadorId: tId, anio: r.annus, mes: r.mes, banco: r.banco, tipoCuenta: r.tcuenta, cuenta: r.cuenta, fecha: toDate(r.fecha), monto: toInt(r.monto), createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date() }) },
    asistencias: { modelName: 'asistencia', fn: (r, tId) => ({ trabajadorId: tId, anio: r.annus, mes: r.mes, dia: r.dia, tipoDiaId: toInt(r.tipodia_id), jornadaId: toInt(r.jornada_id), horaIngresoAm: toTime(r.hora_ingreso_am), horaSalidaAm: toTime(r.hora_salida_am), horaIngresoPm: toTime(r.hora_ingreso_pm), horaSalidaPm: toTime(r.hora_salida_pm), totalHoras: toFloat(r.total_horas), horasExtras: toFloat(r.horas_extras), createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date() }) },
    horas: { modelName: 'horaExtra', fn: (r, tId) => ({ trabajadorId: tId, contrato: r.contrato, plazo: r.plazo, inicio: toDate(r.inicio), termino: toDate(r.termino), estado: toBool(r.estado), imagen: r.imagen, createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date() }) },
    licencias: { modelName: 'licencia', fn: (r, tId) => ({ trabajadorId: tId, fecha: toDate(r.fecha), inicio: toDate(r.inicio), termino: toDate(r.termino), dias: toInt(r.dias), tipo: r.tipo, reposo: r.reposo, imagen: r.imagen, estado: toBool(r.estado), createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date() }) },
    vacaciones: { modelName: 'vacacion', fn: (r, tId) => ({ trabajadorId: tId, inicioContrato: toDate(r.inicio_contrato), diasPendientes: r.dias_pendientes, periodo: r.periodo, dias: toInt(r.dias), saldo: toInt(r.saldo), fechaInicio: toDate(r.fecha_inicio), fechaTermino: toDate(r.fecha_termino), imagen: r.imagen, estado: toBool(r.estado), createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date() }) },
    epps: { modelName: 'epp', fn: (r, tId) => ({ trabajadorId: tId, epp: r.epp, marca: r.marca, cantidad: toInt(r.cantidad) || 0, fechaEntrega: toDate(r.fecha_entrega), documento: r.documento, observacion: r.observacion, createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date() }) },
    hojas: { modelName: 'hojaVida', fn: (r, tId) => ({ trabajadorId: tId, fecha: toDate(r.fecha), documento: r.documento, imagen: r.imagen, estado: toBool(r.estado), createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date() }) },
  }

  for (const [tabla, { modelName, fn }] of Object.entries(mappers)) {
    const fullTable = `${empresa}${tabla}`
    const rows = parseInserts(fullTable)
    console.log(`${fullTable}: ${rows.length} filas`)
    for (const r of rows) {
      const oldTrabId = parseInt(r[`${empresa}trabajadores_id`], 10)
      const newTrabId = idMap.get(oldTrabId)
      if (!newTrabId) continue
      try {
        if (!isDry) await prisma[modelName].create({ data: fn(r, newTrabId) })
      } catch (e) { console.log(`  err ${tabla}: ${e.message}`) }
    }
  }

  // registros (sin trabajador FK)
  for (const r of parseInserts(`${empresa}registros`)) {
    const data = { empresa, anio: r.anio, mes: r.mes, imagen: r.imagen, createdAt: toDateTime(r.created_at) || new Date(), updatedAt: toDateTime(r.updated_at) || new Date() }
    if (!isDry) await prisma.registroEmpresa.create({ data })
  }
}

async function main() {
  console.log(`Importando RRHH desde ${dumpPath}${isDry ? ' (DRY)' : ''}`)
  await importSharedTables()
  await importEmpresa('plastimar')
  await importEmpresa('allegro')
  console.log('\n✓ Importación completada')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
