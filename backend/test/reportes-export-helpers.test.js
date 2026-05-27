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

  it('keeps odt export filters aligned with taller list filters', () => {
    expect(buildOdtExportWhere({ estado: 'Anulada' }).where).toMatchObject({
      eliminado: false,
      estado: 'Anulada',
    })
    expect(buildOdtExportWhere({ estado: 'Anulada', includeEliminados: 'true' }).where).toEqual({
      estado: 'Anulada',
    })
    expect(buildOdtExportWhere({ operarioId: 'abc' })).toEqual({ error: 'Operario invalido' })
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
          tipo: 'Venta Web',
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
