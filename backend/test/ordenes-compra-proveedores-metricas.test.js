import { describe, expect, it } from 'vitest'
import { buildTiemposBodegaKpis } from '../src/routes/ordenes-compra-proveedores/metricas.js'

describe('KPI de tiempos de bodega', () => {
  it('mide solo etapas respaldadas por fechas y declara la trazabilidad no disponible', () => {
    const kpis = buildTiemposBodegaKpis({
      ordenesCompra: [
        { fechaEmision: '2026-08-01T00:00:00.000Z', fechaRecepcion: '2026-08-04T00:00:00.000Z' },
        { fechaEmision: '2026-08-01T00:00:00.000Z', fechaRecepcion: null },
      ],
      despachos: [
        { fechaInterno: '2026-08-10T00:00:00.000Z', fechaEntrega: '2026-08-12T12:00:00.000Z' },
      ],
    })

    expect(kpis.ocARecepcion).toEqual({ promedioDias: 3, muestras: 1 })
    expect(kpis.internoADespacho).toEqual({ promedioDias: 2.5, muestras: 1 })
    expect(kpis.trazabilidadCompleta).toMatchObject({ disponible: false, muestras: 0 })
  })
})
