import { calcularCosteo } from './engine.js';

const COL = {
  codigo: 'C',
  nombre: 'H',
  largo: 'K',
  cubicaje: 'N',
  densidad: 'O',
  precioEspuma: 'R',
  costoMaterial: 'S',
  totalEspumaAux: 'T',
  totalEspuma: 'V',
  cantidadTela: 'X',
  costoTela: 'Y',
  totalTela: 'Z',
  tipoTela: 'AA',
  horasCorte: 'AB',
  horasConfeccion: 'AD',
  horasEnfundado: 'AF',
  accesorios: 'AI',
  costoFabricacion: 'AK',
  costoAjustado: 'AL',
  costoTransferencia: 'AN',
};

const SOURCE_RATES = {
  corte: 3800,
  confeccion: 4200,
  enfundado: 4200,
};

const MATERIAL_ALIASES = new Map(Object.entries({
  'ALGODON KG': 'ALGODON',
  'PICADO KG': 'PICADO',
  'NAPA MT': 'NAPA',
  'PLUMAVIT X KG': 'PLUMAVIT',
  'FREE KID': 'FREE KIDS',
  'FREEKID': 'FREE KIDS',
  'FREEKIDS': 'FREE KIDS',
  'FREE KID BIODEGRADABLE': 'FREE KIDS',
  'FREE KID PRINT SIN ATRIBUTOS': 'FREE KID PRINT',
  'FREEKID PRINT': 'FREE KID PRINT',
  'FREE PRINT': 'FREE KID PRINT',
  'COVERNIL': 'COVERNYL',
  'COVERNIL 1 50': 'COVERNYL',
  'COVERNYL 1 50': 'COVERNYL',
  'TREVIRA': 'TREVIRA ESTAMPADO',
  'TREVIRA 1 50': 'TREVIRA ESTAMPADO',
  'TELA TREVIRA': 'TREVIRA ESTAMPADO',
  'TREVIRA ESTAMP': 'TREVIRA ESTAMPADO',
  'VELOUR': 'VELUR',
  'VELUOR': 'VELUR',
  'VELUT': 'VELUR',
  'VELOUR 1 50': 'VELUR',
  'VELUT 1 50': 'VELUR',
  'TASLAN': 'OXFORD TASLAN',
  'TAZLAN': 'OXFORD TASLAN',
  'OXFORD TASLAN': 'OXFORD TASLAN',
  'PONGE': 'PONGE TAFETAN',
  'PONGEE': 'PONGE TAFETAN',
  'POLAR': 'POLAR X MTS',
  'HULE': 'HULE CLINICO',
  'PVC CRIS': 'PVC CRISTAL',
  'PVC CRIS 1 51': 'PVC CRISTAL',
  'ECOCUERO': 'ECO CUERO',
  'GASA CHIFON': 'GASA',
  'CUADRILLE': 'CUADRILLE',
  'CREA SABANA': 'CREA SABANA LISA 1 44 HBS',
  'CREA SABANA LISA': 'CREA SABANA LISA 1 44 HBS',
  'PIQUE DEPORTIVO': 'PIQUE DEPORTIVO',
  'RAIN SOFT': 'RAINSOFT',
}));

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cellAddress(XLSX, row, column) {
  return XLSX.utils.encode_cell({ r: row - 1, c: XLSX.utils.decode_col(column) });
}

export function getExcelCell(sheet, XLSX, row, column) {
  return sheet[cellAddress(XLSX, row, column)] ?? null;
}

function cellValue(sheet, XLSX, row, column) {
  return getExcelCell(sheet, XLSX, row, column)?.v ?? null;
}

function cellFormula(sheet, XLSX, row, column) {
  return getExcelCell(sheet, XLSX, row, column)?.f ?? null;
}

