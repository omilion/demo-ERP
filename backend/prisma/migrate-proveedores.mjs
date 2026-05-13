/**
 * Migrates proveedores from MySQL dump to PostgreSQL catalogo.proveedores.
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

function parseValues(tuple) {
  const vals = []
  let i = 0
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

async function extractProveedores(dumpPath) {
  return new Promise((resolve, reject) => {
    const rows = []
    let inSection = false
    let buffer = ''
    let inInsert = false

    const rl = createInterface({ input: createReadStream(dumpPath, { encoding: 'utf8' }) })

    rl.on('line', line => {
      if (line.includes('LOCK TABLES `proveedores` WRITE')) { inSection = true; return }
      if (inSection && line.startsWith('UNLOCK TABLES')) { inSection = false; rl.close(); return }
      if (!inSection) return

      if (line.startsWith('INSERT INTO `proveedores`')) { inInsert = true; buffer = '' }
      if (inInsert) {
        buffer += line
        if (line.endsWith(';')) {
          inInsert = false
          const vs = buffer.slice(buffer.indexOf(' VALUES ') + 8, -1)
          let depth = 0, start = 0
          for (let i = 0; i < vs.length; i++) {
            if (vs[i] === '(') depth++
            else if (vs[i] === ')') {
              depth--
              if (depth === 0) {
                try {
                  const v = parseValues(vs.slice(start, i+1))
                  // id, nombre, rut, razon_social, giro, email, fono1, direccion, region, comuna,
                  // codigo_proveedor, porc_venta_sala, porc_conveniomarco, porc_licitacion, pago_factura
                  const [, nombre, rut, razonSocial, giro, email, fono, direccion, region, comuna, codProv, pSala, pMarco, pLic] = v
                  if (nombre && rut) {
                    rows.push({
                      nombre: cleanStr(nombre) || nombre,
                      rut: rut.trim(),
                      razonSocial: cleanStr(razonSocial),
                      giro: cleanStr(giro),
                      email: email?.trim() || null,
                      telefono: fono?.trim() || null,
                      direccion: cleanStr(direccion),
                      region: cleanStr(region),
                      comuna: cleanStr(comuna),
                      codigoProveedor: parseInt(codProv) || null,
                      porcVentaSala: parseInt(pSala) || 0,
                      porcMarco: parseInt(pMarco) || 0,
                      porcLicitacion: parseInt(pLic) || 0,
                    })
                  }
                } catch {}
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
  const rows = await extractProveedores(DUMP_PATH)
  console.log(`Found ${rows.length} proveedores`)

  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()

  const existing = await client.query('SELECT COUNT(*) FROM catalogo.proveedores')
  if (parseInt(existing.rows[0].count) > 0) {
    console.log(`Already have ${existing.rows[0].count} proveedores. Skipping.`)
    await client.end()
    return
  }

  const seen = new Set()
  const unique = rows.filter(r => {
    if (!r.rut || seen.has(r.rut)) return false
    seen.add(r.rut)
    return true
  })
  console.log(`Unique by RUT: ${unique.length}`)

  let inserted = 0
  for (const r of unique) {
    try {
      await client.query(
        `INSERT INTO catalogo.proveedores
         (nombre, rut, razon_social, giro, email, telefono, direccion, region, comuna,
          codigo_proveedor, porc_venta_sala, porc_marco, porc_licitacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (rut) DO NOTHING`,
        [r.nombre, r.rut, r.razonSocial, r.giro, r.email, r.telefono, r.direccion,
         r.region, r.comuna, r.codigoProveedor, r.porcVentaSala, r.porcMarco, r.porcLicitacion]
      )
      inserted++
    } catch (e) {
      console.warn(`Skip RUT ${r.rut}: ${e.message.slice(0, 60)}`)
    }
  }

  console.log(`Done. Inserted ${inserted} proveedores.`)
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
