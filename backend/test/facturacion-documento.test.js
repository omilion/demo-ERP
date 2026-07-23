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
  it('TIPOS_DTE covers factura/boleta/guia/NC/ND y factura de compra', () => {
    expect(TIPOS_DTE[33]).toBe('Factura Electrónica')
    expect(TIPOS_DTE[39]).toBe('Boleta Electrónica')
    expect(TIPOS_DTE[46]).toBe('Factura de Compra Electrónica')
    expect(TIPOS_DTE[52]).toBe('Guía de Despacho Electrónica')
    expect(TIPOS_DTE[56]).toBe('Nota de Débito Electrónica')
    expect(TIPOS_DTE[61]).toBe('Nota de Crédito Electrónica')
  })

  it('factura de compra (46) usa el esquema Documento de una factura afecta', () => {
    const result = buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '11111111-1', razonSocial: 'Proveedor Prueba SpA', giro: 'Servicios', direccion: 'Av Test 1', comuna: 'Santiago' },
      doc: { tipoDte: 46, folio: 9, items: [{ nombre: 'Insumo', cantidad: 2, precio: 5000 }] },
      caf: fakeCaf(),
      timestamp: new Date('2026-07-14T10:00:00')
    })

    expect(result.id).toBe('F9T46')
    expect(result.documentoXml).toContain('<TipoDTE>46</TipoDTE>')
    expect(result.documentoXml).toContain('<MntNeto>10000</MntNeto>')
    expect(result.documentoXml).toContain('<IVA>1900</IVA>')
    expect(result.documentoXml).toContain('<MntTotal>11900</MntTotal>')
  })

  it('liquidación factura (43) usa Liquidacion con detalles y comisiones propios', () => {
    const result = buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '11111111-1', razonSocial: 'Mandante Prueba', giro: 'Comercial', direccion: 'Av Test 1', comuna: 'Santiago', email: 'dte@example.com' },
      doc: {
        tipoDte: 43, folio: 51, fechaEmision: '2026-07-23',
        detalles: [{ tpoDocLiq: 33, codigo: '001', nombre: 'Ventas consignadas', cantidad: 2, unidad: 'UN', monto: 100000 }, { tpoDocLiq: 33, nombre: 'Venta exenta', exento: true, monto: 50000 }],
        comisiones: [{ tipoMovim: 'C', glosa: 'Comisión de consignación', tasaComision: 10, valComNeto: 10000, valComExe: 0, valComIva: 1900 }],
        totales: { neto: 100000, exento: 50000, tasaIva: 19, iva: 19000, ivaProp: 1900, ivaTerc: 17100, valComNeto: 10000, valComIva: 1900, total: 169000 },
        extra: { rutMandante: '15915915-9' }
      },
      caf: fakeCaf(), timestamp: new Date('2026-07-23T10:00:00')
    })

    expect(result.id).toBe('F51T43')
    expect(result.documentoXml).toMatch(/^<Liquidacion ID="F51T43">/)
    expect(result.documentoXml).toContain('<TpoDocLiq>33</TpoDocLiq>')
    expect(result.documentoXml).toContain('<RUTMandante>15915915-9</RUTMandante>')
    expect(result.documentoXml).toContain('<NroLinCom>1</NroLinCom>')
    expect(result.documentoXml).toContain('<ValComIVA>1900</ValComIVA>')
    expect(result.documentoXml).not.toContain('<Documento ID=')
  })

  it('factura de exportación (110) usa Exportaciones, Aduana y OtraMoneda sin IVA', () => {
    const result = buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '55555555-5', razonSocial: 'Importador de prueba', nacionalidad: '225' },
      doc: {
        tipoDte: 110, folio: 201, fechaEmision: '2026-07-23',
        items: [{ codigo: 'SKU-1', nombre: 'Tela exportación', cantidad: 4, unidad: 'MT', precio: 250, descuentoPct: 5, descuentoMonto: 50 }],
        extra: { fechaVencimiento: '2026-08-23', tipoDespacho: 2, moneda: 'DOLAR USA', otraMoneda: { tipoMoneda: 'PESO CL', tipoCambio: 950, mntExe: 950000, mntTotal: 950000 }, transporte: { dirDestino: 'Puerto', aduana: { codModVenta: 2, codClauVenta: 1, codViaTransp: 4, codPtoEmbarque: 992, codPtoDesemb: 134, tipoBultos: [{ codTpoBultos: 1, cantBultos: 2, marcas: 'PLASTIMAR' }], totBultos: 2, codPaisRecep: '225', codPaisDestin: '225' } } }
      },
      caf: fakeCaf(), timestamp: new Date('2026-07-23T10:00:00')
    })

    expect(result.id).toBe('F201T110')
    expect(result.documentoXml).toMatch(/^<Exportaciones ID="F201T110">/)
    expect(result.documentoXml).toContain('<IndExe>1</IndExe>')
    expect(result.documentoXml).toContain('<Aduana>')
    expect(result.documentoXml).toContain('<TotBultos>2</TotBultos>')
    expect(result.documentoXml).toContain('<TipoBultos><CodTpoBultos>1</CodTpoBultos><CantBultos>2</CantBultos><Marcas>PLASTIMAR</Marcas></TipoBultos>')
    expect(result.documentoXml).not.toContain('<TipoBultos><TipoBultos>')
    expect(result.documentoXml).toContain('<CodPaisRecep>225</CodPaisRecep>')
    expect(result.documentoXml).toContain('<OtraMoneda>')
    expect(result.documentoXml).toContain('<MntTotal>950</MntTotal>')
    expect(result.documentoXml).not.toContain('<IVA>')
  })

  it.each([111, 112])('notas de exportación %s requieren referencia a una 110', (tipoDte) => {
    const base = { empresa: PLASTIMAR_EMPRESA, receptor: { rut: '55555555-5', razonSocial: 'Importador' }, caf: fakeCaf() }
    expect(() => buildDocumento({ ...base, doc: { tipoDte, folio: 9, items: [{ nombre: 'Ajuste', cantidad: 1, precio: 100 }], referencias: [] } })).toThrow(/referencia/)
    const result = buildDocumento({ ...base, doc: { tipoDte, folio: 9, items: [{ nombre: 'Ajuste', cantidad: 1, precio: 100 }], referencias: [{ tipoDocRef: 110, folioRef: 201, fechaRef: '2026-07-23', codRef: 3, razon: 'Corrige monto' }] } })
    expect(result.documentoXml).toContain(`<TipoDTE>${tipoDte}</TipoDTE>`)
    expect(result.documentoXml).toContain('<TpoDocRef>110</TpoDocRef>')
    expect(result.documentoXml).toContain('<CodRef>3</CodRef>')
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

  it('limpia los puntos de empresa.rut al armar RUTEmisor (EmpresaConfig lo guarda con puntos)', () => {
    const empresaConPuntos = { ...PLASTIMAR_EMPRESA, rut: '76.354.051-0' }
    const doc = {
      tipoDte: 33,
      folio: 1,
      items: [{ nombre: 'Tela acabada', cantidad: 10, precio: 5000, unidad: 'MT' }]
    }
    const receptor = { rut: '11111111-1', razonSocial: 'Cliente Prueba SpA', direccion: 'Av Test 1', comuna: 'Santiago' }
    const result = buildDocumento({ empresa: empresaConPuntos, receptor, doc, caf: fakeCaf(), timestamp: new Date('2026-07-14T10:00:00') })

    expect(result.documentoXml).toContain('<RUTEmisor>76354051-0</RUTEmisor>')
    expect(result.documentoXml).not.toContain('76.354.051-0')
  })

  it('buildDocumento throws with no items', () => {
    expect(() => buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '11111111-1', razonSocial: 'X' },
      doc: { tipoDte: 33, folio: 1, items: [] },
      caf: fakeCaf()
    })).toThrow(/no tiene ítems/)
  })

  it('guia de despacho (52) incluye TipoDespacho e IndTraslado desde extra', () => {
    const result = buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '11111111-1', razonSocial: 'CLIENTE X', giro: 'Giro', direccion: 'Calle 1', comuna: 'Vina' },
      doc: {
        tipoDte: 52,
        folio: 7,
        items: [{ nombre: 'Colchoneta', cantidad: 2, precio: 10000 }],
        extra: { indTraslado: 1, tipoDespacho: 2 }
      },
      caf: fakeCaf(),
      timestamp: new Date('2026-07-14T10:00:00')
    })
    // El SII exige el orden TipoDespacho -> IndTraslado dentro de IdDoc.
    expect(result.documentoXml).toContain('<TipoDespacho>2</TipoDespacho>')
    expect(result.documentoXml).toContain('<IndTraslado>1</IndTraslado>')
    expect(result.documentoXml.indexOf('<TipoDespacho>')).toBeLessThan(result.documentoXml.indexOf('<IndTraslado>'))
  })

  it('sin extra, la guia sale sin TipoDespacho/IndTraslado (por eso la ruta los valida)', () => {
    const result = buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '11111111-1', razonSocial: 'CLIENTE X' },
      doc: { tipoDte: 52, folio: 8, items: [{ nombre: 'Colchoneta', cantidad: 1, precio: 1000 }] },
      caf: fakeCaf()
    })
    expect(result.documentoXml).not.toContain('<TipoDespacho>')
    expect(result.documentoXml).not.toContain('<IndTraslado>')
  })
})
