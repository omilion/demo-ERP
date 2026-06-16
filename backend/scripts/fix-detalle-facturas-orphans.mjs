import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Iniciando limpieza de huérfanos en detalle_facturas_proveedor...');

  // Buscar todos los detalle_facturas_proveedor cuyos pago_id no existan en pagos_proveedores
  const orphans = await prisma.$queryRaw`
    SELECT id, pago_id FROM catalogo.detalle_facturas_proveedor
    WHERE pago_id NOT IN (SELECT id FROM catalogo.pagos_proveedores)
  `;

  console.log(`Encontrados ${orphans.length} registros huérfanos.`);
  if (orphans.length > 0) {
    console.log('Ejemplos de huérfanos:', orphans.slice(0, 5));
    const deleteCount = await prisma.$executeRaw`
      DELETE FROM catalogo.detalle_facturas_proveedor
      WHERE pago_id NOT IN (SELECT id FROM catalogo.pagos_proveedores)
    `;
    console.log(`Eliminados ${deleteCount} registros huérfanos exitosamente.`);
  } else {
    console.log('No se encontraron registros huérfanos.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
