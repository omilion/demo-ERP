import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/plastimar_dev' })
const prisma = new PrismaClient({ adapter })

const REAL_PERSONNEL_EMAILS = [
  'laura.navarro@plastimar.cl',
  'diego.espinoza@plastimar.cl',
  'marcela.lacourt@plastimar.cl',
  'daniela.reyes@plastimar.cl',
  'dyan.cortes@plastimar.cl',
  'diego.avila@plastimar.cl',
  'zalma.lobos@plastimar.cl',
  'jenifer.breidenbach@plastimar.cl',
  'mercedes.rodriguez@plastimar.cl',
  'sebastian.mella@plastimar.cl',
]

const BASE_SYSTEM_EMAILS = [
  'admin@plastimar.cl',
  'vendedor@plastimar.cl',
  'bodeguero@plastimar.cl',
  'cajero@plastimar.cl',
  'taller@plastimar.cl',
  'rrhh@plastimar.cl',
  'solo_lectura@plastimar.cl',
]

const ALLOWED_EMAILS = new Set([...REAL_PERSONNEL_EMAILS, ...BASE_SYSTEM_EMAILS].map(e => e.toLowerCase()))

async function main() {
  const users = await prisma.user.findMany()
  const testOrExtraUsers = users.filter(u => !ALLOWED_EMAILS.has(u.email.toLowerCase()))

  console.log(`Encontrados ${users.length} usuarios en total.`)
  console.log(`Permitidos (Oficiales + Base): ${ALLOWED_EMAILS.size}`)
  console.log(`Usuarios de prueba/adicionales a desactivar/eliminar: ${testOrExtraUsers.length}`)

  for (const u of testOrExtraUsers) {
    console.log(` - Eliminando/desactivando usuario de prueba: ID ${u.id} (${u.email} - ${u.nombre})`)
    try {
      await prisma.user.delete({ where: { id: u.id } })
    } catch {
      await prisma.user.update({ where: { id: u.id }, data: { activo: false } })
    }
  }

  const remaining = await prisma.user.findMany({
    where: { activo: true },
    select: { id: true, email: true, nombre: true, role: true, cargo: true, permisosExtra: true },
    orderBy: { id: 'asc' },
  })

  console.log('\n=== USUARIOS ACTIVOS OFICIALES QUE QUEDARON ===')
  console.table(remaining.map(u => ({
    ID: u.id,
    Nombre: u.nombre,
    Email: u.email,
    Nivel: u.role,
    Cargo: u.cargo || '—',
    'Permisos Extra': u.permisosExtra ? Object.keys(u.permisosExtra).join(', ') : 'No',
  })))

  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
