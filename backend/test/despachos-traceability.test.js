import { describe, expect, it } from 'vitest'
import {
  applyDespachoEstadoFilter,
  buildClienteOrdenFilter,
  buildDespachoTiempoMetrics,
  buildOrdenEntregaSyncFromDespacho,
  buildOrdenEntregaSyncFromGuia,
  buildGuideAvailability,
  buildGuideWhereForDespacho,
  buildPackingEventRows,
  buildTrackingEventData,
  normalizeTrackingEstado,
  parsePackingReferenceId,
  buildPackingUpdatePlan,
  resolveDespachoOrderBy,
  resolveDispatchTraceability,
  resolveGuideAllocation,
  validateTrackingTransition,
  validateDispatchFilterCoherence,
} from '../src/routes/despachos/index.js'
import { deriveEstadoLogistico, resumenPreparacion } from '../src/routes/despachos/estado-logistico.js'

function prismaMock({
  orden = { id: 10, nInterno: 9001, clienteId: 1 },
  odt = { id: 5, ordenId: 10 },
} = {}) {
  return {
    orden: {
      findUnique: async ({ where }) => {
        if (!orden) return null
        if (where.id !== undefined && where.id !== orden.id) return null
        if (where.nInterno !== undefined && where.nInterno !== orden.nInterno) return null
        return orden
      },
    },
    odt: {
      findUnique: async ({ where }) => {
        if (!odt || where.id !== odt.id) return null
        return odt
      },
    },
  }
}

describe('buildOrdenEntregaSyncFromDespacho', () => {
  it('marks an order as partial when the despacho is partial', () => {
    expect(buildOrdenEntregaSyncFromDespacho({
      ordenId: 10,
      parcial: true,
      fechaEntrega: new Date('2026-05-23T00:00:00.000Z'),
    })).toEqual({
      ordenId: 10,
      estadoEntrega: 'Parcial',
    })
  })

  it('marks an order as delivered when a non-partial despacho has fechaEntrega', () => {
    expect(buildOrdenEntregaSyncFromDespacho({
      ordenId: '10',
      parcial: false,
      fechaEntrega: new Date('2026-05-23T00:00:00.000Z'),
    })).toEqual({
      ordenId: 10,
      estadoEntrega: 'Entregada',
    })
  })

  it('does not sync without a valid ordenId or delivery signal', () => {
    expect(buildOrdenEntregaSyncFromDespacho({
      ordenId: null,
      parcial: true,
      fechaEntrega: new Date('2026-05-23T00:00:00.000Z'),
    })).toBeNull()
    expect(buildOrdenEntregaSyncFromDespacho({
      ordenId: 10,
      parcial: false,
      fechaEntrega: null,
    })).toBeNull()
  })
})

describe('buildOrdenEntregaSyncFromGuia', () => {
  it('marks a non-partial order as delivered when a guia is created', () => {
    expect(buildOrdenEntregaSyncFromGuia({
      ordenId: 10,
      currentEstadoEntrega: 'Pendiente entrega',
    })).toEqual({
      ordenId: 10,
      estadoEntrega: 'Entregada',
    })
  })

  it('keeps a partial order unchanged without an explicit non-partial despacho signal', () => {
    expect(buildOrdenEntregaSyncFromGuia({
      ordenId: 10,
      currentEstadoEntrega: 'Parcial',
      hasExplicitNonPartialDespachoSignal: false,
    })).toBeNull()
  })

  it('marks a partial order as delivered when a non-partial despacho signal exists', () => {
    expect(buildOrdenEntregaSyncFromGuia({
      ordenId: '10',
      currentEstadoEntrega: 'Parcial',
      hasExplicitNonPartialDespachoSignal: true,
    })).toEqual({
      ordenId: 10,
      estadoEntrega: 'Entregada',
    })
  })

  it('does not sync without a valid ordenId', () => {
    expect(buildOrdenEntregaSyncFromGuia({
      ordenId: 0,
      currentEstadoEntrega: 'Pendiente entrega',
    })).toBeNull()
  })
})

