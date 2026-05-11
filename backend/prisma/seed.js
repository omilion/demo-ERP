import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'
import 'dotenv/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const ROLES = ['admin', 'vendedor', 'bodeguero', 'cajero', 'taller', 'rrhh', 'solo_lectura']

async function main() {
  const passwordHash = await bcrypt.hash('dev1234', 12)

  for (const role of ROLES) {
    await prisma.user.upsert({
      where: { email: `${role}@plastimar.cl` },
      update: {},
      create: {
        email: `${role}@plastimar.cl`,
        passwordHash,
        role,
        nombre: role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' '),
      },
    })
  }

  for (const [i, nombre] of [['1', 'Caja 1'], ['2', 'Caja 2']]) {
    await prisma.caja.upsert({
      where: { id: Number(i) },
      update: {},
      create: { nombre, sucursalId: 1 },
    })
  }

  console.log('Seed OK:', ROLES.map(r => `${r}@plastimar.cl`).join(', '))
  console.log('Cajas: Caja 1, Caja 2')
}

main().catch(console.error).finally(() => prisma.$disconnect())
