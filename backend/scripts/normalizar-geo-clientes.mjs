// Normaliza region y comuna de clientes y sucursales contra el catalogo oficial
// que ya usa la aplicacion (frontend/src/data/geoLatam.js).
//
// La corrupcion viene heredada del sistema legacy, donde estos campos eran texto
// libre. Hoy conviven 1.025 comunas distintas y 908 regiones para un pais que
// tiene 346 y 16. Casi todo es la misma comuna escrita de varias formas.
//
// Se resuelve en tres capas, de mas segura a menos:
//   1. Canonica  - el valor calza con el catalogo ignorando tildes y mayusculas.
//                  Se reescribe con la ortografia oficial. Es deterministico.
//   2. Alias     - apodos y localidades que no son comuna pero se usan como tal
//                  ("Valpo", "Reñaca"). Mapa explicito y revisable, abajo.
//   3. Basura    - marcadores sin informacion ("---", ".", "Test"). Pasan a NULL,
//                  porque un dato inventado es peor que un dato ausente.
// Lo que no cae en ninguna capa se lista al final y NO se toca: necesita que
// alguien de Plastimar decida.
//
// Uso:
//   node scripts/normalizar-geo-clientes.mjs                 (simulacion)
//   node scripts/normalizar-geo-clientes.mjs --apply --confirm=NORMALIZAR_GEO
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const CONFIRM = 'NORMALIZAR_GEO'
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const confirmed = args.includes(`--confirm=${CONFIRM}`)

// Apodos y localidades en uso. Cada entrada es una decision de negocio, no una
// regla automatica: por eso viven aca, a la vista, y no escondidas en el codigo.
const ALIAS = {
  'vina': 'Viña del Mar',
  'renaca': 'Viña del Mar',
  'concon': 'Concón',
  'con con': 'Concón',
  'curauma': 'Valparaíso',
  'placilla': 'Valparaíso',
  'valpo': 'Valparaíso',
  'stgo': 'Santiago',
  'santiago centro': 'Santiago',
  'chicureo': 'Colina',
  'calera': 'La Calera',
  'til til': 'Tiltil',
  'llay llay': 'Llaillay',
  'llayllay': 'Llaillay',
  'san vicente de tagua tagua': 'San Vicente',
  'san vicente tagua tagua': 'San Vicente',
  'puerto aysen': 'Aysén',
  'puerto natales': 'Natales',
  'coyaique': 'Coyhaique',
  'lobarnechea': 'Lo Barnechea',
  'santaigo': 'Santiago',
  'quilpies': 'Quilpué',
  'quilpie': 'Quilpué',
  'pac': 'Pedro Aguirre Cerda',
  'alto bio bio': 'Alto Biobío',
}

// Valores que no aportan nada y solo ensucian los filtros.
const BASURA = /^(-+|\.+|_+|s\/i|sin informacion|sin dato|na|n\/a|null|test|comuna test|region test|xxx+|\?+)$/i

// El legacy guardo texto UTF-8 leido como latin1: "ViÃ±a" en vez de "Viña".
// Se recupera releyendo los bytes. Si el resultado trae caracteres invalidos,
// el valor no era mojibake y se deja como estaba.
function repararMojibake(s) {
  if (!s || !/[ÃÂ]/.test(s)) return s
  try {
    const r = Buffer.from(s, 'latin1').toString('utf8')
    return r.includes('�') ? s : r
  } catch { return s }
}

const norm = s => repararMojibake(String(s || ''))
  .trim().toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')   // tildes
  .replace(/[-]/g, '')   // controles que dejo el mojibake
  .replace(/\s+/g, ' ')

const aqui = dirname(fileURLToPath(import.meta.url))
const geoSrc = readFileSync(join(aqui, '..', '..', 'frontend', 'src', 'data', 'geoLatam.js'), 'utf8')
const geo = await import('data:text/javascript;base64,' + Buffer.from(geoSrc).toString('base64'))

const comunaCanon = new Map()
const regionCanon = new Map()
for (const r of geo.REGIONES_CHILE) regionCanon.set(norm(r), r)
for (const [region, comunas] of Object.entries(geo.COMUNAS_POR_REGION)) {
  for (const c of comunas) comunaCanon.set(norm(c), { comuna: c, region })
}

// Devuelve { comuna, region, via } o null si no se pudo resolver.
function resolverComuna(valor) {
  if (!valor || !valor.trim()) return null
  if (BASURA.test(valor.trim())) return { comuna: null, region: null, via: 'basura' }
  const clave = norm(valor)
  const directo = comunaCanon.get(clave)
  if (directo) return { ...directo, via: 'canonica' }
  const alias = ALIAS[clave]
  if (alias) {
    const destino = comunaCanon.get(norm(alias))
    if (destino) return { ...destino, via: 'alias' }
  }
  return null
}

function resolverRegion(valor) {
  if (!valor || !valor.trim()) return null
  if (BASURA.test(valor.trim())) return { region: null, via: 'basura' }
  const directo = regionCanon.get(norm(valor))
  if (directo) return { region: directo, via: 'canonica' }
  return null
}

