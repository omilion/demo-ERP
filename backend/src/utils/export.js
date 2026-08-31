// Exportación en CSV y XLSX con el mismo contrato de columnas.
//
// Los 68 exportadores del ERP ya definían sus columnas como
// `{ key, label, format }` para `rowsToCsv`. Este módulo reutiliza esa misma
// definición para generar Excel, de modo que agregar el formato a una vista sea
// una línea y no una reimplementación.
//
// Por qué XLSX y no sólo CSV: en el CSV todo viaja como texto, así que Excel
// interpreta a su manera —un código con ceros a la izquierda pierde los ceros,
// una fecha cambia de formato según la configuración regional, y un monto no se
// puede sumar sin convertirlo—. En XLSX cada celda lleva su tipo.
import ExcelJS from 'exceljs'
import { rowsToCsv, sendCsv } from './csv.js'

export const FORMATOS = ['csv', 'xlsx']

// Acepta 'xlsx', 'excel' o 'xls' porque es lo que la gente escribe; cualquier
// otra cosa cae a CSV, que es el comportamiento que tenían todas las rutas.
export function normalizarFormato(valor) {
  const texto = String(valor || '').trim().toLowerCase()
  if (texto === 'xlsx' || texto === 'excel' || texto === 'xls') return 'xlsx'
  return 'csv'
}

// El valor que va a la celda. Si la columna trae `format`, se respeta: esa
// función existe para dar la representación que el negocio espera.
function valorDeCelda(row, columna) {
  const crudo = typeof columna.format === 'function' ? columna.format(row[columna.key], row) : row[columna.key]
  if (crudo == null || crudo === '') return null
  if (crudo instanceof Date) return crudo
  if (typeof crudo === 'number') return crudo
  return crudo
}

// Un texto que "parece número" se convierte para que Excel lo pueda sumar. Se
// excluyen los que empiezan con cero: un código como '007' es un identificador,
// y convertirlo a 7 lo destruye.
function comoNumeroSiCorresponde(valor) {
  if (typeof valor !== 'string') return valor
  const limpio = valor.trim()
  if (!/^-?\d+([.,]\d+)?$/.test(limpio)) return valor
  if (/^0\d/.test(limpio)) return valor
  const numero = Number(limpio.replace(',', '.'))
  return Number.isFinite(numero) ? numero : valor
}

// Excel rechaza nombres de hoja sobre 31 caracteres y los que llevan : \ / ? * [ ]
// Sin esto, un nombre como 'matriz_ventas_resumen_2026-08-30' se trunca solo y
// deja un aviso en consola en cada exportacion.
function nombreDeHoja(valor) {
  const limpio = String(valor || 'Datos').replace(/[:\/?*[\]]/g, ' ').trim()
  return (limpio.slice(0, 31) || 'Datos')
}

export async function rowsToXlsx(rows, columns, { hoja = 'Datos' } = {}) {
  const workbook = new ExcelJS.Workbook()
  workbook.created = new Date()
  const sheet = workbook.addWorksheet(nombreDeHoja(hoja))

  sheet.columns = columns.map(columna => ({
    header: columna.label || columna.key,
    key: columna.key,
    // Ancho aproximado por el largo del encabezado, acotado: sin esto todas las
    // columnas salen del mismo ancho y hay que ajustarlas a mano.
    width: Math.min(Math.max(String(columna.label || columna.key).length + 4, 12), 42),
  }))

  const encabezado = sheet.getRow(1)
  encabezado.font = { bold: true }
  encabezado.alignment = { vertical: 'middle' }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }

  for (const row of rows || []) {
    sheet.addRow(columns.map(columna => comoNumeroSiCorresponde(valorDeCelda(row, columna))))
  }

  return workbook.xlsx.writeBuffer()
}

export function sendXlsx(reply, filename, buffer) {
  return reply
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .send(buffer)
}

// Punto único que usan las rutas. El parámetro se llama `archivo` y no
// `formato` porque este último ya estaba tomado en matriz-ventas para elegir
// QUÉ se exporta —resumen, guías, notas—, que es una decisión distinta.
//
// El nombre se pasa sin extensión; la pone el tipo elegido.
export async function sendExport(reply, { archivo, nombre, rows, columns, hoja }) {
  const elegido = normalizarFormato(archivo)
  if (elegido === 'xlsx') {
    // La hoja lleva un nombre corto y estable; el archivo ya trae la fecha.
    const buffer = await rowsToXlsx(rows, columns, { hoja: hoja || 'Datos' })
    return sendXlsx(reply, `${nombre}.xlsx`, buffer)
  }
  return sendCsv(reply, `${nombre}.csv`, rowsToCsv(rows, columns))
}

// Empaqueta filas y columnas sin transformarlas. Existe para convertir los
// exportadores cuyo primer argumento es una expresión multilínea: reemplazar
// `rowsToCsv(` por `buildExport(` es un cambio de una línea, mientras que
// separar los dos argumentos a mano es frágil.
//
// Se usa junto a sendExport:  return sendExport(reply, { archivo, nombre, ...datos })
export function buildExport(rows, columns) {
  return { rows, columns }
}
