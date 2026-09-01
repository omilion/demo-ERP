import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/plastimar_dev' })
const prisma = new PrismaClient({ adapter })

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      nombre: true,
      role: true,
      activo: true,
      permisosExtra: true,
      sucursalId: true,
      rut: true,
      codigoVendedor: true,
      cargo: true,
    },
    orderBy: { id: 'asc' },
  })
  console.log('TOTAL USERS IN DB:', users.length)
  console.table(users.map(u => ({
    ID: u.id,
    Nombre: u.nombre,
    Email: u.email,
    Nivel: u.role,
    CodVendedor: u.codigoVendedor || '—',
    Cargo: u.cargo || '—',
    Activo: u.activo ? 'Si' : 'No',
  })))
  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
