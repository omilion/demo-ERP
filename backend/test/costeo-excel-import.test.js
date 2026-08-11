import { describe, expect, it } from 'vitest';
import XLSX from 'xlsx';
import {
  analyzeCosteoWorkbook,
  buildProductBlocks,
  parseTransferMarginFormula,
  selectBlockForProduct,
} from '../src/routes/costeo/excel-import.js';

const workshops = [
  { id: 1, nombre: 'confecciones', activo: true },
  { id: 2, nombre: 'espumas', activo: true },
];

const tariffs = [
  { id: 1, tallerId: 2, proceso: 'corte', valorHora: 3800, vigenteDesde: new Date('2026-07-01'), activo: true },
  { id: 2, tallerId: 1, proceso: 'confeccion', valorHora: 4200, vigenteDesde: new Date('2026-07-01'), activo: true },
  { id: 3, tallerId: 1, proceso: 'enfundado', valorHora: 4200, vigenteDesde: new Date('2026-07-01'), activo: true },
];

const materials = [
  { id: 101, codigoInterno: 'MP-TREVIRA-ESTAMPADO', nombre: 'Trevira Estampado', precio: 1700, unidadMedida: 'mt', activo: true },
  { id: 102, codigoInterno: 'MP-NAPA', nombre: 'NAPA', precio: 2193, unidadMedida: 'mt', activo: true },
  { id: 103, codigoInterno: 'MP-VELUR', nombre: 'Velur', precio: 3100, unidadMedida: 'mt', activo: true },
  { id: 104, codigoInterno: 'MP-FREE-KIDS', nombre: 'Free Kids', precio: 3573, unidadMedida: 'mt', activo: true },
];

function workbookFixture() {
  const sheet = XLSX.utils.aoa_to_sheet([]);
  sheet['!ref'] = 'A1:AN40';
  const set = (row, column, value, formula = null) => {
    const address = XLSX.utils.encode_cell({ r: row - 1, c: XLSX.utils.decode_col(column) });
    sheet[address] = { t: typeof value === 'number' ? 'n' : 's', v: value };
    if (formula) sheet[address].f = formula;
  };

  set(4, 'L', 'NAPA');
  set(5, 'L', 2193);
  set(4, 'X', 'trevira estamp');
  set(5, 'X', 2290);
  set(4, 'Y', 'FREE KID');
  set(5, 'Y', 4217);
  set(4, 'Z', 'velour');
  set(5, 'Z', 4500);
  return { workbook: { SheetNames: ['MK'], Sheets: { MK: sheet } }, sheet, set };
}

function setMain(set, row, { code, name, foam = 0, fabric = 0, cut = 0, sewing = 0, cover = 0, accessories = 0, ak, marginFormula }) {
  set(row, 'C', code);
  set(row, 'H', name);
  set(row, 'V', foam);
  set(row, 'Z', fabric, `SUM(Y${row}:Y${row})`);
  set(row, 'AB', cut);
  set(row, 'AD', sewing);
  set(row, 'AF', cover);
  set(row, 'AI', accessories);
  set(row, 'AK', ak, `V${row}+Z${row}+AE${row}+AH${row}+AI${row}+AC${row}`);
  set(row, 'AL', ak * 1.03, `AK${row}+AK${row}*$AL$1`);
  set(row, 'AN', marginFormula ? ak * 1.2 : 0, marginFormula);
}

