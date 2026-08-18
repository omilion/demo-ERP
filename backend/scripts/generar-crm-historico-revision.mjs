import ExcelJS from 'exceljs';
import { buildApp } from '../src/app.js';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CORTE = new Date('2026-01-01T00:00:00-03:00');
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(currentDir, '../../docs/entregables');
const outputFile = path.join(outputDir, 'CRM_historico_revision_hasta_2025.xlsx');

const dateValue = (value) => (value ? new Date(value) : null);

const sourceColumns = [
  ['crm_id', 'ID CRM', 'id'],
  ['fecha_origen', 'Fecha origen', 'fecha'],
  ['n_cotizacion_origen', 'N° cotización', 'ncotizacion'],
  ['estado_origen', 'Estado actual', 'estado'],
  ['accion_origen', 'Última acción', 'accion'],
  ['fecha_proximo_origen', 'Próxima acción actual', 'fechaProximo'],
  ['rut_origen', 'RUT actual', 'rut'],
  ['nombre_origen', 'Nombre actual', 'nombre'],
  ['razon_social_origen', 'Razón social actual', 'rsocial'],
  ['email_origen', 'Email actual', 'email'],
  ['telefono_origen', 'Teléfono actual', 'telefono'],
  ['ejecutiva_origen', 'Ejecutiva histórica', 'ejecutiva'],
  ['resultado_origen', 'Resultado actual', 'resultado'],
  ['comentarios_origen', 'Comentarios históricos', 'comentarios'],
  ['creado_el', 'Creado el', 'createdAt'],
  ['actualizado_el', 'Actualizado el', 'updatedAt'],
];

const reviewColumns = [
  ['decision_duenos', 'Decisión dueños'],
  ['crm_id_maestro', 'ID CRM maestro (si fusiona)'],
  ['rut_corregido', 'RUT corregido'],
  ['nombre_corregido', 'Nombre / contacto corregido'],
  ['razon_social_corregida', 'Razón social corregida'],
  ['email_corregido', 'Email corregido'],
  ['telefono_corregido', 'Teléfono corregido'],
  ['tipo_venta', 'Tipo de venta'],
  ['linea_producto', 'Línea de producto'],
  ['vendedor_responsable', 'Vendedor responsable'],
  ['proxima_accion', 'Próxima acción'],
  ['fecha_proxima_accion', 'Fecha próxima acción'],
  ['motivo_perdida', 'Motivo de pérdida'],
  ['observaciones_revision', 'Observaciones de revisión'],
  ['revisado_por', 'Revisado por'],
  ['fecha_revision', 'Fecha revisión'],
];

const workbook = new ExcelJS.Workbook();
workbook.creator = 'Plastimar';
workbook.created = new Date();
workbook.properties.title = 'Revisión de CRM histórico Plastimar';

const instructions = workbook.addWorksheet('Instrucciones');
instructions.columns = [{ width: 28 }, { width: 105 }];
instructions.mergeCells('A1:B1');
instructions.getCell('A1').value = 'CRM histórico — revisión externa';
instructions.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
instructions.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004B23' } };
instructions.getCell('A1').alignment = { vertical: 'middle' };
instructions.getRow(1).height = 30;

const guide = [
  ['Propósito', 'Revisar el CRM creado hasta el 31-12-2025 fuera del ERP. No editar ni eliminar las columnas grises: son el respaldo original.'],
  ['Regla principal', 'No borre filas. Complete “Decisión dueños” para cada fila. El ID CRM permite importar las decisiones con trazabilidad.'],
  ['Mantener activo', 'Usar sólo para contactos u oportunidades que siguen vigentes. Complete al menos RUT o razón social, vendedor responsable y próxima acción.'],
  ['Fusionar', 'Para duplicados, indique “Fusionar” y escriba el ID del registro principal en “ID CRM maestro”.'],
  ['Ganado / Perdido', 'Use cuando la oportunidad ya terminó. Para “Perdido”, complete el motivo de pérdida.'],
  ['Archivar / Descartar', 'Use “Archivar” para historial útil sin gestión actual y “Descartar” para datos erróneos, duplicados sin valor o pruebas.'],
  ['Datos corregidos', 'Complete sólo las columnas amarillas de corrección. Si un dato original está correcto, puede dejar su columna corregida vacía.'],
  ['Listas', 'Seleccione valores desde las listas desplegables cuando existan. No cambie nombres de hojas, encabezados ni el ID CRM.'],
  ['Devolución', 'Al terminar, guarde el archivo conservando el nombre y envíelo de vuelta. Se realizará una validación previa antes de cualquier importación.'],
];
guide.forEach((row, index) => {
  const excelRow = instructions.addRow(row);
  excelRow.getCell(1).font = { bold: true, color: { argb: 'FF004B23' } };
  excelRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F4EA' } };
  excelRow.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  excelRow.height = index === 0 ? 42 : 34;
});

