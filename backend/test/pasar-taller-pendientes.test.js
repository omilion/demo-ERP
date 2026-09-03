import { describe, expect, it } from 'vitest'
import { buildPendienteRow, resolveTallerOrigen } from '../src/routes/pasar-taller/index.js'

const TALLER_ESPUMAS = { id: 1, nombre: 'Espumas', activo: true }
const TALLER_CORTE = { id: 2, nombre: 'Corte', activo: true }
const byKind = new Map([['espumas', TALLER_ESPUMAS], ['corte', TALLER_CORTE]])

const PRODUCTO_TRANSITORIO = {
  id: 10,
  codigoInterno: 'COLCH-100',
  nombre: 'Colchoneta 100x50',
  estadoInventario: 'transitorio',
  activo: true,
  tallerId: null,
}

function ordenCon(items) {
  return { id: 500, nInterno: 18520, tipo: 'Normal', createdAt: new Date(), fechaPlazo: null, items }
}

function itemVenta(overrides = {}) {
  return {
    id: 900,
    productoId: PRODUCTO_TRANSITORIO.id,
    codigoInterno: PRODUCTO_TRANSITORIO.codigoInterno,
    nombre: PRODUCTO_TRANSITORIO.nombre,
    cantidad: 10,
    nEntregados: 0,
    eliminado: false,
    ...overrides,
  }
}

function odtCon(estado, items = []) {
  return { id: 77, estado, eliminado: false, items }
}

function itemOdt(cantidad) {
  return { id: 1, codigoInterno: PRODUCTO_TRANSITORIO.codigoInterno, nombre: PRODUCTO_TRANSITORIO.nombre, cantidad, talleres: [] }
}

const productosMap = { [PRODUCTO_TRANSITORIO.id]: PRODUCTO_TRANSITORIO }

describe('resolveTallerOrigen', () => {
  it('marca origen "producto" cuando el producto trae taller explicito', () => {
    const producto = { ...PRODUCTO_TRANSITORIO, tallerId: 2 }
    expect(resolveTallerOrigen(producto, byKind)).toBe('producto')
  })

  it('marca origen "nombre" cuando el nombre del producto delata el taller', () => {
    const producto = { ...PRODUCTO_TRANSITORIO, nombre: 'Mesa de corte industrial' }
    expect(resolveTallerOrigen(producto, byKind)).toBe('nombre')
  })

  // El caso que hoy pasa inadvertido: autoNotifyTaller cae al fallback y manda
  // el producto a Espumas sin que nadie lo confirme.
  it('marca origen "defecto" cuando ni el producto ni su nombre definen taller', () => {
    expect(resolveTallerOrigen(PRODUCTO_TRANSITORIO, byKind)).toBe('defecto')
  })
})