export function parseTransferMarginFormula(formula) {
  const raw = String(formula ?? '').trim().replace(/^=/, '');
  if (!raw) return { status: 'missing', margin: null, formula: raw };

  if (/^\+?\$?AL\$?\d+$/i.test(raw)) {
    return { status: 'zero', margin: 0, formula: raw };
  }

  const percentMatches = [...raw.matchAll(/\*\s*(-?\d+(?:[.,]\d+)?)\s*%/gi)];
  if (percentMatches.length) {
    const margin = Number(percentMatches.at(-1)[1].replace(',', '.'));
    if (Number.isFinite(margin) && margin >= 0) {
      return { status: 'parsed', margin, formula: raw };
    }
  }

  const additiveFactor = raw.match(/\*\s*(0[.,]\d+)\s*\+\s*\$?AL\$?\d+/i);
  if (additiveFactor) {
    const margin = Number(additiveFactor[1].replace(',', '.')) * 100;
    if (Number.isFinite(margin) && margin >= 0) {
      return { status: 'parsed', margin, formula: raw };
    }
  }

  const totalFactor = raw.match(/^\+?\$?AL\$?\d+\s*\*\s*(\d+(?:[.,]\d+)?)$/i);
  if (totalFactor) {
    const factor = Number(totalFactor[1].replace(',', '.'));
    const margin = Number(((factor - 1) * 100).toFixed(10));
    if (Number.isFinite(margin) && margin >= 0) {
      return { status: 'parsed', margin, formula: raw };
    }
  }

  return { status: 'unsupported', margin: null, formula: raw };
}

export function extractFormulaRows(formula, column) {
  const raw = String(formula ?? '').toUpperCase();
  const target = String(column).toUpperCase();
  const rows = new Set();
  const rangeRegex = new RegExp(`\\$?${target}\\$?(\\d+)\\s*:\\s*\\$?${target}\\$?(\\d+)`, 'g');
  for (const match of raw.matchAll(rangeRegex)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
    for (let row = Math.min(start, end); row <= Math.max(start, end); row += 1) rows.add(row);
  }

  const singleRegex = new RegExp(`\\$?${target}\\$?(\\d+)`, 'g');
  for (const match of raw.matchAll(singleRegex)) rows.add(Number(match[1]));
  return [...rows].sort((a, b) => a - b);
}

export function extractCatalogReferences(formula) {
  const raw = String(formula ?? '').toUpperCase();
  const refs = new Set();
  for (const match of raw.matchAll(/\$?([A-Z]{1,3})\$?5\b/g)) refs.add(`${match[1]}5`);
  return [...refs];
}

function isMainRow(sheet, XLSX, row) {
  const ak = numberOrZero(cellValue(sheet, XLSX, row, COL.costoFabricacion));
  const al = numberOrZero(cellValue(sheet, XLSX, row, COL.costoAjustado));
  const anCell = getExcelCell(sheet, XLSX, row, COL.costoTransferencia);
  return ak > 0 && (al > 0 || anCell?.f || numberOrZero(anCell?.v) > 0);
}

export function buildProductBlocks(sheet, XLSX, { startRow = 11 } = {}) {
  const decoded = XLSX.utils.decode_range(sheet['!ref']);
  const blocks = [];
  let current = null;

  for (let row = startRow; row <= decoded.e.r + 1; row += 1) {
    const code = String(cellValue(sheet, XLSX, row, COL.codigo) ?? '').trim();
    if (!/^MK-/i.test(code)) continue;

    if (!current || current.code !== code) {
      current = { code, rows: [], mainRows: [] };
      blocks.push(current);
    }
    current.rows.push(row);
    if (isMainRow(sheet, XLSX, row)) current.mainRows.push(row);
  }

  return blocks;
}

function nameScore(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);

  const aTokens = new Set(a.split(' ').filter(token => token.length > 1));
  const bTokens = new Set(b.split(' ').filter(token => token.length > 1));
  const intersection = [...aTokens].filter(token => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  const containment = intersection / Math.max(1, Math.min(aTokens.size, bTokens.size));
  const jaccard = intersection / union;
  return jaccard * 0.65 + containment * 0.35;
}