const lists = workbook.addWorksheet('Listas');
const listData = {
  A: ['Decisión dueños', 'Mantener activo', 'Fusionar', 'Ganado', 'Perdido', 'Archivar', 'Descartar'],
  B: ['Tipo de venta', 'Venta sala', 'Venta directa', 'Venta web / OC', 'Licitación', 'Convenio marco', 'Otro'],
  C: ['Línea de producto', 'Espumas', 'Confecciones', 'Madera', 'Corte', 'Otra'],
  D: ['Motivo de pérdida', 'Precio', 'Competencia', 'Sin respuesta', 'Sin stock / plazo', 'No califica', 'Otro'],
};
Object.entries(listData).forEach(([column, values]) => values.forEach((value, index) => { lists.getCell(`${column}${index + 1}`).value = value; }));
lists.state = 'hidden';

const sheet = workbook.addWorksheet('CRM histórico');
sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];
sheet.columns = [...sourceColumns, ...reviewColumns].map(([key, header]) => ({ key, header, width: Math.max(16, Math.min(34, header.length + 6)) }));
sheet.getColumn('accion_origen').width = 30;
sheet.getColumn('comentarios_origen').width = 38;
sheet.getColumn('observaciones_revision').width = 38;
sheet.getColumn('proxima_accion').width = 30;

const header = sheet.getRow(1);
header.height = 38;
header.eachCell((cell, columnNumber) => {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: columnNumber <= sourceColumns.length ? 'FF52616B' : 'FF0B6B3A' } };
  cell.border = { bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
});
sheet.autoFilter = `A1:${sheet.getRow(1).getCell(sheet.columnCount).address}`;

const app = await buildApp();
try {
  const records = await app.prisma.crmRegistro.findMany({
    where: {
      OR: [
        { fecha: { lt: CORTE } },
        { fecha: null, createdAt: { lt: CORTE } },
      ],
    },
    orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
  });

  for (const record of records) {
    const rowData = {};
    for (const [key, , field] of sourceColumns) {
      rowData[key] = ['fecha', 'fechaProximo', 'createdAt', 'updatedAt'].includes(field)
        ? dateValue(record[field])
        : record[field] ?? null;
    }
    rowData.crm_id = record.id;
    for (const [key] of reviewColumns) rowData[key] = null;
    const row = sheet.addRow(rowData);
    row.height = 32;
    row.eachCell((cell, columnNumber) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: columnNumber <= sourceColumns.length ? 'FFF1F4F5' : 'FFFFF8D8' } };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } } };
    });
  }

  ['fecha_origen', 'fecha_proximo_origen', 'creado_el', 'actualizado_el', 'fecha_proxima_accion', 'fecha_revision'].forEach((key) => {
    sheet.getColumn(key).numFmt = 'dd-mm-yyyy';
  });

  const lastRow = Math.max(sheet.rowCount, 2);
  const validation = (column, formula) => {
    sheet.dataValidations.add(`${column}2:${column}${lastRow}`, { type: 'list', allowBlank: true, formulae: [formula] });
  };
  validation('Q', "'Listas'!$A$2:$A$7");
  validation('Y', "'Listas'!$B$2:$B$7");
  validation('Z', "'Listas'!$C$2:$C$6");
  validation('AD', "'Listas'!$D$2:$D$7");

  await mkdir(outputDir, { recursive: true });
  await workbook.xlsx.writeFile(outputFile);
  console.log(`Generado: ${outputFile} (${records.length} registros)`);
} finally {
  await app.close();
}
