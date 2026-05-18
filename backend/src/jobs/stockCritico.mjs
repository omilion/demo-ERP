// G6: reporte de stock crítico - ejecutable vía cron del SO
// Uso: node src/jobs/stockCritico.mjs
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Productos bodega general
  const productos = await prisma.producto.findMany({
    where: { activo: true },
    select: { id: true, codigoInterno: true, nombre: true, stock: true, stockCritico: true, bodega: true },
  })
  const prodCrit = productos.filter(p => (p.stock ?? 0) <= (p.stockCritico ?? 0))

  // Materiales bodega taller
  const materiales = await prisma.bodegaTaller.findMany({
    where: { activo: true },
    select: { id: true, codigoInterno: true, nombre: true, stock: true, stockCritico: true },
  })
  const matCrit = materiales.filter(m => (m.stock ?? 0) <= (m.stockCritico ?? 0))

  const fecha = new Date().toISOString().slice(0, 10)
  console.log(`[stockCritico ${fecha}] productos críticos: ${prodCrit.length} / materiales taller críticos: ${matCrit.length}`)

  for (const p of prodCrit) {
    console.log(`  [PROD] ${p.codigoInterno} ${p.nombre} bodega=${p.bodega} stock=${p.stock} crit=${p.stockCritico}`)
  }
  for (const m of matCrit) {
    console.log(`  [TALLER] ${m.codigoInterno} ${m.nombre} stock=${m.stock} crit=${m.stockCritico}`)
  }

  return { productos: prodCrit.length, materiales: matCrit.length }
}

main()
  .then(r => { console.log('done', r); process.exit(0) })
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
