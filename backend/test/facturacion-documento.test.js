import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateKeyPairSync } from 'node:crypto'
import { assertDteLineLimits, buildDocumento, computeTotales, isBoleta, TIPOS_DTE } from '../src/facturacion/documento.js'
import { createFacturacionEngine, resolveDatosReceptor } from '../src/facturacion/engine.js'

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

  it('conserva más de cinco referencias sin imponer un límite', () => {
    const referencias = Array.from({ length: 6 }, (_, index) => ({ tipoDocRef: 801, folioRef: `OC-${index + 1}`, fechaRef: '2026-07-23', razon: `Orden de compra ${index + 1}` }))
    const result = buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '11111111-1', razonSocial: 'Cliente Prueba', giro: 'Comercio', direccion: 'Av Test 1', comuna: 'Santiago' },
      doc: { tipoDte: 33, folio: 77, items: [{ nombre: 'Servicio', cantidad: 1, precio: 1000 }], referencias },
      caf: fakeCaf(), timestamp: new Date('2026-07-23T10:00:00')
    })

    expect((result.documentoXml.match(/<Referencia>/g) || [])).toHaveLength(6)
    expect(result.documentoXml).toContain('<NroLinRef>6</NroLinRef>')
    expect(result.documentoXml).toContain('<FolioRef>OC-6</FolioRef>')
  })

  it('acepta exactamente 20 lineas de detalle sin truncar el XML', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      nombre: `Producto prueba ${index + 1}`,
      cantidad: 1,
      precio: 100 + index,
    }))
    const result = buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '11111111-1', razonSocial: 'Cliente Prueba', giro: 'Comercio', direccion: 'Av Test 1', comuna: 'Santiago' },
      doc: { tipoDte: 33, folio: 78, items },
      caf: fakeCaf(),
      timestamp: new Date('2026-07-24T10:00:00'),
    })

    expect((result.documentoXml.match(/<Detalle>/g) || [])).toHaveLength(20)
    expect(result.documentoXml).toContain('<NroLinDet>20</NroLinDet>')
    expect(result.documentoXml).toContain('<NmbItem>Producto prueba 20</NmbItem>')
  })

  it('rechaza 21 lineas antes de intentar tomar un folio', async () => {
    const tomarFolio = vi.fn()
    const documento = {
      id: 901,
      tipoDte: 33,
      estado: 'borrador',
      items: Array.from({ length: 21 }, (_, index) => ({ nombre: `Item ${index + 1}`, cantidad: 1, precio: 100 })),
    }
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'facturacion-max-lines-'))
    const engine = createFacturacionEngine({
      dataDir,
      db: {
        documentos: { get: vi.fn().mockResolvedValue(documento) },
        cafs: { tomarFolio },
      },
    })

    try {
      await expect(engine.emitir(documento.id)).rejects.toThrow(/Máximo 20 ítems.*tienes 21/)
      expect(tomarFolio).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('aplica 20 detalles y 20 comisiones a Liquidacion Factura', () => {
    expect(() => assertDteLineLimits({
      tipoDte: 43,
      detalles: Array.from({ length: 20 }, () => ({})),
      comisiones: Array.from({ length: 20 }, () => ({})),
    })).not.toThrow()
    expect(() => assertDteLineLimits({
      tipoDte: 43,
      detalles: Array.from({ length: 21 }, () => ({})),
    })).toThrow(/Máximo 20 ítems/)
    expect(() => assertDteLineLimits({
      tipoDte: 43,
      detalles: [{}],
      comisiones: Array.from({ length: 21 }, () => ({})),
    })).toThrow(/Máximo 20 comisiones/)
  })

  it('acepta una boleta anónima como Consumidor Final', () => {
    expect(resolveDatosReceptor({ tipoDte: 39 }, {})).toMatchObject({
      rut: '66666666-6',
      razonSocial: 'Consumidor Final',
    })
  })

  it('bloquea una factura de venta incompleta antes de tomar folio', () => {
    expect(() => resolveDatosReceptor({ tipoDte: 33 }, {
      rut: '11111111-1',
      razonSocial: 'Cliente incompleto',
    })).toThrow(/datos tributarios.*giro, direccion, comuna/i)
  })

  it('isBoleta true only for 39/41', () => {
    expect(isBoleta(39)).toBe(true)
    expect(isBoleta(33)).toBe(false)
  })

  it('boleta (39) sin RUT/razon social usa el generico Consumidor Final en Receptor y TED', () => {
    const result = buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '', razonSocial: '', direccion: '', comuna: '' },
      doc: { tipoDte: 39, folio: 77, items: [{ nombre: 'Venta sala', cantidad: 1, precio: 1000 }] },
      caf: fakeCaf(),
      timestamp: new Date('2026-08-06T10:00:00')
    })

    expect(result.documentoXml).toContain('<RUTRecep>66666666-6</RUTRecep>')
    expect(result.documentoXml).toContain('<RznSocRecep>Consumidor Final</RznSocRecep>')
    expect(result.documentoXml).toContain('<RR>66666666-6</RR>')
    expect(result.documentoXml).toContain('<RSR>Consumidor Final</RSR>')
  })

  it('boleta (39) con razon social pero sin RUT conserva el nombre y solo rellena el RUT generico', () => {
    const result = buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '', razonSocial: 'Juan Pérez' },
      doc: { tipoDte: 39, folio: 78, items: [{ nombre: 'Venta sala', cantidad: 1, precio: 1000 }] },
      caf: fakeCaf(),
      timestamp: new Date('2026-08-06T10:00:00')
    })

    expect(result.documentoXml).toContain('<RUTRecep>66666666-6</RUTRecep>')
    expect(result.documentoXml).toContain('<RznSocRecep>Juan Pérez</RznSocRecep>')
  })

  // Bug real confirmado contra SII certificacion 2026-08-06: boletas 6/7/8/16/17
  // fueron rechazadas el 2026-07-23/29 con "LSX-00213: only 0 occurrences of
  // particle MntTotal, minimum is 1" pese a que MntTotal SI estaba presente.
  // Causa real: EnvioBOLETA_v11.xsd (schema real de boleta) no tiene TasaIVA
  // en su Totales — solo DTE_v10.xsd (factura/guia/NC/ND) lo tiene. Mandarlo
  // en una boleta hace que el validador del SII pierda la secuencia completa
  // de Totales y reporte MntTotal faltante (mensaje enganoso). Confirmado
  // reproduciendo el rechazo real con folio 18 y verificando que folio 19
  // (sin TasaIVA) ya no rebota instantaneo.
  it('boleta (39) NO incluye TasaIVA en Totales (EnvioBOLETA_v11.xsd no tiene ese campo — el SII rechazaba todas las boletas por esto)', () => {
    const result = buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '11111111-1', razonSocial: 'Cliente Prueba' },
      doc: { tipoDte: 39, folio: 19, items: [{ nombre: 'Venta sala', cantidad: 1, precio: 1000 }] },
      caf: fakeCaf(),
      timestamp: new Date('2026-08-06T23:33:00')
    })

    expect(result.documentoXml).not.toContain('TasaIVA')
    expect(result.documentoXml).toContain('<MntNeto>1000</MntNeto>')
    expect(result.documentoXml).toContain('<IVA>190</IVA>')
    expect(result.documentoXml).toContain('<MntTotal>1190</MntTotal>')
    expect(result.documentoXml).toContain('<MontoItem>1190</MontoItem>')
  })

  it('boleta (39) con múltiples ítems netos calcula MontoItem bruto con IVA para cuadrar suma de detalles con MntTotal (reparo 260 SII)', () => {
    const result = buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '5771267-8', razonSocial: 'Oriana Brain', direccion: 'Villuco', comuna: 'Chiguayante' },
      doc: {
        tipoDte: 39,
        folio: 21,
        items: [
          { nombre: 'Pelota de goma', cantidad: 1, precio: 4300, exento: false }
        ]
      },
      caf: fakeCaf(),
      timestamp: new Date('2026-08-07T11:32:55')
    })

    expect(result.documentoXml).toContain('<MntTotal>5117</MntTotal>')
    expect(result.documentoXml).toContain('<MontoItem>5117</MontoItem>')
    expect(result.documentoXml).toContain('<PrcItem>5117</PrcItem>')
  })

  it('factura (33) SI incluye TasaIVA en Totales (DTE_v10.xsd lo exige para facturas)', () => {
    const result = buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '11111111-1', razonSocial: 'Cliente Prueba', direccion: 'Av Test 1', comuna: 'Santiago' },
      doc: { tipoDte: 33, folio: 100, items: [{ nombre: 'Venta', cantidad: 1, precio: 1000 }] },
      caf: fakeCaf(),
      timestamp: new Date('2026-08-06T23:33:00')
    })

    expect(result.documentoXml).toContain('<TasaIVA>19</TasaIVA>')
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

  it.each([39, 56, 61])('emite el XML del tipo manual %s con sus ítems netos', (tipoDte) => {
    const result = buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '11111111-1', razonSocial: 'CLIENTE X', giro: 'Giro', direccion: 'Calle 1', comuna: 'Viña del Mar' },
      doc: {
        tipoDte,
        folio: tipoDte,
        items: [{ nombre: 'Ajuste manual', cantidad: 1, precio: 10000 }],
        referencias: [56, 61].includes(tipoDte) ? [{ tipoDocRef: 33, folioRef: '45', fechaRef: '2026-07-14', codRef: 3, razon: 'Corrección de prueba' }] : [],
      },
      caf: fakeCaf(),
      timestamp: new Date('2026-07-14T10:00:00'),
    })
    expect(result.id).toBe(`F${tipoDte}T${tipoDte}`)
    expect(result.documentoXml).toContain(`<TipoDTE>${tipoDte}</TipoDTE>`)
    expect(result.documentoXml).toContain('<MntTotal>11900</MntTotal>')
    if ([56, 61].includes(tipoDte)) expect(result.documentoXml).toContain('<FolioRef>45</FolioRef>')
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