export function selectBlockForProduct(sheet, XLSX, codeBlocks, productName) {
  const candidates = codeBlocks.flatMap((block, blockIndex) => block.mainRows.map(row => ({
    block,
    blockIndex,
    row,
    name: String(cellValue(sheet, XLSX, row, COL.nombre) ?? '').trim(),
    score: nameScore(productName, cellValue(sheet, XLSX, row, COL.nombre)),
    cost: numberOrZero(cellValue(sheet, XLSX, row, COL.costoFabricacion)),
  })));

  if (!candidates.length) {
    return { selected: null, reason: 'sin_fila_principal', candidates };
  }
  if (candidates.length === 1) return { selected: candidates[0], reason: null, candidates };

  candidates.sort((a, b) => b.score - a.score || b.cost - a.cost || a.row - b.row);
  const best = candidates[0];
  const next = candidates[1];
  const clearByName = best.score >= 0.5 && best.score - next.score >= 0.08;
  if (!clearByName) {
    return { selected: null, reason: 'variante_ambigua', candidates };
  }
  return { selected: best, reason: null, candidates };
}

export function buildExcelCatalog(sheet, XLSX) {
  const decoded = XLSX.utils.decode_range(sheet['!ref']);
  const result = new Map();
  for (let colIndex = decoded.s.c; colIndex <= decoded.e.c; colIndex += 1) {
    const column = XLSX.utils.encode_col(colIndex);
    const row4 = cellValue(sheet, XLSX, 4, column);
    const row3 = cellValue(sheet, XLSX, 3, column);
    const label = typeof row4 === 'string' && row4.trim()
      ? row4.trim()
      : (typeof row3 === 'string' && row3.trim() ? row3.trim() : null);
    const price = numberOrZero(cellValue(sheet, XLSX, 5, column));
    if (label || price) result.set(`${column}5`, { cell: `${column}5`, label, price });
  }
  return result;
}

function canonicalMaterialName(label) {
  const normalized = normalizeText(label);
  return MATERIAL_ALIASES.get(normalized) ?? normalized;
}

export function createMaterialResolver(materials = [], excelCatalog = new Map()) {
  const byName = new Map();
  const byCode = new Map();

  for (const material of materials) {
    const normalizedName = normalizeText(material.nombre);
    if (normalizedName) {
      const list = byName.get(normalizedName) ?? [];
      list.push(material);
      byName.set(normalizedName, list);
    }
    const normalizedCode = normalizeText(material.codigoInterno);
    if (normalizedCode) byCode.set(normalizedCode, material);
  }

  function resolveLabel(label, confidence) {
    const normalized = normalizeText(label);
    if (!normalized) return null;
    const byExactCode = byCode.get(normalized);
    if (byExactCode) return { material: byExactCode, confidence, matchedLabel: label };

    const canonical = canonicalMaterialName(label);
    const candidates = byName.get(canonical) ?? [];
    if (candidates.length === 1) {
      const aliasApplied = canonical !== normalized;
      return {
        material: candidates[0],
        confidence: confidence === 'formula_ref' ? 'formula_ref' : (aliasApplied ? 'alias' : confidence),
        matchedLabel: label,
        aliasApplied,
      };
    }
    return null;
  }

  return ({ formula, labels = [] }) => {
    const referenceMatches = [];
    for (const ref of extractCatalogReferences(formula)) {
      const entry = excelCatalog.get(ref);
      if (!entry?.label) continue;
      const match = resolveLabel(entry.label, 'formula_ref');
      if (match) referenceMatches.push({ ...match, sourceRef: ref, sourcePrice: entry.price });
    }
    const materialIds = new Set(referenceMatches.map(match => match.material.id ?? match.material.codigoInterno));
    if (materialIds.size === 1 && referenceMatches.length) return referenceMatches[0];
    if (materialIds.size > 1) return { material: null, confidence: 'ambiguous_formula_ref' };

    for (const label of labels) {
      const match = resolveLabel(label, 'normalized_name');
      if (match) return { ...match, sourceRef: null, sourcePrice: null };
    }
    return { material: null, confidence: 'unresolved', sourceRef: null, sourcePrice: null };
  };
}