describe('disponibilidad para guías', () => {
  const items = [
    { id: 10, nombre: 'Producto A', cantidad: 2, nEntregados: 2 },
    { id: 20, nombre: 'Producto B', cantidad: 3, nEntregados: 1 },
  ]

  it('distingue lo pendiente de packing de lo preparado para enviar', () => {
    const result = buildGuideAvailability(items, [])

    expect(result[0]).toMatchObject({ pendientePreparar: 0, cantidadPreparada: 2, disponibleGuia: 2 })
    expect(result[1]).toMatchObject({ pendientePreparar: 2, cantidadPreparada: 1, disponibleGuia: 1 })
  })

  it('descuenta lo ya incluido en guías activas', () => {
    const result = buildGuideAvailability(items, [{ items: [{ ordenItemId: 10, nombre: 'Producto A', cantidad: 1 }] }])
    expect(result[0]).toMatchObject({ cantidadGuiada: 1, disponibleGuia: 1 })
  })

  it('rechaza una guía que supera las unidades preparadas disponibles', () => {
    const result = resolveGuideAllocation(items, [], [{ ordenItemId: 20, nombre: 'Producto B', cantidad: 2 }])
    expect(result.error).toMatch(/solo tiene 1 unidad/i)
  })

  it('normaliza la línea válida con el identificador de la venta', () => {
    const result = resolveGuideAllocation(items, [], [{ nombre: 'Producto B', cantidad: 1, unidad: 'UN' }])
    expect(result.items).toEqual([{ ordenItemId: 20, nombre: 'Producto B', cantidad: 1, unidad: 'UN' }])
  })
})

describe('resolveDispatchTraceability', () => {
  it('resolves a dispatch by ordenId', async () => {
    const result = await resolveDispatchTraceability(prismaMock(), {
      ordenId: 10,
    })

    expect(result).toMatchObject({
      orden: { id: 10 },
      odt: null,
      nInterno: 9001,
      origenTipo: 'orden',
      origenId: 10,
    })
  })

  it('resolves a dispatch by odtId and derives its orden', async () => {
    const result = await resolveDispatchTraceability(prismaMock(), {
      odtId: 5,
    })

    expect(result).toMatchObject({
      orden: { id: 10 },
      odt: { id: 5, ordenId: 10 },
      nInterno: 9001,
      origenTipo: 'odt',
      origenId: 5,
    })
  })

  it('rejects crossed orden and odt references', async () => {
    const result = await resolveDispatchTraceability(prismaMock({
      orden: { id: 11, nInterno: 9002, clienteId: 1 },
      odt: { id: 5, ordenId: 10 },
    }), {
      ordenId: 11,
      odtId: 5,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'ODT no pertenece a la orden indicada',
    })
  })

  it('rejects nInterno mismatched with ordenId', async () => {
    const result = await resolveDispatchTraceability(prismaMock(), {
      ordenId: 10,
      nInterno: 9002,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'nInterno no coincide con la orden indicada',
    })
  })

  it('rejects odt origin without odtId', async () => {
    const result = await resolveDispatchTraceability(prismaMock(), {
      ordenId: 10,
      origenTipo: 'odt',
      origenId: 5,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'origenTipo debe ser orden sin odtId',
    })
  })

  it('rejects order origin when odtId is informed', async () => {
    const result = await resolveDispatchTraceability(prismaMock(), {
      ordenId: 10,
      odtId: 5,
      origenTipo: 'orden',
      origenId: 10,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'origenTipo debe ser odt cuando se informa odtId',
    })
  })
})

