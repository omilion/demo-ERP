// Migra despachos + guias_despachos desde dump SQL legacy y enlaza ordenId vía nInterno.
// Usage:
//   node scripts/migrate-despachos-guias.mjs          → dry-run
//   node scripts/migrate-despachos-guias.mjs --apply  → ejecuta

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
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const SQL_PATH = 'D:/downloads/plastim2_plastimar2014.sql'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
const APPLY = process.argv.includes('--apply')

// Lee TODAS las secciones INSERT INTO `tabla` (puede haber varias) y las concatena.
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
      if (line.trimEnd().endsWith(';')) {
        sections.push(collected.join('\n'))
        inside = false
        collected = []
      }
    } else if (inside) {
      collected.push(line)
      if (line.trimEnd().endsWith(';')) {
        sections.push(collected.join('\n'))
        inside = false
        collected = []
      }
    }
  }
  rl.close()
  return sections.join('\n')
}

function parseRows(insertText) {
  // Múltiples INSERT INTO ... VALUES ...; concatenados.
  // Strip cada cabecera INSERT INTO ... VALUES y los trailing `;`
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
        if (c === ',') {
          row.push(started ? cur : (cur.trim() === 'NULL' ? null : cur.trim()))
          cur = ''; started = false; i++; continue
        }
        if (c === ')') {
          row.push(started ? cur : (cur.trim() === 'NULL' ? null : cur.trim()))
          i++; break
        }
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
  const d = new Date(v.replace(' ', 'T'))
  return isNaN(d) ? null : d
}
const bool = v => v == 1 || v === '1'

async function main() {
  console.log(`\n=== Migrar despachos + guias (${APPLY ? 'APLICANDO' : 'DRY RUN'}) ===\n`)

  // Mapa nInterno → orden.id
  const ordenes = await prisma.orden.findMany({
    where: { nInterno: { not: null } },
    select: { id: true, nInterno: true },
  })
  const byNInterno = new Map(ordenes.map(o => [o.nInterno, o.id]))
  console.log(`Órdenes indexadas por nInterno: ${ordenes.length}`)

  // Mapa legacy_id → n_interno (despachos.interno apunta al id legacy)
  console.log(`Construyendo mapa legacy_id→n_interno desde orden_compra_sistema…`)
  const ocsText = await readInsertSection('orden_compra_sistema')
  const ocsRows = parseRows(ocsText)
  // Cols: id, n_interno, orden_compra, fecha_hora, sucursal, usuario, estado, estado_pago,
  //       rut_cliente, tipo, obs, id_licitacion, estado_entrega, fecha_estado_entrega, email, eliminada, fecham, user
  const legacyIdToNInterno = new Map()
  for (const r of ocsRows) {
    const lid = num(r[0]); const ni = num(r[1])
    if (lid && ni) legacyIdToNInterno.set(lid, ni)
  }
  console.log(`  ${legacyIdToNInterno.size} pares legacy_id→n_interno`)

  // ── Despachos ─────────────────────────────────────────────────────────
  console.log(`\nLeyendo despachos del dump…`)
  const despText = await readInsertSection('despachos')
  const despRows = parseRows(despText)
  // Cols: id, interno, plazo_entrega, fecha_interno, fecha_entrega, tipo_despacho, transporte,
  //       monto_envio, direccion, contacto, region, comuna, parcial, multa, usuario, fecham
  const despachos = despRows.map(r => {
    const interno = str(r[1])
    const legacyId = interno ? parseInt(interno, 10) : null
    const nI = legacyId && legacyIdToNInterno.get(legacyId) || null
    return {
      ordenId: nI && byNInterno.has(nI) ? byNInterno.get(nI) : null,
      interno,
      plazoEntrega: str(r[2]),
      fechaInterno: dat(r[3]),
      fechaEntrega: dat(r[4]),
      tipoDespacho: str(r[5]),
      transporte: str(r[6]),
      montoEnvio: num(r[7]),
      direccion: str(r[8]),
      contacto: str(r[9]),
      region: str(r[10]),
      comuna: str(r[11]),
      parcial: bool(r[12]),
      tieneMulta: bool(r[13]),
      usuario: str(r[14]),
    }
  })
  const despConOrden = despachos.filter(d => d.ordenId != null).length
  console.log(`Despachos parseados: ${despachos.length} | con ordenId: ${despConOrden}`)

  // ── Guias ─────────────────────────────────────────────────────────────
  console.log(`\nLeyendo guias del dump (esto tarda)…`)
  const guiText = await readInsertSection('guias_despachos')
  const guiRows = parseRows(guiText)
  // Cols: id, fecha_guia, n_interno, n_guia, fecha_creacion, origen
  const guias = guiRows.map(r => {
    const nI = num(r[2])
    return {
      ordenId: nI && byNInterno.has(nI) ? byNInterno.get(nI) : null,
      nInterno: nI,
      nGuia: str(r[3]),
      fechaGuia: dat(r[1]) || new Date(0),
      origen: str(r[5]),
    }
  }).filter(g => g.nGuia != null)
  const guiConOrden = guias.filter(g => g.ordenId != null).length
  console.log(`Guías parseadas: ${guias.length} | con ordenId: ${guiConOrden}`)

  if (!APPLY) {
    console.log(`\n→ Re-ejecutar con --apply para insertar.`)
    return
  }

  console.log(`\n--- APLICANDO ---`)
  // Borrar previos para evitar duplicados al re-ejecutar
  await prisma.despacho.deleteMany({})
  await prisma.guiaDespacho.deleteMany({})
  console.log(`  ✓ tablas limpiadas`)

  await prisma.despacho.createMany({ data: despachos, skipDuplicates: true })
  console.log(`  ✓ despachos insertados: ${despachos.length}`)

  const chunk = 2000
  let done = 0
  for (let i = 0; i < guias.length; i += chunk) {
    const slice = guias.slice(i, i + chunk)
    await prisma.guiaDespacho.createMany({ data: slice, skipDuplicates: true })
    done += slice.length
    console.log(`  guias ${done}/${guias.length}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
