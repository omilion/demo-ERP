import { describe, it, expect, vi } from 'vitest'
import pasarTallerRoutes from '../src/routes/pasar-taller/index.js'

async function buildEnviarHandler(prisma) {
  let handler
  const fastify = {
    authenticate: async () => {},
    rbac: () => async () => {},
    prisma,
    post: (path, _opts, routeHandler) => {
      if (path === '/enviar') handler = routeHandler
    },
    get: () => {},
  }
  await pasarTallerRoutes(fastify)
  return handler
}

function replyStub() {
  return {
    statusCode: 200,
    body: undefined,
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

describe('POST /api/pasar-taller/enviar', () => {
  it('creates OdtItem and OdtItemTaller resolving producto by codigoInterno', async () => {
    const producto = { id: 10, codigoInterno: 'TEST-PT-001', nombre: 'Producto Pasar Taller Test' }
    const odtItem = {
      id: 20,
      odtId: 1,
      productoId: producto.id,
      codigoInterno: producto.codigoInterno,
      nombre: producto.nombre,
      cantidad: 2,
      obs: 'Obs test',
    }
    const tx = {
      odtItem: { create: vi.fn().mockResolvedValue(odtItem) },
      odtItemTaller: { create: vi.fn().mockResolvedValue({ id: 30 }) },
    }
    const prisma = {
      odt: { findUnique: vi.fn().mockResolvedValue({ id: 1, ordenId: 100 }) },
      producto: { findFirst: vi.fn().mockResolvedValue(producto) },
      taller: { findFirst: vi.fn().mockResolvedValue({ id: 2, activo: true }) },
      $transaction: vi.fn((fn) => fn(tx)),
    }
    const handler = await buildEnviarHandler(prisma)
    const reply = replyStub()

    const response = await handler({
      user: { email: 'taller@plastimar.cl' },
      body: {
        odtId: 1,
        items: [{ codigoInterno: producto.codigoInterno, cantidad: 2, tallerId: 2, obs: 'Obs test' }],
      },
    }, reply)

    expect(response).toEqual({ ok: true, created: [odtItem] })
    expect(prisma.producto.findFirst).toHaveBeenCalledWith({
      where: { codigoInterno: producto.codigoInterno, activo: true },
    })
    expect(tx.odtItem.create).toHaveBeenCalledWith({
      data: {
        odtId: 1,
        productoId: producto.id,
        codigoInterno: producto.codigoInterno,
        nombre: producto.nombre,
        cantidad: 2,
        obs: 'Obs test',
        usuario: 'taller@plastimar.cl',
      },
    })
    expect(tx.odtItemTaller.create).toHaveBeenCalledWith({
      data: {
        odtItemId: odtItem.id,
        tallerId: 2,
        obs: 'Obs test',
        usuario: 'taller@plastimar.cl',
      },
    })
  })

  it('returns 400 when producto cannot be resolved', async () => {
    const prisma = {
      odt: { findUnique: vi.fn().mockResolvedValue({ id: 1, ordenId: 100 }) },
      producto: { findFirst: vi.fn().mockResolvedValue(null) },
      taller: { findFirst: vi.fn() },
      $transaction: vi.fn(),
    }
    const handler = await buildEnviarHandler(prisma)
    const reply = replyStub()

    await handler({
      body: { odtId: 1, items: [{ codigoInterno: 'NO-EXISTE-PT', cantidad: 1 }] },
    }, reply)

    expect(reply.statusCode).toBe(400)
    expect(reply.body.error).toContain('producto no encontrado')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