describe('validateDispatchFilterCoherence', () => {
  it('accepts coherent orden, odt and nInterno filters', async () => {
    const result = await validateDispatchFilterCoherence(prismaMock(), {
      ordenId: 10,
      odtId: 5,
      nInterno: 9001,
      origenTipo: 'odt',
      origenId: 5,
    })

    expect(result).toMatchObject({
      filters: {
        ordenId: 10,
        odtId: 5,
        nInterno: 9001,
        origenTipo: 'odt',
        origenId: 5,
      },
    })
  })

  it('rejects crossed orden and odt filters', async () => {
    const result = await validateDispatchFilterCoherence(prismaMock({
      orden: { id: 11, nInterno: 9002, clienteId: 1 },
      odt: { id: 5, ordenId: 10 },
    }), {
      ordenId: 11,
      odtId: 5,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'ODT no pertenece a la orden indicada',
    })
  })

  it('rejects crossed orden and nInterno filters', async () => {
    const result = await validateDispatchFilterCoherence(prismaMock(), {
      ordenId: 10,
      nInterno: 9002,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'nInterno no coincide con la orden indicada',
    })
  })

  it('rejects crossed origen and odt filters', async () => {
    const result = await validateDispatchFilterCoherence(prismaMock(), {
      odtId: 5,
      origenTipo: 'odt',
      origenId: 6,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'origenId no coincide con odtId',
    })
  })

  it('rejects crossed order origin and odt filters', async () => {
    const result = await validateDispatchFilterCoherence(prismaMock({
      odt: { id: 5, ordenId: 10 },
    }), {
      odtId: 5,
      origenTipo: 'orden',
      origenId: 11,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'ODT no pertenece a la orden indicada',
    })
  })

  it('rejects crossed odt origin and orden filters', async () => {
    const result = await validateDispatchFilterCoherence(prismaMock({
      orden: { id: 11, nInterno: 9002, clienteId: 1 },
      odt: { id: 5, ordenId: 10 },
    }), {
      ordenId: 11,
      origenTipo: 'odt',
      origenId: 5,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'ODT no pertenece a la orden indicada',
    })
  })
})

describe('buildGuideWhereForDespacho', () => {
  it('scopes guides for an odt dispatch to the same odt trace', () => {
    expect(buildGuideWhereForDespacho({
      ordenId: 10,
      odtId: 5,
      origenTipo: 'odt',
      origenId: 5,
    })).toEqual({
      ordenId: 10,
      OR: [
        { odtId: 5 },
        { origenTipo: 'odt', origenId: 5 },
      ],
    })
  })

  it('scopes guides for an order dispatch away from other odts', () => {
    expect(buildGuideWhereForDespacho({
      ordenId: 10,
      odtId: null,
      origenTipo: 'orden',
      origenId: 10,
    })).toEqual({
      ordenId: 10,
      OR: [
        { odtId: null },
        { origenTipo: 'orden', origenId: 10 },
        { origenTipo: null, origenId: null },
      ],
    })
  })
})

