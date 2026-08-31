// Carga las tres tarifas de mano de obra que el motor de costeo necesita.
//
// Sin ellas el importador de recetas se niega a correr, y con razón: la mano de
// obra se calcularía en cero y el costo de fabricación quedaría corto sin avisar
// en las 2.554 recetas.
//
// Los valores salen del propio Excel de MK, de celdas con nombre:
//
//   $AV$6 = 3.800   "COSTO HH CORTE ESPUMA"
//   $AV$4 = 4.200   "confeccion"
//
// El de enfundado no está parametrizado en el Excel —la mayoría de las filas
// lleva un literal en la fórmula— así que se verificó contra el resultado: con
// 4.200 el motor reproduce el costo del Excel en 98,55% de los productos; con el
// otro valor, en 1,52%. Los datos zanjaron cuál es.
//
// Cambiar una tarifa después NO es editar estas filas: se agrega una nueva con
// su fecha, la anterior queda como histórico, y se recalcula desde la pantalla
// de Costeo. Así se sabe con qué tasa se costeó cada cosa.
//
// Uso:
//   node scripts/cargar-tarifas-costeo.mjs                    (simulación)
//   node scripts/cargar-tarifas-costeo.mjs --apply
//   node scripts/cargar-tarifas-costeo.mjs --apply --allow-production
import pg from 'pg'
import 'dotenv/config'

const APPLY = process.argv.includes('--apply')
const ALLOW_PRODUCTION = process.argv.includes('--allow-production')
const dbArg = process.argv.find(a => a.startsWith('--db='))
const CONEXION = dbArg ? dbArg.slice(5) : process.env.DATABASE_URL

if (!CONEXION) {
  console.error('Falta la base: define DATABASE_URL o pasa --db=<url>')
  process.exit(1)
}

// Mismo criterio que el importador de recetas: escribir en una base remota
// exige una bandera aparte, para que no ocurra por inercia.
function esRemota(url) {
  try {
    return !['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname.toLowerCase())
  } catch {
    return true
  }
}

if (APPLY && esRemota(CONEXION) && !ALLOW_PRODUCTION) {
  console.error('Aplicación rechazada: una base remota requiere --allow-production además de --apply.')
  process.exit(1)
}

const TARIFAS = [
  { taller: 'espumas', proceso: 'corte', valorHora: 3800, origen: 'celda $AV$6 del Excel' },
  { taller: 'confecciones', proceso: 'confeccion', valorHora: 4200, origen: 'celda $AV$4 del Excel' },
  { taller: 'confecciones', proceso: 'enfundado', valorHora: 4200, origen: 'verificado contra el costo AK' },
]

const c = new pg.Client({ connectionString: CONEXION })
await c.connect()

console.log(APPLY ? '=== CARGANDO TARIFAS ===' : '=== SIMULACIÓN (nada se escribe) ===')
console.log('Base:', CONEXION.replace(/:[^:@]*@/, ':***@'))

const { rows: talleres } = await c.query(
  "select id, lower(nombre) as nombre from taller.talleres where lower(nombre) in ('espumas', 'confecciones')",
)
const idPorTaller = Object.fromEntries(talleres.map(t => [t.nombre, t.id]))

const faltantes = TARIFAS.filter(t => !idPorTaller[t.taller]).map(t => t.taller)
if (faltantes.length) {
  console.error(`\nFaltan talleres en esta base: ${[...new Set(faltantes)].join(', ')}`)
  console.error('El importador de recetas también los exige. Créalos antes de continuar.')
  await c.end()
  process.exit(1)
}

const resumen = []
let nuevas = 0
for (const t of TARIFAS) {
  const tallerId = idPorTaller[t.taller]
  const { rows: yaExiste } = await c.query(
    `select valor_hora from taller.tarifas_proceso
      where taller_id = $1 and lower(proceso) = $2 and activo = true
      order by vigente_desde desc limit 1`,
    [tallerId, t.proceso],
  )
  const actual = yaExiste[0] ? Number(yaExiste[0].valor_hora) : null

  resumen.push({
    taller: t.taller,
    proceso: t.proceso,
    actual: actual === null ? '—' : `$${actual.toLocaleString('es-CL')}`,
    nuevo: `$${t.valorHora.toLocaleString('es-CL')}`,
    accion: actual === null ? 'crear' : actual === t.valorHora ? 'ya está' : 'nueva versión',
    origen: t.origen,
  })

  if (actual === t.valorHora) continue
  nuevas += 1
  if (APPLY) {
    await c.query(
      `insert into taller.tarifas_proceso (taller_id, proceso, valor_hora, vigente_desde, activo, created_at)
       values ($1, $2, $3, now(), true, now())`,
      [tallerId, t.proceso, t.valorHora],
    )
  }
}

console.log('')
console.table(resumen)
console.log(`\na crear: ${nuevas} · sin cambio: ${TARIFAS.length - nuevas}`)

if (APPLY) {
  console.log('\nSiguiente paso: cargar las recetas con')
  console.log('  node scripts/import-costeo-excel.mjs "<Excel de MK>" --apply' + (esRemota(CONEXION) ? ' --allow-production' : ''))
} else {
  console.log('\nSimulación. Para aplicar: --apply')
}

await c.end()
