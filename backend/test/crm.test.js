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
