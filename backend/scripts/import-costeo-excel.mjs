import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { upsertReceta } from '../src/routes/costeo/service.js';
import { analyzeCosteoWorkbook, summarizeUnresolvedMaterials } from '../src/routes/costeo/excel-import.js';

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const allowProduction = args.includes('--allow-production');
const limitArg = args.find(argument => argument.startsWith('--limit='));
const applyLimit = limitArg ? Number.parseInt(limitArg.slice('--limit='.length), 10) : null;
const fileArg = args.find(argument => /\.xlsx?$/i.test(argument));
const defaultPath = path.resolve(process.cwd(), 'NUEVOS CALCULOS_PRECIOS_MK_14-07-2026.xls');
const targetFile = fileArg ? path.resolve(process.cwd(), fileArg) : defaultPath;
const connectionString = process.env.DATABASE_URL;

function isProductionLike(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    return !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase());
  } catch {
    return true;
  }
}

function money(value) {
  return Math.round(Number(value) || 0).toLocaleString('es-CL');
}

function printHeader() {
  console.log('\n==================================================');
  console.log('IMPORTADOR DE RECETAS MK CON BOM TRAZABLE');
  console.log(`Modo: ${isApply ? 'APLICAR RECETAS' : 'DRY-RUN (sin escrituras)'}`);
  console.log(`Excel: ${targetFile}`);
  console.log('==================================================\n');
}

function printAnalysis(analysis, materials, tariffs) {
  const { summary } = analysis;
  console.log('--- COBERTURA DEL EXCEL Y LA BASE ---');
  console.log(`Filas fisicas MK:                  ${summary.physicalRows}`);
  console.log(`Codigos MK unicos:                ${summary.uniqueCodes}`);
  console.log(`Codigos en bloques separados:     ${summary.duplicateBlockCodes}`);
  console.log(`Productos encontrados en ERP:     ${summary.productsFound}`);
  console.log(`Materias primas activas en ERP:   ${materials.length}`);
  console.log(`Tarifas activas en ERP:           ${tariffs.length}`);
  console.log(`Taller confecciones:              ${analysis.workshopIds.confecciones ?? 'NO ENCONTRADO'}`);
  console.log(`Taller espumas:                   ${analysis.workshopIds.espumas ?? 'NO ENCONTRADO'}`);

  console.log('\n--- VALIDACION POR PRODUCTO ---');
  console.log(`Coinciden con AK (+/- $2):        ${summary.sourceMatches}/${summary.uniqueCodes} (${summary.sourceMatchPct}%)`);
  console.log(`Recetas elegibles:                ${summary.eligible}`);
  console.log(`Recetas bloqueadas:               ${summary.blocked}`);
  console.log(`Lineas BOM vinculadas:            ${summary.linkedLines}`);
  console.log(`Lineas sin vinculo de catalogo:   ${summary.unresolvedLines}`);
  console.log(`Lineas espuma residuales:         ${summary.foamResidualLines} ($${money(summary.foamResidualCost)})`);
  console.log(`Margenes literales sobre 100%:    ${summary.highMargins}`);

  if (materials.length < 70) {
    console.log('\nAVISO: el catalogo local no contiene las 70 materias primas esperadas; la cobertura BOM de este dry-run no representa produccion.');
  }

  console.log('\n--- BLOQUEOS (pueden superponerse) ---');
  const blockedEntries = Object.entries(summary.blockedByReason).sort((a, b) => b[1] - a[1]);
  if (!blockedEntries.length) console.log('Sin bloqueos.');
  for (const [reason, count] of blockedEntries) console.log(`${reason.padEnd(32)} ${count}`);

  const deviations = analysis.validationResults
    .filter(result => Math.abs(result.difference) > 2)
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  console.log('\n--- 20 MAYORES DESVIOS CONTRA AK ---');
  if (!deviations.length) console.log('Sin desvios.');
  for (const result of deviations.slice(0, 20)) {
    console.log(`${result.code} fila ${result.row}: motor fuente $${money(result.calculatedAK)} | AK $${money(result.sourceAK)} | diferencia $${money(result.difference)}`);
  }

  console.log('\n--- CODIGOS EN BLOQUES SEPARADOS ---');
  const duplicated = analysis.results.filter(result => result.codeBlocks.length > 1);
  if (!duplicated.length) console.log('Sin codigos repetidos en bloques separados.');
  for (const result of duplicated) {
    const candidates = result.selection.candidates.map(candidate => `fila ${candidate.row} "${candidate.name}" score=${candidate.score.toFixed(2)}`).join(' | ');
    console.log(`${result.code}: ${result.selection.selected ? `seleccion fila ${result.selection.selected.row}` : 'BLOQUEADO'} | ${candidates}`);
  }

  console.log('\n--- MARGEN SIN FORMULA UTILIZABLE ---');
  const missingMargins = analysis.results.filter(result => result.blockedReasons.includes('margen_sin_formula'));
  if (!missingMargins.length) console.log('Sin casos.');
  for (const result of missingMargins) console.log(`${result.code} fila ${result.marginIssue?.row ?? result.mainRow}: ${result.marginIssue?.formula || '(vacia)'}`);

  console.log('\n--- MARGENES MAYORES A 100% (NO BLOQUEAN) ---');
  const highMargins = analysis.results.filter(result => result.highMargin).sort((a, b) => b.margin.margin - a.margin.margin);
  if (!highMargins.length) console.log('Sin casos.');
  for (const result of highMargins) console.log(`${result.code}: ${result.margin.margin}% (fila ${result.mainRow})`);

  console.log('\n--- MATERIALES NO RESUELTOS: TOP 30 POR COSTO FUENTE ---');
  const unresolved = summarizeUnresolvedMaterials(analysis.results);
  if (!unresolved.length) console.log('Sin casos.');
  for (const item of unresolved.slice(0, 30)) {
    console.log(`${String(item.label).padEnd(35)} ${item.type.padEnd(10)} lineas=${item.count} costo=$${money(item.sourceCost)} ejemplos=${item.examples.join(', ')}`);
  }

  const negativeResiduals = analysis.results.filter(result => result.blockedReasons.includes('residual_negativo'));
  console.log('\n--- RESIDUALES NEGATIVOS ---');
  if (!negativeResiduals.length) console.log('Sin casos.');
  for (const result of negativeResiduals.slice(0, 30)) {
    console.log(`${result.code} fila ${result.mainRow}: materiales fuente $${money(result.sourceMaterials)} | vinculados fuente $${money(result.breakdown.linkedSourceCost)} | residual $${money(result.rawResidual)}`);
  }
}

