import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

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

let seq = 1

async function getProducto(app) {
  const existing = await app.prisma.producto.findFirst({ select: { id: true, codigoInterno: true, nombre: true } })
  if (existing) return existing
  return app.prisma.producto.create({
    data: {
      codigoInterno: `TEST-DESP-${seq++}`,
      nombre: 'Producto despacho test',
      precioLista: 1000,
      stock: 10,
    },
    select: { id: true, codigoInterno: true, nombre: true },
  })
}

async function createFixture(app, overrides = {}) {
  const user = await app.prisma.user.findFirst({ select: { id: true } })
  const producto = await getProducto(app)
  const marker = `${Date.now()}-${seq++}`
  const cliente = await app.prisma.cliente.create({
    data: {
      rut: `desp-${marker}`,
      nombre: `Cliente Despacho ${marker}`,
      razonSocial: `Cliente Despacho ${marker}`,
      email: `desp-${marker}@test.local`,
      region: 'Region Test',
      comuna: 'Comuna Test',
      activo: true,
    },
  })
  const sucursal = await app.prisma.clienteSucursal.create({
    data: {
      clienteId: cliente.id,
      nombre: 'Sucursal principal',
      direccion: 'Calle despacho 123',
      region: 'Region Test',
      comuna: 'Comuna Test',
      ciudad: 'Ciudad Test',
      isPrincipal: true,
      activo: true,
    },
  })
  const nInterno = 800000000 + seq++
  const orden = await app.prisma.orden.create({
    data: {
      nInterno,
      tipo: overrides.tipo || 'Venta sala',
      estado: overrides.estado || 'Activa',
      estadoPago: overrides.estadoPago || 'No pagada',
      estadoEntrega: overrides.estadoEntrega || 'Pendiente entrega',
      clienteId: cliente.id,
      clienteSucursalId: sucursal.id,
      rutCliente: cliente.rut,
      userId: user.id,
      licitacion: overrides.licitacion || `OC-${marker}`,
      eliminada: overrides.eliminada || false,
      items: {
        create: [{
          productoId: producto.id,
          codigoInterno: producto.codigoInterno,
          nombre: producto.nombre,
          cantidad: 2,
          precioUnitario: 1000,
        }],
      },
    },
  })
  return { marker, cliente, sucursal, orden }
}

async function cleanupFixture(app, fixture) {
  if (!fixture) return
  await app.prisma.movimientoCaja.deleteMany({ where: { ordenId: fixture.orden.id } }).catch(() => {})
  await app.prisma.guiaDespacho.deleteMany({ where: { ordenId: fixture.orden.id } }).catch(() => {})
  await app.prisma.despacho.deleteMany({ where: { ordenId: fixture.orden.id } }).catch(() => {})
  await app.prisma.odt.deleteMany({ where: { ordenId: fixture.orden.id } }).catch(() => {})
  await app.prisma.orden.delete({ where: { id: fixture.orden.id } }).catch(() => {})
  await app.prisma.clienteSucursal.deleteMany({ where: { clienteId: fixture.cliente.id } }).catch(() => {})
  await app.prisma.cliente.delete({ where: { id: fixture.cliente.id } }).catch(() => {})
}

