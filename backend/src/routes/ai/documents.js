import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import ExcelJS from 'exceljs'
import pptxgen from 'pptxgenjs'

function uploadsRoot() {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'))
}

// Herramientas de generación de documentos expuestas al LLM. Claude arma la
// estructura (columnas + filas / secciones) con datos que YA consultó; aquí
// solo materializamos el archivo en disco y devolvemos el link de descarga.
// Se guardan en UPLOADS_DIR/ai/ → servido por nginx en /uploads/ai/...

export const documentToolDefinitions = [
  {
    name: 'generar_excel',
    description: 'Genera un archivo Excel (.xlsx) descargable a partir de datos ya consultados. Llamar SOLO después de obtener los datos con las herramientas de consulta. Devuelve un link de descarga que debes entregar al usuario.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título del reporte / nombre de la hoja' },
        columnas: { type: 'array', items: { type: 'string' }, description: 'Encabezados de columna' },
        filas: { type: 'array', items: { type: 'array', items: {} }, description: 'Filas de datos; cada fila es un array alineado con columnas' },
      },
      required: ['titulo', 'columnas', 'filas'],
    },
  },
  {
    name: 'generar_pptx',
    description: 'Genera una presentación PowerPoint (.pptx) descargable. Cada sección es una diapositiva con título y viñetas (o una tabla simple). Llamar SOLO después de obtener los datos. Devuelve un link de descarga.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título de la presentación (slide de portada)' },
        secciones: {
          type: 'array',
          description: 'Diapositivas de contenido',
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string' },
              vinetas: { type: 'array', items: { type: 'string' }, description: 'Viñetas de texto (opcional)' },
              tabla: {
                type: 'object',
                description: 'Tabla opcional con columnas y filas',
                properties: {
                  columnas: { type: 'array', items: { type: 'string' } },
                  filas: { type: 'array', items: { type: 'array', items: {} } },
                },
              },
            },
            required: ['titulo'],
          },
        },
      },
      required: ['titulo', 'secciones'],
    },
  },
]

const GREEN = '1B5E20'

async function saveBuffer(buffer, ext) {
  const dir = path.join(uploadsRoot(), 'ai')
  await mkdir(dir, { recursive: true })
  const filename = `${randomUUID()}.${ext}`
  await writeFile(path.join(dir, filename), buffer)
  return `/uploads/ai/${filename}`
}

async function generarExcel(input) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Asistente Plastimar IA'
  const ws = wb.addWorksheet((input.titulo || 'Reporte').slice(0, 31))
  const columnas = Array.isArray(input.columnas) ? input.columnas : []
  ws.addRow(columnas)
  const header = ws.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${GREEN}` } }
  for (const fila of input.filas || []) ws.addRow(Array.isArray(fila) ? fila : [fila])
  ws.columns.forEach(col => {
    let max = 10
    col.eachCell({ includeEmpty: false }, c => { max = Math.max(max, String(c.value ?? '').length + 2) })
    col.width = Math.min(max, 60)
  })
  const buffer = Buffer.from(await wb.xlsx.writeBuffer())
  const url = await saveBuffer(buffer, 'xlsx')
  return { url, tipo: 'excel', filas: (input.filas || []).length }
}

async function generarPptx(input) {
  const pptx = new pptxgen()
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 })
  pptx.layout = 'WIDE'

  const cover = pptx.addSlide()
  cover.background = { color: GREEN }
  cover.addText(input.titulo || 'Reporte Plastimar', { x: 0.6, y: 2.6, w: 12, h: 1.5, fontSize: 40, bold: true, color: 'FFFFFF' })
  cover.addText(new Date().toLocaleDateString('es-CL'), { x: 0.6, y: 4.1, w: 12, h: 0.6, fontSize: 16, color: 'D7E3D7' })

  for (const sec of input.secciones || []) {
    const slide = pptx.addSlide()
    slide.addText(sec.titulo || '', { x: 0.5, y: 0.4, w: 12.3, h: 0.8, fontSize: 26, bold: true, color: GREEN })
    let y = 1.6
    if (Array.isArray(sec.vinetas) && sec.vinetas.length) {
      slide.addText(sec.vinetas.map(t => ({ text: String(t), options: { bullet: true, fontSize: 16, color: '333333', breakLine: true } })), { x: 0.7, y, w: 12, h: 4 })
      y += 4
    }
    if (sec.tabla?.columnas?.length) {
      const head = sec.tabla.columnas.map(c => ({ text: String(c), options: { bold: true, color: 'FFFFFF', fill: { color: GREEN } } }))
      const body = (sec.tabla.filas || []).map(f => (Array.isArray(f) ? f : [f]).map(c => ({ text: String(c ?? '') })))
      slide.addTable([head, ...body], { x: 0.6, y: Math.min(y, 2), w: 12.1, fontSize: 12, border: { type: 'solid', color: 'DDDDDD', pt: 0.5 } })
    }
  }
  const buffer = Buffer.from(await pptx.write({ outputType: 'nodebuffer' }))
  const url = await saveBuffer(buffer, 'pptx')
  return { url, tipo: 'pptx', diapositivas: (input.secciones || []).length + 1 }
}

export async function runDocumentTool(name, input) {
  if (name === 'generar_excel') return generarExcel(input || {})
  if (name === 'generar_pptx') return generarPptx(input || {})
  return null
}

export const DOCUMENT_TOOL_NAMES = new Set(['generar_excel', 'generar_pptx'])
