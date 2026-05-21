import { describe, expect, it, vi } from 'vitest'
import pagosProveedoresRoutes from '../src/routes/pagos-proveedores/index.js'

async function buildPostHandler(prisma) {
  let handler
  const fastify = {
    authenticate: async () => {},
    rbac: () => async () => {},
    prisma,
    get: () => {},
    put: () => {},
    post: (path, _opts, routeHandler) => {
      if (path === '/') handler = routeHandler
    },
  }
  await pagosProveedoresRoutes(fastify)
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

describe('POST /api/pagos-proveedores stock mixto', () => {
  it('rolls back the provider invoice transaction when stock application fails', async () => {
    let rolledBack = false
    const tx = {
      $executeRaw: vi.fn(),
      pagoProveedor: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 123, documento: 'Factura', nDoc: 'MIX-1' }),
        update: vi.fn(),
      },
      detalleFacturaProveedor: {
        create: vi.fn().mockResolvedValue({}),
      },
      producto: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      bodegaTaller: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      tela: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      movimientoBodega: { create: vi.fn() },
      bodegaTallerMovimiento: { create: vi.fn() },
      telaMovimiento: { create: vi.fn() },
    }
    const prisma = {
      $transaction: vi.fn(async (callback) => {
        try {
          return await callback(tx)
        } catch (error) {
          rolledBack = true
          throw error
        }
      }),
    }
    const handler = await buildPostHandler(prisma)
    const reply = replyStub()

    await handler({
      user: { id: 7, nombre: 'QA' },
      body: {
        proveedorId: 55,
        documento: 'Factura',
        nDoc: 'MIX-1',
        ingresaStock: true,
        detalles: [{ codigoInterno: 'P-MISSING', destino: 'producto', cantidad: 2, precio: 100 }],
      },
    }, reply)

    expect(reply.statusCode).toBe(400)
    expect(reply.body).toMatchObject({
      error: 'items no encontrados para ingresar stock',
      items: [{ codigoInterno: 'P-MISSING', destino: 'producto' }],
    })
    expect(rolledBack).toBe(true)
    expect(tx.detalleFacturaProveedor.create).toHaveBeenCalledOnce()
    expect(tx.pagoProveedor.update).not.toHaveBeenCalled()
    expect(tx.producto.update).not.toHaveBeenCalled()
    expect(tx.movimientoBodega.create).not.toHaveBeenCalled()
  })

  it('returns the already applied stock invoice without duplicating stock', async () => {
    const existing = {
      id: 321,
      proveedorId: 55,
      documento: 'Factura',
      nDoc: 'MIX-2',
      stockAplicadoAt: new Date('2026-05-21T10:00:00.000Z'),
    }
    const tx = {
      $executeRaw: vi.fn(),
      pagoProveedor: {
        findFirst: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
        update: vi.fn(),
      },
      detalleFacturaProveedor: {
        create: vi.fn(),
      },
      producto: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      movimientoBodega: { create: vi.fn() },
    }
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    }
    const handler = await buildPostHandler(prisma)
    const reply = replyStub()

    const response = await handler({
      user: { id: 7, nombre: 'QA' },
      body: {
        proveedorId: 55,
        documento: 'Factura',
        nDoc: 'MIX-2',
        ingresaStock: true,
        detalles: [{ codigoInterno: 'P1', destino: 'producto', cantidad: 2, precio: 100 }],
      },
    }, reply)

    expect(reply.statusCode).toBe(200)
    expect(response).toMatchObject({ id: 321, idempotent: true })
    expect(tx.pagoProveedor.create).not.toHaveBeenCalled()
    expect(tx.detalleFacturaProveedor.create).not.toHaveBeenCalled()
    expect(tx.producto.update).not.toHaveBeenCalled()
    expect(tx.movimientoBodega.create).not.toHaveBeenCalled()
  })
})