describe('importador de recetas MK', () => {
  it('extrae margen literal, margen cero y bloquea formulas ausentes', () => {
    expect(parseTransferMarginFormula('+AL11*285%+AL11')).toMatchObject({ status: 'parsed', margin: 285 });
    expect(parseTransferMarginFormula('+AL11')).toMatchObject({ status: 'zero', margin: 0 });
    expect(parseTransferMarginFormula('AL11*1.35')).toMatchObject({ status: 'parsed', margin: 35 });
    expect(parseTransferMarginFormula(null)).toMatchObject({ status: 'missing', margin: null });
    expect(parseTransferMarginFormula('SUM(AL11:AL12)')).toMatchObject({ status: 'unsupported', margin: null });
  });

  it('construye MK-263 desde todas sus filas y crea Trevira, NAPA y Velur', () => {
    const { workbook, set } = workbookFixture();
    setMain(set, 11, { code: 'MK-263', name: 'Alfombra de estimulacion con texturas', foam: 2193, fabric: 3873, sewing: 3, cover: 0.83, ak: 22152, marginFormula: '+AL11*60%+AL11' });
    set(11, 'T', 2193, 'SUM(S11:S13)');
    set(11, 'X', 1.2);
    set(11, 'Y', 2748, 'X11*$X$5');
    set(11, 'AA', 'VELUR'); // La formula debe ganar sobre esta pista secundaria incorrecta.

    set(12, 'C', 'MK-263', '+C11');
    set(12, 'H', 'NAPA');
    set(12, 'K', 1);
    set(12, 'S', 2193, 'K12*$L$5');

    set(13, 'C', 'MK-263', '+C12');
    set(13, 'H', 'VELOUR');
    set(13, 'X', 0.25);
    set(13, 'Y', 1125, 'X13*$Z$5');
    set(11, 'Z', 3873, 'SUM(Y11:Y13)');

    const analysis = analyzeCosteoWorkbook({
      workbook,
      XLSX,
      products: [{ id: 1, codigoInterno: 'MK-263', nombre: 'Alfombra de estimulacion con texturas' }],
      materials,
      workshops,
      tariffs,
    });
    const result = analysis.results.find(item => item.code === 'MK-263');

    expect(result.eligible).toBe(true);
    expect(result.margin.margin).toBe(60);
    expect(result.sourceCalculation.costoFabricacion).toBe(22152);
    expect(result.recipe.materialesMonto).toBeCloseTo(0, 6);
    expect(result.breakdown.lines.map(line => line.source.materialCode)).toEqual([
      'MP-TREVIRA-ESTAMPADO',
      'MP-VELUR',
      'MP-NAPA',
    ]);
    expect(result.breakdown.lines.map(line => line.cantidad)).toEqual([1.2, 0.25, 1]);
    expect(result.breakdown.lines[0].source.confidence).toBe('formula_ref');
  });

  it('elige por nombre entre bloques separados y bloquea si la coincidencia es ambigua', () => {
    const { workbook, sheet, set } = workbookFixture();
    setMain(set, 11, { code: 'MK-DUP', name: 'Producto normal', fabric: 1000, ak: 1000, marginFormula: '+AL11*20%+AL11' });
    setMain(set, 12, { code: 'MK-OTRO', name: 'Separador', fabric: 1000, ak: 1000, marginFormula: '+AL12*20%+AL12' });
    setMain(set, 13, { code: 'MK-DUP', name: 'Producto licitacion especial', fabric: 1000, ak: 1000, marginFormula: '+AL13*20%+AL13' });

    const blocks = buildProductBlocks(sheet, XLSX);
    const dupBlocks = blocks.filter(block => block.code === 'MK-DUP');
    expect(dupBlocks).toHaveLength(2);
    expect(selectBlockForProduct(sheet, XLSX, dupBlocks, 'Producto licitacion especial').selected.row).toBe(13);
    expect(selectBlockForProduct(sheet, XLSX, dupBlocks, 'Nombre sin relacion')).toMatchObject({ selected: null, reason: 'variante_ambigua' });
  });

  it('bloquea residual negativo y no lo convierte silenciosamente en cero', () => {
    const { workbook, set } = workbookFixture();
    setMain(set, 11, { code: 'MK-NEG', name: 'Producto residual', fabric: 100, ak: 100, marginFormula: '+AL11*20%+AL11' });
    set(11, 'Z', 100, 'SUM(Y12:Y12)');
    set(12, 'C', 'MK-NEG', '+C11');
    set(12, 'H', 'Tela');
    set(12, 'X', 120 / 4217);
    set(12, 'Y', 120, 'X12*$Y$5');

    const analysis = analyzeCosteoWorkbook({
      workbook,
      XLSX,
      products: [{ id: 1, codigoInterno: 'MK-NEG', nombre: 'Producto residual' }],
      materials,
      workshops,
      tariffs,
    });
    const result = analysis.results.find(item => item.code === 'MK-NEG');
    expect(result.rawResidual).toBeCloseTo(-20, 6);
    expect(result.blockedReasons).toContain('residual_negativo');
    expect(result.eligible).toBe(false);
  });

  it('mantiene la espuma por densidad como residual sin inventar una materia prima', () => {
    const { workbook, set } = workbookFixture();
    setMain(set, 11, { code: 'MK-FOAM', name: 'Producto espuma', foam: 100, ak: 100, marginFormula: '+AL11*20%+AL11' });
    set(11, 'T', 100, 'S12');
    set(12, 'C', 'MK-FOAM', '+C11');
    set(12, 'H', 'Modulo D25');
    set(12, 'N', 1);
    set(12, 'O', 25);
    set(12, 'R', 100);
    set(12, 'S', 100, 'N12*R12');

    const analysis = analyzeCosteoWorkbook({
      workbook,
      XLSX,
      products: [{ id: 1, codigoInterno: 'MK-FOAM', nombre: 'Producto espuma' }],
      materials,
      workshops,
      tariffs,
    });
    const result = analysis.results.find(item => item.code === 'MK-FOAM');
    expect(result.eligible).toBe(true);
    expect(result.breakdown.lines).toHaveLength(0);
    expect(result.breakdown.foamResidualLines).toBe(1);
    expect(result.recipe.materialesMonto).toBe(100);
  });

  it('bloquea costos que no cuadran con AK y margen sin formula', () => {
    const { workbook, set } = workbookFixture();
    setMain(set, 11, { code: 'MK-BAD', name: 'Set compuesto', fabric: 1000, ak: 9000, marginFormula: null });

    const analysis = analyzeCosteoWorkbook({
      workbook,
      XLSX,
      products: [{ id: 1, codigoInterno: 'MK-BAD', nombre: 'Set compuesto' }],
      materials,
      workshops,
      tariffs,
    });
    const result = analysis.results.find(item => item.code === 'MK-BAD');
    expect(result.blockedReasons).toEqual(expect.arrayContaining(['costo_no_cuadra_ak', 'margen_sin_formula']));
    expect(result.eligible).toBe(false);
  });
});
