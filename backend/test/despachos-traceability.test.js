import { describe, expect, it } from 'vitest'
import { resolveDispatchTraceability } from '../src/routes/despachos/index.js'

function prismaMock({
  orden = { id: 10, nInterno: 9001, clienteId: 1 },
  odt = { id: 5, ordenId: 10 },
} = {}) {
  return {
    orden: {
      findUnique: async ({ where }) => {
        if (!orden) return null
        if (where.id !== undefined && where.id !== orden.id) return null
        if (where.nInterno !== undefined && where.nInterno !== orden.nInterno) return null
        return orden
      },
    },
    odt: {
      findUnique: async ({ where }) => {
        if (!odt || where.id !== odt.id) return null
        return odt
      },
    },
  }
}

describe('resolveDispatchTraceability', () => {
  it('resolves a dispatch by ordenId', async () => {
    const result = await resolveDispatchTraceability(prismaMock(), {
      ordenId: 10,
    })

    expect(result).toMatchObject({
      orden: { id: 10 },
      odt: null,
      nInterno: 9001,
      origenTipo: 'orden',
      origenId: 10,
    })
  })

  it('resolves a dispatch by odtId and derives its orden', async () => {
    const result = await resolveDispatchTraceability(prismaMock(), {
      odtId: 5,
    })

    expect(result).toMatchObject({
      orden: { id: 10 },
      odt: { id: 5, ordenId: 10 },
      nInterno: 9001,
      origenTipo: 'odt',
      origenId: 5,
    })
  })

  it('rejects crossed orden and odt references', async () => {
    const result = await resolveDispatchTraceability(prismaMock({
      orden: { id: 11, nInterno: 9002, clienteId: 1 },
      odt: { id: 5, ordenId: 10 },
    }), {
      ordenId: 11,
      odtId: 5,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'ODT no pertenece a la orden indicada',
    })
  })

  it('rejects nInterno mismatched with ordenId', async () => {
    const result = await resolveDispatchTraceability(prismaMock(), {
      ordenId: 10,
      nInterno: 9002,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'nInterno no coincide con la orden indicada',
    })
  })

  it('rejects origen odt without odtId', async () => {
    const result = await resolveDispatchTraceability(prismaMock(), {
      ordenId: 10,
      origenTipo: 'odt',
      origenId: 5,
    })

    expect(result).toMatchObject({
      status: 400,
      error: 'odtId requerido para origen odt',
    })
  })
})
