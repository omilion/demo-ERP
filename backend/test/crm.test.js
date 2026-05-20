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
    })

    expect(response).toEqual({ items: [], total: 0, limit: 500 })
    expect(prisma.crmRegistro.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { estado: '1' },
    }))
    expect(prisma.crmRegistro.count).toHaveBeenCalledWith({
      where: { estado: '1' },
    })
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
    }, reply)

    expect(reply.statusCode).toBe(400)
    expect(reply.body).toEqual({ error: 'Estado CRM invalido' })
    expect(prisma.crmRegistro.update).not.toHaveBeenCalled()
  })
})
