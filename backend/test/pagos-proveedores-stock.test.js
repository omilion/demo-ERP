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
    delete: () => {},
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
      proveedor: {
        findFirst: vi.fn().mockResolvedValue({ id: 55, codigoProveedor: 55 }),
        findMany: vi.fn(),
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
      user: { id: 7, role: 'admin', nombre: 'QA' },
      body: {
        proveedorId: 55,
        documento: 'Factura',
        nDoc: 'MIX-1',
        bodega: 'Inventario',
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
      proveedor: {
        findFirst: vi.fn().mockResolvedValue({ id: 55, codigoProveedor: 55 }),
        findMany: vi.fn(),
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
      user: { id: 7, role: 'admin', nombre: 'QA' },
      body: {
        proveedorId: 55,
        documento: 'Factura',
        nDoc: 'MIX-2',
        bodega: 'Inventario',
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

  it('rejects duplicate provider document before creating a second payment', async () => {
    const existing = {
      id: 777,
      proveedorId: 55,
      documento: 'Factura',
      nDoc: 'DUP-1',
      stockAplicadoAt: null,
    }
    const tx = {
      $executeRaw: vi.fn(),
      pagoProveedor: {
        findFirst: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
        update: vi.fn(),
      },
      proveedor: {
        findFirst: vi.fn().mockResolvedValue({ id: 55, codigoProveedor: 55 }),
        findMany: vi.fn(),
      },
      detalleFacturaProveedor: { create: vi.fn() },
    }
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    }
    const handler = await buildPostHandler(prisma)
    const reply = replyStub()

    await handler({
      user: { id: 7, nombre: 'QA' },
      body: {
        proveedorId: 55,
        documento: 'Factura',
        nDoc: 'DUP-1',
        total: 1000,
      },
    }, reply)

    expect(reply.statusCode).toBe(409)
    expect(reply.body).toMatchObject({ error: 'documento proveedor duplicado', duplicateId: 777 })
    expect(tx.pagoProveedor.create).not.toHaveBeenCalled()
    expect(tx.detalleFacturaProveedor.create).not.toHaveBeenCalled()
  })

  it('requires bodega write permission when creating a document that applies stock', async () => {
    const prisma = {
      $transaction: vi.fn(),
    }
    const handler = await buildPostHandler(prisma)
    const reply = replyStub()

    await handler({
      user: {
        id: 7,
        role: 'solo_lectura',
        nombre: 'QA',
        permisosExtra: { proveedores: ['write'] },
      },
      body: {
        proveedorId: 55,
        documento: 'Factura',
        nDoc: 'PERM-1',
        bodega: 'Inventario',
        ingresaStock: true,
        detalles: [{ codigoInterno: 'P1', destino: 'producto', cantidad: 2, precio: 100 }],
      },
    }, reply)

    expect(reply.statusCode).toBe(403)
    expect(reply.body).toMatchObject({ error: 'No tiene permiso para aplicar stock' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects stock application for non-stock bodegas', async () => {
    const prisma = {
      $transaction: vi.fn(),
    }
    const handler = await buildPostHandler(prisma)
    const reply = replyStub()

    await handler({
      user: { id: 7, role: 'admin', nombre: 'QA' },
      body: {
        proveedorId: 55,
        documento: 'Factura',
        nDoc: 'GASTO-1',
        bodega: 'GTransporte',
        ingresaStock: true,
        detalles: [{ codigoInterno: 'P1', destino: 'producto', cantidad: 2, precio: 100 }],
      },
    }, reply)

    expect(reply.statusCode).toBe(400)
    expect(reply.body).toMatchObject({ error: 'La bodega seleccionada no permite aplicar stock' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a stock-marked document whose malformed details have no internal code', async () => {
    const prisma = { $transaction: vi.fn() }
    const handler = await buildPostHandler(prisma)
    const reply = replyStub()

    await handler({
      user: { id: 7, role: 'admin', nombre: 'QA' },
      body: {
        proveedorId: 55,
        documento: 'Factura',
        nDoc: 'SIN-CODIGO-1',
        bodega: 'Inventario',
        ingresaStock: true,
        detalles: [{ cantidad: 1, precio: 100 }],
      },
    }, reply)

    expect(reply.statusCode).toBe(400)
    expect(reply.body).toMatchObject({ error: expect.stringMatching(/código interno/) })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('registra un gasto (Centro de Costo) sin detalles ni stock — solo la cabecera contable', async () => {
    const tx = {
      $executeRaw: vi.fn(),
      pagoProveedor: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 900, documento: 'Boleta', nDoc: 'GASTO-77', bodega: 'GAdministrativos', total: 45000 }),
        update: vi.fn(),
      },
      proveedor: {
        findFirst: vi.fn().mockResolvedValue({ id: 12, codigoProveedor: 12 }),
        findMany: vi.fn(),
      },
      detalleFacturaProveedor: { create: vi.fn() },
      producto: { findMany: vi.fn(), update: vi.fn() },
      bodegaTaller: { findMany: vi.fn(), update: vi.fn() },
      tela: { findMany: vi.fn(), update: vi.fn() },
      movimientoBodega: { create: vi.fn() },
      bodegaTallerMovimiento: { create: vi.fn() },
      telaMovimiento: { create: vi.fn() },
    }
    const prisma = { $transaction: vi.fn(async (callback) => callback(tx)) }
    const handler = await buildPostHandler(prisma)
    const reply = replyStub()

    await handler({
      user: { id: 7, role: 'admin', nombre: 'QA' },
      body: {
        proveedorId: 12,
        documento: 'Boleta',
        nDoc: 'GASTO-77',
        bodega: 'GAdministrativos',
        estado: 'Pendiente',
        total: 45000,
        ingresaStock: false,
        detalles: [],
      },
    }, reply)

    expect(reply.statusCode).toBe(201)
    expect(reply.body).toMatchObject({ id: 900, bodega: 'GAdministrativos', total: 45000 })
    expect(tx.pagoProveedor.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bodega: 'GAdministrativos', total: 45000, estado: 'Pendiente' }),
    }))
    // Sin detalles: no se crea ninguna linea ni se toca stock de ningun tipo.
    expect(tx.detalleFacturaProveedor.create).not.toHaveBeenCalled()
    expect(tx.producto.findMany).not.toHaveBeenCalled()
    expect(tx.movimientoBodega.create).not.toHaveBeenCalled()
    expect(tx.pagoProveedor.update).not.toHaveBeenCalled()
  })
})
