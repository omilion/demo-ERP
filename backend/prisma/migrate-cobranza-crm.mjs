/**
 * Migrates historico_cobranza and crm from MySQL dump to PostgreSQL.
 * Uses streaming to handle large dump file.
 */
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import pg from 'pg'

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) throw new Error('DATABASE_URL not set')
const DUMP_PATH = 'D:/downloads/plastim2_plastimar2014.sql'

function cleanStr(s) {
  if (!s) return null
  return s.replace(/Ã¡/g,'á').replace(/Ã©/g,'é').replace(/Ã­/g,'í').replace(/Ã³/g,'ó').replace(/Ãº/g,'ú')
          .replace(/Ã±/g,'ñ').replace(/Ã/g,'Á').replace(/Ã‰/g,'É').replace(/Ã'/g,'Ñ').trim() || null
}

function parseDate(s) {
  if (!s || s === '0000-00-00' || s === '0000-00-00 00:00:00') return null
  try { return new Date(s).toISOString() } catch { return null }
}

function parseValues(tuple) {
  const vals = []
  const s = tuple.startsWith('(') ? tuple.slice(1, -1) : tuple
  let j = 0
  while (j < s.length) {
    if (s[j] === ',') { j++; continue }
    if (s.slice(j, j+4) === 'NULL') { vals.push(null); j += 4; continue }
    if (s[j] === "'") {
      let val = ''; j++
      while (j < s.length) {
        if (s[j] === '\\' && j+1 < s.length) { j++; val += s[j++] }
        else if (s[j] === "'") { j++; break }
        else val += s[j++]
      }
      vals.push(val)
    } else {
      let num = ''
      while (j < s.length && s[j] !== ',' && s[j] !== ')') num += s[j++]
      vals.push(num)
    }
  }
  return vals
}

function splitTuples(buffer, tableName) {
  const vs = buffer.slice(buffer.indexOf(' VALUES ') + 8, -1)
  const tuples = []
  let depth = 0, start = 0
  for (let i = 0; i < vs.length; i++) {
    if (vs[i] === '(') depth++
    else if (vs[i] === ')') {
      depth--
      if (depth === 0) { tuples.push(vs.slice(start, i+1)); start = i + 2 }
    }
  }
  return tuples
}

async function extractTable(dumpPath, tableName) {
  return new Promise((resolve, reject) => {
    const rows = []
    let inSection = false
    let buffer = ''
    let inInsert = false
    const rl = createInterface({ input: createReadStream(dumpPath, { encoding: 'utf8' }) })

    rl.on('line', line => {
      if (line.includes(`LOCK TABLES \`${tableName}\` WRITE`)) { inSection = true; return }
      if (inSection && line.startsWith('UNLOCK TABLES')) { inSection = false; rl.close(); return }
      if (!inSection) return
      if (line.startsWith(`INSERT INTO \`${tableName}\``)) { inInsert = true; buffer = '' }
      if (inInsert) {
        buffer += line
        if (line.endsWith(';')) {
          inInsert = false
          try {
            const tuples = splitTuples(buffer, tableName)
            for (const t of tuples) {
              try { rows.push(parseValues(t)) } catch {}
            }
          } catch {}
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
  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()

  // ── COBRANZA HISTORICO ──────────────────────────────────────────────
  const existCob = await client.query('SELECT COUNT(*) FROM ventas.cobranza_historico')
  if (parseInt(existCob.rows[0].count) === 0) {
    console.log('Extracting historico_cobranza...')
    const cobData = await extractTable(DUMP_PATH, 'historico_cobranza')
    console.log(`Found ${cobData.length} cobranza rows`)
    // Fields: id, ejecutiva, interno, ndoc, monto, monto_menos, nc, valor_factura, multas,
    //         cliente, rut, fecha_factura, mes_anio, estado, comision, pago_comision,
    //         despacho, fecha_gestion, ingreso_pago, fecha_pago, banco, reclamo, observacion
    let ins = 0
    for (const v of cobData) {
      try {
        await client.query(
          `INSERT INTO ventas.cobranza_historico
           (ejecutiva, interno, ndoc, monto, monto_menos, nc, valor_factura, multas, cliente, rut,
            fecha_factura, mes_anio, estado, comision, pago_comision, despacho, fecha_gestion,
            ingreso_pago, fecha_pago, banco, reclamo, observacion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
          [
            v[1] || null, parseInt(v[2]) || null, parseInt(v[3]) || null,
            parseInt(v[4]) || null, parseInt(v[5]) || null, parseInt(v[6]) || null,
            parseInt(v[7]) || null, parseInt(v[8]) || null,
            cleanStr(v[9]), v[10] || null,
            parseDate(v[11]), v[12] || null, v[13] || null, v[14] || null,
            parseDate(v[15]), parseDate(v[16]), parseDate(v[17]),
            parseDate(v[18]), parseDate(v[19]), v[20] || null,
            v[21] || null, cleanStr(v[22]),
          ]
        )
        ins++
      } catch (e) {
        // skip
      }
    }
    console.log(`Inserted ${ins} cobranza_historico records`)
  } else {
    console.log(`cobranza_historico: ${existCob.rows[0].count} records, skipping`)
  }

  // ── CRM ──────────────────────────────────────────────────────────────
  const existCrm = await client.query('SELECT COUNT(*) FROM ventas.crm_registros')
  if (parseInt(existCrm.rows[0].count) === 0) {
    console.log('Extracting crm...')
    const crmData = await extractTable(DUMP_PATH, 'crm')
    console.log(`Found ${crmData.length} CRM rows`)
    // Fields: id, ncotizacion, fecha, accion, competencia, fecha_proximo, prioridad, rut,
    //         nombre, rsocial, email, telefono, ejecutiva, fecha_cotizacion, resultado,
    //         estado, created_at, updated_at, usuario
    let ins = 0
    for (const v of crmData) {
      try {
        await client.query(
          `INSERT INTO ventas.crm_registros
           (n_cotizacion, fecha, accion, competencia, fecha_proximo, prioridad, rut, nombre, r_social,
            email, telefono, ejecutiva, fecha_cotizacion, resultado, estado, usuario, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            v[1] || null, parseDate(v[2]), v[3] || null, v[4] === '1',
            parseDate(v[5]), v[6] || null, v[7] || null,
            cleanStr(v[8]), cleanStr(v[9]), v[10] || null, v[11] || null,
            cleanStr(v[12]), parseDate(v[13]), cleanStr(v[14]),
            v[15] !== null && v[15] !== undefined ? parseInt(v[15]) : null,
            v[18] || null,
            parseDate(v[16]) || new Date().toISOString(),
            parseDate(v[17]) || new Date().toISOString(),
          ]
        )
        ins++
      } catch (e) {
        // skip parse/constraint errors
      }
    }
    console.log(`Inserted ${ins} CRM records`)
  } else {
    console.log(`crm_registros: ${existCrm.rows[0].count} records, skipping`)
  }

  await client.end()
  console.log('Done.')
}

main().catch(e => { console.error(e); process.exit(1) })
