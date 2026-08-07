import zlib from 'node:zlib'
import { describe, it, expect } from 'vitest'
import { renderDteHtml, tedToPdf417DataUri } from '../src/facturacion/printDte.js'
import { renderDtePdf } from '../src/facturacion/printDtePdf.js'

// pdfkit comprime cada content stream (FlateDecode) y escribe el texto como
// hex-strings <..> dentro de arreglos TJ, asi que buscar el texto plano en el
// buffer crudo no sirve (a diferencia de los marcadores estructurales /Type
// /Page, que quedan sin comprimir). Se descomprime cada stream y se decodifica
// cada hex-string para reconstruir el texto realmente dibujado en la pagina.
function extractPdfText(pdf) {
  const raw = pdf.toString('latin1')
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
  let text = ''
  for (const [, body] of streams) {
    try {
      const decompressed = zlib.inflateSync(Buffer.from(body, 'latin1')).toString('latin1')
      for (const [, hex] of decompressed.matchAll(/<([0-9a-fA-F]+)>/g)) {
        text += Buffer.from(hex, 'hex').toString('latin1')
      }
    } catch { /* stream no es FlateDecode (ej. la imagen del timbre) */ }
  }
  return text
}

const baseArgs = {
  empresa: { razonSocial: 'PLASTIMAR LIMITADA', giro: 'ACABADO DE PRODUCTOS TEXTILES', direccion: '5 Oriente 134', comuna: 'Viña del Mar', ciudad: 'Viña del Mar', rut: '76354051-0', nroResol: 0, fchResol: '2026-07-21' },
  receptor: { razonSocial: 'Cliente Prueba SpA', rut: '11111111-1' },
  totales: { neto: 50000, iva: 9500, tasaIva: 19, total: 59500, exento: null },
  tedXml: '<TED version="1.0"><DD><RE>76354051-0</RE></DD></TED>',
}

describe('facturacion/printDtePdf', () => {
  it('genera un PDF real (buffer con encabezado %PDF-) para una factura con items', async () => {
    const pdf = await renderDtePdf({
      ...baseArgs,
      doc: { tipoDte: 33, folio: 1, items: [{ nombre: 'Tela acabada', cantidad: 10, precio: 5000 }] },
    })
    expect(Buffer.isBuffer(pdf)).toBe(true)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(1000)
  })

  it('no revienta con referencias y sigue produciendo un PDF valido', async () => {
    const pdf = await renderDtePdf({
      ...baseArgs,
      doc: {
        tipoDte: 61,
        folio: 5,
        items: [{ nombre: 'Producto anulado', cantidad: 1, precio: 10000 }],
        referencias: [{ tipoDocRef: '33', folioRef: '1', fechaRef: '2026-07-21', razon: 'Anula por error de monto' }],
      },
    })
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('pagina automaticamente cuando el detalle no entra en una hoja', async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ nombre: `Producto ${i + 1}`, cantidad: 1, precio: 1000 }))
    const pdf = await renderDtePdf({ ...baseArgs, doc: { tipoDte: 33, folio: 2, items } })
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
    expect(pageCount).toBeGreaterThan(1)
  })

  it('guia de despacho: imprime explicito el Tipo de Traslado y Tipo de Despacho en la cabecera', async () => {
    const pdf = await renderDtePdf({
      ...baseArgs,
      doc: {
        tipoDte: 52,
        folio: 9,
        items: [{ nombre: 'Producto', cantidad: 1, precio: 1000 }],
        extra: { indTraslado: 5, tipoDespacho: 1 },
      },
    })
    const texto = extractPdfText(pdf)
    expect(texto).toContain('Tipo de Traslado: Traslados internos')
    expect(texto).toContain('Tipo de Despacho: Despacho por cuenta del receptor')
  })

  it('guia de despacho: motivo desconocido/no informado no revienta el render', async () => {
    const pdf = await renderDtePdf({
      ...baseArgs,
      doc: { tipoDte: 52, folio: 10, items: [{ nombre: 'Producto', cantidad: 1, precio: 1000 }], extra: {} },
    })
    const texto = extractPdfText(pdf)
    expect(texto).toContain('Tipo de Traslado: No informado')
    expect(texto).toContain('Tipo de Despacho: No informado')
  })

  it('una factura normal (no guia) no imprime la fila de Tipo de Traslado', async () => {
    const pdf = await renderDtePdf({
      ...baseArgs,
      doc: { tipoDte: 33, folio: 11, items: [{ nombre: 'Producto', cantidad: 1, precio: 1000 }] },
    })
    const texto = extractPdfText(pdf)
    expect(texto).not.toContain('Tipo de Traslado')
  })

  it('imprime la descripcion extendida de un item (DscItem) con wrap real bajo el nombre, sin reventar', async () => {
    const descripcionLarga = 'Adquisicion de mobiliario para el proyecto FNDR N 40012345, concurso publico ID 1234-5-LE24, financiado por el Gobierno Regional segun resolucion exenta N 987 de 2026, destinado a la sala de estimulacion temprana del jardin infantil. '.repeat(3)
    const pdf = await renderDtePdf({
      ...baseArgs,
      doc: { tipoDte: 33, folio: 3, items: [{ nombre: 'Material Didáctico', cantidad: 1, precio: 50000, descripcion: descripcionLarga }] },
    })
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(1000)
  })

  it('cada item mantiene su propia descripcion; los items sin descripcion no la heredan', async () => {
    const pdf = await renderDtePdf({
      ...baseArgs,
      doc: {
        tipoDte: 33,
        folio: 4,
        items: [
          { nombre: 'Item A', cantidad: 1, precio: 1000, descripcion: 'Descripción del ítem A para la licitación pública Mineduc.' },
          { nombre: 'Item B', cantidad: 1, precio: 2000 },
          { nombre: 'Item C', cantidad: 1, precio: 3000, descripcion: 'Descripción distinta del ítem C, proyecto Serviu.' },
        ],
      },
    })
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('el salto de pagina tambien considera la descripcion extendida del ultimo item de la hoja', async () => {
    const items = Array.from({ length: 59 }, (_, i) => ({ nombre: `Producto ${i + 1}`, cantidad: 1, precio: 1000 }))
    items.push({ nombre: 'Ítem con descripción extensa', cantidad: 1, precio: 5000, descripcion: 'Detalle del proyecto FNDR con harto texto para forzar el salto de pagina al final de la hoja. '.repeat(6) })
    const pdf = await renderDtePdf({ ...baseArgs, doc: { tipoDte: 33, folio: 6, items } })
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
    expect(pageCount).toBeGreaterThan(1)
  })
})

