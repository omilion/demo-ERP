// Carga inicial del catalogo de materias primas (taller.bodega_taller).
//
// Los datos vienen de la lista curada a mano por Plastimar desde el bloque de
// materiales del Excel (filas 1-6 de la hoja MK-INTEGRA). Ese bloque es
// irregular -nombre y precio a veces en la misma fila, a veces una abajo- por
// eso se transcribio en vez de parsearlo.
//
// USO:
//   node scripts/import-materias-primas.mjs            -> DRY RUN
//   node scripts/import-materias-primas.mjs --apply    -> escribe
//
// Es idempotente: si el codigo interno ya existe, actualiza en vez de duplicar.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Taller por categoria, definido por Plastimar.
const TALLER_POR_CATEGORIA = {
  'Rellenos': 'espumas',
  'Telas y Textiles': 'confecciones',
  'Ferreteria y Herrajes': 'madera',
  'Maderas, Fierros y Planchas': 'madera',
  'Productos / Estructuras': 'madera',
};

const MATERIAS = [
  ['Rellenos', 'Algodón', 3070, 'kg'],
  ['Rellenos', 'Picado', 3330, 'kg'],
  ['Rellenos', 'NAPA', 2193, 'mt'],
  ['Rellenos', 'Plumavit', 4905, 'kg'],
  ['Telas y Textiles', 'Huincha', 79, 'mt'],
  ['Telas y Textiles', 'Velcros 2,5 cms', 128, 'mt'],
  ['Telas y Textiles', 'Cinta Raso', 336, 'mt'],
  ['Telas y Textiles', 'Tafetán', 340, 'mt'],
  ['Telas y Textiles', 'TNT', 368, 'mt'],
  ['Telas y Textiles', 'Velcros 5 cms / Engomado', 360, 'mt'],
  ['Telas y Textiles', 'Ponge / Tafetán', 460, 'mt'],
  ['Telas y Textiles', 'TULL', 470, 'mt'],
  ['Telas y Textiles', 'Fieltro / Pañolenci', 570, 'mt'],
  ['Telas y Textiles', 'Raso Listado 1,50 mts', 600, 'mt'],
  ['Telas y Textiles', 'Bistrech', 640, 'mt'],
  ['Telas y Textiles', 'Popelina', 920, 'mt'],
  ['Telas y Textiles', 'Oxford', 930, 'mt'],
  ['Telas y Textiles', 'Cuadrillé', 1200, 'mt'],
  ['Telas y Textiles', 'Pañolensi Estampado', 1205, 'mt'],
  ['Telas y Textiles', 'Crea Sábana Lisa 1,44 HBS', 1309, 'mt'],
  ['Telas y Textiles', 'Polar x mts', 1390, 'mt'],
  ['Telas y Textiles', 'Térmico', 1550, 'mt'],
  ['Telas y Textiles', 'Oxford / Taslan', 1590, 'mt'],
  ['Telas y Textiles', 'Hule Clínico', 1650, 'mt'],
  ['Telas y Textiles', 'Trevira Estampado', 1700, 'mt'],
  ['Telas y Textiles', 'Crea Trevira Estamp 1,44 HBS 2 kilo', 1700, 'mt'],
  ['Telas y Textiles', 'Visillo', 2000, 'mt'],
  ['Telas y Textiles', 'Gamusina', 2090, 'mt'],
  ['Telas y Textiles', 'Malla Goma', 2180, 'mt'],
  ['Telas y Textiles', 'Rainsoft', 2348, 'mt'],
  ['Telas y Textiles', 'PVC Cristal', 2490, 'mt'],
  ['Telas y Textiles', 'Eco Cuero', 2690, 'mt'],
  ['Telas y Textiles', 'Lona', 2730, 'mt'],
  ['Telas y Textiles', 'Velur', 3100, 'mt'],
  ['Telas y Textiles', 'Free Kid Fluor', 3509, 'mt'],
  ['Telas y Textiles', 'Free Kids', 3573, 'mt'],
  ['Telas y Textiles', 'Covernyl', 3600, 'mt'],
  ['Telas y Textiles', 'Tevinil', 3600, 'mt'],
  ['Telas y Textiles', 'Roschell', 3690, 'mt'],
  ['Telas y Textiles', 'Pique Deportivo', 3840, 'mt'],
  ['Telas y Textiles', 'Patriota / Etnia', 4500, 'mt'],
  ['Telas y Textiles', 'Gasa', 5990, 'mt'],
  ['Telas y Textiles', 'Lycra', 6500, 'mt'],
  ['Telas y Textiles', 'Cobertura', 7200, 'mt'],
  ['Telas y Textiles', 'Raschel (textura)', 7800, 'mt'],
  ['Telas y Textiles', 'Free Kid Print', 8208, 'mt'],
  ['Ferreteria y Herrajes', 'Abrazadera', 1500, 'unidad'],
  ['Ferreteria y Herrajes', 'Mosquetón', 2500, 'unidad'],
  ['Ferreteria y Herrajes', 'Cadenas', 2800, 'mt'],
  ['Ferreteria y Herrajes', 'Cinta Adhesiva x mtr', 3493, 'mt'],
  ['Ferreteria y Herrajes', 'Guardacabo', 4300, 'unidad'],
  ['Maderas, Fierros y Planchas', 'Fierro Tubular 2500 mtrs', 2650, 'mt'],
  ['Maderas, Fierros y Planchas', 'Barra Madera 2 mtrs', 8394, 'unidad'],
  ['Maderas, Fierros y Planchas', 'Tubos de Madera 28 mm (2,50 mtrs)', 9900, 'unidad'],
  ['Maderas, Fierros y Planchas', 'Madera Pino Cepillada Impregnada', 10000, 'unidad'],
  ['Maderas, Fierros y Planchas', 'Goma', 10255, 'unidad'],
  ['Maderas, Fierros y Planchas', 'Tubos de Madera 35 mm (2,50 mtrs)', 14500, 'unidad'],
  ['Maderas, Fierros y Planchas', 'Tubo Fierro', 15000, 'unidad'],
  ['Maderas, Fierros y Planchas', 'Láminas', 25990, 'unidad'],
  ['Maderas, Fierros y Planchas', 'Melamina 15 mm Blanca', 28000, 'plancha'],
  ['Maderas, Fierros y Planchas', 'Lámina Espejos 182x91', 33980, 'plancha'],
  ['Maderas, Fierros y Planchas', 'Terciado 1,5 mm dimens 2,44x122x15mm-18mm', 35210, 'plancha'],
  ['Maderas, Fierros y Planchas', 'Formalita 2,50x1,22 mts', 40000, 'plancha'],
  ['Maderas, Fierros y Planchas', 'Espejo 2,40x1,20', 42500, 'plancha'],
  ['Productos / Estructuras', 'Cuerda polipropileno 10 mm verde', 161.55, 'mt'],
  ['Productos / Estructuras', 'Plato equilibrio', 7500, 'unidad'],
  ['Productos / Estructuras', 'Patas fierro equilibrio', 30000, 'unidad'],
  ['Productos / Estructuras', 'Banca sueca', 80000, 'unidad'],
  ['Productos / Estructuras', 'Espaldera 1 cuerpo', 95000, 'unidad'],
  ['Productos / Estructuras', 'Espaldera completa', 110000, 'unidad'],
];

