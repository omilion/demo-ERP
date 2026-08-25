// Clasifica el tipo de cliente sobre la data heredada del legacy.
//
// El campo `tipo` quedo vacio en 16.632 de 16.645 clientes: los filtros del
// modulo (Empresa, Institucional, Municipal, Gobierno, Distribuidor, Persona
// natural) operaban sobre un campo que nadie lleno nunca.
//
// Hay dos niveles de evidencia, y el script los separa a proposito:
//
//   ALTA  - el nombre lo dice ("I. MUNICIPALIDAD DE...", "COLEGIO...",
//           "... SPA"), o el RUT esta en el rango 60-65, que el SII reserva
//           para organismos del Estado y municipios. Es lo que se aplica por
//           defecto.
//   MEDIA - el resto del prefijo del RUT: 76-79 y 96-99 son sociedades, 70-75
//           corporaciones y fundaciones, y bajo 30 millones es persona natural.
//           Es buena señal, pero indirecta: una sociedad puede facturar con RUT
//           de su dueño. Se aplica solo con --incluir-rut.
//
// Nunca sobreescribe un tipo ya asignado a mano.
//
// Uso:
//   node scripts/clasificar-tipo-clientes.mjs                 (simulacion, alta confianza)
//   node scripts/clasificar-tipo-clientes.mjs --incluir-rut   (simulacion, incluye media)
//   node scripts/clasificar-tipo-clientes.mjs --apply --confirm=CLASIFICAR_TIPO
import 'dotenv/config'
import pg from 'pg'

const CONFIRM = 'CLASIFICAR_TIPO'
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const confirmed = args.includes(`--confirm=${CONFIRM}`)
const incluirRut = args.includes('--incluir-rut')

// Señales explicitas en el nombre. El orden importa: lo mas especifico primero,
// porque "CORPORACION MUNICIPAL DE..." es Municipal, no Institucional.
const POR_NOMBRE = [
  [/municipalidad|municipal|\bilustre\b/i, 'Municipal'],
  [/ministerio|servicio nacional|junta nacional|gobierno|gobernacion|subsecretaria|hospital|carabineros|ejercito|armada|direccion general|direccion regional|servicio de salud|gore\b/i, 'Gobierno'],
  [/colegio|escuela|liceo|universidad|instituto|jardin infantil|fundacion|corporacion|sostenedor|educacional|seminario|preescolar|club deportivo|junta de vecinos/i, 'Institucional'],
  [/distribuidora|comercializadora|importadora|ferreteria/i, 'Distribuidor'],
  [/\bspa\b|\bltda\b|limitada|\beirl\b|e\.i\.r\.l|sociedad|comercial|servicios|constructora|inmobiliaria|\bs\.a\.\b|empresa/i, 'Empresa'],
]

const rutLimpio = rut => String(rut || '').toLowerCase().replace(/[^0-9k]/g, '')

function porNombre(nombre) {
  const texto = String(nombre || '')
  for (const [patron, tipo] of POR_NOMBRE) if (patron.test(texto)) return tipo
  return null
}

// Rangos verificados contra el comportamiento real de compra de cada grupo: si
// el RUT dice "organismo publico", sus ventas tienen que ser mayoritariamente
// licitacion o convenio marco. El resultado del cruce fue contundente:
//
//   60 -> 87,6% compra publica    69 -> 88,6%    65 ->  6,1%
//   61 -> 94,5%                   76 ->  0,0%    12-19 -> 0,0%
//   62 -> 91,8%
//
// Por eso 60/61/62 son Gobierno y 69 es Municipal, mientras que 65 (corporaciones
// y organizaciones sin fines de lucro) es Institucional y no Gobierno.
//
// Los rangos 63, 64, 66, 67 y 68 quedan fuera a proposito: son pocos clientes y
// su comportamiento es ambiguo. En el 66 vive ademas "CONSUMIDOR FINAL", que no
// corresponde clasificar automaticamente.
const RUT_PUBLICO = {
  '60': 'Gobierno', '61': 'Gobierno', '62': 'Gobierno',
  '69': 'Municipal',
}

const RUT_PRIVADO = {
  '65': 'Institucional',
  '70': 'Institucional', '71': 'Institucional', '72': 'Institucional',
  '73': 'Institucional', '74': 'Institucional', '75': 'Institucional',
  '76': 'Empresa', '77': 'Empresa', '78': 'Empresa', '79': 'Empresa',
  '96': 'Empresa', '97': 'Empresa', '98': 'Empresa', '99': 'Empresa',
}

