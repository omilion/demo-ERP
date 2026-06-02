import { describe, expect, it, vi } from 'vitest'
import { ODT_ESTADOS_ABIERTOS } from '../src/routes/odts/operations.js'
import { buildOdtListWhere, sortOdtsOperativas } from '../src/routes/odts/list.js'

describe('ODT list helpers', () => {
  it('builds Kanban-compatible filters with default open states and sucursal scope', async () => {
    const fastify = { prisma: { orden: { findMany: vi.fn() } } }

    const { where, error } = await buildOdtListWhere(
      fastify,
      {},
      { sucursalId: 3 },
      { defaultEstados: ODT_ESTADOS_ABIERTOS },
    )

    expect(error).toBeUndefined()
    expect(where).toEqual({
      AND: [{ OR: [{ sucursalId: 3 }, { sucursalId: null }] }],
      eliminado: false,
      estado: { in: ODT_ESTADOS_ABIERTOS },
    })
    expect(fastify.prisma.orden.findMany).not.toHaveBeenCalled()
  })

  it('supports explicit multi-state filters for terminal list views', async () => {
    const fastify = { prisma: { orden: { findMany: vi.fn() } } }

    const { where, error } = await buildOdtListWhere(
      fastify,
      {
        estados: 'Terminada,Entregada',
        fechaCampo: 'plazo',
        fechaDesde: '2026-06-01',
        fechaHasta: '2026-06-02',
      },
      {},
      { defaultEstados: ODT_ESTADOS_ABIERTOS },
    )

    expect(error).toBeUndefined()
    expect(where).toMatchObject({
      eliminado: false,
      estado: { in: ['Terminada', 'Entregada'] },
      plazo: { gte: expect.any(Date), lte: expect.any(Date) },
    })
  })

  it('rejects invalid multi-state filters', async () => {
    const fastify = { prisma: { orden: { findMany: vi.fn() } } }

    await expect(buildOdtListWhere(
      fastify,
      { estados: 'Pendiente,No existe' },
      {},
      { defaultEstados: ODT_ESTADOS_ABIERTOS },
    )).resolves.toEqual({ error: 'Estado invalido' })
  })

  it('sorts ODTs by operational state and newest creation date', () => {
    const odts = [
      { id: 1, estado: 'Pendiente', createdAt: '2026-05-20T12:00:00.000Z' },
      { id: 2, estado: 'En proceso', createdAt: '2026-05-19T12:00:00.000Z' },
      { id: 3, estado: 'Prioritaria', createdAt: '2026-05-18T12:00:00.000Z' },
      { id: 4, estado: 'Pendiente', createdAt: '2026-05-22T12:00:00.000Z' },
    ]

    expect(sortOdtsOperativas(odts).map(odt => odt.id)).toEqual([3, 2, 4, 1])
  })
})
