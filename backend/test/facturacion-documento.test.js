import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { buildDocumento, computeTotales, isBoleta, TIPOS_DTE } from '../src/facturacion/documento.js'

const PLASTIMAR_EMPRESA = {
  rut: '76354051-0',
  razonSocial: 'PLASTIMAR LIMITADA',
  giro: 'ACABADO DE PRODUCTOS TEXTILES',
  direccion: '5 Oriente 134',
  comuna: 'Viña del Mar',
  ciudad: 'Viña del Mar',
  acteco: '1394'
}

function fakeCaf() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
  return {
    cafXml: '<CAF version="1.0"><DA><RE>76354051-0</RE></DA></CAF>',
    privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' })
  }
}

describe('facturacion/documento', () => {
  it('TIPOS_DTE covers factura/boleta/guia/NC/ND', () => {
    expect(TIPOS_DTE[33]).toBe('Factura Electrónica')
    expect(TIPOS_DTE[39]).toBe('Boleta Electrónica')
    expect(TIPOS_DTE[52]).toBe('Guía de Despacho Electrónica')
    expect(TIPOS_DTE[56]).toBe('Nota de Débito Electrónica')
    expect(TIPOS_DTE[61]).toBe('Nota de Crédito Electrónica')
  })

  it('isBoleta true only for 39/41', () => {
    expect(isBoleta(39)).toBe(true)
    expect(isBoleta(33)).toBe(false)
  })

  it('computeTotales applies 19% IVA on an affected factura (33)', () => {
    const totales = computeTotales([{ cantidad: 2, precio: 5000 }], 33)
    expect(totales.neto).toBe(10000)
    expect(totales.iva).toBe(1900)
    expect(totales.total).toBe(11900)
  })

  it('buildDocumento produces a well-formed <Documento> for a Plastimar factura afecta', () => {
    const doc = {
      tipoDte: 33,
      folio: 1,
      items: [{ nombre: 'Tela acabada', cantidad: 10, precio: 5000, unidad: 'MT' }]
    }
    const receptor = { rut: '11111111-1', razonSocial: 'Cliente Prueba SpA', direccion: 'Av Test 1', comuna: 'Santiago' }
    const result = buildDocumento({ empresa: PLASTIMAR_EMPRESA, receptor, doc, caf: fakeCaf(), timestamp: new Date('2026-07-14T10:00:00') })

    expect(result.id).toBe('F1T33')
    expect(result.documentoXml).toContain('<RUTEmisor>76354051-0</RUTEmisor>')
    expect(result.documentoXml).toContain('<RznSoc>PLASTIMAR LIMITADA</RznSoc>')
    expect(result.documentoXml).toContain('<GiroEmis>ACABADO DE PRODUCTOS TEXTILES</GiroEmis>')
    expect(result.documentoXml).toContain('<MntTotal>59500</MntTotal>')
    expect(result.documentoXml).toContain('<TED version="1.0">')
    expect(result.totales.total).toBe(59500)
  })

  it('buildDocumento throws with no items', () => {
    expect(() => buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '11111111-1', razonSocial: 'X' },
      doc: { tipoDte: 33, folio: 1, items: [] },
      caf: fakeCaf()
    })).toThrow(/no tiene ítems/)
  })
})