// Codigo interno estable a partir del nombre: sin tildes, mayusculas y con
// guiones. Estable = correr el script dos veces no duplica.
function codigoDe(nombre) {
  const base = nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `MP-${base}`;
}

async function main() {
  console.log(APPLY ? '=== MODO APLICAR (escribe en la base) ===\n' : '=== DRY RUN (no escribe nada) ===\n');

  const talleres = await prisma.taller.findMany();
  const tallerPorNombre = new Map(talleres.map(t => [t.nombre.toLowerCase(), t.id]));

  const faltantes = [...new Set(Object.values(TALLER_POR_CATEGORIA))].filter(n => !tallerPorNombre.has(n));
  if (faltantes.length) {
    console.log('ERROR: faltan talleres en la base:', faltantes.join(', '));
    console.log('Talleres existentes:', talleres.map(t => t.nombre).join(', '));
    return;
  }

  let creados = 0, actualizados = 0;
  const porCategoria = {};
  const codigosVistos = new Set();

  for (const [categoria, nombre, precio, unidad] of MATERIAS) {
    const codigo = codigoDe(nombre);
    if (codigosVistos.has(codigo)) {
      console.log(`  AVISO: codigo repetido ${codigo} (${nombre}) — se omite`);
      continue;
    }
    codigosVistos.add(codigo);

    const tallerId = tallerPorNombre.get(TALLER_POR_CATEGORIA[categoria]);
    const existente = await prisma.bodegaTaller.findUnique({ where: { codigoInterno: codigo } });

    porCategoria[categoria] = (porCategoria[categoria] || 0) + 1;

    if (APPLY) {
      const data = { nombre, detalle: categoria, unidadMedida: unidad, precio, tallerId, activo: true };
      if (existente) {
        await prisma.bodegaTaller.update({ where: { id: existente.id }, data });
        actualizados++;
      } else {
        await prisma.bodegaTaller.create({ data: { codigoInterno: codigo, ...data } });
        creados++;
      }
    } else if (existente) {
      actualizados++;
    } else {
      creados++;
    }
  }

  console.log('--- POR CATEGORIA ---');
  for (const [cat, n] of Object.entries(porCategoria)) {
    console.log(`  ${cat.padEnd(30)} ${String(n).padStart(3)} materiales -> taller ${TALLER_POR_CATEGORIA[cat]}`);
  }

  console.log('\n--- EJEMPLOS DE CODIGO GENERADO ---');
  for (const [, nombre] of MATERIAS.slice(0, 4)) console.log(`  ${nombre.padEnd(34)} -> ${codigoDe(nombre)}`);

  console.log('\n--- RESUMEN ---');
  console.log('  en la lista :', MATERIAS.length);
  console.log('  a crear     :', creados);
  console.log('  a actualizar:', actualizados);
  console.log(APPLY ? '\n✓ CAMBIOS APLICADOS' : '\nDRY RUN: nada se escribio. Corre con --apply para aplicar.');
}

main()
  .catch(e => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