describe('dispatch list filters', () => {
  it('builds a client filter through order and branch data', () => {
    expect(buildClienteOrdenFilter('  plastimar  ')).toEqual({
      orden: {
        is: {
          OR: [
            { rutCliente: { contains: 'plastimar', mode: 'insensitive' } },
            { emailCliente: { contains: 'plastimar', mode: 'insensitive' } },
            { clienteSucursal: { is: { nombre: { contains: 'plastimar', mode: 'insensitive' } } } },
            { clienteSucursal: { is: { cliente: { is: { nombre: { contains: 'plastimar', mode: 'insensitive' } } } } } },
          ],
        },
      },
    })
    expect(buildClienteOrdenFilter('')).toBeNull()
  })

  it('applies logistic state filters conservatively', () => {
    const delivered = { fechaEntrega: { gte: new Date('2026-05-01T00:00:00.000Z') } }
    expect(applyDespachoEstadoFilter(delivered, 'entregada')).toBeNull()
    expect(delivered).toEqual({
      fechaEntrega: {
        gte: new Date('2026-05-01T00:00:00.000Z'),
        not: null,
      },
      parcial: false,
    })

    const partial = {}
    expect(applyDespachoEstadoFilter(partial, 'parcial')).toBeNull()
    expect(partial).toEqual({ parcial: true })

    const invalid = {}
    expect(applyDespachoEstadoFilter(invalid, 'cerrada')).toEqual({
      status: 400,
      error: 'estado debe ser pendiente, entregada, parcial o multa',
    })
  })

  it('orders by delivery date desc by default, unchanged from before', () => {
    expect(resolveDespachoOrderBy({})).toEqual({ fechaEntrega: 'desc' })
    expect(resolveDespachoOrderBy({ estado: 'entregada' })).toEqual({ fechaEntrega: 'desc' })
  })

  it('orders pendientes oldest-first so old backlog surfaces before today', () => {
    expect(resolveDespachoOrderBy({ estado: 'pendiente' })).toEqual([
      { fechaInterno: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'asc' },
    ])
    expect(resolveDespachoOrderBy({ estado: 'pendientes' })).toEqual([
      { fechaInterno: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'asc' },
    ])
  })

  it('lets sort=reciente override the oldest-first default for pendientes', () => {
    expect(resolveDespachoOrderBy({ estado: 'pendiente', sort: 'reciente' })).toEqual({ fechaEntrega: 'desc' })
  })

  it('lets sort=antiguedad force oldest-first even outside the pendientes view', () => {
    expect(resolveDespachoOrderBy({ estado: 'entregada', sort: 'antiguedad' })).toEqual([
      { fechaInterno: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'asc' },
    ])
  })
})

describe('packing and dispatch timing helpers', () => {
  it('builds a validated packing update plan for order items', () => {
    const orderItems = [
      { id: 1, cantidad: 3, nEntregados: 0, pickingConfirmado: true },
      { id: 2, cantidad: 2, nEntregados: 1, pickingConfirmado: true },
    ]

    expect(buildPackingUpdatePlan(orderItems, [
      { itemId: 1, nEntregados: '2' },
      { id: 2, nEntregados: 2 },
    ])).toEqual({
      updates: [
        { id: 1, nEntregados: 2, cantidadAnterior: 0, delta: 2 },
        { id: 2, nEntregados: 2, cantidadAnterior: 1, delta: 1 },
      ],
    })

    expect(buildPackingUpdatePlan(orderItems, [{ itemId: 3, nEntregados: 1 }])).toEqual({
      error: 'Item 3 no pertenece a la orden',
    })
    expect(buildPackingUpdatePlan(orderItems, [{ itemId: 1, nEntregados: 4 }])).toEqual({
      error: 'nEntregados supera la cantidad del item 1',
    })
    expect(buildPackingUpdatePlan(orderItems, [
      { itemId: 1, nEntregados: 1 },
      { itemId: 1, nEntregados: 2 },
    ])).toEqual({
      error: 'itemId duplicado: 1',
    })

    const sinConfirmar = [{ id: 1, cantidad: 3, nEntregados: 0, pickingConfirmado: false }]
    expect(buildPackingUpdatePlan(sinConfirmar, [{ itemId: 1, nEntregados: 1 }])).toEqual({
      error: 'Item 1 no tiene picking confirmado',
    })
    // Corregir hacia abajo (o dejar igual) no requiere picking confirmado.
    const parcialSinConfirmar = [{ id: 1, cantidad: 3, nEntregados: 2, pickingConfirmado: false }]
    expect(buildPackingUpdatePlan(parcialSinConfirmar, [{ itemId: 1, nEntregados: 1 }])).toEqual({
      updates: [{ id: 1, nEntregados: 1, cantidadAnterior: 2, delta: -1 }],
    })
  })

  it('builds traceable packing event rows only for changed quantities', () => {
    expect(buildPackingEventRows({
      ordenId: 9,
      despachoId: 4,
      bultoId: 2,
      usuario: 'Admin',
      observacion: 'Bulto QA',
      updates: [
        { id: 1, nEntregados: 2, cantidadAnterior: 0, delta: 2 },
        { id: 2, nEntregados: 1, cantidadAnterior: 1, delta: 0 },
        { id: 3, nEntregados: 0, cantidadAnterior: 2, delta: -2 },
      ],
    })).toEqual([
      {
        ordenId: 9,
        ordenItemId: 1,
        despachoId: 4,
        bultoId: 2,
        guiaDespachoId: null,
        cantidadAnterior: 0,
        cantidadNueva: 2,
        delta: 2,
        accion: 'entrega',
        observacion: 'Bulto QA',
        usuario: 'Admin',
      },
      {
        ordenId: 9,
        ordenItemId: 3,
        despachoId: 4,
        bultoId: 2,
        guiaDespachoId: null,
        cantidadAnterior: 2,
        cantidadNueva: 0,
        delta: -2,
        accion: 'correccion',
        observacion: 'Bulto QA',
        usuario: 'Admin',
      },
    ])
  })

  it('validates optional packing reference ids when they are present', () => {
    expect(parsePackingReferenceId(null, 'despachoId')).toEqual({ id: null })
    expect(parsePackingReferenceId('', 'despachoId')).toEqual({ id: null })
    expect(parsePackingReferenceId('12', 'despachoId')).toEqual({ id: 12 })
    expect(parsePackingReferenceId('abc', 'bultoId')).toEqual({ error: 'bultoId invalido' })
  })

  it('computes basic dispatch timing metrics', () => {
    expect(buildDespachoTiempoMetrics({
      fechaInterno: '2026-05-20T08:00:00.000Z',
      fechaEntrega: '2026-05-22T14:00:00.000Z',
    })).toEqual({
      despachoHoras: 54,
      despachoDias: 2.3,
      pendiente: false,
    })

    expect(buildDespachoTiempoMetrics({
      createdAt: '2026-05-20T08:00:00.000Z',
      fechaEntrega: null,
      eliminado: false,
    }, new Date('2026-05-21T08:00:00.000Z'))).toEqual({
      despachoHoras: 24,
      despachoDias: 1,
      pendiente: true,
    })
  })
})

