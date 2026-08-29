// Carga un juego inicial de reglas de descuento para que Plastimar pueda ver el
// modulo funcionando.
//
// Hoy el modulo rechaza TODO descuento, porque sin reglas cargadas no hay contra
// que evaluar. Estas tres son un punto de partida para que el equipo las vea y
// las corrija con criterio comercial; no pretenden ser la politica definitiva.
//
// Como evalua el motor (backend/src/routes/descuentos/rules-engine.js):
//   porcentajeAutoaprobado  hasta aqui pasa solo
//   porcentajeMax           sobre esto se RECHAZA
//   requiereAprobacion      entre autoaprobado y max queda PENDIENTE
//   prioridad               mayor gana; todas las que calzan se muestran
//
// Uso:
//   node scripts/cargar-reglas-descuento.mjs                  (simulacion)
//   node scripts/cargar-reglas-descuento.mjs --apply
//   node scripts/cargar-reglas-descuento.mjs --db=<url>
//   node scripts/cargar-reglas-descuento.mjs --apply --desactivar-pruebas
import pg from 'pg'
import 'dotenv/config'

const APPLY = process.argv.includes('--apply')
const DESACTIVAR_PRUEBAS = process.argv.includes('--desactivar-pruebas')
const dbArg = process.argv.find(a => a.startsWith('--db='))
const URL = dbArg ? dbArg.slice(5) : process.env.DATABASE_URL

if (!URL) {
  console.error('Falta la base: define DATABASE_URL o pasa --db=<url>')
  process.exit(1)
}

const REGLAS = [
  {
    codigo: 'general-estandar',
    nombre: 'Descuento comercial estándar',
    descripcion: 'Cualquier venta, todo el equipo comercial. Se aplica sin pedir autorización.',
    // Menor prioridad que la ampliada: la ampliada cubre bien todo el rango
    // -autoriza hasta 5, deja pendiente hasta 15, rechaza sobre eso-, mientras
    // que esta sola haria aparecer como RECHAZADO un 9% que en realidad solo
    // necesita autorizacion. Queda como la opcion explicita para el caso simple.
    prioridad: 100,
    // Sin condiciones: calza con cualquier venta y cualquier producto.
    condiciones: {},
    efecto: { porcentajeSugerido: 0, porcentajeAutoaprobado: 5 },
    porcentajeMax: 5,
    requiereAprobacion: false,
  },
  {
    codigo: 'general-ampliado',
    nombre: 'Descuento ampliado con autorización',
    descripcion: 'Cualquier venta. Sobre 5% queda pendiente hasta que alguien con permiso lo autorice.',
    // Es la que manda por defecto en una venta comun: cubre todo el rango sin
    // que un porcentaje legitimo aparezca rechazado.
    prioridad: 110,
    condiciones: {},
    efecto: { porcentajeSugerido: 0, porcentajeAutoaprobado: 5 },
    porcentajeMax: 15,
    requiereAprobacion: true,
  },
  {
    codigo: 'licitacion',
    nombre: 'Descuento de licitación',
    descripcion: 'Sólo ventas de tipo Licitación, donde el margen se define al postular.',
    // Mayor prioridad: cuando la venta es licitacion, esta manda sobre las generales.
    prioridad: 120,
    condiciones: { tiposVenta: ['Licitación'] },
    efecto: { porcentajeSugerido: 0, porcentajeAutoaprobado: 10 },
    porcentajeMax: 20,
    requiereAprobacion: true,
  },
]

const c = new pg.Client({ connectionString: URL })
await c.connect()

console.log(APPLY ? '=== CARGANDO REGLAS ===' : '=== SIMULACION (nada se escribe) ===')
console.log('Base:', URL.replace(/:[^:@]*@/, ':***@'))

// Reglas de prueba olvidadas: una con prioridad alta gana sobre las reales y
// autoaprueba en silencio. En la copia de produccion hay una de agosto.
const { rows: pruebas } = await c.query(
  `select id, codigo, nombre, prioridad, porcentaje_max
     from ventas.descuento_reglas
    where activo = true and (codigo ilike 'test-%' or nombre ilike 'TEST-%')`,
)
if (pruebas.length) {
  console.log(`\n### ${pruebas.length} regla(s) de PRUEBA activas`)
  console.table(pruebas)
  if (APPLY && DESACTIVAR_PRUEBAS) {
    const res = await c.query(
      `update ventas.descuento_reglas set activo = false where id = any ($1)`,
      [pruebas.map(p => p.id)],
    )
    console.log(`   -> ${res.rowCount} desactivada(s)`)
  } else {
    console.log('   Para desactivarlas: --apply --desactivar-pruebas')
  }
}

console.log('\n### reglas a cargar')
console.table(REGLAS.map(r => ({
  codigo: r.codigo,
  nombre: r.nombre,
  aplica: r.condiciones.tiposVenta ? r.condiciones.tiposVenta.join(', ') : 'cualquier venta',
  automatico: `${r.efecto.porcentajeAutoaprobado}%`,
  maximo: `${r.porcentajeMax}%`,
  sobre_automatico: r.requiereAprobacion ? 'pide autorizacion' : 'no aplica',
  prioridad: r.prioridad,
})))

let nuevas = 0
let existentes = 0
for (const r of REGLAS) {
  const ya = await c.query('select id, version from ventas.descuento_reglas where codigo = $1 order by version desc limit 1', [r.codigo])
  if (ya.rowCount) {
    console.log(`  = ${r.codigo.padEnd(20)} ya existe (id ${ya.rows[0].id}, version ${ya.rows[0].version})`)
    existentes++
    continue
  }
  if (APPLY) {
    const res = await c.query(
      `insert into ventas.descuento_reglas
         (codigo, version, nombre, descripcion, alcance, tipo_descuento, prioridad,
          condiciones, efecto, porcentaje_max, requiere_aprobacion, activo, created_at, updated_at)
       values ($1, 1, $2, $3, 'ventas', 'porcentaje', $4, $5::jsonb, $6::jsonb, $7, $8, true, now(), now())
       returning id`,
      [r.codigo, r.nombre, r.descripcion, r.prioridad,
       JSON.stringify(r.condiciones), JSON.stringify(r.efecto), r.porcentajeMax, r.requiereAprobacion],
    )
    console.log(`  + ${r.codigo.padEnd(20)} creada (id ${res.rows[0].id})`)
  }
  nuevas++
}

console.log(`\nnuevas: ${nuevas} · ya existentes: ${existentes}`)
console.log('\nQue va a ver el equipo:')
console.log('  venta comun    5% pasa solo · hasta 15% queda pendiente de autorizacion')
console.log('  licitacion    10% pasa solo · hasta 20% queda pendiente de autorizacion')
console.log('  sobre el maximo de la regla, se rechaza')
if (!APPLY) console.log('\nSimulacion. Para aplicar: --apply')

await c.end()
