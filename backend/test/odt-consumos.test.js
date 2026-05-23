import { describe, expect, it, vi } from 'vitest'
import odtConsumosRoutes, {
  applyOdtConsumo,
  buildHistorialMaterialData,
  getConsumoUserId,
  getConsumoUsuario,
  parseConsumoRequest,
} from '../src/routes/odts/consumos.js'

const NOW = new Date('2026-05-23T12:00:00.000Z')
const ROUTE = '/:id/consumos'

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

async function buildHandlers(prisma) {
  const handlers = {}
  const fastify = {
    authenticate: async () => {},
    rbac: vi.fn(() => async () => {}),
    prisma,
    post: (path, opts, handler) => {
      handlers[`POST ${path}`] = { opts, handler }
    },
  }
  await odtConsumosRoutes(fastify)
  return { fastify, handlers }
}

describe('ODT consumos helpers', () => {
  it('validates and normalizes the consumo request body', () => {
    expect(parseConsumoRequest({
      tipo: ' Producto ',
      id: '10',
      cantidad: '2',
      motivo: ' Corte ODT ',
      taller: ' Espumas ',
    })).toEqual({
      tipo: 'producto',
      id: 10,
      cantidad: 2,
      motivo: 'Corte ODT',
      taller: 'Espumas',
    })

    expect(parseConsumoRequest({ tipo: 'otro', id: 1, cantidad: 1, motivo: 'x' })).toEqual({
      error: 'tipo debe ser producto, material_taller o tela',
    })
    expect(parseConsumoRequest({ tipo: 'producto', id: 'abc', cantidad: 1, motivo: 'x' })).toEqual({ error: 'id invalido' })
    expect(parseConsumoRequest({ tipo: 'tela', id: 1, cantidad: 0, motivo: 'x' })).toEqual({ error: 'cantidad invalida' })
    expect(parseConsumoRequest({ tipo: 'producto', id: 1, cantidad: 1.5, motivo: 'x' })).toEqual({
      error: 'cantidad debe ser entera para producto',
    })
    expect(parseConsumoRequest({ tipo: 'tela', id: 1, cantidad: 1, motivo: ' ' })).toEqual({ error: 'motivo requerido' })
  })

  it('chooses usuario and userId from request user with stable fallbacks', () => {
    expect(getConsumoUsuario({ nombre: ' Ana ', username: 'arojas', email: 'ana@example.com' })).toBe('Ana')
    expect(getConsumoUsuario({ username: ' taller ' })).toBe('taller')
    expect(getConsumoUsuario({ email: 'taller@example.com' })).toBe('taller@example.com')
    expect(getConsumoUsuario({})).toBe('Sistema')

    expect(getConsumoUserId({ id: '7' })).toBe(7)
    expect(getConsumoUserId({ id: 0 })).toBe(1)
    expect(getConsumoUserId({})).toBe(1)
  })

  it('builds a taller historial egreso payload from product-like or tela-like items', () => {
    expect(buildHistorialMaterialData({
      odt: { id: 11 },
      item: { codigoInterno: 'P1', nombre: 'Producto', unidadMedida: 'un', sucursalId: 4 },
      cantidad: 3,
      usuario: 'Ana',
      taller: 'Espumas',
      now: NOW,
    })).toEqual({
      odtId: 11,
      codigoInterno: 'P1',
      nombre: 'Producto',
      egreso: 3,
      ingreso: 0,
      unidad: 'un',
      usuario: 'Ana',
      fecha: NOW,
      taller: 'Espumas',
      sucursalId: 4,
    })

    expect(buildHistorialMaterialData({
      odt: { id: 12 },
      item: { codigo: 'T1', nombre: 'Tela' },
      cantidad: 2.5,
      usuario: 'Sistema',
      now: NOW,
    })).toMatchObject({
      odtId: 12,
      codigoInterno: 'T1',
      nombre: 'Tela',
      egreso: 2.5,
      unidad: null,
      sucursalId: null,
    })
  })

  it('consumes product stock and writes bodega and taller history with ODT traceability', async () => {
    const tx = {
      producto: {
        findUnique: vi.fn().mockResolvedValue({
          id: 5,
          codigoInterno: 'P1',
          nombre: 'Producto',
          unidadMedida: 'un',
          stock: 10,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      movimientoBodega: { create: vi.fn().mockResolvedValue({ id: 100 }) },
      tallerHistorialMaterial: { create: vi.fn().mockResolvedValue({ id: 200 }) },
    }

    const result = await applyOdtConsumo({
      tx,
      odt: { id: 11, ordenId: 22 },
      consumo: { tipo: 'producto', id: 5, cantidad: 3, motivo: 'Uso en ODT' },
      userId: 7,
      usuario: 'Ana',
      now: NOW,
    })

    expect(result).toMatchObject({ tipo: 'producto', id: 5, stockFinal: 7 })
    expect(tx.producto.updateMany).toHaveBeenCalledWith({
      where: { id: 5, stock: { gte: 3 } },
      data: { stock: { decrement: 3 } },
    })
    expect(tx.movimientoBodega.create).toHaveBeenCalledWith({
      data: {
        productoId: 5,
        tipo: 'egreso',
        cantidad: -3,
        motivo: 'Uso en ODT',
        userId: 7,
        ordenId: 22,
        odtId: 11,
        origenTipo: 'odt_consumo',
        origenId: 11,
      },
    })
    expect(tx.tallerHistorialMaterial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        odtId: 11,
        codigoInterno: 'P1',
        egreso: 3,
        ingreso: 0,
        usuario: 'Ana',
        fecha: NOW,
      }),
    })
  })

  it('rejects insufficient product stock before mutating anything', async () => {
    const tx = {
      producto: {
        findUnique: vi.fn().mockResolvedValue({
          id: 5,
          codigoInterno: 'P1',
          nombre: 'Producto',
          unidadMedida: 'un',
          stock: 2,
        }),
        updateMany: vi.fn(),
      },
      movimientoBodega: { create: vi.fn() },
      tallerHistorialMaterial: { create: vi.fn() },
    }

    const result = await applyOdtConsumo({
      tx,
      odt: { id: 11, ordenId: 22 },
      consumo: { tipo: 'producto', id: 5, cantidad: 3, motivo: 'Uso en ODT' },
      userId: 7,
      usuario: 'Ana',
      now: NOW,
    })

    expect(result).toEqual({ status: 409, error: 'Stock insuficiente', stockDisponible: 2 })
    expect(tx.producto.updateMany).not.toHaveBeenCalled()
    expect(tx.movimientoBodega.create).not.toHaveBeenCalled()
    expect(tx.tallerHistorialMaterial.create).not.toHaveBeenCalled()
  })

  it('rejects product consumption if the conditional stock decrement loses a race', async () => {
    const tx = {
      producto: {
        findUnique: vi.fn().mockResolvedValue({
          id: 5,
          codigoInterno: 'P1',
          nombre: 'Producto',
          unidadMedida: 'un',
          stock: 10,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      movimientoBodega: { create: vi.fn() },
      tallerHistorialMaterial: { create: vi.fn() },
    }

    const result = await applyOdtConsumo({
      tx,
      odt: { id: 11, ordenId: 22 },
      consumo: { tipo: 'producto', id: 5, cantidad: 3, motivo: 'Uso en ODT' },
      userId: 7,
      usuario: 'Ana',
      now: NOW,
    })

    expect(result).toEqual({ status: 409, error: 'Stock insuficiente', stockDisponible: 10 })
    expect(tx.movimientoBodega.create).not.toHaveBeenCalled()
    expect(tx.tallerHistorialMaterial.create).not.toHaveBeenCalled()
  })

  it('consumes material_taller stock and writes a negative bodega taller movement', async () => {
    const tx = {
      bodegaTaller: {
        findUnique: vi.fn().mockResolvedValue({
          id: 8,
          codigoInterno: 'M1',
          nombre: 'Broche',
          unidadMedida: 'kg',
          stock: 4.5,
          sucursalId: 3,
        }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      bodegaTallerMovimiento: { create: vi.fn().mockResolvedValue({ id: 101 }) },
      tallerHistorialMaterial: { create: vi.fn().mockResolvedValue({ id: 201 }) },
    }

    const result = await applyOdtConsumo({
      tx,
      odt: { id: 12, ordenId: 23 },
      consumo: { tipo: 'material_taller', id: 8, cantidad: 1.25, motivo: 'Armado' },
      userId: 9,
      usuario: 'Taller',
      now: NOW,
    })

    expect(result).toMatchObject({ tipo: 'material_taller', id: 8, stockFinal: 3.25 })
    expect(tx.bodegaTaller.updateMany).toHaveBeenCalledWith({
      where: { id: 8, stock: { gte: 1.25 } },
      data: { stock: { decrement: 1.25 } },
    })
    expect(tx.bodegaTallerMovimiento.create).toHaveBeenCalledWith({
      data: {
        bodegaTallerId: 8,
        tipo: 'egreso',
        cantidad: -1.25,
        motivo: 'Armado',
        userId: 9,
        origenTipo: 'odt_consumo',
        origenId: 12,
      },
    })
    expect(tx.tallerHistorialMaterial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        odtId: 12,
        codigoInterno: 'M1',
        egreso: 1.25,
        unidad: 'kg',
        sucursalId: 3,
      }),
    })
  })

  it('consumes tela stock with existing positive egreso movement convention', async () => {
    const tx = {
      tela: {
        findUnique: vi.fn().mockResolvedValue({
          id: 9,
          codigo: 'T1',
          nombre: 'Lona',
          stock: 6.75,
          ubicacion: 'Rack A',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      telaMovimiento: { create: vi.fn().mockResolvedValue({ id: 102 }) },
      tallerHistorialMaterial: { create: vi.fn().mockResolvedValue({ id: 202 }) },
    }

    const result = await applyOdtConsumo({
      tx,
      odt: { id: 13, ordenId: 24 },
      consumo: { tipo: 'tela', id: 9, cantidad: 2.5, motivo: 'Corte' },
      userId: 10,
      usuario: 'Corte',
      now: NOW,
    })

    expect(result).toMatchObject({ tipo: 'tela', id: 9, stockFinal: 4.25 })
    expect(tx.tela.updateMany).toHaveBeenCalledWith({
      where: { id: 9, stock: { gte: 2.5 } },
      data: { stock: { decrement: 2.5 } },
    })
    expect(tx.telaMovimiento.create).toHaveBeenCalledWith({
      data: {
        telaId: 9,
        tipo: 'egreso',
        cantidad: 2.5,
        origenTipo: 'odt_consumo',
        origenId: 13,
        ubicacion: 'Rack A',
        usuario: 'Corte',
      },
    })
    expect(tx.tallerHistorialMaterial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        odtId: 13,
        codigoInterno: 'T1',
        egreso: 2.5,
        unidad: null,
      }),
    })
  })
})

describe('ODT consumos route', () => {
  it('registers POST /:id/consumos with taller write access', async () => {
    const { fastify, handlers } = await buildHandlers({})

    expect(fastify.rbac).toHaveBeenCalledWith('taller', 'write')
    expect(handlers[`POST ${ROUTE}`]).toBeTruthy()
    expect(handlers[`POST ${ROUTE}`].opts.preHandler).toHaveLength(2)
  })

  it('validates the ODT and wraps product consumption in prisma.$transaction', async () => {
    const tx = {
      producto: {
        findUnique: vi.fn().mockResolvedValue({
          id: 5,
          codigoInterno: 'P1',
          nombre: 'Producto',
          unidadMedida: 'un',
          stock: 10,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      movimientoBodega: { create: vi.fn().mockResolvedValue({ id: 100 }) },
      tallerHistorialMaterial: { create: vi.fn().mockResolvedValue({ id: 200 }) },
    }
    const prisma = {
      odt: {
        findUnique: vi.fn().mockResolvedValue({ id: 11, ordenId: 22 }),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    }
    const { handlers } = await buildHandlers(prisma)
    const reply = replyStub()

    const response = await handlers[`POST ${ROUTE}`].handler({
      params: { id: '11' },
      body: { tipo: 'producto', id: '5', cantidad: '3', motivo: 'Uso en ODT' },
      user: { id: 7, nombre: 'Ana' },
    }, reply)

    expect(reply.statusCode).toBe(201)
    expect(response).toMatchObject({ tipo: 'producto', id: 5, stockFinal: 7 })
    expect(prisma.odt.findUnique).toHaveBeenCalledWith({
      where: { id: 11 },
      select: { id: true, ordenId: true },
    })
    expect(prisma.$transaction).toHaveBeenCalledOnce()
    expect(tx.movimientoBodega.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 7,
        ordenId: 22,
        odtId: 11,
        origenTipo: 'odt_consumo',
        origenId: 11,
      }),
    })
  })

  it('returns the stock error response from inside the transaction', async () => {
    const tx = {
      tela: {
        findUnique: vi.fn().mockResolvedValue({
          id: 9,
          codigo: 'T1',
          nombre: 'Lona',
          stock: 1,
          ubicacion: null,
        }),
        updateMany: vi.fn(),
      },
      telaMovimiento: { create: vi.fn() },
      tallerHistorialMaterial: { create: vi.fn() },
    }
    const prisma = {
      odt: {
        findUnique: vi.fn().mockResolvedValue({ id: 11, ordenId: 22 }),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    }
    const { handlers } = await buildHandlers(prisma)
    const reply = replyStub()

    await handlers[`POST ${ROUTE}`].handler({
      params: { id: '11' },
      body: { tipo: 'tela', id: '9', cantidad: '2', motivo: 'Corte' },
      user: { email: 'corte@example.com' },
    }, reply)

    expect(reply.statusCode).toBe(409)
    expect(reply.body).toEqual({ error: 'Stock insuficiente', stockDisponible: 1 })
    expect(tx.tela.updateMany).not.toHaveBeenCalled()
    expect(tx.telaMovimiento.create).not.toHaveBeenCalled()
  })

  it('returns ODT validation errors before opening a transaction', async () => {
    const prisma = {
      odt: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(),
    }
    const { handlers } = await buildHandlers(prisma)
    const reply = replyStub()

    await handlers[`POST ${ROUTE}`].handler({
      params: { id: '99' },
      body: { tipo: 'producto', id: '5', cantidad: '3', motivo: 'Uso en ODT' },
      user: { id: 7, nombre: 'Ana' },
    }, reply)

    expect(reply.statusCode).toBe(404)
    expect(reply.body).toEqual({ error: 'ODT no encontrada' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
