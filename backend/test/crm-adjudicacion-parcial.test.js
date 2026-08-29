// CU-03: la licitacion se convierte en venta segun lo ADJUDICADO, no segun lo
// cotizado. El legacy ya lo modelaba (cotizacion_licitacion_items.cantAdjudicados)
// y el CRM que lo reemplaza no, de modo que aprobar una adjudicacion parcial
// generaba una venta por el total cotizado.
//
// En produccion hay 221 lineas parciales repartidas en 64 cotizaciones.
import { describe, expect, it } from 'vitest'
import { resolverItemsAdjudicados } from '../src/domain/crm/service.js'

const linea = (cantidad, cantAdjudicados) => ({ productoId: 1, cantidad, cantAdjudicados, precioUnitario: 1000 })

describe('resolucion de cantidad adjudicada', () => {
  it('sin adjudicacion registrada vende la cantidad cotizada', () => {
    const salida = resolverItemsAdjudicados([linea(10, null)])
    expect(salida).toHaveLength(1)
    expect(salida[0].cantidad).toBe(10)
  })

  it('con adjudicacion parcial vende solo lo adjudicado', () => {
    expect(resolverItemsAdjudicados([linea(10, 3)])[0].cantidad).toBe(3)
  })

  it('con adjudicacion total vende lo mismo que se cotizo', () => {
    expect(resolverItemsAdjudicados([linea(7, 7)])[0].cantidad).toBe(7)
  })

  it('una linea no adjudicada no llega a la venta', () => {
    const salida = resolverItemsAdjudicados([
      { ...linea(10, 0), productoId: 1 },
      { ...linea(5, 5), productoId: 2 },
    ])
    expect(salida).toHaveLength(1)
    expect(salida[0].productoId).toBe(2)
  })

  // El caso que motiva distinguir null de 0: con el default 0 del legacy no se
  // puede separar "todavia no registro la adjudicacion" de "no me adjudicaron
  // nada", y llevan a ventas distintas.
  it('distingue no registrado de no adjudicado', () => {
    expect(resolverItemsAdjudicados([linea(4, null)])).toHaveLength(1)
    expect(resolverItemsAdjudicados([linea(4, 0)])).toHaveLength(0)
  })

  // Los items que vienen del cliente Prisma antes de la migracion no traen el
  // campo: undefined tiene que comportarse como null, no descartar la linea.
  it('trata undefined como no registrado', () => {
    const salida = resolverItemsAdjudicados([{ productoId: 1, cantidad: 6, precioUnitario: 1000 }])
    expect(salida).toHaveLength(1)
    expect(salida[0].cantidad).toBe(6)
  })

  it('no muta los items originales', () => {
    const original = [linea(10, 3)]
    resolverItemsAdjudicados(original)
    expect(original[0].cantidad).toBe(10)
  })

  it('con la lista vacia devuelve vacio, sin reventar', () => {
    expect(resolverItemsAdjudicados([])).toEqual([])
    expect(resolverItemsAdjudicados()).toEqual([])
  })

  // Escenario completo de adjudicacion parcial: de tres lineas cotizadas, una
  // se adjudica entera, otra a medias y la tercera no se adjudica.
  it('resuelve una adjudicacion parcial de varias lineas', () => {
    const salida = resolverItemsAdjudicados([
      { productoId: 1, cantidad: 100, cantAdjudicados: 100, precioUnitario: 500 },
      { productoId: 2, cantidad: 50, cantAdjudicados: 20, precioUnitario: 800 },
      { productoId: 3, cantidad: 30, cantAdjudicados: 0, precioUnitario: 200 },
    ])
    expect(salida.map(i => [i.productoId, i.cantidad])).toEqual([[1, 100], [2, 20]])
    const total = salida.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0)
    expect(total).toBe(100 * 500 + 20 * 800)
  })
})
