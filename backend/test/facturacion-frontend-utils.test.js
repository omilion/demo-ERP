import { describe, expect, it } from 'vitest'
import { buildExportacionInput, buildIngresoMercaderiaPrefill, buildLiquidacionInput, buildReceptor, computeDteTotales, mapManualDteItems, mapVentaItems, puedeCrearVentaDesdeEmision } from '../../frontend/src/utils/facturacion.js'

describe('facturacion/frontend totals', () => {
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