describe('despachos legacy matrix parity', () => {
  let app, adminToken

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    adminToken = tokenFor(app)
  })

  afterAll(async () => {
    await app.close()
  })

  it('lists pending sales even when no despacho record exists', async () => {
    const fixture = await createFixture(app)
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/despachos/matriz?nInterno=${fixture.orden.nInterno}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.total).toBe(1)
      expect(body.items[0]).toMatchObject({
        ordenId: fixture.orden.id,
        nInterno: fixture.orden.nInterno,
        estadoPago: 'No pagada',
        estadoEntrega: 'Pendiente entrega',
        region: 'Region Test',
        comuna: 'Comuna Test',
      })
      expect(body.items[0].itemsDetalle).toHaveLength(1)
      expect(body.items[0].total).toBe(2000)
    } finally {
      await cleanupFixture(app, fixture)
    }
  })

  it('filters the matrix by guia and nota de credito documents', async () => {
    const fixture = await createFixture(app)
    const guia = `GD-${fixture.marker}`
    const nc = `NC-${fixture.marker}`
    try {
      await app.prisma.guiaDespacho.create({
        data: {
          ordenId: fixture.orden.id,
          nInterno: fixture.orden.nInterno,
          nGuia: guia,
          fechaGuia: new Date(),
        },
      })
      await app.prisma.movimientoCaja.create({
        data: {
          tipo: 'Ingreso',
          monto: 100,
          medioPago: 'Credito',
          ordenId: fixture.orden.id,
          documento: 'NC',
          tipoDocumento: 'NC',
          nDoc: nc,
          fecha: new Date(),
        },
      })

      const byGuia = await app.inject({
        method: 'GET',
        url: `/api/despachos/matriz?guia=${encodeURIComponent(guia)}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(byGuia.statusCode).toBe(200)
      expect(JSON.parse(byGuia.body).items.map(item => item.ordenId)).toContain(fixture.orden.id)

      const byNc = await app.inject({
        method: 'GET',
        url: `/api/despachos/matriz?nc=${encodeURIComponent(nc)}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(byNc.statusCode).toBe(200)
      expect(JSON.parse(byNc.body).items.map(item => item.ordenId)).toContain(fixture.orden.id)
    } finally {
      await cleanupFixture(app, fixture)
    }
  })

  it('soft deletes despachos and recalculates stale delivery state', async () => {
    const fixture = await createFixture(app)
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixture.orden.id, fechaEntrega: '2026-05-26', tipoDespacho: 'Despacho test' },
      })
      expect(createRes.statusCode).toBe(200)
      const despacho = JSON.parse(createRes.body)
      const delivered = await app.prisma.orden.findUnique({ where: { id: fixture.orden.id } })
      expect(delivered.estadoEntrega).toBe('Entregada')
      expect(delivered.fechaEstadoEntrega).toBeTruthy()

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/despachos/${despacho.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { motivo: 'correccion test' },
      })
      expect(deleteRes.statusCode).toBe(200)
      expect(JSON.parse(deleteRes.body).eliminado).toBe(true)

      const hidden = await app.inject({
        method: 'GET',
        url: `/api/despachos?ordenId=${fixture.orden.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(JSON.parse(hidden.body).items).toHaveLength(0)
      const recalculated = await app.prisma.orden.findUnique({ where: { id: fixture.orden.id } })
      expect(recalculated.estadoEntrega).toBe('Pendiente entrega')
    } finally {
      await cleanupFixture(app, fixture)
    }
  })

  it('rejects dispatch records for eliminated sales', async () => {
    const fixture = await createFixture(app, { eliminada: true })
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixture.orden.id, fechaEntrega: '2026-05-26' },
      })
      expect(res.statusCode).toBe(409)
      expect(JSON.parse(res.body).error).toMatch(/Orden no activa|eliminada/)
    } finally {
      await cleanupFixture(app, fixture)
    }
  })

  it('recalculates delivery state when a despacho edit removes delivery signals', async () => {
    const fixture = await createFixture(app)
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixture.orden.id, fechaEntrega: '2026-05-26' },
      })
      expect(createRes.statusCode).toBe(200)
      expect((await app.prisma.orden.findUnique({ where: { id: fixture.orden.id } })).estadoEntrega).toBe('Entregada')

      const despacho = JSON.parse(createRes.body)
      const updateRes = await app.inject({
        method: 'PUT',
        url: `/api/despachos/${despacho.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { fechaEntrega: '', parcial: false },
      })
      expect(updateRes.statusCode).toBe(200)
      const recalculated = await app.prisma.orden.findUnique({ where: { id: fixture.orden.id } })
      expect(recalculated.estadoEntrega).toBe('Pendiente entrega')
    } finally {
      await cleanupFixture(app, fixture)
    }
  })

  it('records logistics tracking events and syncs delivered state', async () => {
    const fixture = await createFixture(app)
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixture.orden.id, tipoDespacho: 'Despacho tracking', transporte: 'Inicial' },
      })
      expect(createRes.statusCode).toBe(200)
      const despacho = JSON.parse(createRes.body)

      const invalid = await app.inject({
        method: 'POST',
        url: `/api/despachos/${despacho.id}/tracking`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { estado: 'Sin estado' },
      })
      expect(invalid.statusCode).toBe(400)

      const enRuta = await app.inject({
        method: 'POST',
        url: `/api/despachos/${despacho.id}/tracking`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          estado: 'en ruta',
          transporte: 'Transportista QA',
          ubicacion: 'Valparaiso',
          observacion: 'Carga retirada',
          fechaEvento: '2026-06-02T10:00:00.000Z',
        },
      })
      expect(enRuta.statusCode).toBe(200)
      expect(JSON.parse(enRuta.body).evento).toMatchObject({
        despachoId: despacho.id,
        estado: 'En ruta',
        transporte: 'Transportista QA',
        ubicacion: 'Valparaiso',
        usuario: 'Test admin',
      })

      const list = await app.inject({
        method: 'GET',
        url: `/api/despachos?ordenId=${fixture.orden.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(list.statusCode).toBe(200)
      expect(JSON.parse(list.body).items[0]).toMatchObject({
        id: despacho.id,
        transporte: 'Transportista QA',
        tracking: { estado: 'En ruta', ubicacion: 'Valparaiso' },
      })

      const delivered = await app.inject({
        method: 'POST',
        url: `/api/despachos/${despacho.id}/tracking`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { estado: 'Entregado', fechaEvento: '2026-06-02T12:00:00.000Z' },
      })
      expect(delivered.statusCode).toBe(200)
      expect(JSON.parse(delivered.body).latest.estado).toBe('Entregado')

      const trace = await app.inject({
        method: 'GET',
        url: `/api/despachos/${despacho.id}/tracking`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(trace.statusCode).toBe(200)
      expect(JSON.parse(trace.body).eventos.map(evento => evento.estado)).toEqual(['Entregado', 'En ruta'])
      const order = await app.prisma.orden.findUnique({ where: { id: fixture.orden.id } })
      expect(order.estadoEntrega).toBe('Entregada')
    } finally {
      await cleanupFixture(app, fixture)
    }
  })

  it('records structured incident fields and filters dispatches with incidents', async () => {
    const fixtureA = await createFixture(app)
    const fixtureB = await createFixture(app)
    try {
      const createA = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixtureA.orden.id, tipoDespacho: 'Despacho con incidencia' },
      })
      const createB = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixtureB.orden.id, tipoDespacho: 'Despacho normal' },
      })
      expect(createA.statusCode).toBe(200)
      expect(createB.statusCode).toBe(200)
      const despachoA = JSON.parse(createA.body)
      const despachoB = JSON.parse(createB.body)

      const legacyIncident = await app.inject({
        method: 'POST',
        url: `/api/despachos/${despachoA.id}/tracking`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { estado: 'Incidencia', observacion: 'Falta responsable' },
      })
      expect(legacyIncident.statusCode).toBe(200)
      expect(JSON.parse(legacyIncident.body).evento).toMatchObject({
        estado: 'Incidencia',
        observacion: 'Falta responsable',
      })

      const incident = await app.inject({
        method: 'POST',
        url: `/api/despachos/${despachoA.id}/tracking`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          estado: 'Incidencia',
          tipoIncidente: 'Producto faltante',
          accionTomada: 'Preparar reposicion',
          responsable: 'Bodega',
          fechaCompromiso: '2026-06-05T09:00:00.000Z',
          observacion: 'Falta una almohada',
        },
      })
      expect(incident.statusCode).toBe(200)
      expect(JSON.parse(incident.body).evento).toMatchObject({
        despachoId: despachoA.id,
        estado: 'Incidencia',
        tipoIncidente: 'Producto faltante',
        accionTomada: 'Preparar reposicion',
        responsable: 'Bodega',
      })

      const normalTrack = await app.inject({
        method: 'POST',
        url: `/api/despachos/${despachoB.id}/tracking`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { estado: 'Preparado' },
      })
      expect(normalTrack.statusCode).toBe(200)

      const list = await app.inject({
        method: 'GET',
        url: '/api/despachos?conIncidencia=true',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(list.statusCode).toBe(200)
      const items = JSON.parse(list.body).items
      expect(items.some(item => item.id === despachoA.id)).toBe(true)
      expect(items.some(item => item.id === despachoB.id)).toBe(false)
      expect(items.find(item => item.id === despachoA.id).incidencia).toMatchObject({
        tipoIncidente: 'Producto faltante',
        accionTomada: 'Preparar reposicion',
        responsable: 'Bodega',
      })

      const trace = await app.inject({
        method: 'GET',
        url: `/api/despachos/${despachoA.id}/tracking`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(trace.statusCode).toBe(200)
      expect(JSON.parse(trace.body).latestIncidencia).toMatchObject({
        tipoIncidente: 'Producto faltante',
        accionTomada: 'Preparar reposicion',
      })
      const order = await app.prisma.orden.findUnique({ where: { id: fixtureA.orden.id } })
      expect(order.estadoEntrega).toBe('Pendiente entrega')

      const exportRes = await app.inject({
        method: 'GET',
        url: '/api/despachos/export/registros?conIncidencia=true',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(exportRes.statusCode).toBe(200)
      expect(exportRes.body).toContain('Incidencia Tipo')
      expect(exportRes.body).toContain('Producto faltante')
      expect(exportRes.body).toContain('Preparar reposicion')
    } finally {
      await cleanupFixture(app, fixtureA)
      await cleanupFixture(app, fixtureB)
    }
  })

  it('recalculates both orders when a despacho is moved to another sale', async () => {
    const fixtureA = await createFixture(app)
    const fixtureB = await createFixture(app)
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixtureA.orden.id, fechaEntrega: '2026-05-26' },
      })
      expect(createRes.statusCode).toBe(200)
      const despacho = JSON.parse(createRes.body)

      const updateRes = await app.inject({
        method: 'PUT',
        url: `/api/despachos/${despacho.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixtureB.orden.id },
      })
      expect(updateRes.statusCode).toBe(200)
      const orderA = await app.prisma.orden.findUnique({ where: { id: fixtureA.orden.id } })
      const orderB = await app.prisma.orden.findUnique({ where: { id: fixtureB.orden.id } })
      expect(orderA.estadoEntrega).toBe('Pendiente entrega')
      expect(orderB.estadoEntrega).toBe('Entregada')
      expect(JSON.parse(updateRes.body).interno).toBe(String(fixtureB.orden.nInterno))
    } finally {
      await cleanupFixture(app, fixtureA)
      await cleanupFixture(app, fixtureB)
    }
  })

  it('edits, deduplicates and soft deletes guias with delivery recalculation', async () => {
    const fixtureA = await createFixture(app)
    const fixtureB = await createFixture(app)
    const fixtureC = await createFixture(app)
    const guia = `GD-EDIT-${fixtureA.marker}`
    const guiaDuplicate = `GD-DUP-${fixtureA.marker}`
    const vendedorToken = tokenFor(app, 'vendedor')
    try {
      await app.prisma.guiaDespacho.create({
        data: {
          ordenId: fixtureC.orden.id,
          nInterno: fixtureC.orden.nInterno,
          nGuia: guiaDuplicate,
          fechaGuia: new Date(),
        },
      })
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/despachos/guias',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixtureA.orden.id, nGuia: guia, fechaGuia: '2026-05-26' },
      })
      expect(createRes.statusCode).toBe(200)
      const created = JSON.parse(createRes.body)
      expect((await app.prisma.orden.findUnique({ where: { id: fixtureA.orden.id } })).estadoEntrega).toBe('Entregada')

      const duplicateCreate = await app.inject({
        method: 'POST',
        url: '/api/despachos/guias',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixtureA.orden.id, nGuia: guiaDuplicate, fechaGuia: '2026-05-26' },
      })
      expect(duplicateCreate.statusCode).toBe(409)

      const duplicateUpdate = await app.inject({
        method: 'PUT',
        url: `/api/despachos/guias/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { nGuia: guiaDuplicate },
      })
      expect(duplicateUpdate.statusCode).toBe(409)

      const updateRes = await app.inject({
        method: 'PUT',
        url: `/api/despachos/guias/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixtureB.orden.id, nGuia: `${guia}-B`, origen: 'Correccion' },
      })
      expect(updateRes.statusCode).toBe(200)
      expect(JSON.parse(updateRes.body)).toMatchObject({
        ordenId: fixtureB.orden.id,
        nInterno: fixtureB.orden.nInterno,
        nGuia: `${guia}-B`,
        origen: 'Correccion',
      })
      expect((await app.prisma.orden.findUnique({ where: { id: fixtureA.orden.id } })).estadoEntrega).toBe('Pendiente entrega')
      expect((await app.prisma.orden.findUnique({ where: { id: fixtureB.orden.id } })).estadoEntrega).toBe('Entregada')

      const deleteWithoutReason = await app.inject({
        method: 'DELETE',
        url: `/api/despachos/guias/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(deleteWithoutReason.statusCode).toBe(400)

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/despachos/guias/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { motivo: 'guia duplicada' },
      })
      expect(deleteRes.statusCode).toBe(200)
      expect(JSON.parse(deleteRes.body).motivoEliminacion).toBe('guia duplicada')
      expect((await app.prisma.orden.findUnique({ where: { id: fixtureB.orden.id } })).estadoEntrega).toBe('Pendiente entrega')

      const recreateDeletedDuplicate = await app.inject({
        method: 'POST',
        url: '/api/despachos/guias',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixtureB.orden.id, nGuia: `${guia}-B`, fechaGuia: '2026-05-26' },
      })
      expect(recreateDeletedDuplicate.statusCode).toBe(409)

      const readOnlyDeletedGuides = await app.inject({
        method: 'GET',
        url: `/api/despachos/guias/list?ordenId=${fixtureB.orden.id}&includeEliminados=true`,
        headers: { authorization: `Bearer ${vendedorToken}` },
      })
      expect(readOnlyDeletedGuides.statusCode).toBe(403)

      const adminDeletedGuides = await app.inject({
        method: 'GET',
        url: `/api/despachos/guias/list?ordenId=${fixtureB.orden.id}&includeEliminados=true`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(adminDeletedGuides.statusCode).toBe(200)
      expect(JSON.parse(adminDeletedGuides.body).items[0]).toMatchObject({
        eliminado: true,
        motivoEliminacion: 'guia duplicada',
      })

      const guideExport = await app.inject({
        method: 'GET',
        url: `/api/despachos/guias/export?ordenId=${fixtureB.orden.id}&includeEliminados=true`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(guideExport.statusCode).toBe(200)
      expect(guideExport.headers['content-type']).toContain('text/csv')
      expect(guideExport.body).toContain('guia duplicada')
    } finally {
      await cleanupFixture(app, fixtureA)
      await cleanupFixture(app, fixtureB)
      await cleanupFixture(app, fixtureC)
    }
  })

  it('guards deleted dispatches from read-only users and exports full filtered registros', async () => {
    const fixture = await createFixture(app)
    const vendedorToken = tokenFor(app, 'vendedor')
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixture.orden.id, fechaEntrega: '2026-05-26', tipoDespacho: 'Export test' },
      })
      expect(createRes.statusCode).toBe(200)
      const despacho = JSON.parse(createRes.body)
      const deleteWithoutReason = await app.inject({
        method: 'DELETE',
        url: `/api/despachos/${despacho.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(deleteWithoutReason.statusCode).toBe(400)

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/despachos/${despacho.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { motivo: 'export eliminado' },
      })
      expect(deleteRes.statusCode).toBe(200)

      const readOnly = await app.inject({
        method: 'GET',
        url: `/api/despachos?ordenId=${fixture.orden.id}&includeEliminados=true`,
        headers: { authorization: `Bearer ${vendedorToken}` },
      })
      expect(readOnly.statusCode).toBe(403)

      const adminList = await app.inject({
        method: 'GET',
        url: `/api/despachos?ordenId=${fixture.orden.id}&includeEliminados=true`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(adminList.statusCode).toBe(200)
      expect(JSON.parse(adminList.body).items[0]).toMatchObject({
        eliminado: true,
        motivoEliminacion: 'export eliminado',
      })

      const exportRes = await app.inject({
        method: 'GET',
        url: `/api/despachos/export/registros?ordenId=${fixture.orden.id}&includeEliminados=true`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(exportRes.statusCode).toBe(200)
      expect(exportRes.headers['content-type']).toContain('text/csv')
      expect(exportRes.body).toContain('export eliminado')
    } finally {
      await cleanupFixture(app, fixture)
    }
  })

  it('links a guia to a despacho and scopes packing quantities to that despacho', async () => {
    const fixtureA = await createFixture(app)
    const fixtureB = await createFixture(app)
    try {
      const item = await app.prisma.ordenItem.findFirst({ where: { ordenId: fixtureA.orden.id } })

      const despachoRes = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixtureA.orden.id, tipoDespacho: 'Parcial' },
      })
      expect(despachoRes.statusCode).toBe(200)
      const despacho = JSON.parse(despachoRes.body)

      // Un despacho de otra orden no puede asociarse a esta guia.
      const otroDespachoRes = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixtureB.orden.id },
      })
      const otroDespacho = JSON.parse(otroDespachoRes.body)
      const guiaMismatch = await app.inject({
        method: 'POST',
        url: '/api/despachos/guias',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixtureA.orden.id, nGuia: `GD-LINK-BAD-${fixtureA.marker}`, despachoId: otroDespacho.id },
      })
      expect(guiaMismatch.statusCode).toBe(400)

      const guiaRes = await app.inject({
        method: 'POST',
        url: '/api/despachos/guias',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixtureA.orden.id, nGuia: `GD-LINK-${fixtureA.marker}`, despachoId: despacho.id },
      })
      expect(guiaRes.statusCode).toBe(200)
      expect(JSON.parse(guiaRes.body).despachoId).toBe(despacho.id)

      // Empaca solo 1 de los 2 unidades del item para este despacho (envio parcial).
      const packRes = await app.inject({
        method: 'PUT',
        url: `/api/despachos/ordenes/${fixtureA.orden.id}/packing`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { despachoId: despacho.id, items: [{ itemId: item.id, nEntregados: 1 }] },
      })
      expect(packRes.statusCode).toBe(200)

      const trace = await app.inject({
        method: 'GET',
        url: `/api/despachos/ordenes/${fixtureA.orden.id}/packing?despachoId=${despacho.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(trace.statusCode).toBe(200)
      const traceBody = JSON.parse(trace.body)
      expect(traceBody.packedDespacho).toEqual([{ ordenItemId: item.id, cantidad: 1 }])

      // Sin despachoId en la query no se calcula el desglose por despacho.
      const traceSinFiltro = await app.inject({
        method: 'GET',
        url: `/api/despachos/ordenes/${fixtureA.orden.id}/packing`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(JSON.parse(traceSinFiltro.body).packedDespacho).toBeUndefined()
    } finally {
      await cleanupFixture(app, fixtureA)
      await cleanupFixture(app, fixtureB)
    }
  })

  it('packs against a pending guia (sin despacho) and backfills despachoId once se asigna', async () => {
    const fixture = await createFixture(app)
    try {
      const item = await app.prisma.ordenItem.findFirst({ where: { ordenId: fixture.orden.id } })

      const guiaRes = await app.inject({
        method: 'POST',
        url: '/api/despachos/guias',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixture.orden.id, nGuia: `GD-PEND-${fixture.marker}` },
      })
      expect(guiaRes.statusCode).toBe(200)
      const guia = JSON.parse(guiaRes.body)
      expect(guia.despachoId).toBeNull()

      // Empaca 1 de 2 directo contra la guia, sin ningun despacho todavia.
      const packRes = await app.inject({
        method: 'PUT',
        url: `/api/despachos/ordenes/${fixture.orden.id}/packing`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { guiaDespachoId: guia.id, items: [{ itemId: item.id, nEntregados: 1 }] },
      })
      expect(packRes.statusCode).toBe(200)

      const traceGuia = await app.inject({
        method: 'GET',
        url: `/api/despachos/ordenes/${fixture.orden.id}/packing?guiaDespachoId=${guia.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(JSON.parse(traceGuia.body).packedGuia).toEqual([{ ordenItemId: item.id, cantidad: 1 }])

      const eventoPendiente = await app.prisma.packingEvento.findFirst({ where: { guiaDespachoId: guia.id } })
      expect(eventoPendiente.despachoId).toBeNull()

      // Se crea el despacho y se le asigna la guia -> el evento de packing
      // que estaba pendiente debe quedar tambien contado en ese despacho.
      const despachoRes = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixture.orden.id },
      })
      const despacho = JSON.parse(despachoRes.body)
      const asignarRes = await app.inject({
        method: 'PUT',
        url: `/api/despachos/guias/${guia.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { despachoId: despacho.id },
      })
      expect(asignarRes.statusCode).toBe(200)
      expect(JSON.parse(asignarRes.body).despachoId).toBe(despacho.id)

      const traceDespacho = await app.inject({
        method: 'GET',
        url: `/api/despachos/ordenes/${fixture.orden.id}/packing?despachoId=${despacho.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(JSON.parse(traceDespacho.body).packedDespacho).toEqual([{ ordenItemId: item.id, cantidad: 1 }])
    } finally {
      await cleanupFixture(app, fixture)
    }
  })

  it('returns guia detail with despacho, orden/cliente and only the items sent in that guia', async () => {
    const fixture = await createFixture(app)
    try {
      const item = await app.prisma.ordenItem.findFirst({ where: { ordenId: fixture.orden.id } })
      const despachoRes = await app.inject({
        method: 'POST',
        url: '/api/despachos',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixture.orden.id, transporte: 'Starken' },
      })
      const despacho = JSON.parse(despachoRes.body)
      const guiaRes = await app.inject({
        method: 'POST',
        url: '/api/despachos/guias',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixture.orden.id, nGuia: `GD-PRINT-${fixture.marker}`, despachoId: despacho.id },
      })
      const guia = JSON.parse(guiaRes.body)
      await app.inject({
        method: 'PUT',
        url: `/api/despachos/ordenes/${fixture.orden.id}/packing`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { guiaDespachoId: guia.id, despachoId: despacho.id, items: [{ itemId: item.id, nEntregados: 1 }] },
      })

      const detalleRes = await app.inject({
        method: 'GET',
        url: `/api/despachos/guias/${guia.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(detalleRes.statusCode).toBe(200)
      const detalle = JSON.parse(detalleRes.body)
      expect(detalle.guia.id).toBe(guia.id)
      expect(detalle.despacho.transporte).toBe('Starken')
      expect(detalle.orden.nInterno).toBe(fixture.orden.nInterno)
      expect(detalle.orden.cliente.razonSocial).toBe(fixture.cliente.razonSocial)
      expect(detalle.items).toEqual([{ id: item.id, nombre: item.nombre, codigoInterno: item.codigoInterno, cantidad: item.cantidad, enviado: 1 }])
    } finally {
      await cleanupFixture(app, fixture)
    }
  })

  it('auto-genera N guia unico (distinto de n_interno) cuando no se indica, incluso para 2 guias de la misma orden', async () => {
    const fixture = await createFixture(app)
    try {
      const primera = await app.inject({
        method: 'POST',
        url: '/api/despachos/guias',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixture.orden.id },
      })
      expect(primera.statusCode).toBe(200)
      const guia1 = JSON.parse(primera.body)
      expect(guia1.nGuia).toBe(String(guia1.id))
      expect(guia1.nGuia).not.toBe(String(fixture.orden.nInterno))

      // Segunda guia para la MISMA orden (segundo envio parcial): no debe
      // chocar por N guia duplicado aunque comparta n_interno con la primera.
      const segunda = await app.inject({
        method: 'POST',
        url: '/api/despachos/guias',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: fixture.orden.id },
      })
      expect(segunda.statusCode).toBe(200)
      const guia2 = JSON.parse(segunda.body)
      expect(guia2.nGuia).toBe(String(guia2.id))
      expect(guia2.nGuia).not.toBe(guia1.nGuia)
      expect(guia2.nInterno).toBe(guia1.nInterno)
    } finally {
      await cleanupFixture(app, fixture)
    }
  })
})