describe('estado logístico derivado', () => {
  it('prioriza evidencia de tracking, SII, packing y despacho en ese orden', () => {
    expect(deriveEstadoLogistico({ items: [{ cantidad: 2, nEntregados: 0 }] })).toMatchObject({ codigo: 'LISTA_PICKING' })
    expect(deriveEstadoLogistico({ items: [{ cantidad: 2, nEntregados: 0 }], despachos: [{ id: 1 }] })).toMatchObject({ codigo: 'PICKING' })
    expect(deriveEstadoLogistico({ items: [{ cantidad: 2, nEntregados: 1 }], despachos: [{ id: 1 }] })).toMatchObject({ codigo: 'PACKING' })
    expect(deriveEstadoLogistico({ items: [{ cantidad: 2, nEntregados: 2 }], despachos: [{ id: 1 }] })).toMatchObject({ codigo: 'LISTA_DESPACHO' })
    expect(deriveEstadoLogistico({ items: [{ cantidad: 2, nEntregados: 2 }], guias: [{ id: 2, dteEstado: 'emitido' }] })).toMatchObject({ codigo: 'GUIA_SII_EMITIDA' })
    expect(deriveEstadoLogistico({ tracking: { estado: 'Reparto' } })).toMatchObject({ codigo: 'REPARTO' })
  })

  it('separa inventario listo de fabricación pendiente en una venta mixta', () => {
    const items = [
      { id: 1, productoId: 10, cantidad: 3, nEntregados: 0, estadoInventario: 'inventariado' },
      { id: 2, productoId: 20, cantidad: 2, nEntregados: 0, estadoInventario: 'transitorio' },
    ]
    const preparacion = resumenPreparacion(items, [{
      id: 9,
      items: [{ productoId: 20, cantidad: 2, talleres: [{ estado: 'en_proceso' }] }],
    }])
    expect(preparacion).toMatchObject({
      disponiblePicking: 3,
      disponibleInventario: 3,
      disponibleTaller: 0,
      pendienteTaller: 2,
      esMixta: true,
    })
    expect(deriveEstadoLogistico({ items, preparacion })).toMatchObject({ codigo: 'PICKING_PARCIAL' })
  })

  it('habilita para picking una línea transitoria sólo al quedar lista en todos sus talleres', () => {
    const items = [{ id: 2, productoId: 20, cantidad: 2, nEntregados: 0, estadoInventario: 'transitorio' }]
    const preparacion = resumenPreparacion(items, [{
      id: 9,
      items: [{ productoId: 20, cantidad: 2, talleres: [{ estado: 'listo' }, { estado: 'listo' }] }],
    }])
    expect(preparacion).toMatchObject({ disponiblePicking: 2, disponibleTaller: 2, pendienteTaller: 0 })
    expect(deriveEstadoLogistico({ items, preparacion })).toMatchObject({ codigo: 'LISTA_PICKING' })
  })
})

