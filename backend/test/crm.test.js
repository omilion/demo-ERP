import { describe, it, expect, vi } from 'vitest'
import crmRoutes from '../src/routes/crm/index.js'

async function buildCrmHandlers(prisma) {
  const handlers = {}
  const fastify = {
    authenticate: async () => {},
    rbac: () => async () => {},
    prisma,
    register: async (plugin) => {
      await plugin({
        authenticate: async () => {},
        rbac: () => async () => {},
        prisma,
        get: (path, _opts, handler) => { handlers[`GET ${path}`] = handler },
        patch: (path, _opts, handler) => { handlers[`PATCH ${path}`] = handler },
        post: (path, _opts, handler) => { handlers[`POST ${path}`] = handler },
        put: (path, _opts, handler) => { handlers[`PUT ${path}`] = handler },
        delete: (path, _opts, handler) => { handlers[`DELETE ${path}`] = handler },
      })
    },
  }
  await crmRoutes(fastify)
  return handlers
}

function replyStub() {
  return {
    statusCode: 200,
    body: undefined,
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    code(statusCode) {
      this.statusCode = statusCode
      return this
    },
    send(body) {
      this.body = body
      return body
    },
  }
}

describe('CRM estado routes', () => {
  it('filters estado as text for the current Prisma schema', async () => {
    const prisma = {
      crmRegistro: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      $queryRaw: vi.fn(),
    }
    const handlers = await buildCrmHandlers(prisma)

    const response = await handlers['GET /']({
      query: { estado: '1', page: '1' },
      user: { role: 'admin' },
    })

    expect(response).toEqual({ items: [], total: 0, limit: 500 })
    expect(prisma.crmRegistro.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { estado: '1' },
    }))
    expect(prisma.crmRegistro.count).toHaveBeenCalledWith({
      where: { estado: '1' },
    })
  })

  it('filters the operational and historical CRM portfolios explicitly', async () => {
    const prisma = {
      crmRegistro: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      $queryRaw: vi.fn(),
    }
    const handlers = await buildCrmHandlers(prisma)
    await handlers['GET /']({ query: { historico: '0' }, user: { role: 'admin' } })
    expect(prisma.crmRegistro.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { esHistorico: false } }))

    await handlers['GET /']({ query: { historico: '1' }, user: { role: 'admin' } })
    expect(prisma.crmRegistro.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { esHistorico: true } }))
  })

  it('returns real executive totals for the selected portfolio, grouped by vendedorId not raw text', async () => {
    const prisma = {
      crmRegistro: {
        // Simula el caso real post-canonicalizacion: la misma vendedora "Ana"
        // tiene filas con texto legacy distinto (login vs nombre completo)
        // pero ya comparten vendedorId=11. No deben duplicarse en el resultado.
        findMany: vi.fn().mockResolvedValue([
          ...Array.from({ length: 4 }, () => ({ ejecutiva: 'ana', vendedorId: 11, esHistorico: true })),
          ...Array.from({ length: 3 }, () => ({ ejecutiva: 'Ana Torrealba', vendedorId: 11, esHistorico: true })),
          ...Array.from({ length: 7 }, () => ({ ejecutiva: 'Histórica', vendedorId: null, esHistorico: true })),
        ]),
      },
      user: { findMany: vi.fn().mockResolvedValue([{ id: 11, nombre: 'Ana' }, { id: 12, nombre: 'Pedro' }]) },
    }
    const handlers = await buildCrmHandlers(prisma)
    const response = await handlers['GET /ejecutivas']({ query: { historico: '1' }, user: { role: 'admin' } })

    expect(prisma.crmRegistro.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ejecutiva: { not: null }, esHistorico: true },
    }))
    // Ana aparece UNA sola vez con el total combinado (4+3), no dos filas separadas.
    expect(response.filter(r => r.vendedorId === 11)).toHaveLength(1)
    expect(response).toEqual(expect.arrayContaining([
      expect.objectContaining({ ejecutiva: 'Ana', vendedorId: 11, total: 7 }),
      expect.objectContaining({ ejecutiva: 'Pedro', vendedorId: 12, total: 0 }),
      expect.objectContaining({ ejecutiva: 'Histórica', vendedorId: null, total: 7 }),
    ]))
  })

  it('enriches imported OC items with their product image for CRM detail', async () => {
    const prisma = {
      crmRegistro: {
        findFirst: vi.fn().mockResolvedValue({ id: 10 }),
        findUnique: vi.fn().mockResolvedValue({
          id: 10, esHistorico: true, ordenCompraOnline: {
            id: 88, nCompra: '2026', items: [{ id: 1, codigoInterno: 'SKU-1', cantidad: 2, precio: 1000 }],
          }, gestiones: [], estadosHistorial: [],
        }),
      },
      producto: { findMany: vi.fn().mockResolvedValue([{ codigoInterno: 'SKU-1', fotoUrl: '/uploads/fotos_chicas/sku-1.jpg' }]) },
    }
    const handlers = await buildCrmHandlers(prisma)
    const response = await handlers['GET /:id']({ params: { id: '10' }, user: { role: 'admin' } }, replyStub())

    expect(prisma.producto.findMany).toHaveBeenCalledWith({ where: { codigoInterno: { in: ['SKU-1'] } }, select: { codigoInterno: true, fotoUrl: true } })
    expect(response.ordenCompraOnline.items[0].producto).toEqual({ codigoInterno: 'SKU-1', fotoUrl: '/uploads/fotos_chicas/sku-1.jpg' })
  })

  it('updates estado as text instead of number', async () => {
    const updated = { id: 10, estado: '2' }
    const prisma = {
      crmRegistro: {
        update: vi.fn().mockResolvedValue(updated),
      },
      $queryRaw: vi.fn(),
    }
    const handlers = await buildCrmHandlers(prisma)
    const reply = replyStub()

    const response = await handlers['PATCH /:id']({
      params: { id: '10' },
      body: { estado: 2 },
      user: { id: 1, role: 'admin' },
    }, reply)

    expect(response).toBe(updated)
    expect(prisma.crmRegistro.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { estado: '2' },
    })
  })

  it('rejects invalid estado values', async () => {
    const prisma = {
      crmRegistro: {
        update: vi.fn(),
      },
      $queryRaw: vi.fn(),
    }
    const handlers = await buildCrmHandlers(prisma)
    const reply = replyStub()

    await handlers['PATCH /:id']({
      params: { id: '10' },
      body: { estado: '9' },
      user: { id: 1, role: 'admin' },
    }, reply)

    expect(reply.statusCode).toBe(400)
    expect(reply.body).toEqual({ error: 'Estado CRM invalido' })
    expect(prisma.crmRegistro.update).not.toHaveBeenCalled()
  })

  it('converts lead to customer', async () => {
    const crm = { id: 10, rut: '12345678-9', nombre: 'Test Lead', email: 'test@example.com', telefono: '1234', estado: '3' }
    const createdCustomer = { id: 99, rut: '12345678-9', nombre: 'Test Lead' }
    const prisma = {
      crmRegistro: {
        findFirst: vi.fn().mockResolvedValue({ id: 10 }),
        findUnique: vi.fn().mockResolvedValue(crm),
        update: vi.fn().mockResolvedValue({ ...crm, clienteId: 99 }),
      },
      cliente: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdCustomer),
      },
    }
    const handlers = await buildCrmHandlers(prisma)
    const reply = replyStub()

    const response = await handlers['POST /:id/convertir-cliente']({
      params: { id: '10' },
      user: { id: 1, role: 'admin' },
    }, reply)

    expect(reply.statusCode).toBe(201)
    expect(response).toEqual({ clienteId: 99, creado: true })
    expect(prisma.cliente.create).toHaveBeenCalled()
  })

  it('gets pending items today', async () => {
    const prisma = {
      crmRegistro: {
        count: vi.fn()
          .mockResolvedValueOnce(7)
          .mockResolvedValueOnce(2),
        findMany: vi.fn().mockResolvedValue([
          { id: 1, fechaProximo: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // overdue
          { id: 2, fechaProximo: new Date() }, // today
        ]),
      },
    }
    const handlers = await buildCrmHandlers(prisma)
    const response = await handlers['GET /pendientes-hoy']({
      user: { role: 'vendedor', nombre: 'Ana' },
    })

    expect(response.hoy.length).toBe(1)
    expect(response.vencidas.length).toBe(1)
    expect(response.resumen).toEqual({ total: 9, vencidas: 7, hoy: 2, sinAsignar: 0 })
    expect(prisma.crmRegistro.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }))
  })

  it('gets metrics', async () => {
    const prisma = {
      crmRegistro: {
        groupBy: vi.fn().mockResolvedValue([
          { estado: '0', _count: { _all: 2 } },
          { estado: '3', _count: { _all: 4 } },
        ]),
        findMany: vi.fn().mockImplementation((args) => {
          if (args.select?.ejecutiva) {
            return Promise.resolve([
              { ejecutiva: 'Ana', estado: '3', etapaComercial: 'CERRADO', resultadoCierre: 'GANADO', prioridad: 'Alta' },
              { ejecutiva: 'Ana', estado: '3', etapaComercial: 'CERRADO', resultadoCierre: 'PERDIDO' },
              { ejecutiva: 'Ana', estado: '3', etapaComercial: 'CERRADO', resultadoCierre: 'SIN_CLASIFICAR' },
              { ejecutiva: 'Ana', estado: '3', etapaComercial: 'CERRADO', resultadoCierre: null },
              { ejecutiva: 'Pedro', estado: '0', etapaComercial: 'PENDIENTE_CLASIFICACION', prioridad: 'alta' },
              { ejecutiva: 'Pedro', estado: '0' },
            ])
          }
          return Promise.resolve([
            { createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }
          ])
        }),
      },
    }
    const handlers = await buildCrmHandlers(prisma)
    const response = await handlers['GET /metricas']({
      query: {},
    })

    expect(response.porEstado).toEqual({ '0': 2, '1': 0, '2': 0, '3': 4 })
    expect(response.tasaCierre).toBe(50)
    expect(response.porResultado).toEqual({ GANADO: 1, PERDIDO: 1, SIN_CLASIFICAR: 2 })
    expect(response.porEjecutiva[0]).toMatchObject({ ejecutiva: 'Ana', total: 4, ganados: 1, perdidos: 1, sinClasificar: 2, tasaCierre: 50 })
    expect(response.prioridadAlta).toBe(2)
    expect(response.tiempoPromedioEnPipeline).toBeCloseTo(5, 1)
  })
})