async function loadReferenceData(prisma) {
  const [products, materials, workshops, tariffs] = await Promise.all([
    prisma.producto.findMany({
      where: { codigoInterno: { startsWith: 'MK', mode: 'insensitive' } },
      select: { id: true, codigoInterno: true, nombre: true, activo: true },
    }),
    prisma.bodegaTaller.findMany({
      where: { activo: true },
      select: { id: true, codigoInterno: true, nombre: true, precio: true, unidadMedida: true, detalle: true, activo: true },
    }),
    prisma.taller.findMany({ select: { id: true, nombre: true, activo: true } }),
    prisma.tarifaProceso.findMany({
      where: { activo: true },
      select: { id: true, tallerId: true, proceso: true, valorHora: true, vigenteDesde: true, activo: true },
      orderBy: { vigenteDesde: 'desc' },
    }),
  ]);
  return { products, materials, workshops, tariffs };
}

async function applyEligibleRecipes(prisma, analysis) {
  const eligible = analysis.results.filter(result => result.eligible && result.recipe);
  const selected = Number.isInteger(applyLimit) && applyLimit > 0
    ? eligible.slice(0, applyLimit)
    : eligible;
  let applied = 0;
  const failures = [];

  for (const result of selected) {
    try {
      await upsertReceta(prisma, result.recipe.productoId, result.recipe);
      applied += 1;
    } catch (error) {
      failures.push({ code: result.code, error: error.message });
    }
  }

  return { requested: selected.length, applied, failures };
}

function assertApplyPrerequisites(reference, analysis) {
  if (reference.materials.length < 70) {
    throw new Error(`Aplicacion rechazada: se esperaban al menos 70 materias primas activas y la base tiene ${reference.materials.length}.`);
  }
  if (!analysis.workshopIds.espumas || !analysis.workshopIds.confecciones) {
    throw new Error('Aplicacion rechazada: faltan los talleres espumas o confecciones.');
  }
  const requiredTariffs = [
    [analysis.workshopIds.espumas, 'corte'],
    [analysis.workshopIds.confecciones, 'confeccion'],
    [analysis.workshopIds.confecciones, 'enfundado'],
  ];
  const missingTariffs = requiredTariffs.filter(([tallerId, proceso]) => !reference.tariffs.some(tariff => (
    tariff.tallerId === tallerId && String(tariff.proceso).trim().toLowerCase() === proceso && tariff.activo !== false
  )));
  if (missingTariffs.length) {
    throw new Error(`Aplicacion rechazada: faltan tarifas activas para ${missingTariffs.map(([, proceso]) => proceso).join(', ')}.`);
  }
  if (analysis.summary.linkedLines === 0) {
    throw new Error('Aplicacion rechazada: el dry-run no logro vincular ninguna linea BOM al catalogo.');
  }
}

async function main() {
  printHeader();
  if (!fs.existsSync(targetFile)) {
    throw new Error(`Excel no encontrado: ${targetFile}. Indica la ruta .xls/.xlsx como argumento.`);
  }
  if (!connectionString) throw new Error('DATABASE_URL es obligatorio incluso en dry-run para resolver productos y materias primas.');
  if (isApply && isProductionLike(connectionString) && !allowProduction) {
    throw new Error('Aplicacion rechazada: una base remota requiere --allow-production ademas de --apply y autorizacion explicita del dueno.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const reference = await loadReferenceData(prisma);
    const workbook = XLSX.readFile(targetFile, { cellFormula: true, cellStyles: false, cellDates: false });
    const analysis = analyzeCosteoWorkbook({ workbook, XLSX, ...reference });
    printAnalysis(analysis, reference.materials, reference.tariffs);

    if (!isApply) {
      console.log('\nDRY-RUN COMPLETADO: no se escribio ninguna receta, tarifa ni precio de producto.');
      return;
    }

    assertApplyPrerequisites(reference, analysis);
    const applied = await applyEligibleRecipes(prisma, analysis);
    console.log('\n--- RESULTADO DE APLICACION ---');
    console.log(`Elegibles solicitadas: ${applied.requested}`);
    console.log(`Recetas aplicadas:     ${applied.applied}`);
    console.log(`Errores de escritura:  ${applied.failures.length}`);
    for (const failure of applied.failures.slice(0, 30)) console.log(`${failure.code}: ${failure.error}`);
    if (applied.failures.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
});