function selectedMaterialRows(sheet, XLSX, mainRow) {
  const foamRows = new Set(extractFormulaRows(cellFormula(sheet, XLSX, mainRow, COL.totalEspumaAux), COL.costoMaterial));
  const fabricRows = new Set(extractFormulaRows(cellFormula(sheet, XLSX, mainRow, COL.totalTela), COL.costoTela));
  if (numberOrZero(cellValue(sheet, XLSX, mainRow, COL.costoMaterial)) > 0) foamRows.add(mainRow);
  if (numberOrZero(cellValue(sheet, XLSX, mainRow, COL.costoTela)) > 0) fabricRows.add(mainRow);
  return { foamRows: [...foamRows].sort((a, b) => a - b), fabricRows: [...fabricRows].sort((a, b) => a - b) };
}

function sourceLineNote({ row, formula, confidence, matchedLabel, aliasApplied, sourceRef, sourceSubtotal, sourceUnitPrice }) {
  return [
    `Excel MK fila ${row}`,
    `confianza=${confidence}`,
    matchedLabel ? `material_origen=${matchedLabel}` : null,
    aliasApplied ? 'alias_aplicado=si' : null,
    sourceRef ? `referencia=${sourceRef}` : null,
    formula ? `formula=${formula}` : null,
    `costo_fuente=${sourceSubtotal}`,
    sourceUnitPrice ? `precio_fuente=${sourceUnitPrice}` : null,
  ].filter(Boolean).join('; ');
}

function buildMaterialBreakdown(sheet, XLSX, mainRow, resolveMaterial) {
  const { foamRows, fabricRows } = selectedMaterialRows(sheet, XLSX, mainRow);
  const lines = [];
  const unresolved = [];
  let linkedSourceCost = 0;
  let linkedCurrentCost = 0;
  let foamResidual = 0;
  let foamResidualLines = 0;

  for (const row of fabricRows) {
    const sourceSubtotal = numberOrZero(cellValue(sheet, XLSX, row, COL.costoTela));
    const quantity = numberOrZero(cellValue(sheet, XLSX, row, COL.cantidadTela));
    if (sourceSubtotal <= 0 || quantity <= 0) continue;
    const formula = cellFormula(sheet, XLSX, row, COL.costoTela);
    const resolved = resolveMaterial({
      formula,
      labels: [cellValue(sheet, XLSX, row, COL.tipoTela), cellValue(sheet, XLSX, row, COL.nombre)],
    });
    if (!resolved.material?.id) {
      unresolved.push({ row, type: 'tela', label: cellValue(sheet, XLSX, row, COL.tipoTela) || cellValue(sheet, XLSX, row, COL.nombre), sourceSubtotal, confidence: resolved.confidence });
      continue;
    }

    const sourceUnitPrice = sourceSubtotal / quantity;
    linkedSourceCost += sourceSubtotal;
    linkedCurrentCost += quantity * numberOrZero(resolved.material.precio);
    lines.push({
      bodegaTallerId: resolved.material.id,
      cantidad: quantity,
      unidad: resolved.material.unidadMedida || 'mt',
      notas: sourceLineNote({ row, formula, ...resolved, sourceSubtotal, sourceUnitPrice }),
      source: { row, type: 'tela', sourceSubtotal, sourceUnitPrice, materialCode: resolved.material.codigoInterno, confidence: resolved.confidence },
    });
  }

  for (const row of foamRows) {
    const sourceSubtotal = numberOrZero(cellValue(sheet, XLSX, row, COL.costoMaterial));
    if (sourceSubtotal <= 0) continue;
    const cubicaje = numberOrZero(cellValue(sheet, XLSX, row, COL.cubicaje));
    const densidad = numberOrZero(cellValue(sheet, XLSX, row, COL.densidad));
    const foamPrice = numberOrZero(cellValue(sheet, XLSX, row, COL.precioEspuma));
    if (cubicaje > 0 && densidad > 0 && foamPrice > 0) {
      foamResidual += sourceSubtotal;
      foamResidualLines += 1;
      continue;
    }

    const formula = cellFormula(sheet, XLSX, row, COL.costoMaterial);
    const resolved = resolveMaterial({
      formula,
      labels: [cellValue(sheet, XLSX, row, COL.tipoTela), cellValue(sheet, XLSX, row, COL.nombre)],
    });
    const sourceUnitPrice = numberOrZero(resolved.sourcePrice);
    const quantity = sourceUnitPrice > 0
      ? sourceSubtotal / sourceUnitPrice
      : numberOrZero(cellValue(sheet, XLSX, row, COL.largo));
    if (!resolved.material?.id || quantity <= 0) {
      unresolved.push({ row, type: 'material', label: cellValue(sheet, XLSX, row, COL.tipoTela) || cellValue(sheet, XLSX, row, COL.nombre), sourceSubtotal, confidence: resolved.confidence });
      continue;
    }

    linkedSourceCost += sourceSubtotal;
    linkedCurrentCost += quantity * numberOrZero(resolved.material.precio);
    lines.push({
      bodegaTallerId: resolved.material.id,
      cantidad: quantity,
      unidad: resolved.material.unidadMedida || null,
      notas: sourceLineNote({ row, formula, ...resolved, sourceSubtotal, sourceUnitPrice }),
      source: { row, type: 'material', sourceSubtotal, sourceUnitPrice, materialCode: resolved.material.codigoInterno, confidence: resolved.confidence },
    });
  }

  return { lines, unresolved, linkedSourceCost, linkedCurrentCost, foamResidual, foamResidualLines, foamRows, fabricRows };
}

