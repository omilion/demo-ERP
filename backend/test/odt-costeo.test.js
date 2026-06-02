import { describe, expect, it } from 'vitest'
import {
  buildMaterialCostRows,
  buildOdtCosteo,
  buildPriceLookup,
  buildProductividadOperarios,
  parseMoneyLike,
} from '../src/routes/odts/costeo.js'

describe('ODT costeo helpers', () => {
  it('parses Chilean money-like strings conservatively', () => {
    expect(parseMoneyLike('$900.000')).toBe(900000)
    expect(parseMoneyLike('900000')).toBe(900000)
    expect(parseMoneyLike('900.000,50')).toBe(900000.5)
    expect(parseMoneyLike('')).toBeNull()
    expect(parseMoneyLike('sin dato')).toBeNull()
  })

  it('builds material cost rows from net historical consumption and current catalog prices', () => {
    const priceByCode = buildPriceLookup({
      productos: [{ codigoInterno: 'PROD-1', nombre: 'Producto', precioLista: 7000 }],
      materiales: [{ codigoInterno: 'MAT-1', nombre: 'Material', precio: 10000 }],
      telas: [{ codigo: 'TEL-1', nombre: 'Tela', precio: 2500 }],
    })

    expect(buildMaterialCostRows([
      { codigoInterno: 'MAT-1', nombre: 'Material', egreso: 2, ingreso: 0.5, unidad: 'un', taller: 'Corte' },
      { codigoInterno: 'TEL-1', nombre: 'Tela', egreso: 3, ingreso: 0, unidad: 'm', taller: 'Costura' },
      { codigoInterno: 'SIN-1', nombre: 'Sin precio', egreso: 1, ingreso: 0, unidad: 'un', taller: null },
    ], priceByCode)).toEqual([
      {
        codigoInterno: 'MAT-1',
        nombre: 'Material',
        unidad: 'un',
        taller: 'Corte',
        cantidad: 1.5,
        precioUnitario: 10000,
        costo: 15000,
        fuentePrecio: 'material_taller',
        precioFaltante: false,
      },
      {
        codigoInterno: 'TEL-1',
        nombre: 'Tela',
        unidad: 'm',
        taller: 'Costura',
        cantidad: 3,
        precioUnitario: 2500,
        costo: 7500,
        fuentePrecio: 'tela',
        precioFaltante: false,
      },
      {
        codigoInterno: 'SIN-1',
        nombre: 'Sin precio',
        unidad: 'un',
        taller: null,
        cantidad: 1,
        precioUnitario: 0,
        costo: 0,
        fuentePrecio: null,
        precioFaltante: true,
      },
    ])
  })

  it('builds estimated ODT cost and productivity metrics', () => {
    const priceByCode = buildPriceLookup({
      materiales: [{ codigoInterno: 'MAT-1', nombre: 'Material', precio: 10000 }],
    })
    const costeo = buildOdtCosteo({
      id: 7,
      operarioId: 3,
      estado: 'Terminada',
      fechaInicio: '2026-06-02T08:00:00.000Z',
      fechaTermino: '2026-06-02T12:00:00.000Z',
    }, {
      priceByCode,
      historiales: [{ codigoInterno: 'MAT-1', nombre: 'Material', egreso: 1.5, ingreso: 0, unidad: 'un', taller: null }],
      trabajador: { sueldoLiquido: '$900.000' },
      items: [{ cantidad: 5 }],
      orden: {
        descuentoPct: 0,
        items: [{ cantidad: 5, precioUnitario: 20000 }],
        cargos: [],
      },
    })

    expect(costeo).toMatchObject({
      costoMateriales: 15000,
      costoManoObra: 20000,
      costoTotal: 35000,
      costoHora: 5000,
      sueldoLiquido: 900000,
      produccionHoras: 4,
      unidades: 5,
      unidadesPorHora: 1.25,
      costoPorUnidad: 7000,
      ventaTotal: 100000,
      margenEstimado: 65000,
      margenPct: 65,
      alertas: {
        materialesSinPrecio: 0,
        manoObraSinSueldo: false,
        sinHorasProduccion: false,
      },
    })
  })

  it('aggregates productivity by main ODT responsable', () => {
    expect(buildProductividadOperarios([
      {
        id: 1,
        operarioId: 7,
        operario: { id: 7, nombres: 'Ana', apellidoPaterno: 'Rojas' },
        costeo: {
          unidades: 4,
          produccionHoras: 2,
          costoMateriales: 10000,
          costoManoObra: 8000,
          costoTotal: 18000,
          ventaTotal: 50000,
          margenEstimado: 32000,
          alertas: { materialesSinPrecio: 1, manoObraSinSueldo: false, sinHorasProduccion: false },
        },
      },
      {
        id: 2,
        operarioId: 7,
        operario: { id: 7, nombres: 'Ana', apellidoPaterno: 'Rojas' },
        costeo: {
          unidades: 2,
          produccionHoras: 1,
          costoMateriales: 4000,
          costoManoObra: 4000,
          costoTotal: 8000,
          ventaTotal: 30000,
          margenEstimado: 22000,
          alertas: { materialesSinPrecio: 0, manoObraSinSueldo: false, sinHorasProduccion: false },
        },
      },
      {
        id: 3,
        operarioId: null,
        operario: null,
        costeo: {
          unidades: 1,
          produccionHoras: 0,
          costoTotal: 0,
          ventaTotal: null,
          margenEstimado: null,
          alertas: { materialesSinPrecio: 0, manoObraSinSueldo: false, sinHorasProduccion: true },
        },
      },
    ])).toEqual([
      {
        operarioId: 7,
        operario: { id: 7, nombres: 'Ana', apellidoPaterno: 'Rojas' },
        responsable: 'Ana Rojas',
        odts: 2,
        unidades: 6,
        produccionHoras: 3,
        costoMateriales: 14000,
        costoManoObra: 12000,
        costoTotal: 26000,
        ventaTotal: 80000,
        margenEstimado: 54000,
        unidadesPorHora: 2,
        costoPorUnidad: 4333,
        margenPct: 67.5,
        alertas: { materialesSinPrecio: 1, manoObraSinSueldo: 0, sinHorasProduccion: 0 },
      },
      {
        operarioId: null,
        operario: null,
        responsable: 'Sin responsable',
        odts: 1,
        unidades: 1,
        produccionHoras: 0,
        costoMateriales: 0,
        costoManoObra: 0,
        costoTotal: 0,
        ventaTotal: 0,
        margenEstimado: 0,
        unidadesPorHora: null,
        costoPorUnidad: 0,
        margenPct: null,
        alertas: { materialesSinPrecio: 0, manoObraSinSueldo: 0, sinHorasProduccion: 1 },
      },
    ])
  })
})
