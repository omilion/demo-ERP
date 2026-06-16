import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function cleanRut(rut) {
  if (!rut) return null;
  return String(rut).toUpperCase().replace(/[^0-9K]/g, '');
}

function cleanName(name) {
  if (!name) return '';
  return String(name)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function main() {
  console.log('Iniciando limpieza y saneamiento de proveedores...');

  const proveedores = await prisma.proveedor.findMany({
    include: {
      _count: {
        select: {
          productoProveedores: true,
        }
      }
    }
  });

  console.log(`Total de proveedores encontrados: ${proveedores.length}`);

  // Paso 1: Rellenar RUTs temporales para proveedores que no lo tengan
  console.log('Validando y sanitizando RUTs...');
  let placeholderCount = 1;
  const sanitizados = proveedores.map(p => {
    let rut = cleanRut(p.rut);
    if (!rut) {
      rut = `TEMP_RUT_${placeholderCount++}`;
      console.log(`Proveedor ID ${p.id} (${p.nombre}) no tiene RUT. Asignando temporal: ${rut}`);
    }
    return {
      ...p,
      rutClean: rut,
      nameClean: cleanName(p.nombre)
    };
  });

  // Agrupar por RUT limpio primero
  const groupsByRut = {};
  for (const p of sanitizados) {
    if (!groupsByRut[p.rutClean]) {
      groupsByRut[p.rutClean] = [];
    }
    groupsByRut[p.rutClean].push(p);
  }

  // Agrupar por nombre limpio si el RUT no fue duplicado pero los nombres coinciden
  const groupsByName = {};
  for (const p of sanitizados) {
    if (!groupsByName[p.nameClean]) {
      groupsByName[p.nameClean] = [];
    }
    groupsByName[p.nameClean].push(p);
  }

  const merges = []; // Lista de { primarioId, duplicados: [p1, p2...] }
  const processedIds = new Set();

  // 1. Resolver duplicados por RUT
  for (const rut in groupsByRut) {
    const list = groupsByRut[rut];
    if (list.length > 1) {
      // Ordenar por: cantidad de productos (descendente), luego por ID (ascendente)
      list.sort((a, b) => {
        if (b._count.productoProveedores !== a._count.productoProveedores) {
          return b._count.productoProveedores - a._count.productoProveedores;
        }
        return a.id - b.id;
      });
      const primario = list[0];
      const duplicados = list.slice(1);
      merges.push({ primario, duplicados });
      list.forEach(p => processedIds.add(p.id));
      console.log(`Duplicado por RUT (${rut}): Primario es ID ${primario.id} (${primario.nombre}), fusionando ${duplicados.length} duplicados.`);
    }
  }

  // 2. Resolver duplicados por nombre (para los no procesados por RUT)
  for (const name in groupsByName) {
    const list = groupsByName[name].filter(p => !processedIds.has(p.id));
    if (list.length > 1) {
      list.sort((a, b) => {
        if (b._count.productoProveedores !== a._count.productoProveedores) {
          return b._count.productoProveedores - a._count.productoProveedores;
        }
        return a.id - b.id;
      });
      const primario = list[0];
      const duplicados = list.slice(1);
      merges.push({ primario, duplicados });
      list.forEach(p => processedIds.add(p.id));
      console.log(`Duplicado por Nombre (${name}): Primario es ID ${primario.id} (${primario.nombre}), fusionando ${duplicados.length} duplicados.`);
    }
  }

  if (merges.length === 0) {
    console.log('No se encontraron proveedores duplicados que requieran fusión.');
    return;
  }

  console.log(`Ejecutando fusiones para ${merges.length} grupos en una sola transacción...`);

  await prisma.$transaction(async (tx) => {
    for (const merge of merges) {
      const { primario, duplicados } = merge;

      for (const duplicado of duplicados) {
        console.log(`  Fusionando duplicado ID ${duplicado.id} (${duplicado.nombre}) -> primario ID ${primario.id} (${primario.nombre})...`);

        // Reasignar pagos_proveedores (evitando FK collisions ya que es relación simple)
        // Pero actualizando codigoProveedor e ids
        const pagos = await tx.pagoProveedor.findMany({
          where: { proveedorId: duplicado.id }
        });
        if (pagos.length > 0) {
          console.log(`    Reasignando ${pagos.length} pagos del proveedor...`);
          await tx.pagoProveedor.updateMany({
            where: { proveedorId: duplicado.id },
            data: {
              proveedorId: primario.id,
              codigoProveedor: primario.codigoProveedor ?? primario.id
            }
          });
        }

        // Procesar ProductoProveedor (cuidado con Compound Unique @@unique([productoId, proveedorId]))
        const prodProvs = await tx.productoProveedor.findMany({
          where: { proveedorId: duplicado.id }
        });

        for (const dp of prodProvs) {
          // Buscar si el primario ya tiene relación con ese producto
          const pp = await tx.productoProveedor.findFirst({
            where: {
              productoId: dp.productoId,
              proveedorId: primario.id
            }
          });

          if (pp) {
            // Existe colisión: Fusionamos registros en el primario y eliminamos el duplicado
            console.log(`    Colisión de producto ID ${dp.productoId}. Fusionando relación ProductoProveedor.`);
            // Determinar cual registro tiene la compra mas reciente; conservar su costo y fecha.
            // Si solo uno tiene fecha, ese gana. Si ninguno tiene fecha o empatan, se conserva el del primario (pp).
            const dpTime = dp.ultimaCompra ? new Date(dp.ultimaCompra).getTime() : null;
            const ppTime = pp.ultimaCompra ? new Date(pp.ultimaCompra).getTime() : null;
            const dpIsLatest = dpTime != null && (ppTime == null || dpTime > ppTime);
            const latestCompra = dpIsLatest ? dp.ultimaCompra : pp.ultimaCompra;
            const latestCosto = dpIsLatest ? dp.costo : pp.costo;

            await tx.productoProveedor.update({
              where: { id: pp.id },
              data: {
                cantidad: pp.cantidad + dp.cantidad,
                costo: latestCosto,
                ultimaCompra: latestCompra,
                activo: pp.activo || dp.activo
              }
            });

            // Eliminar duplicado para no infringir constraints
            await tx.productoProveedor.delete({
              where: { id: dp.id }
            });
          } else {
            // No existe colisión: Reasignamos el proveedorId del duplicado al primario
            await tx.productoProveedor.update({
              where: { id: dp.id },
              data: { proveedorId: primario.id }
            });
          }
        }

        // Eliminar el proveedor duplicado
        await tx.proveedor.delete({
          where: { id: duplicado.id }
        });
      }
    }
  });

  console.log('Fusiones completadas con éxito.');
}

main()
  .catch((e) => {
    console.error('Error durante la ejecución:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