// Digito verificador chileno. El 98% de los RUT de la base lo tiene correcto,
// asi que sirve para descartar el 2% que trae basura.
function dvValido(rut) {
  const l = rutLimpio(rut)
  if (l.length < 8 || l.length > 9) return false
  const cuerpo = l.slice(0, -1)
  if (!/^\d+$/.test(cuerpo)) return false
  let suma = 0
  let mul = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const resto = 11 - (suma % 11)
  const esperado = resto === 11 ? '0' : resto === 10 ? 'k' : String(resto)
  return l.slice(-1) === esperado
}

function porRutPublico(rut) {
  if (!dvValido(rut)) return null
  return RUT_PUBLICO[rutLimpio(rut).slice(0, 2)] || null
}

function porRutResto(rut) {
  if (!dvValido(rut)) return null
  const limpio = rutLimpio(rut)
  const privado = RUT_PRIVADO[limpio.slice(0, 2)]
  if (privado) return privado
  // Bajo los 30 millones y con 8 digitos: persona natural.
  if (limpio.length === 9 && Number(limpio.slice(0, 8)) < 30000000) return 'Persona natural'
  if (limpio.length === 8) return 'Persona natural'
  return null
}

function clasificar(cliente) {
  const nombre = porNombre(cliente.nombre)
  if (nombre) return { tipo: nombre, via: 'nombre' }
  const publico = porRutPublico(cliente.rut)
  if (publico) return { tipo: publico, via: 'rut publico' }
  if (incluirRut) {
    const resto = porRutResto(cliente.rut)
    if (resto) return { tipo: resto, via: 'rut' }
  }
  return null
}

const cli = new pg.Client({ connectionString: process.env.DATABASE_URL })

async function main() {
  if (apply && !confirmed) {
    console.error(`Para escribir hay que pasar tambien --confirm=${CONFIRM}`)
    process.exit(1)
  }

  console.log(apply ? '=== APLICANDO CAMBIOS ===' : '=== SIMULACION (no se escribe nada) ===')
  console.log('Base:', String(process.env.DATABASE_URL || '').replace(/:[^:@]*@/, ':***@'))
  console.log('Nivel:', incluirRut ? 'alta + media (incluye inferencia por RUT)' : 'solo alta confianza')

  await cli.connect()
  // Solo los que no tienen tipo: lo asignado a mano no se toca.
  const { rows } = await cli.query('select id, rut, nombre from clientes.clientes where tipo is null')
  console.log(`\nclientes sin tipo: ${rows.length}`)

  const porTipo = new Map()
  const porVia = new Map()
  const cambios = []
  const muestras = new Map()

  for (const cliente of rows) {
    const r = clasificar(cliente)
    if (!r) continue
    cambios.push({ id: cliente.id, tipo: r.tipo })
    porTipo.set(r.tipo, (porTipo.get(r.tipo) || 0) + 1)
    porVia.set(r.via, (porVia.get(r.via) || 0) + 1)
    if (!muestras.has(r.tipo)) muestras.set(r.tipo, [])
    if (muestras.get(r.tipo).length < 3) muestras.get(r.tipo).push(`${cliente.nombre} (${cliente.rut})`)
  }

  console.log('\n--- a clasificar por tipo ---')
  ;[...porTipo.entries()].sort((a, b) => b[1] - a[1]).forEach(([tipo, n]) => {
    console.log(`  ${String(n).padStart(6)}  ${tipo}`)
    for (const ej of muestras.get(tipo) || []) console.log(`          · ${ej}`)
  })

  console.log('\n--- por tipo de evidencia ---')
  ;[...porVia.entries()].sort((a, b) => b[1] - a[1]).forEach(([via, n]) => console.log(`  ${String(n).padStart(6)}  ${via}`))

  const sinClasificar = rows.length - cambios.length
  console.log(`\ntotal a clasificar: ${cambios.length} · quedan sin tipo: ${sinClasificar}`)

  if (apply && cambios.length) {
    // Un UPDATE por tipo en vez de uno por fila: son miles.
    const porValor = new Map()
    for (const c of cambios) {
      if (!porValor.has(c.tipo)) porValor.set(c.tipo, [])
      porValor.get(c.tipo).push(c.id)
    }
    await cli.query('BEGIN')
    try {
      for (const [tipo, ids] of porValor) {
        await cli.query('update clientes.clientes set tipo = $1 where id = any($2::int[])', [tipo, ids])
      }
      await cli.query('COMMIT')
      console.log(`\nAPLICADO: ${cambios.length} clientes clasificados.`)
    } catch (e) {
      await cli.query('ROLLBACK')
      throw e
    }
  }

  if (!apply) {
    console.log(`\nSimulacion. Para aplicar: node scripts/clasificar-tipo-clientes.mjs${incluirRut ? ' --incluir-rut' : ''} --apply --confirm=${CONFIRM}`)
  }
  await cli.end()
}

main().catch(async e => {
  console.error(e)
  try { await cli.end() } catch { /* ya cerrada */ }
  process.exit(1)
})
