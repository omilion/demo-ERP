import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import { deriveEstadoLogistico, resumenPreparacion } from '../src/routes/despachos/estado-logistico.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin') {
  return app.jwt.sign({
    id: 1,
    role,
    nombre: `Test ${role}`,
    permisosExtra: null,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

describe('Flujo Integral Bodega → Picking → Packing → Despacho → Guía SII → Seguimiento', () => {
  let app
  let token

  beforeAll(async () => {
    app = await buildApp()
    token = tokenFor(app, 'admin')
  })

  afterAll(async () => {
    if (app) await app.close()
  })

  describe('1. Reglas de Producto y Preparación (Inventariado vs Transitorio vs Mixto)', () => {
    it('producto inventariado pasa directamente a picking si está disponible', () => {
      const items = [
        { id: 101, productoId: 1, cantidad: 5, estadoInventario: 'Inventariado' },
      ]
      const odts = []
      const prep = resumenPreparacion(items, odts)
      expect(prep.pendienteTotal).toBe(5)
      expect(prep.disponibleInventario).toBe(5)
      expect(prep.disponibleTaller).toBe(0)
      expect(prep.pendienteTaller).toBe(0)
      expect(prep.disponiblePicking).toBe(5)

      const estado = deriveEstadoLogistico({ items, preparacion: prep, despachos: [], guias: [] })
      expect(estado.codigo).toBe('LISTA_PICKING')
    })

    it('producto transitorio debe pasar primero por Taller y sólo pasa a picking cuando talleres estén listos', () => {
      const items = [
        { id: 102, productoId: 2, cantidad: 3, estadoInventario: 'Transitorio' },
      ]
      // Con taller pendiente
      const odtsPendiente = [
        { id: 501, items: [{ productoId: 2, cantidad: 3, talleres: [{ estado: 'en_proceso' }] }] },
      ]
      const prepPend = resumenPreparacion(items, odtsPendiente)
      expect(prepPend.pendienteTaller).toBe(3)
      expect(prepPend.disponibleTaller).toBe(0)
      expect(prepPend.disponiblePicking).toBe(0)

      const estadoPend = deriveEstadoLogistico({ items, preparacion: prepPend, despachos: [], guias: [] })
      expect(estadoPend.codigo).toBe('EN_TALLER')

      // Con taller listo
      const odtsListo = [
        { id: 501, items: [{ productoId: 2, cantidad: 3, talleres: [{ estado: 'listo' }] }] },
      ]
      const prepListo = resumenPreparacion(items, odtsListo)
      expect(prepListo.pendienteTaller).toBe(0)
      expect(prepListo.disponibleTaller).toBe(3)
      expect(prepListo.disponiblePicking).toBe(3)

      const estadoListo = deriveEstadoLogistico({ items, preparacion: prepListo, despachos: [], guias: [] })
      expect(estadoListo.codigo).toBe('LISTA_PICKING')
    })

    it('ventas mixtas: no marcar venta completa como LISTA_DESPACHO si quedan unidades pendientes en Taller', () => {
      const items = [
        { id: 103, productoId: 1, cantidad: 10, estadoInventario: 'Inventariado' },
        { id: 104, productoId: 2, cantidad: 5, estadoInventario: 'Transitorio' },
      ]
      const odts = [
        { id: 502, items: [{ productoId: 2, cantidad: 5, talleres: [{ estado: 'pendiente' }] }] },
      ]
      const prep = resumenPreparacion(items, odts)
      expect(prep.disponibleInventario).toBe(10)
      expect(prep.pendienteTaller).toBe(5)
      expect(prep.disponiblePicking).toBe(10)

      // Aunque el packing de inventario esté listo, la venta no es LISTA_DESPACHO completa
      const packingParcial = { preparados: 10, total: 15, completo: false }
      const estado = deriveEstadoLogistico({ items, preparacion: prep, packing: packingParcial, despachos: [], guias: [] })
      expect(estado.codigo).toBe('PICKING_PARCIAL')
      expect(estado.codigo).not.toBe('LISTA_DESPACHO')
    })
  })

  describe('2. Paneles de Bodega & Cola Operativa', () => {
    it('GET /api/despachos/cola-operativa retorna lista de pedidos estructurada con stats', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/despachos/cola-operativa?etapa=picking',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.payload)
      expect(data).toHaveProperty('items')
      expect(data).toHaveProperty('stats')
      expect(Array.isArray(data.items)).toBe(true)
      expect(typeof data.stats.total).toBe('number')
    })

    it('GET /api/despachos/cola-operativa filtra por etapa (picking, packing, despacho, admin)', async () => {
      for (const etapa of ['picking', 'packing', 'despacho', 'admin']) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/despachos/cola-operativa?etapa=${etapa}`,
          headers: { authorization: `Bearer ${token}` },
        })
        expect(res.statusCode).toBe(200)
      }
    })
  })

  describe('3. Despacho Aislado de Bodega (Sin inventar venta ni interno)', () => {
    it('crea despacho aislado con motivo, responsable, destinatario y productos', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          origenTipo: 'manual',
          motivoOperacion: 'Traslado interno de muestras a sucursal norte',
          receptorRut: '77.888.999-0',
          receptorRazonSocial: 'Sucursal Norte Plastimar',
          receptorGiro: 'Comercializadora de Plásticos',
          direccion: 'Av. Industrial 456',
          comuna: 'Antofagasta',
          ciudad: 'Antofagasta',
          transporte: 'Transporte Propio',
          items: [
            { nombre: 'Malla Raschel 80% 4.20x100m', cantidad: 2, unidad: 'ROLLO' },
          ],
        },
      })
      expect(res.statusCode).toBe(200)
      const desp = JSON.parse(res.payload)
      expect(desp.origenTipo).toBe('manual')
      expect(desp.motivoOperacion).toBe('Traslado interno de muestras a sucursal norte')
      expect(desp.ordenId).toBeNull()
      expect(desp.interno).toBeNull()
      expect(desp.items).toHaveLength(1)
    })

    it('rechaza despacho aislado si no incluye motivo de operación', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          origenTipo: 'manual',
          motivoOperacion: '',
          direccion: 'Calle Test 123',
          comuna: 'Santiago',
        },
      })
      expect(res.statusCode).toBe(400)
      const data = JSON.parse(res.payload)
      expect(data.error).toMatch(/motivo/i)
    })
  })

  describe('4. Preparación de Guía DTE 52 para Despacho Aislado', () => {
    let despachoAisladoId = null
    let guiaId = null

    it('crea despacho aislado base para la guía', async () => {
      const despRes = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          origenTipo: 'manual',
          motivoOperacion: 'Devolución de mercadería defectuosa a proveedor',
          receptorRut: '76.111.222-3',
          receptorRazonSocial: 'Proveedor Plásticos Chile SA',
          receptorGiro: 'Fabricación y Venta de Resinas',
          direccion: 'Camino Lonquén 1000',
          comuna: 'Maipú',
          ciudad: 'Santiago',
          transporte: 'Starken',
          items: [
            { nombre: 'Carrete Hilo Polietileno Azul', cantidad: 10, unidad: 'UN' },
          ],
        },
      })
      expect(despRes.statusCode).toBe(200)
      const desp = JSON.parse(despRes.payload)
      despachoAisladoId = desp.id
      expect(despachoAisladoId).toBeDefined()
    })

    it('guarda guía de despacho para despacho aislado como borrador (DTE 52 preparada)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/despachos/guias',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          origenTipo: 'manual',
          despachoId: despachoAisladoId,
          indTraslado: 6,
          tipoDespacho: 2,
          receptor: {
            rut: '76.111.222-3',
            razonSocial: 'Proveedor Plásticos Chile SA',
            giro: 'Fabricación y Venta de Resinas',
            direccion: 'Camino Lonquén 1000',
            comuna: 'Maipú',
            ciudad: 'Santiago',
          },
          items: [
            { nombre: 'Carrete Hilo Polietileno Azul', cantidad: 10, unidad: 'UN' },
          ],
          borrador: true,
          emitirSii: false,
        },
      })
      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.payload)
      expect(data).toHaveProperty('guia')
      expect(data).toHaveProperty('documento')
      expect(data.documento.tipoDte).toBe(52)
      expect(data.documento.estado).toBe('borrador')
      expect(data.guia.despachoId).toBe(despachoAisladoId)
      expect(data.guia.ordenId).toBeNull()
      guiaId = data.guia.id
    })

    it('GET /api/despachos/guias/:id entrega datos de DTE 52, checklist de faltantes y receptor', async () => {
      expect(guiaId).toBeDefined()
      const res = await app.inject({
        method: 'GET',
        url: `/api/despachos/guias/${guiaId}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.payload)
      expect(data.guia.id).toBe(guiaId)
      expect(data.documentoDte).not.toBeNull()
      expect(data.documentoDte.estado).toBe('borrador')
      expect(data.validacionDte52).toHaveProperty('valido')
      expect(data.validacionDte52).toHaveProperty('faltantes')
    })
  })
})
