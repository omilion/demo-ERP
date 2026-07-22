import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { calcularCosteo } from '../src/routes/costeo/engine.js';
import { upsertReceta } from '../src/routes/costeo/service.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/test' });
const prisma = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const fileArg = args.find((a) => a.endsWith('.xls') || a.endsWith('.xlsx'));
const defaultPath = path.resolve(process.cwd(), 'NUEVOS CALCULOS_PRECIOS_MK_14-07-2026.xls');
const targetFile = fileArg ? path.resolve(process.cwd(), fileArg) : defaultPath;

console.log(`\n==================================================`);
console.log(`IMPORTADOR DE COSTEO DESDE EXCEL AL ERP`);
console.log(`Modo: ${isApply ? 'APLICAR A BASE DE DATOS (--apply)' : 'DRY-RUN (Simulación sin escrituras)'}`);
console.log(`Archivo objetivo: ${targetFile}`);
console.log(`==================================================\n`);

function parseTransferMarginFormula(formulaStr) {
  if (!formulaStr) return 35;
  // Match formulas like =+AL11*20%+AL11 or =AL11*1.20 or =AL11*15%+AL11
  const pctMatch = formulaStr.match(/\*(\d+)%/);
  if (pctMatch) return parseInt(pctMatch[1], 10);

  const factorMatch = formulaStr.match(/\*1\.(\d+)/);
  if (factorMatch) return parseInt(factorMatch[1], 10);

  return 35;
}