// coordinador_comercial: igual a vendedor en todo salvo visibilidad ampliada
// del CRM de todos los vendedores. Ver backend/src/middleware/rbac.js (mismos
// permisos que vendedor) y backend/src/routes/crm/index.js (unica ampliacion).
describe('CRM visibilidad de coordinador_comercial', () => {
  it('ve el CRM de todos los vendedores igual que admin (sin filtrar por vendedorId)', async () => {
    const prisma = {
      crmRegistro: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      $queryRaw: vi.fn(),
    }
    const handlers = await buildCrmHandlers(prisma)

    await handlers['GET /']({ query: {}, user: { id: 5, role: 'coordinador_comercial' } })

    expect(prisma.crmRegistro.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }))
    expect(prisma.crmRegistro.count).toHaveBeenCalledWith({ where: {} })
  })

  it('un vendedor sigue viendo solo sus propios leads (sin cambios)', async () => {
    const prisma = {
      crmRegistro: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      $queryRaw: vi.fn(),
    }
    const handlers = await buildCrmHandlers(prisma)

    await handlers['GET /']({ query: {}, user: { id: 5, role: 'vendedor' } })

    expect(prisma.crmRegistro.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { vendedorId: 5 } }))
  })

  it('puede abrir el detalle de un lead que no es suyo (solo lectura)', async () => {
    const prisma = {
      crmRegistro: {
        findFirst: vi.fn().mockResolvedValue({ id: 10 }),
        findUnique: vi.fn().mockResolvedValue({ id: 10, vendedorId: 99, gestiones: [], estadosHistorial: [] }),
      },
    }
    const handlers = await buildCrmHandlers(prisma)
    const reply = replyStub()

    await handlers['GET /:id']({ params: { id: '10' }, user: { id: 5, role: 'coordinador_comercial' } }, reply)

    expect(reply.statusCode).not.toBe(404)
    expect(prisma.crmRegistro.findFirst).toHaveBeenCalledWith({ where: { id: 10 }, select: { id: true } })
  })

  it('NO puede editar (PATCH) un lead que no es suyo: mismo limite que vendedor', async () => {
    const prisma = {
      crmRegistro: {
        findFirst: vi.fn().mockResolvedValue(null), // no es dueña -> sin acceso de escritura
        update: vi.fn(),
      },
      $queryRaw: vi.fn(),
    }
    const handlers = await buildCrmHandlers(prisma)
    const reply = replyStub()

    await handlers['PATCH /:id']({
      params: { id: '10' },
      body: { prioridad: 'Alta' },
      user: { id: 5, role: 'coordinador_comercial' },
    }, reply)

    expect(reply.statusCode).toBe(403)
    expect(prisma.crmRegistro.findFirst).toHaveBeenCalledWith({ where: { id: 10, vendedorId: 5 }, select: { id: true } })
    expect(prisma.crmRegistro.update).not.toHaveBeenCalled()
  })

  it('cuenta leads sin asignar en la agenda igual que admin (KPI de coordinacion)', async () => {
    const prisma = {
      crmRegistro: {
        count: vi.fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(3),
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const handlers = await buildCrmHandlers(prisma)
    const response = await handlers['GET /pendientes-hoy']({
      user: { id: 5, role: 'coordinador_comercial' },
    })

    expect(response.resumen.sinAsignar).toBe(3)
  })
})
