import { describe, expect, it } from 'vitest'
import { buildHistorialWhere } from '../src/routes/historial-materiales/index.js'

describe('historial materiales filters', () => {
  it('applies sucursal scope and legacy visible filters', () => {
    const built = buildHistorialWhere({
      desde: '2026-05-01',
      hasta: '2026-05-31',
      operario: 'ana',
      taller: 'costura',
      codigoInterno: 'TEL',
      nombre: 'lona',
      odtId: '12',
      tipoMovimiento: 'egreso',
    }, { sucursalId: 4 })

    expect(built.where).toEqual({
      AND: [{ OR: [{ sucursalId: 4 }, { sucursalId: null }] }],
      usuario: { contains: 'ana', mode: 'insensitive' },
      taller: { contains: 'costura', mode: 'insensitive' },
      codigoInterno: { contains: 'TEL', mode: 'insensitive' },
      nombre: { contains: 'lona', mode: 'insensitive' },
      odtId: 12,
      fecha: {
        gte: expect.any(Date),
        lte: expect.any(Date),
      },
      egreso: { gt: 0 },
    })
  })

  it('rejects invalid dates, odt ids and movement filters', () => {
    expect(buildHistorialWhere({ desde: '2026-02-31' })).toEqual({ error: 'Rango de fechas invalido' })
    expect(buildHistorialWhere({ odtId: 'abc' })).toEqual({ error: 'odtId invalido' })
    expect(buildHistorialWhere({ tipoMovimiento: 'otro' })).toEqual({ error: 'tipoMovimiento invalido' })
  })
})
