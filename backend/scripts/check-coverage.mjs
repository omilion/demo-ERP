// Compara counts legacy vs v2 para tablas vitales no analizadas aún.
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
const DUMP = 'D:/downloads/plastim2_plastimar2014 (1).sql'

// Streaming count rows in INSERT INTO `table` section
async function countLegacy(table) {
  return new Promise((res) => {
    const startMarker = `INSERT INTO \`${table}\` `
    let count = 0
    let inside = false
    let depth = 0
    let inStr = false
    let strCh = ''
    const stream = createReadStream(DUMP, { encoding: 'utf8', highWaterMark: 1 << 20 })
    let pending = ''
    stream.on('data', chunk => {
      pending += chunk
      while (true) {
        if (!inside) {
          const idx = pending.indexOf(startMarker)
          if (idx < 0) {
            if (pending.length > startMarker.length) pending = pending.slice(-startMarker.length)
            break
          }
          pending = pending.slice(idx + startMarker.length)
          // skip header up to VALUES
          const vIdx = pending.indexOf('VALUES')
          if (vIdx < 0) {
            if (pending.length > 1000) pending = pending.slice(-1000)
            break
          }
          pending = pending.slice(vIdx + 6)
          inside = true; depth = 0; inStr = false
        }
        // count balanced () not in strings
        let i = 0
        for (; i < pending.length; i++) {
          const c = pending[i]
          if (inStr) {
            if (c === '\\') { i++; continue }
            if (c === strCh) inStr = false
            continue
          }
          if (c === "'" || c === '"') { inStr = true; strCh = c; continue }
          if (c === '(') depth++
          else if (c === ')') { depth--; if (depth === 0) count++ }
          else if (c === ';' && depth === 0) { inside = false; i++; break }
        }
        pending = pending.slice(i)
        if (!inside) continue
        else break
      }
    })
    stream.on('end', () => res(count))
  })
}

const v2Counts = {
  'bitacora_taller': () => prisma.bitacoraTaller?.count() ?? prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM taller.bitacora_taller`).then(r => r[0].c),
  'taller_materiales': () => prisma.tallerMaterial?.count() ?? prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM taller.taller_materiales`).then(r => r[0].c),
  'taller_historial_materiales': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM taller.taller_historial_materiales`).then(r => r[0].c),
  'telas': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM taller.telas`).then(r => r[0].c),
  'descuentos_marco': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM ventas.descuentos_marco`).then(r => r[0].c),
  'descuentos_porc': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM ventas.descuentos_porc`).then(r => r[0].c),
  'descuentos_ventas': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM ventas.descuentos_ventas`).then(r => r[0].c),
  'multas': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM ventas.multas`).then(r => r[0].c),
  'relacion_productos': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM catalogo.relacion_productos`).then(r => r[0].c),
  'crm': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM ventas.crm_registros`).then(r => r[0].c),
  'firmas_email': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM config.firmas_email`).then(r => r[0].c),
  'historial_email': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM ventas.historial_email`).then(r => r[0].c),
  'cargo_transporte': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM catalogo.cargo_transporte`).then(r => r[0].c),
  'categorias': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM catalogo.categorias`).then(r => r[0].c),
  'subcategorias': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM catalogo.subcategorias`).then(r => r[0].c),
  'sucursales': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM auth.sucursales`).then(r => r[0].c),
  'comunas': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM clientes.comunas`).then(r => r[0].c),
  'regiones': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM clientes.regiones`).then(r => r[0].c),
  'competencia': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM clientes.competencia`).then(r => r[0].c),
  'banner': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM catalogo.banners`).then(r => r[0].c),
  'bloqueo_pagina': () => prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM config.bloqueo_pagina`).then(r => r[0].c),
}

async function main() {
  console.log(`\n=== Coverage check: legacy dump vs v2 ===\n`)
  const tables = Object.keys(v2Counts)
  console.log(`tabla                              legacy    v2     status`)
  console.log(`─────────────────────────────────────────────────────────────`)
  for (const t of tables) {
    try {
      const [legacy, v2] = await Promise.all([countLegacy(t), v2Counts[t]()])
      const status = v2 === 0 && legacy > 0 ? '⚠ falta migrar' : v2 < legacy * 0.5 && legacy > 10 ? '⚠ posible incompleto' : 'ok'
      console.log(`${t.padEnd(34)} ${String(legacy).padStart(7)} ${String(v2).padStart(7)}   ${status}`)
    } catch (e) {
      console.log(`${t.padEnd(34)} ERROR ${e.message.slice(0, 50)}`)
    }
  }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect())
