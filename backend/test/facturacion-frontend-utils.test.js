import { describe, expect, it } from 'vitest'
import { buildExportacionInput, buildIngresoMercaderiaPrefill, buildLiquidacionInput, buildReceptor, buildReferenciaInternaRow, computeDteTotales, isDteReferenciable, isReferenciaRowEmpty, mapManualDteItems, mapVentaItems, puedeCrearVentaDesdeEmision, REFERENCIA_TIPOS, REFERENCIA_TIPOS_INTERNOS } from '../../frontend/src/utils/facturacion.js'

describe('facturacion/frontend totals', () => {
  it('cataloga los 10 tipos de DTE propios (33-112) mas los codigos no tributarios 801-806 del SII', () => {
    expect(REFERENCIA_TIPOS).toMatchObject({
      33: 'Factura Electrónica', 39: 'Boleta Electrónica', 43: 'Liquidación Factura Electrónica',
      46: 'Factura de Compra Electrónica', 52: 'Guía de Despacho Electrónica', 56: 'Nota de Débito Electrónica',
      61: 'Nota de Crédito Electrónica', 110: 'Factura de Exportación Electrónica',
      111: 'Nota de Débito de Exportación Electrónica', 112: 'Nota de Crédito de Exportación Electrónica',
      801: 'Orden de Compra', 802: 'Nota de Pedido', 803: 'Contrato', 804: 'Resolución',
      805: 'Proceso ChileCompra', 806: 'Ficha ChileCompra',
    })
    for (const tipo of ['33', '39', '43', '46', '52', '56', '61', '110', '111', '112']) {
      expect(REFERENCIA_TIPOS_INTERNOS).toContain(tipo)
    }
  })

  it('una fila de referencia vacia no bloquea ni se manda; con folio sin tipo si es valida (TpoDocRef es opcional en el SII)', () => {
    expect(isReferenciaRowEmpty({ tipo: '', docLocalId: '', folio: '', razon: '' })).toBe(true)
    expect(isReferenciaRowEmpty({ tipo: '', docLocalId: '', folio: '1234', razon: '' })).toBe(false)
    expect(isReferenciaRowEmpty({ tipo: '', docLocalId: '', folio: '', razon: 'Orden de compra' })).toBe(false)
    expect(isReferenciaRowEmpty({ tipo: '801', docLocalId: '', folio: '', razon: '' })).toBe(false)
  })

  it('mantiene referenciables los DTE emitidos, enviados y aceptados con su folio real', () => {
    for (const estado of ['emitido', 'enviado', 'aceptado']) {
      expect(isDteReferenciable({ tipoDte: 52, estado, folio: 187 })).toBe(true)
    }
    for (const estado of ['borrador', 'error', 'rechazado']) {
      expect(isDteReferenciable({ tipoDte: 52, estado, folio: 187 })).toBe(false)
    }
    expect(isDteReferenciable({ tipoDte: 52, estado: 'aceptado', folio: null })).toBe(false)
  })

  it('copia folio y fecha reales al seleccionar una referencia interna', () => {
    expect(buildReferenciaInternaRow({
      id: 41,
      tipoDte: 52,
      folio: 187,
      fechaEmision: '2026-07-24T12:30:00.000Z',
    })).toEqual({
      tipo: '52',
      docLocalId: '41',
      folio: '187',
      fecha: '2026-07-24',
      razon: '',
    })
  })

  it('mantiene el total del formulario manual igual a la vista previa con ítems afectos y exentos', () => {
    const items = mapVentaItems({ items: [
      { id: 1, nombre: 'Ítem afecto', cantidad: 2, precioUnitario: 11900, exento: false },
      { id: 2, nombre: 'Ítem exento', cantidad: 3, precioUnitario: 5000, exento: true },
    ] })

    expect(items).toEqual([
      expect.objectContaining({ nombre: 'Ítem afecto', precio: 10000, exento: false }),
      expect.objectContaining({ nombre: 'Ítem exento', precio: 5000, exento: true }),
    ])
    expect(computeDteTotales(items)).toEqual({ neto: 20000, exento: 15000, iva: 3800, total: 38800 })
  })

  it('prorratea el descuento de la Orden entre los ítems y el total del DTE calza con el total real de la venta', () => {
    const venta = {
      descuentoPct: 10,
      items: [
        { id: 1, nombre: 'Item A', cantidad: 10, precioUnitario: 11900, exento: false },
        { id: 2, nombre: 'Item B', cantidad: 5, precioUnitario: 5950, exento: false },
      ],
    }
    const items = mapVentaItems(venta)
    expect(items).toEqual([
      expect.objectContaining({ nombre: 'Item A', cantidad: 10, precio: 10000, descuentoMonto: 10000 }),
      expect.objectContaining({ nombre: 'Item B', cantidad: 5, precio: 5000, descuentoMonto: 2500 }),
    ])
    // total real de la venta: subtotal 148750 - 10% = 133875 (computeTotal en backend/routes/ventas/helpers.js)
    expect(computeDteTotales(items).total).toBe(133875)
  })

  it('prorratea ademas por la cantidad enviada en una guía parcial (misma tasa de descuento por unidad)', () => {
    const venta = {
      descuentoPct: 10,
      items: [
        { id: 1, nombre: 'Item A', cantidad: 10, precioUnitario: 11900, exento: false },
        { id: 2, nombre: 'Item B', cantidad: 5, precioUnitario: 5950, exento: false },
      ],
    }
    const items = mapVentaItems(venta, { 1: 4 })
    expect(items).toEqual([
      expect.objectContaining({ nombre: 'Item A', cantidad: 4, precio: 10000, descuentoMonto: 4000 }),
    ])
  })

  it('descuento fijo (descuentoMonto congelado) tiene prioridad sobre el porcentaje', () => {
    const venta = {
      descuentoPct: 50,
      descuentoMonto: 1190,
      items: [{ id: 1, nombre: 'Item A', cantidad: 1, precioUnitario: 11900, exento: false }],
    }
    const items = mapVentaItems(venta)
    expect(items).toEqual([expect.objectContaining({ descuentoMonto: 1000 })])
  })

  it('incluye cargos como línea propia solo si includeCargos, y comparten el pool de descuento', () => {
    const venta = {
      descuentoPct: 10,
      items: [{ id: 1, nombre: 'Item A', cantidad: 1, precioUnitario: 11900, exento: false }],
      cargos: [{ nombre: 'Flete', valor: 11900 }],
    }
    const sinCargos = mapVentaItems(venta, null, { includeCargos: false })
    expect(sinCargos).toEqual([expect.objectContaining({ nombre: 'Item A', descuentoMonto: 1000 })])

    const conCargos = mapVentaItems(venta, null, { includeCargos: true })
    expect(conCargos).toEqual([
      expect.objectContaining({ nombre: 'Item A', descuentoMonto: 1000 }),
      expect.objectContaining({ nombre: 'Flete', cantidad: 1, precio: 10000, descuentoMonto: 1000 }),
    ])
  })

  it('serializa Liquidación con detalles, comisiones, totales y mandante sin convertirla en ítems normales', () => {
    const input = buildLiquidacionInput({
      detalles: [{ tpoDocLiq: 33, folio: 82, codigo: 'A-1', nombre: 'Servicio', descripcion: 'Comisión', cantidad: 1, unidad: 'UN', precio: 10000, monto: 10000, exento: false }],
      comisiones: [{ tipoMovim: 'C', glosa: 'Comisión', tasaComision: 10, valComNeto: 1000, valComExe: 0, valComIva: 190 }],
      totales: { neto: 10000, exento: 0, tasaIva: 19, iva: 1900, total: 11900 },
      rutMandante: '76.123.456-7',
    })

    expect(input).toMatchObject({
      items: [],
      detalles: [expect.objectContaining({ tpoDocLiq: 33, monto: 10000 })],
      comisiones: [expect.objectContaining({ tipoMovim: 'C', valComNeto: 1000, valComIva: 190 })],
      totales: expect.objectContaining({ iva: 1900, total: 11900 }),
      extra: { rutMandante: '76.123.456-7' },
    })
  })

  it('serializa Exportación como exenta y conserva referencia 110 y bloques aduaneros', () => {
    const referencia = { tipoDocRef: 110, folioRef: '19', fechaRef: '2026-07-23', codRef: 3, razon: 'Corrige monto' }
    const aduana = { codPaisRecep: '840', totBultos: 1, tipoBultos: [{ codTpoBultos: 1, cantBultos: 1, idContainer: 'CONT-1', sello: 'S-1', emisorSello: 'Naviera' }] }
    const input = buildExportacionInput({
      tipoDte: 111,
      items: [{ nombre: 'Mercadería', cantidad: 2, precio: 5000, exento: false }],
      moneda: 'DOLAR USA',
      otraMoneda: { tipoMoneda: 'PESO CL', tipoCambio: 950, mntExe: 10000, mntTotal: 10000 },
      transporte: { aduana },
      referencias: [referencia],
    })

    expect(input.items).toEqual([expect.objectContaining({ nombre: 'Mercadería', exento: true })])
    expect(input.referencias).toEqual([referencia])
    expect(input.extra).toMatchObject({ moneda: 'DOLAR USA', otraMoneda: expect.objectContaining({ tipoCambio: 950 }), transporte: { aduana } })
  })

  it('preserva contacto, correo y nacionalidad del receptor especializado', () => {
    expect(buildReceptor({ rut: '55555555-5', razonSocial: 'Importador', contacto: 'Ana', email: 'ana@example.com', nacionalidad: '840' })).toMatchObject({ contacto: 'Ana', email: 'ana@example.com', nacionalidad: '840' })
  })

  it('calcula el desglose de totales del editor standalone igual que el payload del DTE', () => {
    expect(computeDteTotales([
      { nombre: 'Producto afecto', cantidad: 2, precio: 10000, exento: false },
      { nombre: 'Servicio exento', cantidad: 1, precio: 5000, exento: true },
    ])).toEqual({ neto: 20000, exento: 5000, iva: 3800, total: 28800 })
  })

  it('convierte los ítems manuales a precios netos antes de emitir cualquier tipo estándar', () => {
    const items = mapManualDteItems([
      { nombre: 'Ítem afecto', cantidad: 2, precioUnitario: 11900, exento: false },
      { nombre: 'Servicio exento', cantidad: 1, precioUnitario: 5000, exento: true },
    ])
    expect(items).toEqual([
      expect.objectContaining({ nombre: 'Ítem afecto', cantidad: 2, precio: 10000, exento: false }),
      expect.objectContaining({ nombre: 'Servicio exento', cantidad: 1, precio: 5000, exento: true }),
    ])
    expect(computeDteTotales(items)).toEqual({ neto: 20000, exento: 5000, iva: 3800, total: 28800 })
  })

  it('prellena ingreso de mercadería sin inventar el código interno del proveedor', () => {
    const prefill = buildIngresoMercaderiaPrefill({ id: 8, tipoDte: 33, folio: 401, fechaEmision: '2026-07-23', rutEmisor: '76.123.456-7', razonSocialEmisor: 'Proveedor SpA', totales: { total: 11900 }, items: [{ nombre: 'Materia prima', cantidad: 2, unidad: 'KG', monto: 10000 }] })
    expect(prefill).toMatchObject({ documentoRecibidoId: 8, documento: 'Factura', nDoc: '401', proveedorRut: '76.123.456-7', totalReferencia: 11900 })
    expect(prefill.details).toEqual([expect.objectContaining({ codigoInterno: '', nombre: 'Materia prima', cantidad: '2', precio: '5000' })])
  })

  it('solo permite crear una venta vinculable con cliente y líneas reales de catálogo', () => {
    const base = { tipo: 'Venta Sala', cliente: { id: 9 }, items: [{ productoId: 15, cantidad: 2, precioUnitario: 11900 }] }
    expect(puedeCrearVentaDesdeEmision(base)).toBe(true)
    expect(puedeCrearVentaDesdeEmision({ ...base, cliente: null })).toBe(false)
    expect(puedeCrearVentaDesdeEmision({ ...base, items: [{ nombre: 'Servicio manual', cantidad: 1, precioUnitario: 5000 }] })).toBe(false)
  })

  it('exige los datos especiales antes de crear Licitación o Convenio Marco', () => {
    const base = { cliente: { id: 9 }, items: [{ productoId: 15, cantidad: 1, precioUnitario: 11900 }] }
    expect(puedeCrearVentaDesdeEmision({ ...base, tipo: 'Licitación', licitacion: 'LIC-1', licitacionFecha: '2026-07-24' })).toBe(true)
    expect(puedeCrearVentaDesdeEmision({ ...base, tipo: 'Licitación', licitacion: 'LIC-1' })).toBe(false)
    expect(puedeCrearVentaDesdeEmision({ ...base, tipo: 'Convenio Marco', licitacion: 'OC-1' })).toBe(true)
    expect(puedeCrearVentaDesdeEmision({ ...base, tipo: 'Convenio Marco' })).toBe(false)
  })
})