function latestTariffMap(tariffs = []) {
  const sorted = [...tariffs].sort((a, b) => new Date(b.vigenteDesde ?? 0) - new Date(a.vigenteDesde ?? 0));
  const result = new Map();
  for (const tariff of sorted) {
    const key = `${tariff.tallerId}_${normalizeText(tariff.proceso)}`;
    if (!result.has(key) && tariff.activo !== false) result.set(key, numberOrZero(tariff.valorHora));
  }
  return result;
}

function buildProcesses(sheet, XLSX, mainRow, workshopIds) {
  const definitions = [
    { key: 'corte', column: COL.horasCorte, tallerId: workshopIds.espumas },
    { key: 'confeccion', column: COL.horasConfeccion, tallerId: workshopIds.confecciones },
    { key: 'enfundado', column: COL.horasEnfundado, tallerId: workshopIds.confecciones },
  ];
  return definitions
    .map(definition => ({ ...definition, horas: numberOrZero(cellValue(sheet, XLSX, mainRow, definition.column)) }))
    .filter(definition => definition.horas > 0)
    .map(({ key, tallerId, horas }) => ({ proceso: key, tallerId, horas }));
}

function primaryWorkshopForProcesses(processes, workshopIds) {
  if (processes.some(process => process.proceso === 'corte')) return workshopIds.espumas;
  if (processes.some(process => ['confeccion', 'enfundado'].includes(process.proceso))) {
    return workshopIds.confecciones;
  }
  return null;
}