async function main() {
  if (!fs.existsSync(targetFile)) {
    console.log(`⚠️ Archivo de Excel no encontrado en: ${targetFile}`);
    console.log(`Por favor proporciona la ruta del archivo Excel como argumento: node scripts/import-costeo-excel.mjs <archivo.xls> [--apply]\n`);
    process.exit(0);
  }

  const workbook = XLSX.readFile(targetFile, { cellFormulas: true });
  const sheetName = workbook.SheetNames.find((s) => s.toUpperCase() === 'MK') || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    console.error(`❌ No se encontró la hoja 'MK' en el archivo Excel`);
    process.exit(1);
  }

  console.log(`Hoja cargada: '${sheetName}'`);

  const range = XLSX.utils.decode_range(sheet['!ref']);
  console.log(`Rango de celdas: Fila ${range.s.r + 1} a Fila ${range.e.r + 1}`);

  let totalProcesados = 0;
  let totalCoincidenAK = 0;
  const desvios = [];
  const excepcionesMargen = [];
  const recetasPorCodigo = new Map();

  // Seed process tariffs if apply
  if (isApply) {
    const tallerEspumas = await prisma.taller.findFirst({ where: { id: 1 } });
    const tallerConfeccion = await prisma.taller.findFirst({ where: { id: 2 } });

    if (tallerEspumas) {
      await prisma.tarifaProceso.upsert({
        where: { tallerId_proceso_vigenteDesde: { tallerId: 1, proceso: 'corte', vigenteDesde: new Date('2026-07-01') } },
        update: { valorHora: 3800 },
        create: { tallerId: 1, proceso: 'corte', valorHora: 3800, vigenteDesde: new Date('2026-07-01') },
      });
    }

    if (tallerConfeccion) {
      await prisma.tarifaProceso.upsert({
        where: { tallerId_proceso_vigenteDesde: { tallerId: 2, proceso: 'confeccion', vigenteDesde: new Date('2026-07-01') } },
        update: { valorHora: 4200 },
        create: { tallerId: 2, proceso: 'confeccion', valorHora: 4200, vigenteDesde: new Date('2026-07-01') },
      });
      await prisma.tarifaProceso.upsert({
        where: { tallerId_proceso_vigenteDesde: { tallerId: 2, proceso: 'enfundado', vigenteDesde: new Date('2026-07-01') } },
        update: { valorHora: 4200 },
        create: { tallerId: 2, proceso: 'enfundado', valorHora: 4200, vigenteDesde: new Date('2026-07-01') },
      });
    }
  }

  // Row 11 is start of product data (0-indexed 10)
  for (let r = 10; r <= range.e.r; r++) {
    const cellCodigo = sheet[XLSX.utils.encode_cell({ r, c: 2 })]; // Col C
    if (!cellCodigo || !cellCodigo.v) continue;

    const codigo = String(cellCodigo.v).trim();
    if (!codigo.startsWith('MK-')) continue;

    totalProcesados++;

    const cellNombre = sheet[XLSX.utils.encode_cell({ r, c: 7 })]; // Col H
    // Materiales ya totalizados por el Excel en la fila del producto (sus
    // formulas agregan las filas de componentes de mas abajo). Sin estas dos
    // columnas el costo queda solo con mano de obra y se subestima muchisimo:
    // AK = V(espuma) + Z(tela) + AE + AH + AI + AC.
    const cellEspuma = sheet[XLSX.utils.encode_cell({ r, c: 21 })]; // Col V - VALOR TOTAL SET ESPUMA
    const cellTela = sheet[XLSX.utils.encode_cell({ r, c: 25 })]; // Col Z - V/MT X SET TELA
    const cellHorasCorte = sheet[XLSX.utils.encode_cell({ r, c: 27 })]; // Col AB
    const cellHorasConfeccion = sheet[XLSX.utils.encode_cell({ r, c: 29 })]; // Col AD
    const cellHorasEnfundado = sheet[XLSX.utils.encode_cell({ r, c: 31 })]; // Col AF
    const cellAccesorios = sheet[XLSX.utils.encode_cell({ r, c: 34 })]; // Col AI
    const cellCostoAK = sheet[XLSX.utils.encode_cell({ r, c: 36 })]; // Col AK (Costo Fabricación Excel)
    const cellFormulaAN = sheet[XLSX.utils.encode_cell({ r, c: 39 })]; // Col AN (Formula para margen)

    const valorEspuma = Number(cellEspuma?.v) || 0;
    const valorTela = Number(cellTela?.v) || 0;
    const hrsCorte = Number(cellHorasCorte?.v) || 0;
    const hrsConfeccion = Number(cellHorasConfeccion?.v) || 0;
    const hrsEnfundado = Number(cellHorasEnfundado?.v) || 0;
    const accesoriosMonto = Number(cellAccesorios?.v) || 0;
    const costoAKExcel = Number(cellCostoAK?.v) || 0;

    const formulaStr = cellFormulaAN?.f || '';
    const margenTransferencia = parseTransferMarginFormula(formulaStr);

    if (margenTransferencia === 35 && formulaStr && !formulaStr.includes('35')) {
      excepcionesMargen.push({ codigo, formula: formulaStr });
    }

    const calcEngine = calcularCosteo({
      materiales: [
        { nombre: 'Espuma (set)', cantidad: 1, precioUnitario: valorEspuma },
        { nombre: 'Tela (set)', cantidad: 1, precioUnitario: valorTela },
      ],
      procesos: [
        { tallerId: 1, proceso: 'corte', horas: hrsCorte, valorHora: 3800 },
        { tallerId: 2, proceso: 'confeccion', horas: hrsConfeccion, valorHora: 4200 },
        { tallerId: 2, proceso: 'enfundado', horas: hrsEnfundado, valorHora: 4200 },
      ],
      accesoriosMonto,
      ajusteGlobalPct: 3,
      margenTransferencia,
    });

    const diffAK = Math.abs(calcEngine.costoFabricacion - costoAKExcel);
    if (diffAK <= 2) {
      totalCoincidenAK++;
    } else {
      desvios.push({
        codigo,
        nombre: cellNombre?.v || '',
        costoEngine: calcEngine.costoFabricacion,
        costoAKExcel,
        diferencia: calcEngine.costoFabricacion - costoAKExcel,
      });
    }

    // El Excel usa varias filas por codigo: la del producto (con el costo
    // total en AK) y debajo las de sus componentes, que repiten el codigo.
    // Si se escribiera fila por fila, la ultima componente pisaria al
    // producto, porque producto_recetas.producto_id es unico. Nos quedamos
    // con la fila de mayor costo AK, que es la del producto.
    const previo = recetasPorCodigo.get(codigo);
    if (!previo || costoAKExcel > previo.costoAKExcel) {
      recetasPorCodigo.set(codigo, {
        codigo,
        nombre: cellNombre?.v || '',
        margenTransferencia,
        accesoriosMonto,
        materialesMonto: valorEspuma + valorTela,
        hrsCorte,
        hrsConfeccion,
        hrsEnfundado,
        costoAKExcel,
      });
    }
  }

  // Escritura: una sola receta por producto, ya deduplicada.
  let recetasEscritas = 0;
  let sinProductoEnErp = 0;
  if (isApply) {
    const talleres = await prisma.taller.findMany();
    const tallerPorNombre = new Map(talleres.map((t) => [t.nombre.toLowerCase(), t.id]));
    const tallerEspumas = tallerPorNombre.get('espumas') ?? talleres[0]?.id ?? null;
    const tallerConfecciones = tallerPorNombre.get('confecciones') ?? tallerEspumas;

    // Sin tarifa vigente la hora vale 0 y el costo queda solo con materiales.
    // Valores del Excel: $3.800 corte de espuma, $4.200 confeccion y enfundado.
    const tarifas = [
      { tallerId: tallerEspumas, proceso: 'corte', valorHora: 3800 },
      { tallerId: tallerConfecciones, proceso: 'confeccion', valorHora: 4200 },
      { tallerId: tallerConfecciones, proceso: 'enfundado', valorHora: 4200 },
    ];
    for (const t of tarifas) {
      const yaExiste = await prisma.tarifaProceso.findFirst({
        where: { tallerId: t.tallerId, proceso: t.proceso, activo: true },
      });
      if (!yaExiste) {
        await prisma.tarifaProceso.create({ data: { ...t, vigenteDesde: new Date(), activo: true } });
        console.log(`  tarifa creada: ${t.proceso} $${t.valorHora}/hora`);
      }
    }

    for (const receta of recetasPorCodigo.values()) {
      const productoDB = await prisma.producto.findUnique({ where: { codigoInterno: receta.codigo } });
      if (!productoDB) { sinProductoEnErp++; continue; }

      const procesos = [];
      if (receta.hrsCorte > 0) procesos.push({ tallerId: tallerEspumas, proceso: 'corte', horas: receta.hrsCorte });
      if (receta.hrsConfeccion > 0) procesos.push({ tallerId: tallerConfecciones, proceso: 'confeccion', horas: receta.hrsConfeccion });
      if (receta.hrsEnfundado > 0) procesos.push({ tallerId: tallerConfecciones, proceso: 'enfundado', horas: receta.hrsEnfundado });

      await upsertReceta(prisma, productoDB.id, {
        tallerId: tallerEspumas,
        margenTransferencia: receta.margenTransferencia,
        ajusteGlobalPct: 3,
        accesoriosMonto: receta.accesoriosMonto,
        materialesMonto: receta.materialesMonto,
        notas: `Importado del Excel (${receta.nombre}). Materiales sin desglose.`,
        materiales: [],
        procesos,
      });
      recetasEscritas++;
    }
  }

  const pctCoincidencia = totalProcesados > 0 ? ((totalCoincidenAK / totalProcesados) * 100).toFixed(1) : 0;

  console.log(`\n==================================================`);
  console.log(`RESUMEN DE VALIDACIÓN`);
  console.log(`==================================================`);
  console.log(`Filas MK leidas: ${totalProcesados}`);
  console.log(`Productos unicos (deduplicados): ${recetasPorCodigo.size}`);
  if (isApply) {
    console.log(`Recetas escritas: ${recetasEscritas}`);
    console.log(`Codigos del Excel sin producto en el ERP: ${sinProductoEnErp}`);
  }
  console.log(`Coinciden con columna AK (±$2): ${totalCoincidenAK} (${pctCoincidencia}%)`);
  console.log(`Excepciones de margen capturadas: ${excepcionesMargen.length}`);

  if (desvios.length > 0) {
    console.log(`\nTop desvíos detectados (máximo 20):`);
    desvios.slice(0, 20).forEach((d, idx) => {
      console.log(`  ${idx + 1}. [${d.codigo}] ${d.nombre} -> Motor: $${d.costoEngine} | Excel AK: $${d.costoAKExcel} (Diff: $${d.diferencia})`);
    });
  }

  if (Number(pctCoincidencia) < 90 && totalProcesados > 0) {
    console.log(`\n⚠️ ADVERTENCIA: La coincidencia (${pctCoincidencia}%) es inferior al 90% requerido.`);
  } else {
    console.log(`\n✅ VALIDACIÓN EXITOSA: La coincidencia (${pctCoincidencia}%) cumple los criterios del plan.`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Error durante la importación:', e);
  prisma.$disconnect();
  process.exit(1);
});
