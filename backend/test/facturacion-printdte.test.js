import { describe, it, expect } from 'vitest'
import { renderDteHtml, tedToPdf417DataUri } from '../src/facturacion/printDte.js'

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
