import 'dotenv/config'
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/plastimar_dev' })
const prisma = new PrismaClient({ adapter })

// Cortafuegos. Este script no lleva `where`: le cambia la clave a TODOS los
// usuarios. Contra la base del VPS eso deja a la empresa entera fuera del ERP,
// y basta con tener el .env apuntando alla -el 55433- para que ocurra sin
// preguntar. Por eso solo corre contra la base local de desarrollo.
function verificarBaseLocal() {
  const url = process.env.DATABASE_URL || ''
  const esLocal = /(localhost|127\.0\.0\.1)/.test(url) && /(plastimar_dev|plastimar_test)/.test(url)
  if (!esLocal || process.env.NODE_ENV === 'production') {
    console.error('ABORTADO: este script resetea la contraseña de TODOS los usuarios.')
    console.error('Solo puede correr contra la base local de desarrollo.')
    console.error(`DATABASE_URL apunta a: ${url.replace(/:[^:@]*@/, ':***@') || '(sin definir)'}`)
    process.exit(1)
  }
}

async function main() {
  verificarBaseLocal()
  const hash = await bcrypt.hash('dev1234', 10)
  const result = await prisma.user.updateMany({
    data: { passwordHash: hash },
  })
  console.log(`Actualizadas contraseñas de ${result.count} usuarios a 'dev1234'`)
  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