const cli = new pg.Client({ connectionString: process.env.DATABASE_URL })

async function normalizarTabla(tabla, etiqueta) {
  const { rows } = await cli.query(`select id, comuna, region from ${tabla} where comuna is not null or region is not null`)

  const cambios = []
  const stats = { canonica: 0, alias: 0, basura: 0, regionDesdeComuna: 0, sinCambio: 0 }
  const sinResolver = new Map()

  for (const row of rows) {
    let comuna = row.comuna
    let region = row.region

    const rc = resolverComuna(row.comuna)
    if (rc && rc.via === 'basura') {
      // Si la comuna era un marcador vacio, la region que la acompana tampoco sirve.
      comuna = null
      const rr = resolverRegion(row.region)
      region = rr && rr.via !== 'basura' ? rr.region : null
      stats.basura++
      if (comuna !== row.comuna || region !== row.region) cambios.push({ id: row.id, comuna, region, antes: { comuna: row.comuna, region: row.region } })
      else stats.sinCambio++
      continue
    }
    if (rc) {
      comuna = rc.comuna
      // La region correcta se deduce de la comuna: es la fuente mas confiable.
      if (rc.region && norm(region) !== norm(rc.region)) {
        region = rc.region
        stats.regionDesdeComuna++
      }
      stats[rc.via]++
    } else if (row.comuna) {
      sinResolver.set(row.comuna, (sinResolver.get(row.comuna) || 0) + 1)
    }

    // Si la comuna no resolvio, al menos se intenta enderezar la region sola.
    if (!rc && row.region) {
      const rr = resolverRegion(row.region)
      if (rr) region = rr.region
    }

    if (comuna !== row.comuna || region !== row.region) {
      cambios.push({ id: row.id, comuna, region, antes: { comuna: row.comuna, region: row.region } })
    } else {
      stats.sinCambio++
    }
  }

  console.log(`\n=== ${etiqueta} ===`)
  console.log(`filas con geo: ${rows.length} · a corregir: ${cambios.length} · ya correctas: ${stats.sinCambio}`)
  console.log(`  por ortografia (tildes/mayusculas): ${stats.canonica}`)
  console.log(`  por alias (apodos y localidades):   ${stats.alias}`)
  console.log(`  basura a NULL:                      ${stats.basura}`)
  console.log(`  region deducida desde la comuna:    ${stats.regionDesdeComuna}`)

  const muestra = cambios.slice(0, 8)
  if (muestra.length) {
    console.log('  ejemplos:')
    for (const c of muestra) {
      console.log(`    #${c.id}  ${JSON.stringify(c.antes.comuna)} / ${JSON.stringify(c.antes.region)}  ->  ${JSON.stringify(c.comuna)} / ${JSON.stringify(c.region)}`)
    }
  }

  if (sinResolver.size) {
    const total = [...sinResolver.values()].reduce((a, b) => a + b, 0)
    console.log(`\n  SIN RESOLVER: ${sinResolver.size} valores distintos (${total} filas). No se tocan.`)
    ;[...sinResolver.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
      .forEach(([k, v]) => console.log(`    ${String(v).padStart(4)}  ${JSON.stringify(k)}`))
  }

  if (apply && cambios.length) {
    await cli.query('BEGIN')
    try {
      for (const c of cambios) {
        await cli.query(`update ${tabla} set comuna = $1, region = $2 where id = $3`, [c.comuna, c.region, c.id])
      }
      await cli.query('COMMIT')
      console.log(`\n  APLICADO: ${cambios.length} filas actualizadas.`)
    } catch (e) {
      await cli.query('ROLLBACK')
      throw e
    }
  }

  return cambios.length
}

async function main() {
  if (apply && !confirmed) {
    console.error(`Para escribir hay que pasar tambien --confirm=${CONFIRM}`)
    process.exit(1)
  }

  console.log(apply ? '=== APLICANDO CAMBIOS ===' : '=== SIMULACION (no se escribe nada) ===')
  console.log('Base:', String(process.env.DATABASE_URL || '').replace(/:[^:@]*@/, ':***@'))
  console.log(`Catalogo: ${regionCanon.size} regiones · ${comunaCanon.size} comunas · ${Object.keys(ALIAS).length} alias`)

  await cli.connect()
  const a = await normalizarTabla('clientes.clientes', 'CLIENTES')
  const b = await normalizarTabla('clientes.cliente_sucursales', 'SUCURSALES DE CLIENTE')

  console.log('\n---')
  console.log(`total de filas a corregir: ${a + b}`)
  if (!apply) console.log(`\nSimulacion. Para aplicar: node scripts/normalizar-geo-clientes.mjs --apply --confirm=${CONFIRM}`)
  await cli.end()
}

main().catch(async e => {
  console.error(e)
  try { await cli.end() } catch { /* ya cerrada */ }
  process.exit(1)
})
