import { describe, it, expect } from 'vitest'
import { renderDteHtml, tedToPdf417DataUri } from '../src/facturacion/printDte.js'
import { renderDtePdf } from '../src/facturacion/printDtePdf.js'

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
  })
})
