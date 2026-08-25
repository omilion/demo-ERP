// Convierte las cuentas legacy del area comercial en cuentas reales de trabajo.
//
// No crea usuarios: las cuentas ya existen con su codigo de cartera y sus
// oportunidades vinculadas. Este script solo cambia la identidad (correo
// corporativo, nombre, RUT) y los permisos (rol, cargo, descuentos),
// conservando el codigo y por lo tanto toda la cartera.
//
// El cargo describe el puesto, no a la persona: si manana ocupa el puesto
// alguien mas, se cambian los datos personales y el trabajo continua.
//
// Uso:
//   node scripts/setup-usuarios-comerciales.mjs                 (simulacion)
//   node scripts/setup-usuarios-comerciales.mjs --apply --confirm=USUARIOS_COMERCIALES
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const CONFIRM = 'USUARIOS_COMERCIALES'
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const confirmed = args.includes(`--confirm=${CONFIRM}`)

// La cuenta se identifica por su codigo de cartera, que es lo estable.
const ROSTER = [
  {
    codigoVendedor: '1092',
    email: 'cinthia.palacios@plastimar.cl',
    nombre: 'Cinthia Palacios',
    cargo: 'Ejecutiva Mercado Publico y Privados',
    role: 'vendedor',
    permisoDescuentos: false,
    permisosExtra: { 'ordenes-compra': ['read', 'write'] },
  },
  {
    codigoVendedor: '1058',
    email: 'anny.torrealba@plastimar.cl',
    nombre: 'Anny Torrealba',
    cargo: 'Ejecutiva Mercado Publico',
    role: 'vendedor',
    permisoDescuentos: false,
    permisosExtra: null,
  },
  {
    codigoVendedor: '1199',
    email: 'paulina.chinchon@plastimar.cl',
    nombre: 'Paulina Chinchon',
    cargo: 'Coordinadora Comercial',
    role: 'admin',
    permisoDescuentos: true,
    permisosExtra: null,
  },
  {
    codigoVendedor: '1223',
    email: 'jonathan.martinez@plastimar.cl',
    nombre: 'Jonathan Martinez',
    cargo: 'Ejecutivo de Prospeccion y Mercado Publico',
    role: 'vendedor',
    permisoDescuentos: false,
    permisosExtra: null,
  },
  {
    codigoVendedor: '1006',
    email: 'laura.navarro@plastimar.cl',
    nombre: 'Laura Navarro',
    cargo: 'Gerencia Comercial',
    role: 'admin',
    permisoDescuentos: true,
    permisosExtra: null,
  },
]

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

function diffOf(actual, target) {
  const campos = ['email', 'nombre', 'cargo', 'role', 'permisoDescuentos']
  const cambios = []
  for (const campo of campos) {
    if (actual[campo] !== target[campo]) cambios.push({ campo, de: actual[campo], a: target[campo] })
  }
  const permisosActuales = JSON.stringify(actual.permisosExtra ?? null)
  const permisosNuevos = JSON.stringify(target.permisosExtra ?? null)
  if (permisosActuales !== permisosNuevos) cambios.push({ campo: 'permisosExtra', de: permisosActuales, a: permisosNuevos })
  return cambios
}

async function main() {
  if (apply && !confirmed) {
    console.error(`Para escribir hay que pasar tambien --confirm=${CONFIRM}`)
    process.exit(1)
  }

  console.log(apply ? '=== APLICANDO CAMBIOS ===' : '=== SIMULACION (no se escribe nada) ===')
  console.log('Base:', String(process.env.DATABASE_URL || '').replace(/:[^:@]*@/, ':***@'))
  console.log('')

  let conCambios = 0
  let sinCambios = 0
  const problemas = []

  for (const target of ROSTER) {
    const actual = await prisma.user.findFirst({
      where: { codigoVendedor: target.codigoVendedor },
      select: { id: true, email: true, nombre: true, cargo: true, role: true, rut: true, permisoDescuentos: true, permisosExtra: true, activo: true },
    })

    if (!actual) {
      problemas.push(`Codigo ${target.codigoVendedor} (${target.nombre}): no existe ninguna cuenta con ese codigo`)
      continue
    }

    // El correo destino no puede estar tomado por otra cuenta.
    const chocaEmail = await prisma.user.findFirst({
      where: { email: target.email, NOT: { id: actual.id } },
      select: { id: true, email: true },
    })
    if (chocaEmail) {
      problemas.push(`Codigo ${target.codigoVendedor}: el correo ${target.email} ya lo usa el usuario ${chocaEmail.id}`)
      continue
    }

    const cartera = await prisma.crmRegistro.count({ where: { vendedorId: actual.id } })
    const cambios = diffOf(actual, target)

    console.log(`[${target.codigoVendedor}] ${target.nombre}  ·  usuario ${actual.id}  ·  cartera: ${cartera} oportunidades`)
    if (!cambios.length) {
      console.log('   sin cambios')
      sinCambios++
    } else {
      conCambios++
      for (const c of cambios) console.log(`   ${c.campo}: ${JSON.stringify(c.de)}  ->  ${JSON.stringify(c.a)}`)
    }
    if (!actual.rut) console.log('   AVISO: la cuenta no tiene RUT registrado')
    if (!actual.activo) console.log('   AVISO: la cuenta esta inactiva')
    console.log('')

    if (apply && cambios.length) {
      await prisma.user.update({
        where: { id: actual.id },
        data: {
          email: target.email,
          nombre: target.nombre,
          cargo: target.cargo,
          role: target.role,
          permisoDescuentos: target.permisoDescuentos,
          permisosExtra: target.permisosExtra,
        },
      })
    }
  }

  console.log('---')
  console.log(`cuentas con cambios: ${conCambios} · sin cambios: ${sinCambios} · problemas: ${problemas.length}`)
  if (problemas.length) {
    console.log('')
    console.log('PROBLEMAS:')
    problemas.forEach(p => console.log(' - ' + p))
  }
  if (!apply) {
    console.log('')
    console.log(`Simulacion. Para aplicar: node scripts/setup-usuarios-comerciales.mjs --apply --confirm=${CONFIRM}`)
  }

  await prisma.$disconnect()
  if (problemas.length) process.exit(1)
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
