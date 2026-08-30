// Lleva a las diez personas del levantamiento al modelo de permisos por función.
//
// Se crearon antes de que existieran las funciones dentro de un módulo, así que
// quedaron con permisos más gruesos de lo que su trabajo necesita:
//
//   Jenifer y Mercedes son cortadoras con rol `taller`, que otorga taller:write
//   en bloque: hoy pueden cerrar y anular una OT.
//
//   Diego Ávila marca entregas desde bodega, pero no tiene cómo: eso exigía
//   ventas:write, que además lo habilitaría a crear y editar ventas.
//
// Uso:
//   node scripts/ajustar-permisos-personas.mjs               (simulación)
//   node scripts/ajustar-permisos-personas.mjs --apply
//   node scripts/ajustar-permisos-personas.mjs --db=<url>
import bcrypt from 'bcrypt'
import pg from 'pg'
import 'dotenv/config'

const APPLY = process.argv.includes('--apply')
// En una base recien levantada las personas no existen todavia. Con --crear se
// dan de alta con la misma identidad y permisos, para poder recorrer el flujo
// de cada una sin depender de la copia de produccion.
const CREAR = process.argv.includes('--crear')
const PASSWORD = 'plastimar2026'
const dbArg = process.argv.find(a => a.startsWith('--db='))
const URL = dbArg ? dbArg.slice(5) : process.env.DATABASE_URL

if (!URL) {
  console.error('Falta la base: define DATABASE_URL o pasa --db=<url>')
  process.exit(1)
}

// Sale de docs/PLAN_CATALOGO_PERMISOS.md, acordado contra el trabajo real que
// cada persona declaró en el levantamiento.
const PERSONAS = [
  { email: 'laura.navarro@plastimar.cl', nombre: 'Laura Navarro', cargo: 'Gerencia General', rol: 'admin', extra: null, porque: 'Gerencia: acceso completo' },
  { email: 'diego.espinoza@plastimar.cl', nombre: 'Diego Espinoza', cargo: 'Gerencia General', rol: 'admin', extra: null, porque: 'Gerencia: acceso completo' },
  { email: 'marcela.lacourt@plastimar.cl', nombre: 'Marcela Lacourt', cargo: 'Finanzas y RRHH', rol: 'cajero', extra: { rrhh: ['read', 'write'] }, porque: 'Cobranza y RRHH' },
  {
    email: 'daniela.reyes@plastimar.cl', nombre: 'Daniela Reyes', cargo: 'Facturación y Despacho', rol: 'bodeguero',
    extra: { 'facturacion.emitir': ['read', 'write'], 'despacho.guias': ['read', 'write'] },
    porque: 'Emite DTE y guías; NO ajusta folios ni CAF',
  },
  {
    email: 'dyan.cortes@plastimar.cl', nombre: 'Dyan Cortés', cargo: 'Coordinador de bodega y espuma', rol: 'bodeguero',
    extra: { 'taller.gestion': ['read', 'write'], 'ventas.taller': ['write'], 'bodega.compras': ['read', 'write'] },
    porque: 'Coordina taller y compras; empuja órdenes a taller',
  },
  {
    email: 'diego.avila@plastimar.cl', nombre: 'Diego Ávila', cargo: 'Encargado de bodega e inventario', rol: 'bodeguero',
    extra: { 'bodega.movimientos': ['read', 'write'], 'ventas.entregas': ['write'] },
    porque: 'Marca entregas sin poder crear ventas',
  },
  {
    email: 'zalma.lobos@plastimar.cl', nombre: 'Zalma Lobos', cargo: 'Supervisora de confección', rol: 'taller',
    extra: { 'taller.gestion': ['read', 'write'], 'taller.cerrar': ['read', 'write'] },
    porque: 'Supervisora: gestiona y cierra OT',
  },
  { email: 'jenifer.breidenbach@plastimar.cl', nombre: 'Jenifer Breidenbach', cargo: 'Cortadora', rol: 'taller_operario', extra: null, porque: 'Cortadora: registra avance, no cierra' },
  { email: 'mercedes.rodriguez@plastimar.cl', nombre: 'Mercedes Rodríguez', cargo: 'Cortadora', rol: 'taller_operario', extra: null, porque: 'Cortadora: registra avance, no cierra' },
  {
    email: 'sebastian.mella@plastimar.cl', nombre: 'Sebastián Mella', cargo: 'Encargado de Espuma', rol: 'taller',
    extra: { 'taller.materiales': ['read', 'write'], 'bodega.movimientos': ['read', 'write'], despacho: ['read'] },
    porque: 'Espuma: materiales y movimientos de bodega',
  },
]

const c = new pg.Client({ connectionString: URL })
await c.connect()

console.log(APPLY ? '=== AJUSTANDO PERMISOS ===' : '=== SIMULACION (nada se escribe) ===')
console.log('Base:', URL.replace(/:[^:@]*@/, ':***@'))

const resumen = []
const noEncontradas = []

for (const p of PERSONAS) {
  const { rows } = await c.query(
    'select id, nombre, role, permisos_extra from auth.users where lower(email) = lower($1)',
    [p.email],
  )
  if (!rows.length) {
    if (!CREAR) { noEncontradas.push(p.email); continue }
    resumen.push({ persona: p.nombre, rol: `(nueva) ${p.rol}`, permisos: p.extra ? Object.keys(p.extra).sort().join(', ') : '—', cambia: 'alta' })
    if (APPLY) {
      const hash = await bcrypt.hash(PASSWORD, 10)
      await c.query(
        `insert into auth.users (email, password_hash, role, nombre, cargo, permisos_extra, activo, created_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, true, now())`,
        [p.email, hash, p.rol, p.nombre, p.cargo, p.extra ? JSON.stringify(p.extra) : null],
      )
    }
    continue
  }
  const actual = rows[0]

  const extraActual = actual.permisos_extra ? Object.keys(actual.permisos_extra).sort().join(', ') : '—'
  const extraNuevo = p.extra ? Object.keys(p.extra).sort().join(', ') : '—'
  const cambiaRol = actual.role !== p.rol
  const cambiaExtra = extraActual !== extraNuevo

  resumen.push({
    persona: actual.nombre,
    rol: cambiaRol ? `${actual.role} -> ${p.rol}` : actual.role,
    permisos: cambiaExtra ? `${extraActual}  ->  ${extraNuevo}` : extraActual,
    cambia: cambiaRol || cambiaExtra ? 'si' : '—',
  })

  if (APPLY && (cambiaRol || cambiaExtra)) {
    await c.query(
      'update auth.users set role = $2, permisos_extra = $3::jsonb where id = $1',
      [actual.id, p.rol, p.extra ? JSON.stringify(p.extra) : null],
    )
  }
}

console.log('')
console.table(resumen)

if (noEncontradas.length) {
  console.log('\nNo encontradas en esta base (crear primero):')
  noEncontradas.forEach(e => console.log('   ' + e))
}

console.log('\nLo que cambia en concreto:')
console.log('  Jenifer y Mercedes  dejan de poder cerrar y anular una OT')
console.log('  Diego Ávila         puede marcar entregas, y sigue sin poder crear ventas')
console.log('  Daniela             emite DTE y guías, pero ya no ajusta folios ni CAF')
if (!APPLY) console.log('\nSimulacion. Para aplicar: --apply')

await c.end()