export function analyzeCosteoWorkbook({ workbook, XLSX, products = [], materials = [], workshops = [], tariffs = [] }) {
  const sheet = workbook.Sheets.MK ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("No se encontro la hoja 'MK' en el Excel");

  const blocks = buildProductBlocks(sheet, XLSX);
  const blocksByCode = new Map();
  for (const block of blocks) {
    const list = blocksByCode.get(block.code) ?? [];
    list.push(block);
    blocksByCode.set(block.code, list);
  }

  const productByCode = new Map(products.map(product => [normalizeText(product.codigoInterno), product]));
  const workshopByName = new Map(workshops.map(workshop => [normalizeText(workshop.nombre), workshop.id]));
  const workshopIds = {
    confecciones: workshopByName.get('CONFECCIONES') ?? null,
    espumas: workshopByName.get('ESPUMAS') ?? null,
  };
  const tariffMap = latestTariffMap(tariffs);
  const excelCatalog = buildExcelCatalog(sheet, XLSX);
  const resolveMaterial = createMaterialResolver(materials, excelCatalog);
  const results = [];
  const validationResults = [];

  for (const [code, codeBlocks] of blocksByCode) {
    const allRows = codeBlocks.flatMap(block => block.rows);
    const validationRow = [...allRows].sort((left, right) => (
      numberOrZero(cellValue(sheet, XLSX, right, COL.costoFabricacion))
      - numberOrZero(cellValue(sheet, XLSX, left, COL.costoFabricacion))
    ))[0];
    const validationMaterials = numberOrZero(cellValue(sheet, XLSX, validationRow, COL.totalEspuma))
      + numberOrZero(cellValue(sheet, XLSX, validationRow, COL.totalTela));
    const validationAK = numberOrZero(cellValue(sheet, XLSX, validationRow, COL.costoFabricacion));
    const validationCalculation = calcularCosteo({
      materiales: [{ cantidad: 1, precioUnitario: validationMaterials }],
      procesos: [
        { proceso: 'corte', horas: numberOrZero(cellValue(sheet, XLSX, validationRow, COL.horasCorte)), valorHora: SOURCE_RATES.corte },
        { proceso: 'confeccion', horas: numberOrZero(cellValue(sheet, XLSX, validationRow, COL.horasConfeccion)), valorHora: SOURCE_RATES.confeccion },
        { proceso: 'enfundado', horas: numberOrZero(cellValue(sheet, XLSX, validationRow, COL.horasEnfundado)), valorHora: SOURCE_RATES.enfundado },
      ],
      accesoriosMonto: numberOrZero(cellValue(sheet, XLSX, validationRow, COL.accesorios)),
    });
    const validationRecord = {
      code,
      row: validationRow,
      sourceAK: validationAK,
      calculatedAK: validationCalculation.costoFabricacion,
      difference: validationCalculation.costoFabricacion - validationAK,
    };
    validationResults.push(validationRecord);

    const product = productByCode.get(normalizeText(code)) ?? null;
    const blockedReasons = [];
    if (!product) blockedReasons.push('producto_no_encontrado');

    const selection = selectBlockForProduct(sheet, XLSX, codeBlocks, product?.nombre ?? '');
    if (!selection.selected) blockedReasons.push(selection.reason);

    // El fallback de mayor AK se usa solamente para completar el diagnostico.
    // La receta sigue bloqueada: nunca se aplica esta eleccion a ciegas.
    const mainRow = selection.selected?.row ?? validationRow;
    const margin = parseTransferMarginFormula(cellFormula(sheet, XLSX, mainRow, COL.costoTransferencia));
    const validationMargin = parseTransferMarginFormula(cellFormula(sheet, XLSX, validationRow, COL.costoTransferencia));
    const marginIssue = margin.margin === null
      ? { row: mainRow, ...margin }
      : (validationRow !== mainRow && validationMargin.margin === null
        ? { row: validationRow, ...validationMargin }
        : null);
    if (marginIssue) blockedReasons.push('margen_sin_formula');

    const sourceMaterials = numberOrZero(cellValue(sheet, XLSX, mainRow, COL.totalEspuma))
      + numberOrZero(cellValue(sheet, XLSX, mainRow, COL.totalTela));
    const breakdown = buildMaterialBreakdown(sheet, XLSX, mainRow, resolveMaterial);
    const rawResidual = sourceMaterials - breakdown.linkedSourceCost;
    if (rawResidual < -2) blockedReasons.push('residual_negativo');
    const residual = rawResidual < 0 && rawResidual >= -2 ? 0 : rawResidual;

    const processes = buildProcesses(sheet, XLSX, mainRow, workshopIds);
    if (processes.some(process => !process.tallerId)) blockedReasons.push('taller_no_encontrado');
    const accessories = numberOrZero(cellValue(sheet, XLSX, mainRow, COL.accesorios));
    const sourceAK = numberOrZero(cellValue(sheet, XLSX, mainRow, COL.costoFabricacion));
    const sourceCalculation = calcularCosteo({
      materiales: [{ cantidad: 1, precioUnitario: sourceMaterials }],
      procesos: processes.map(process => ({ ...process, valorHora: SOURCE_RATES[process.proceso] })),
      accesoriosMonto: accessories,
      ajusteGlobalPct: 3,
      margenTransferencia: margin.margin ?? 0,
    });
    const akDifference = sourceCalculation.costoFabricacion - sourceAK;
    if (Math.abs(validationRecord.difference) > 2) blockedReasons.push('costo_no_cuadra_ak');

    const liveMaterialsCost = Math.max(0, residual) + breakdown.linkedCurrentCost;
    const liveCalculation = calcularCosteo({
      materiales: [{ cantidad: 1, precioUnitario: liveMaterialsCost }],
      procesos: processes.map(process => ({
        ...process,
        valorHora: tariffMap.get(`${process.tallerId}_${normalizeText(process.proceso)}`) ?? 0,
      })),
      accesoriosMonto: accessories,
      ajusteGlobalPct: 3,
      margenTransferencia: margin.margin ?? 0,
    });

    const recipe = product && margin.margin !== null ? {
      productoId: product.id,
      tallerId: primaryWorkshopForProcesses(processes, workshopIds),
      margenTransferencia: margin.margin,
      ajusteGlobalPct: 3,
      accesoriosMonto: accessories,
      materialesMonto: Math.max(0, residual),
      materiales: breakdown.lines.map(({ source, ...line }) => line),
      procesos: processes,
      notas: `Importado desde Excel MK; fila principal ${mainRow}; costo fuente AK=${sourceAK}; materiales residuales=${Math.max(0, residual)}.`,
    } : null;

    results.push({
      code,
      product,
      codeBlocks,
      selection,
      mainRow,
      margin,
      marginIssue,
      sourceAK,
      sourceMaterials,
      sourceCalculation,
      akDifference,
      residual,
      rawResidual,
      breakdown,
      liveCalculation,
      recipe,
      highMargin: margin.margin !== null && margin.margin > 100,
      blockedReasons: [...new Set(blockedReasons)],
      eligible: blockedReasons.length === 0,
    });
  }

  const blockedByReason = {};
  for (const result of results) {
    for (const reason of result.blockedReasons) blockedByReason[reason] = (blockedByReason[reason] ?? 0) + 1;
  }
  const matchedProducts = results.filter(result => result.product).length;
  const sourceMatches = validationResults.filter(result => Math.abs(result.difference) <= 2).length;
  const linkedLines = results.reduce((sum, result) => sum + (result.breakdown?.lines.length ?? 0), 0);
  const unresolvedLines = results.reduce((sum, result) => sum + (result.breakdown?.unresolved.length ?? 0), 0);
  const foamResidualLines = results.reduce((sum, result) => sum + (result.breakdown?.foamResidualLines ?? 0), 0);
  const foamResidualCost = results.reduce((sum, result) => sum + (result.breakdown?.foamResidual ?? 0), 0);

  return {
    sheetName: sheet === workbook.Sheets.MK ? 'MK' : workbook.SheetNames[0],
    workshopIds,
    blocks,
    results,
    validationResults,
    summary: {
      physicalRows: blocks.reduce((sum, block) => sum + block.rows.length, 0),
      uniqueCodes: blocksByCode.size,
      duplicateBlockCodes: [...blocksByCode.values()].filter(list => list.length > 1).length,
      productsFound: matchedProducts,
      sourceMatches,
      sourceMatchPct: validationResults.length ? Number(((sourceMatches / validationResults.length) * 100).toFixed(2)) : 0,
      eligible: results.filter(result => result.eligible).length,
      blocked: results.filter(result => !result.eligible).length,
      blockedByReason,
      linkedLines,
      unresolvedLines,
      foamResidualLines,
      foamResidualCost,
      highMargins: results.filter(result => result.highMargin).length,
    },
  };
}

export function summarizeUnresolvedMaterials(results) {
  const grouped = new Map();
  for (const result of results) {
    for (const unresolved of result.breakdown?.unresolved ?? []) {
      const key = `${normalizeText(unresolved.label) || '(SIN NOMBRE)'}|${unresolved.type}`;
      const current = grouped.get(key) ?? { label: unresolved.label || '(sin nombre)', type: unresolved.type, count: 0, sourceCost: 0, examples: [] };
      current.count += 1;
      current.sourceCost += unresolved.sourceSubtotal;
      if (current.examples.length < 5) current.examples.push(`${result.code}:fila ${unresolved.row}`);
      grouped.set(key, current);
    }
  }
  return [...grouped.values()].sort((a, b) => b.sourceCost - a.sourceCost || b.count - a.count);
}
