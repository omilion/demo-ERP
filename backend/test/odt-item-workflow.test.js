import { describe, expect, it, vi } from 'vitest'
import itemWorkflowRoutes, {
  ODT_ITEM_TALLER_ESTADOS,
  ODT_ITEM_TALLER_ESTADOS_ERROR,
  buildTallerItemEstadoBitacoraEntry,
  buildTallerItemEstadoUpdate,
  buildTallerBulkRelationWhere,
  buildTallerItemRelationWhere,
  canChangeTallerItemEstado,
  getRequestUsuario,
  normalizeTallerItemEstado,
  parseBulkWorkflowParams,
  parseWorkflowParams,
} from '../src/routes/odts/item-workflow.js'

const NOW = new Date('2026-05-23T12:00:00.000Z')
const ROUTE = '/:odtId/items/:itemId/talleres/:tallerItemId/estado'

async function buildHandlers(prisma) {
  const handlers = {}
  const fastify = {
    authenticate: async () => {},
    rbac: vi.fn(() => async () => {}),
    prisma,
    put: (path, opts, handler) => {
      handlers[`PUT ${path}`] = { opts, handler }
    },
    patch: (path, opts, handler) => {
      handlers[`PATCH ${path}`] = { opts, handler }
    },
    post: (path, opts, handler) => {
      handlers[`POST ${path}`] = { opts, handler }
    },
  }
  await itemWorkflowRoutes(fastify)
  return { fastify, handlers }
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

describe('ODT item/taller workflow helpers', () => {
  it('keeps allowed taller item states explicit and normalizes common input forms', () => {
    expect(ODT_ITEM_TALLER_ESTADOS).toEqual([
      'pendiente',
      'en_proceso',
      'pausado',
      'listo',
      'cancelado',
    ])
    expect(normalizeTallerItemEstado('En proceso')).toBe('en_proceso')
    expect(normalizeTallerItemEstado(' en-proceso ')).toBe('en_proceso')
    expect(normalizeTallerItemEstado('listo')).toBe('listo')
    expect(normalizeTallerItemEstado('terminado')).toBeNull()
    expect(normalizeTallerItemEstado(null)).toBeNull()
  })

  it('parses route params as positive ids and builds the relationship where clause', () => {
    const params = parseWorkflowParams({ odtId: '10', itemId: '20', tallerItemId: '30' })

    expect(params).toEqual({ odtId: 10, itemId: 20, tallerItemId: 30 })
    expect(buildTallerItemRelationWhere(params)).toEqual({
      id: 30,
      odtItemId: 20,
      odtItem: { is: { odtId: 10, eliminado: false, odt: { is: { id: 10 } } } },
    })
    expect(buildTallerItemRelationWhere(params, { sucursalId: 4 })).toEqual({
      id: 30,
      odtItemId: 20,
      odtItem: { is: { odtId: 10, eliminado: false, odt: { is: { id: 10, OR: [{ sucursalId: 4 }, { sucursalId: null }] } } } },
    })
    expect(parseWorkflowParams({ odtId: '0', itemId: '20', tallerItemId: '30' })).toEqual({ error: 'odtId invalido' })
    expect(parseWorkflowParams({ odtId: '10', itemId: 'abc', tallerItemId: '30' })).toEqual({ error: 'itemId invalido' })
    expect(parseWorkflowParams({ odtId: '10', itemId: '20', tallerItemId: '-1' })).toEqual({ error: 'tallerItemId invalido' })
  })

  it('parses bulk taller workflow params and builds the scoped relationship where clause', () => {
    const params = parseBulkWorkflowParams({ odtId: '10', tallerId: '3' })

    expect(params).toEqual({ odtId: 10, tallerId: 3 })
    expect(buildTallerBulkRelationWhere(params, { sucursalId: 4 })).toEqual({
      tallerId: 3,
      odtItem: { is: { odtId: 10, eliminado: false, odt: { is: { id: 10, OR: [{ sucursalId: 4 }, { sucursalId: null }] } } } },
    })
    expect(parseBulkWorkflowParams({ odtId: 'x', tallerId: '3' })).toEqual({ error: 'odtId invalido' })
    expect(parseBulkWorkflowParams({ odtId: '10', tallerId: '0' })).toEqual({ error: 'tallerId invalido' })
  })

  it('chooses the usuario from request user nombre before email', () => {
    expect(getRequestUsuario({ nombre: ' Ana Taller ', email: 'ana@example.com' })).toBe('Ana Taller')
    expect(getRequestUsuario({ email: 'taller@example.com' })).toBe('taller@example.com')
    expect(getRequestUsuario({ nombre: ' ', email: ' ' })).toBeNull()
  })

  it('sets fechaInicio and usuario when entering en_proceso without an existing start date', () => {
    expect(buildTallerItemEstadoUpdate({
      estado: 'en_proceso',
      current: { estado: 'pendiente', fechaInicio: null },
      user: { nombre: 'Ana Taller' },
      now: NOW,
    })).toEqual({
      estado: 'en_proceso',
      usuario: 'Ana Taller',
      fechaInicio: NOW,
    })

    const existingInicio = new Date('2026-05-22T08:00:00.000Z')
    expect(buildTallerItemEstadoUpdate({
      estado: 'en_proceso',
      current: { estado: 'pausado', fechaInicio: existingInicio },
      user: { email: 'taller@example.com' },
      now: NOW,
    })).toEqual({
      estado: 'en_proceso',
      usuario: 'taller@example.com',
    })
  })

  it('stamps fechaListo and usuarioListo when entering listo', () => {
    expect(buildTallerItemEstadoUpdate({
      estado: 'listo',
      current: { estado: 'en_proceso', fechaListo: null, usuarioListo: null },
      user: { email: 'taller@example.com' },
      now: NOW,
    })).toEqual({
      estado: 'listo',
      usuario: 'taller@example.com',
      fechaListo: NOW,
      usuarioListo: 'taller@example.com',
    })

    const existingListo = new Date('2026-05-22T18:00:00.000Z')
    expect(buildTallerItemEstadoUpdate({
      estado: 'listo',
      current: { estado: 'listo', fechaListo: existingListo, usuarioListo: 'Original' },
      user: { nombre: 'Nueva Persona' },
      now: NOW,
    })).toEqual({
      estado: 'listo',
      usuario: 'Nueva Persona',
    })
  })

  it('clears ready metadata when reopening to pendiente or en_proceso', () => {
    const existingListo = new Date('2026-05-22T18:00:00.000Z')

    expect(buildTallerItemEstadoUpdate({
      estado: 'pendiente',
      current: { estado: 'listo', fechaListo: existingListo, usuarioListo: 'Original' },
      user: { nombre: 'Ana Taller' },
      now: NOW,
    })).toEqual({
      estado: 'pendiente',
      usuario: 'Ana Taller',
      fechaListo: null,
      usuarioListo: null,
    })

    expect(buildTallerItemEstadoUpdate({
      estado: 'en_proceso',
      current: { estado: 'listo', fechaInicio: existingListo, fechaListo: existingListo, usuarioListo: 'Original' },
      user: { nombre: 'Ana Taller' },
      now: NOW,
    })).toEqual({
      estado: 'en_proceso',
      usuario: 'Ana Taller',
      fechaListo: null,
      usuarioListo: null,
    })
  })

  it('returns a helper error for invalid target states', () => {
    expect(buildTallerItemEstadoUpdate({
      estado: 'terminada',
      current: {},
      user: { nombre: 'Ana Taller' },
      now: NOW,
    })).toEqual({ error: ODT_ITEM_TALLER_ESTADOS_ERROR })
  })

  it('builds an automatic bitacora entry for item/taller state changes', () => {
    expect(buildTallerItemEstadoBitacoraEntry({
      current: {
        odtItemId: 20,
        tallerId: 3,
        estado: 'pendiente',
        odtItem: { odtId: 10, codigoInterno: 'MK-1', nombre: 'Colchoneta' },
        taller: { nombre: 'Costura' },
      },
      estado: 'en_proceso',
      user: { email: 'taller@example.com' },
    })).toEqual({
      odtId: 10,
      usuario: 'taller@example.com',
      usuarioReporta: 'taller@example.com',
      sucursalId: null,
      fecha: expect.any(Date),
      texto: 'Estado taller Costura / MK-1 - Colchoneta: pendiente -> en_proceso',
    })
  })

  it('requires taller delete permission to cancel or reopen canceled item workflow states', () => {
    expect(canChangeTallerItemEstado({ role: 'taller' }, 'cancelado', { estado: 'pendiente' })).toBe(false)
    expect(canChangeTallerItemEstado({ role: 'taller' }, 'pendiente', { estado: 'cancelado' })).toBe(false)
    expect(canChangeTallerItemEstado({ role: 'admin' }, 'cancelado', { estado: 'pendiente' })).toBe(true)
    expect(canChangeTallerItemEstado({ role: 'taller', permisosExtra: { taller: ['delete'] } }, 'cancelado', { estado: 'pendiente' })).toBe(true)
    expect(canChangeTallerItemEstado({ role: 'taller' }, 'listo', { estado: 'pendiente' })).toBe(true)
  })
})

describe('ODT item/taller workflow route', () => {
  it('registers PUT and PATCH with taller write access', async () => {
    const prisma = { odtItemTaller: { findFirst: vi.fn(), update: vi.fn() } }
    const { fastify, handlers } = await buildHandlers(prisma)

    expect(fastify.rbac).toHaveBeenCalledWith('taller', 'write')
    expect(handlers[`PUT ${ROUTE}`]).toBeTruthy()
    expect(handlers[`PATCH ${ROUTE}`]).toBeTruthy()
    expect(handlers['POST /:odtId/talleres/:tallerId/estado']).toBeTruthy()
    expect(handlers[`PUT ${ROUTE}`].opts.preHandler).toHaveLength(2)
  })

  it('rejects invalid params before querying Prisma', async () => {
    const prisma = { odtItemTaller: { findFirst: vi.fn(), update: vi.fn() } }
    const { handlers } = await buildHandlers(prisma)
    const reply = replyStub()

    await handlers[`PUT ${ROUTE}`].handler({
      params: { odtId: 'abc', itemId: '20', tallerItemId: '30' },
      body: { estado: 'pendiente' },
      user: { nombre: 'Ana Taller' },
    }, reply)

    expect(reply.statusCode).toBe(400)
    expect(reply.body).toEqual({ error: 'odtId invalido' })
    expect(prisma.odtItemTaller.findFirst).not.toHaveBeenCalled()
    expect(prisma.odtItemTaller.update).not.toHaveBeenCalled()
  })

  it('rejects invalid target states before querying Prisma', async () => {
    const prisma = { odtItemTaller: { findFirst: vi.fn(), update: vi.fn() } }
    const { handlers } = await buildHandlers(prisma)
    const reply = replyStub()

    await handlers[`PATCH ${ROUTE}`].handler({
      params: { odtId: '10', itemId: '20', tallerItemId: '30' },
      body: { estado: 'terminada' },
      user: { nombre: 'Ana Taller' },
    }, reply)

    expect(reply.statusCode).toBe(400)
    expect(reply.body).toEqual({ error: ODT_ITEM_TALLER_ESTADOS_ERROR })
    expect(prisma.odtItemTaller.findFirst).not.toHaveBeenCalled()
    expect(prisma.odtItemTaller.update).not.toHaveBeenCalled()
  })

  it('returns 404 when the ODT item/taller relationship does not match', async () => {
    const prisma = {
      odtItemTaller: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    }
    const { handlers } = await buildHandlers(prisma)
    const reply = replyStub()

    await handlers[`PUT ${ROUTE}`].handler({
      params: { odtId: '10', itemId: '20', tallerItemId: '30' },
      body: { estado: 'en_proceso' },
      user: { nombre: 'Ana Taller' },
    }, reply)

    expect(reply.statusCode).toBe(404)
    expect(reply.body).toEqual({ error: 'Relacion ODT/item/taller no encontrada' })
    expect(prisma.odtItemTaller.findFirst).toHaveBeenCalledWith({
      where: {
        id: 30,
        odtItemId: 20,
        odtItem: { is: { odtId: 10, eliminado: false, odt: { is: { id: 10 } } } },
      },
      select: {
        id: true,
        odtItemId: true,
        tallerId: true,
        estado: true,
        fechaInicio: true,
        fechaListo: true,
        usuario: true,
        usuarioListo: true,
        odtItem: {
          select: {
            odtId: true,
            codigoInterno: true,
            nombre: true,
            odt: { select: { id: true, sucursalId: true, estado: true, eliminado: true } },
          },
        },
        taller: { select: { nombre: true } },
      },
    })
    expect(prisma.odtItemTaller.update).not.toHaveBeenCalled()
  })

  it('rejects canceling a taller item without delete permission', async () => {
    const current = {
      id: 30,
      odtItemId: 20,
      tallerId: 3,
      estado: 'pendiente',
      fechaInicio: null,
      fechaListo: null,
      usuario: null,
      usuarioListo: null,
      odtItem: { odtId: 10, codigoInterno: 'MK-1', nombre: 'Colchoneta', odt: { id: 10, estado: 'Pendiente', eliminado: false, sucursalId: null } },
      taller: { nombre: 'Costura' },
    }
    const prisma = {
      odtItemTaller: {
        findFirst: vi.fn().mockResolvedValue(current),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    }
    const { handlers } = await buildHandlers(prisma)
    const reply = replyStub()

    await handlers[`PATCH ${ROUTE}`].handler({
      params: { odtId: '10', itemId: '20', tallerItemId: '30' },
      body: { estado: 'cancelado' },
      user: { role: 'taller', nombre: 'Ana Taller' },
    }, reply)

    expect(reply.statusCode).toBe(403)
    expect(reply.body).toEqual({ error: 'Forbidden' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('updates the matched taller item state with workflow side effects', async () => {
    const current = {
      id: 30,
      odtItemId: 20,
      tallerId: 3,
      estado: 'pendiente',
      fechaInicio: null,
      fechaListo: null,
      usuario: null,
      usuarioListo: null,
      odtItem: { odtId: 10, codigoInterno: 'MK-1', nombre: 'Colchoneta', odt: { id: 10, estado: 'Pendiente', eliminado: false, sucursalId: null } },
      taller: { nombre: 'Costura' },
    }
    const updated = { ...current, estado: 'en_proceso', usuario: 'Ana Taller' }
    const tx = {
      odtItemTaller: {
        findFirst: vi.fn().mockResolvedValue(current),
        update: vi.fn().mockResolvedValue(updated),
      },
      bitacoraTaller: {
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
    }
    const prisma = {
      odtItemTaller: {
        findFirst: vi.fn().mockResolvedValue(current),
      },
      $transaction: vi.fn(async callback => callback(tx)),
    }
    const { handlers } = await buildHandlers(prisma)
    const reply = replyStub()

    const response = await handlers[`PUT ${ROUTE}`].handler({
      params: { odtId: '10', itemId: '20', tallerItemId: '30' },
      body: { estado: 'En proceso' },
      user: { nombre: 'Ana Taller' },
    }, reply)

    expect(response).toBe(updated)
    expect(tx.odtItemTaller.findFirst).toHaveBeenCalledOnce()
    expect(tx.odtItemTaller.update).toHaveBeenCalledOnce()
    const updateArgs = tx.odtItemTaller.update.mock.calls[0][0]
    expect(updateArgs.where).toEqual({ id: 30 })
    expect(updateArgs.data).toEqual({
      estado: 'en_proceso',
      usuario: 'Ana Taller',
      fechaInicio: expect.any(Date),
    })
    expect(tx.bitacoraTaller.create).toHaveBeenCalledWith({
      data: {
        odtId: 10,
        usuario: 'Ana Taller',
        usuarioReporta: 'Ana Taller',
        sucursalId: null,
        fecha: expect.any(Date),
        texto: 'Estado taller Costura / MK-1 - Colchoneta: pendiente -> en_proceso',
      },
    })
  })

  it('marks all items for a taller as ready with audit entries', async () => {
    const items = [
      {
        id: 30,
        odtItemId: 20,
        tallerId: 3,
        estado: 'pendiente',
        fechaInicio: null,
        fechaListo: null,
        usuario: null,
        usuarioListo: null,
        odtItem: { odtId: 10, codigoInterno: 'MK-1', nombre: 'Colchoneta', odt: { id: 10, estado: 'Pendiente', eliminado: false, sucursalId: null } },
        taller: { nombre: 'Costura' },
      },
      {
        id: 31,
        odtItemId: 21,
        tallerId: 3,
        estado: 'en_proceso',
        fechaInicio: new Date('2026-05-22T08:00:00.000Z'),
        fechaListo: null,
        usuario: 'Previo',
        usuarioListo: null,
        odtItem: { odtId: 10, codigoInterno: 'MK-2', nombre: 'Respaldo', odt: { id: 10, estado: 'Pendiente', eliminado: false, sucursalId: null } },
        taller: { nombre: 'Costura' },
      },
    ]
    const tx = {
      odtItemTaller: {
        findMany: vi.fn().mockResolvedValue(items),
        update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
      bitacoraTaller: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    }
    const prisma = {
      odtItemTaller: {
        findMany: vi.fn().mockResolvedValue(items),
      },
      $transaction: vi.fn(async callback => callback(tx)),
    }
    const { handlers } = await buildHandlers(prisma)
    const reply = replyStub()

    const response = await handlers['POST /:odtId/talleres/:tallerId/estado'].handler({
      params: { odtId: '10', tallerId: '3' },
      body: { estado: 'listo' },
      user: { nombre: 'Ana Taller' },
    }, reply)

    expect(response).toEqual({ odtId: 10, tallerId: 3, estado: 'listo', updated: 2 })
    expect(tx.odtItemTaller.update).toHaveBeenCalledTimes(2)
    expect(tx.bitacoraTaller.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ odtId: 10, texto: 'Estado taller Costura / MK-1 - Colchoneta: pendiente -> listo' }),
        expect.objectContaining({ odtId: 10, texto: 'Estado taller Costura / MK-2 - Respaldo: en_proceso -> listo' }),
      ]),
    })
  })
})