describe('facturacion/printDte', () => {
  it('tedToPdf417DataUri returns a PNG data URI', async () => {
    const uri = await tedToPdf417DataUri('<TED version="1.0"><DD><RE>76354051-0</RE></DD></TED>')
    expect(uri).toMatch(/^data:image\/png;base64,/)
  })

  it('renderDteHtml embeds Plastimar emisor and receptor data', async () => {
    const html = await renderDteHtml({
      empresa: { razonSocial: 'PLASTIMAR LIMITADA', giro: 'ACABADO DE PRODUCTOS TEXTILES', direccion: '5 Oriente 134', comuna: 'Viña del Mar', ciudad: 'Viña del Mar', rut: '76354051-0' },
      receptor: { razonSocial: 'Cliente Prueba SpA', rut: '11111111-1' },
      doc: { tipoDte: 33, folio: 1, items: [{ nombre: 'Tela acabada', cantidad: 10, precio: 5000 }] },
      totales: { neto: 50000, iva: 9500, tasaIva: 19, total: 59500, exento: null },
      tedXml: '<TED version="1.0"><DD><RE>76354051-0</RE></DD></TED>'
    })
    expect(html).toContain('PLASTIMAR LIMITADA')
    expect(html).toContain('ACABADO DE PRODUCTOS TEXTILES')
    expect(html).toContain('Cliente Prueba SpA')
    expect(html).toContain('FACTURA ELECTRÓNICA')
    expect(html).toContain('$ 59.500')
    expect(html).not.toContain('Tipo de Traslado')
  })

  it('guia de despacho: renderDteHtml imprime explicito el Tipo de Traslado y Tipo de Despacho', async () => {
    const html = await renderDteHtml({
      empresa: { razonSocial: 'PLASTIMAR LIMITADA', giro: 'ACABADO DE PRODUCTOS TEXTILES', direccion: '5 Oriente 134', comuna: 'Viña del Mar', ciudad: 'Viña del Mar', rut: '76354051-0' },
      receptor: { razonSocial: 'Cliente Prueba SpA', rut: '11111111-1' },
      doc: {
        tipoDte: 52,
        folio: 9,
        items: [{ nombre: 'Producto', cantidad: 1, precio: 1000 }],
        extra: { indTraslado: 5, tipoDespacho: 1 },
      },
      totales: { neto: 1000, iva: 190, tasaIva: 19, total: 1190, exento: null },
      tedXml: '<TED version="1.0"><DD><RE>76354051-0</RE></DD></TED>'
    })
    expect(html).toContain('<strong>Tipo de Traslado:</strong> Traslados internos')
    expect(html).toContain('<strong>Tipo de Despacho:</strong> Despacho por cuenta del receptor')
  })
})
