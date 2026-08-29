import { describe, expect, it } from 'vitest'
import {
  buildClientesExportWhere,
  buildOdtExportWhere,
  buildVentasExportWhere,
} from '../src/routes/reportes/index.js'

function fakeFastify({ odts = [], corte = null } = {}) {
  return {
    prisma: {
      odt: {
        findMany: async () => odts,
      },
      orden: {
        findMany: async () => [],
        findFirst: async () => corte,
      },
    },
  }
}

describe('reportes export filter helpers', () => {
  it('honors clientes active state filters from frontend export', () => {
    expect(buildClientesExportWhere({}).activo).toBe(true)
    expect(buildClientesExportWhere({ estado: 'inactivo' }).activo).toBe(false)
    expect(buildClientesExportWhere({ estado: 'todos' })).not.toHaveProperty('activo')
    expect(buildClientesExportWhere({ activo: 'false' }).activo).toBe(false)
  })

  it('keeps clientes email filters aligned with the legacy search/export', () => {
    const where = buildClientesExportWhere({ email: 'compras@cliente.cl', search: 'contacto' })
    expect(where.email).toEqual({ contains: 'compras@cliente.cl', mode: 'insensitive' })
    expect(where.OR).toContainEqual({ email: { contains: 'contacto', mode: 'insensitive' } })
  })

  it('keeps odt export filters aligned with taller list filters', async () => {
    await expect(buildOdtExportWhere(fakeFastify(), { estado: 'Anulada' })).resolves.toMatchObject({
      where: {
        eliminado: false,
        estado: 'Anulada',
      },
    })
    await expect(buildOdtExportWhere(fakeFastify(), { estado: 'Anulada', includeEliminados: 'true' })).resolves.toMatchObject({
      where: {
        estado: 'Anulada',
      },
    })
    await expect(buildOdtExportWhere(fakeFastify(), { operarioId: 'abc' })).resolves.toEqual({ error: 'Operario invalido' })
  })

  it('matches odt export numeric search against ODT id and order internal number', async () => {
    const fastify = fakeFastify()
    fastify.prisma.orden.findMany = async () => [{ id: 77 }]
    const built = await buildOdtExportWhere(fastify, { search: '123' })

    expect(built.where).toMatchObject({
      eliminado: false,
      AND: [{
        OR: expect.arrayContaining([
          { id: 123 },
          { ordenId: 123 },
          { ordenId: { in: [77] } },
        ]),
      }],
    })
  })

  it('normalizes visible matriz ventas export filters', async () => {
    const corte = { id: 1, nInterno: 10, createdAt: new Date('2026-01-01T00:00:00.000Z') }
    const { where } = await buildVentasExportWhere(fakeFastify({ corte }), {
      tipo: 'venta-web',
      nInterno: '123',
      guia: '456',
      estadoPago: 'Parcial',
      scope: 'operacional',
    })

    expect(where).toEqual({
      AND: [
        {
          eliminada: false,
          // Todos los tipos se resuelven ahora por su catalogo de grafias, asi que
          // el filtro es siempre un `in`, aunque el tipo tenga una sola forma.
          tipo: { in: ['Venta Web'] },
          nInterno: 123,
          guias: 456,
          estadoPago: 'Parcial',
        },
        {
          nInterno: { not: null, gt: 0 },
          createdAt: { gte: corte.createdAt },
        },
      ],
    })
  })

  it('rejects invalid numeric visible ventas export filters', async () => {
    await expect(buildVentasExportWhere(fakeFastify(), { nInterno: 'abc' })).resolves.toEqual({
      error: 'nInterno invalido',
    })
    await expect(buildVentasExportWhere(fakeFastify(), { guia: '0' })).resolves.toEqual({
      error: 'guia invalida',
    })
  })
})
