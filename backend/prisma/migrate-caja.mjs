/**
 * Migrates historical caja data from MySQL dump to PostgreSQL.
 * Uses streaming line-by-line to handle large dump files.
 */
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import pg from 'pg'

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) throw new Error('DATABASE_URL not set')
const DUMP_PATH = 'D:/downloads/plastim2_plastimar2014.sql'

function parseDate(s) {
  if (!s || s === '0000-00-00 00:00:00' || s === '0000-00-00') return null
  try { return new Date(s).toISOString() } catch { return null }
}

/**
 * Parse a VALUES INSERT row into individual value strings.
 * Handles quoted strings with escaped quotes.
 */
function parseValues(row) {
  const vals = []
  let i = 0
  while (i < row.length) {
    if (row[i] === '(') i++
    else if (row[i] === ')') break
    else if (row[i] === ',') i++
    else if (row[i] === "'") {
      let s = ''
      i++ // skip opening quote
      while (i < row.length) {
        if (row[i] === '\\' && i + 1 < row.length) {
          i++
          const c = row[i]
          if (c === 'n') s += '\n'
          else if (c === 'r') s += '\r'
          else if (c === 't') s += '\t'
          else s += c
          i++
        } else if (row[i] === "'") {
          i++ // skip closing quote
          break
        } else {
          s += row[i++]
        }
      }
      vals.push(s)
    } else if (row.slice(i, i + 4) === 'NULL') {
      vals.push(null)
      i += 4
    } else {
      let num = ''
      while (i < row.length && row[i] !== ',' && row[i] !== ')') num += row[i++]
      vals.push(num)
    }
  }
  return vals
}

async function extractCajaRows(dumpPath) {
  return new Promise((resolve, reject) => {
    const rows = []
    let inCajaInsert = false
    let buffer = ''
    let inSection = false

    const rl = createInterface({ input: createReadStream(dumpPath, { encoding: 'utf8' }) })

    rl.on('line', line => {
      if (line.includes('LOCK TABLES `caja` WRITE')) { inSection = true; return }
      if (inSection && line.startsWith('UNLOCK TABLES')) { inSection = false; rl.close(); return }
      if (!inSection) return

      if (line.startsWith('INSERT INTO `caja`')) {
        inCajaInsert = true
        buffer = ''
      }

      if (inCajaInsert) {
        buffer += line
        if (line.endsWith(';')) {
          inCajaInsert = false
          // parse all value tuples from buffer
          const valuesStart = buffer.indexOf(' VALUES ') + 8
          const valueStr = buffer.slice(valuesStart, -1) // remove trailing ;

          // Split by ),( but careful with strings
          let depth = 0
          let start = 0
          for (let i = 0; i < valueStr.length; i++) {
            if (valueStr[i] === '(') depth++
            else if (valueStr[i] === ')') {
              depth--
              if (depth === 0) {
                const tuple = valueStr.slice(start, i + 1)
                try {
                  const v = parseValues(tuple)
                  // Fields: id, n_interno, sucursal, ingreso, egreso, medio_pago, cuotas,
                  //         fecha_hora, fecha_ingreso, documento, n_doc, tipo_documento,
                  //         estado_doc, estado_pago_doc, paga_con, usuario, operacion,
                  //         tipo, origen_medio_pago, n_medio_pago, fecha_pago_fac,
                  //         numero_nota_credito_interna, eliminado, fecham, user
                  const [id, nInterno, , ingreso, egreso, medioPago, , fechaHora, , documento, nDoc, tipoDoc, , , , usuario, operacion, tipo] = v
                  const ing = parseInt(ingreso) || 0
                  const egr = parseInt(egreso) || 0
                  if (ing === 0 && egr === 0) { start = i + 2; continue }
                  const eliminado = v[22] === '1'
                  if (eliminado) { start = i + 2; continue }

                  const monto = ing > 0 ? ing : -egr
                  const tipoMov = egr > 0 ? 'egreso' : 'ingreso'
                  const ref = tipoDoc && nDoc && nDoc !== '0' ? `${tipoDoc} ${nDoc}` : (documento || null)

                  rows.push({
                    tipo: tipoMov,
                    monto,
                    medioPago: medioPago || 'Efectivo',
                    referencia: ref,
                    ordenId: parseInt(nInterno) > 0 ? parseInt(nInterno) : null,
                    usuario: usuario || null,
                    fecha: parseDate(fechaHora),
                  })
                } catch { /* skip malformed */ }
                start = i + 2
              }
            }
          }
          buffer = ''
        }
      }
    })

    rl.on('close', () => resolve(rows))
    rl.on('error', reject)
  })
}

async function main() {
  console.log('Reading MySQL dump (streaming)...')
  const rows = await extractCajaRows(DUMP_PATH)
  console.log(`Found ${rows.length} valid caja rows`)

  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()

  const existing = await client.query(
    "SELECT COUNT(*) FROM caja.movimientos_caja WHERE turno_id IS NULL"
  )
  if (parseInt(existing.rows[0].count) > 0) {
    console.log(`Already have ${existing.rows[0].count} historical records. Skipping.`)
    await client.end()
    return
  }

  console.log('Inserting into PostgreSQL...')
  let inserted = 0
  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const placeholders = batch.map((_, j) => {
      const b = j * 7
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7})`
    }).join(',')
    const params = batch.flatMap(r => [r.tipo, r.monto, r.medioPago, r.referencia, r.ordenId, r.usuario, r.fecha])
    await client.query(
      `INSERT INTO caja.movimientos_caja (tipo, monto, medio_pago, referencia, orden_id, usuario, fecha) VALUES ${placeholders}`,
      params
    )
    inserted += batch.length
    if (inserted % 5000 === 0) console.log(`  ${inserted}/${rows.length}...`)
  }

  console.log(`Done. Inserted ${inserted} historical caja records.`)
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