describe('buildPendienteRow', () => {
  it('reporta sin_odt cuando la venta tiene transitorios y ninguna ODT', () => {
    const row = buildPendienteRow(ordenCon([itemVenta()]), null, productosMap, { odts: [], odt: null }, byKind)
    expect(row.motivos).toContain('sin_odt')
    expect(row.itemsFaltantes).toBe(1)
    expect(row.odtId).toBeNull()
  })

  it('reporta odt_cerrada cuando la ODT ya esta terminada y el item no entro', () => {
    const odt = odtCon('Terminada', [])
    const row = buildPendienteRow(ordenCon([itemVenta()]), null, productosMap, { odts: [odt], odt }, byKind)
    expect(row.motivos).toContain('odt_cerrada')
    expect(row.odtAbierta).toBe(false)
  })

  it('reporta items_faltantes cuando la ODT esta abierta pero el item no llego', () => {
    const odt = odtCon('Pendiente', [])
    const row = buildPendienteRow(ordenCon([itemVenta()]), null, productosMap, { odts: [odt], odt }, byKind)
    expect(row.motivos).toContain('items_faltantes')
    expect(row.motivos).not.toContain('odt_cerrada')
  })

  it('reporta cantidad_desfasada cuando la ODT tiene menos unidades que la venta', () => {
    const odt = odtCon('Pendiente', [itemOdt(8)])
    const row = buildPendienteRow(ordenCon([itemVenta({ cantidad: 10 })]), null, productosMap, { odts: [odt], odt }, byKind)
    expect(row.motivos).toContain('cantidad_desfasada')
    expect(row.itemsDesfasados).toBe(1)
  })

  it('no reporta nada cuando el item ya esta en taller con la cantidad correcta y taller explicito', () => {
    const producto = { ...PRODUCTO_TRANSITORIO, tallerId: 1 }
    const odt = odtCon('Pendiente', [itemOdt(10)])
    const row = buildPendienteRow(
      ordenCon([itemVenta({ cantidad: 10 })]),
      null,
      { [producto.id]: producto },
      { odts: [odt], odt },
      byKind,
    )
    expect(row).toBeNull()
  })

  // Una venta puede acumular varias ODTs. Mirar solo la primera daria por
  // faltante un producto que la segunda ODT ya tiene en fabricacion.
  it('considera todas las ODTs de la venta, no solo la primera', () => {
    const producto = { ...PRODUCTO_TRANSITORIO, tallerId: 1 }
    const cerrada = odtCon('Terminada', [])
    const abierta = { ...odtCon('Pendiente', [itemOdt(10)]), id: 78 }
    const row = buildPendienteRow(
      ordenCon([itemVenta({ cantidad: 10 })]),
      null,
      { [producto.id]: producto },
      { odts: [cerrada, abierta], odt: cerrada },
      byKind,
    )
    expect(row).toBeNull()
  })

  it('reporta la ODT abierta como referencia cuando convive con una cerrada', () => {
    const cerrada = odtCon('Terminada', [])
    const abierta = { ...odtCon('Pendiente', []), id: 78 }
    const row = buildPendienteRow(
      ordenCon([itemVenta()]),
      null,
      productosMap,
      { odts: [cerrada, abierta], odt: cerrada },
      byKind,
    )
    expect(row.odtId).toBe(78)
    expect(row.odtAbierta).toBe(true)
    expect(row.motivos).toContain('items_faltantes')
    expect(row.motivos).not.toContain('odt_cerrada')
  })

  it('sigue reportando odt_cerrada mientras no exista una OT nueva que reciba el trabajo', () => {
    const cerrada = odtCon('Anulada', [])
    const row = buildPendienteRow(ordenCon([itemVenta()]), null, productosMap, { odts: [cerrada], odt: cerrada }, byKind)
    expect(row.motivos).toContain('odt_cerrada')
    expect(row.odtAbierta).toBe(false)
  })

  it('deja de reportar la venta una vez que la OT nueva recibe los productos', () => {
    const producto = { ...PRODUCTO_TRANSITORIO, tallerId: 1 }
    const cerrada = odtCon('Entregada', [])
    const nueva = { ...odtCon('Pendiente', [itemOdt(10)]), id: 79 }
    const row = buildPendienteRow(
      ordenCon([itemVenta({ cantidad: 10 })]),
      null,
      { [producto.id]: producto },
      { odts: [cerrada, nueva], odt: nueva },
      byKind,
    )
    expect(row).toBeNull()
  })

  it('ignora items ya entregados por completo', () => {
    const row = buildPendienteRow(
      ordenCon([itemVenta({ cantidad: 10, nEntregados: 10 })]),
      null,
      productosMap,
      { odts: [], odt: null },
      byKind,
    )
    expect(row).toBeNull()
  })

  it('ignora ventas sin productos transitorios', () => {
    const producto = { ...PRODUCTO_TRANSITORIO, estadoInventario: 'normal' }
    const row = buildPendienteRow(
      ordenCon([itemVenta()]),
      null,
      { [producto.id]: producto },
      { odts: [], odt: null },
      byKind,
    )
    expect(row).toBeNull()
  })
})
