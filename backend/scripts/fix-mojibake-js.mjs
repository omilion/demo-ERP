// Repara mojibake en JS leyendo desde PG, decodificando y actualizando.
// Soporta caracteres de control y secuencias que fallan en convert_to en PG.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(resolve(__dirname, '../.env'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// Mappings for WIN1252 special characters U+0080..U+009F to raw byte values
const win1252Map = {
  0x20AC: 0x80, // €
  0x201A: 0x82, // ‚
  0x0192: 0x83, // ƒ
  0x201E: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x02C6: 0x88, // ˆ
  0x2030: 0x89, // ‰
  0x0160: 0x8A, // Š
  0x2039: 0x8B, // ‹
  0x0152: 0x8C, // Œ
  0x017D: 0x8E, // Ž
  0x2018: 0x91, // ‘
  0x2019: 0x92, // ’
  0x201C: 0x93, // “
  0x201D: 0x94, // ”
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x02DC: 0x98, // ˜
  0x2122: 0x99, // ™
  0x0161: 0x9A, // š
  0x203A: 0x9B, // ›
  0x0153: 0x9C, // œ
  0x017E: 0x9E, // ž
  0x0178: 0x9F, // Ÿ
}

function decodeDoubleUtf8(str) {
  if (typeof str !== 'string' || str === '') return str
  if (!/[ÃÂâ]/.test(str)) return str

  const bytes = []
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code <= 0xFF) {
      bytes.push(code)
    } else {
      const mapped = win1252Map[code]
      if (mapped !== undefined) {
        bytes.push(mapped)
      } else {
        return null // Unmappable, skip
      }
    }
  }

  try {
    const buf = Buffer.from(bytes)
    const decoded = buf.toString('utf8')
    if (decoded.includes('\uFFFD')) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

const TARGETS = [
  { table: 'catalogo.productos', key: 'id', cols: ['nombre', 'descripcion', 'categoria', 'proveedor', 'ubicacion', 'descripcion_web'] },
  { table: 'catalogo.categorias', key: 'id', cols: ['nombre'] },
  { table: 'catalogo.subcategorias', key: 'id', cols: ['nombre'] },
  { table: 'clientes.clientes', key: 'id', cols: ['razon_social', 'nombre', 'direccion', 'comuna', 'region', 'giro'] },
  { table: 'catalogo.proveedores', key: 'id', cols: ['nombre', 'razon_social', 'direccion', 'giro', 'region', 'comuna'] },
  { table: 'ventas.ordenes', key: 'id', cols: ['observaciones', 'creador_nombre', 'licitacion'] },
  { table: 'ventas.orden_items', key: 'id', cols: ['nombre', 'descripcion'] },
  { table: 'ventas.cotizacion_licitacion', key: 'id', cols: ['referencia', 'obs', 'usuario'] },
  { table: 'ventas.cotizacion_licitacion_items', key: 'id', cols: ['nombre', 'descripcion'] },
  { table: 'bodega.despachos', key: 'id', cols: ['direccion', 'contacto', 'region', 'comuna', 'transporte'] },
  { table: 'bodega.guias_despachos', key: 'id', cols: ['origen'] },
  { table: 'taller.odts', key: 'id', cols: ['obs_general', 'cliente_nombre', 'descripcion'] },
  { table: 'taller.bodega_taller', key: 'id', cols: ['nombre'] },
  { table: 'taller.bitacora_taller', key: 'id', cols: ['texto', 'usuario', 'usuario_reporta'] },
  { table: 'caja.movimientos_caja', key: 'id', cols: ['referencia', 'usuario', 'medio_pago'] },
  { table: 'ventas.cobranza_historico', key: 'id', cols: ['cliente', 'ejecutiva', 'banco', 'observacion'] },
]

async function main() {
  const isDry = process.argv.includes('--dry')
  console.log(`Starting JS-based encoding repair${isDry ? ' (DRY-RUN)' : ''}...`)

  let totalUpdated = 0

  for (const target of TARGETS) {
    console.log(`\nProcessing ${target.table}...`)
    const selectCols = [target.key, ...target.cols].map(c => `"${c}"`).join(', ')
    const conditions = target.cols.map(c => `"${c}" ~ '[ÃÂâ]'`).join(' OR ')
    
    const query = `SELECT ${selectCols} FROM ${target.table} WHERE ${conditions}`
    const { rows } = await pgPool.query(query)
    
    if (rows.length === 0) {
      console.log(`  clean`)
      continue
    }

    console.log(`  Found ${rows.length} candidate rows`)

    let tableUpdated = 0
    for (const row of rows) {
      const id = row[target.key]
      const updates = {}
      let hasChanges = false

      for (const col of target.cols) {
        const val = row[col]
        if (val && /[ÃÂâ]/.test(val)) {
          const decoded = decodeDoubleUtf8(val)
          if (decoded !== null && decoded !== val) {
            updates[col] = decoded
            hasChanges = true
          }
        }
      }

      if (hasChanges) {
        if (!isDry) {
          const setClause = Object.keys(updates).map((col, idx) => `"${col}" = $${idx + 2}`).join(', ')
          const params = [id, ...Object.values(updates)]
          const updateQuery = `UPDATE ${target.table} SET ${setClause} WHERE "${target.key}" = $1`
          await pgPool.query(updateQuery, params)
        }
        tableUpdated++
        totalUpdated++
      }
    }
    console.log(`  Updated ${tableUpdated} rows for ${target.table}`)
  }

  console.log(`\nTotal rows updated across all tables: ${totalUpdated}`)
  await pgPool.end()
}

main().catch(console.error)