describe('dispatch tracking helpers', () => {
  it('normalizes known logistics tracking states', () => {
    expect(normalizeTrackingEstado(' en ruta ')).toBe('En ruta')
    expect(normalizeTrackingEstado('ENTREGADO')).toBe('Entregado')
    expect(normalizeTrackingEstado('otro')).toBeNull()
  })

  it('builds tracking event data with a canonical state and user label', () => {
    expect(buildTrackingEventData({
      estado: 'incidencia',
      transporte: '  Chilexpress  ',
      ubicacion: '  Valparaiso  ',
      observacion: '  Cliente ausente  ',
      tipoIncidente: ' Cliente ausente ',
      accionTomada: ' Se reagenda entrega ',
      responsable: ' Logistica ',
      fechaCompromiso: '2026-06-03T10:15:00.000Z',
      fechaEvento: '2026-06-02T10:15:00.000Z',
    }, { nombre: 'Admin QA' })).toEqual({
      data: {
        estado: 'Incidencia',
        transporte: 'Chilexpress',
        ubicacion: 'Valparaiso',
        observacion: 'Cliente ausente',
        tipoIncidente: 'Cliente ausente',
        accionTomada: 'Se reagenda entrega',
        responsable: 'Logistica',
        fechaCompromiso: new Date('2026-06-03T10:15:00.000Z'),
        fechaEvento: new Date('2026-06-02T10:15:00.000Z'),
        usuario: 'Admin QA',
      },
    })

    expect(buildTrackingEventData({ estado: 'sin estado' })).toEqual({
      error: 'estado tracking invalido',
    })
    expect(buildTrackingEventData({ estado: 'Preparado', fechaEvento: 'bad-date' })).toEqual({
      error: 'fechaEvento invalida',
    })
    expect(buildTrackingEventData({ estado: 'Incidencia', observacion: 'Sin responsable' })).toEqual({
      error: 'Una incidencia requiere tipo, accion tomada, responsable y fecha compromiso',
    })
    expect(buildTrackingEventData({ estado: 'Preparado', tipoIncidente: 'Retraso' })).toEqual({
      error: 'campos de incidencia solo aplican a estado Incidencia',
    })
  })

  it('requires Preparado as the first event and respects the operational chain', () => {
    expect(validateTrackingTransition(undefined, 'Entregado')).toEqual({
      error: 'El primer estado del despacho debe ser Preparado',
    })
    expect(validateTrackingTransition(undefined, 'Preparado')).toBeNull()
    expect(validateTrackingTransition('Preparado', 'Entregado')).toEqual({
      error: 'Transición inválida: Preparado → Entregado',
    })
    expect(validateTrackingTransition('Preparado', 'Patio')).toBeNull()
  })
})
