import { describe, expect, it } from 'vitest'
import {
  buildGuideWhereForDespacho,
  resolveDispatchTraceability,
  validateDispatchFilterCoherence,
} from '../src/routes/despachos/index.js'

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

  it('rejects odt origin without odtId', async () => {
    const result = await resolveDispatchTraceability(prismaMock(), {
      ordenId: 10,
      origenTipo: 'odt',
      origenId: 5,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'origenTipo debe ser orden sin odtId',
    })
  })

  it('rejects order origin when odtId is informed', async () => {
    const result = await resolveDispatchTraceability(prismaMock(), {
      ordenId: 10,
      odtId: 5,
      origenTipo: 'orden',
      origenId: 10,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'origenTipo debe ser odt cuando se informa odtId',
    })
  })
})

describe('validateDispatchFilterCoherence', () => {
  it('accepts coherent orden, odt and nInterno filters', async () => {
    const result = await validateDispatchFilterCoherence(prismaMock(), {
      ordenId: 10,
      odtId: 5,
      nInterno: 9001,
      origenTipo: 'odt',
      origenId: 5,
    })

    expect(result).toMatchObject({
      filters: {
        ordenId: 10,
        odtId: 5,
        nInterno: 9001,
        origenTipo: 'odt',
        origenId: 5,
      },
    })
  })

  it('rejects crossed orden and odt filters', async () => {
    const result = await validateDispatchFilterCoherence(prismaMock({
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

  it('rejects crossed orden and nInterno filters', async () => {
    const result = await validateDispatchFilterCoherence(prismaMock(), {
      ordenId: 10,
      nInterno: 9002,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'nInterno no coincide con la orden indicada',
    })
  })

  it('rejects crossed origen and odt filters', async () => {
    const result = await validateDispatchFilterCoherence(prismaMock(), {
      odtId: 5,
      origenTipo: 'odt',
      origenId: 6,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'origenId no coincide con odtId',
    })
  })

  it('rejects crossed order origin and odt filters', async () => {
    const result = await validateDispatchFilterCoherence(prismaMock({
      odt: { id: 5, ordenId: 10 },
    }), {
      odtId: 5,
      origenTipo: 'orden',
      origenId: 11,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'ODT no pertenece a la orden indicada',
    })
  })

  it('rejects crossed odt origin and orden filters', async () => {
    const result = await validateDispatchFilterCoherence(prismaMock({
      orden: { id: 11, nInterno: 9002, clienteId: 1 },
      odt: { id: 5, ordenId: 10 },
    }), {
      ordenId: 11,
      origenTipo: 'odt',
      origenId: 5,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'ODT no pertenece a la orden indicada',
    })
  })
})

describe('buildGuideWhereForDespacho', () => {
  it('scopes guides for an odt dispatch to the same odt trace', () => {
    expect(buildGuideWhereForDespacho({
      ordenId: 10,
      odtId: 5,
      origenTipo: 'odt',
      origenId: 5,
    })).toEqual({
      ordenId: 10,
      OR: [
        { odtId: 5 },
        { origenTipo: 'odt', origenId: 5 },
      ],
    })
  })

  it('scopes guides for an order dispatch away from other odts', () => {
    expect(buildGuideWhereForDespacho({
      ordenId: 10,
      odtId: null,
      origenTipo: 'orden',
      origenId: 10,
    })).toEqual({
      ordenId: 10,
      OR: [
        { odtId: null },
        { origenTipo: 'orden', origenId: 10 },
        { origenTipo: null, origenId: null },
      ],
    })
  })
})
