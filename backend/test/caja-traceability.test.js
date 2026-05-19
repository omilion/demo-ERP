import { describe, expect, it } from 'vitest'
import { resolveCajaMovementTraceability } from '../src/routes/caja/movimientos.js'

function prismaMock({ orden = { id: 10 }, gasto = { id: 3, activo: true } } = {}) {
  return {
    orden: {
      findUnique: async ({ where }) => {
        if (!orden || where.id !== orden.id) return null
        return { id: orden.id, nInterno: orden.nInterno ?? null, clienteId: orden.clienteId ?? null }
      },
    },
    gasto: {
      findUnique: async ({ where }) => {
        if (!gasto || where.id !== gasto.id) return null
        return gasto
      },
    },
  }
}

describe('resolveCajaMovementTraceability', () => {
  it('rejects egresos without gasto or orden', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock(), {
      tipo: 'Egreso',
    })

    expect(result).toMatchObject({
      status: 400,
      error: 'gastoTipoId u ordenId requerido para egreso',
    })
  })

  it('rejects gasto type on ingresos', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock(), {
      tipo: 'Ingreso',
      gastoTipoId: 3,
    })

    expect(result).toMatchObject({
      status: 400,
      error: 'gastoTipoId solo aplica a egresos',
    })
  })

  it('rejects inactive gasto types', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock({
      gasto: { id: 3, activo: false },
    }), {
      tipo: 'Egreso',
      gastoTipoId: 3,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'Tipo de gasto inactivo',
    })
  })

  it('classifies order linked movements', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock(), {
      tipo: 'Ingreso',
      ordenId: 10,
    })

    expect(result).toMatchObject({
      ordenId: 10,
      gastoTipoId: null,
      origenTipo: 'orden',
      origenId: 10,
    })
  })

  it('classifies expense linked movements', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock(), {
      tipo: 'Egreso',
      gastoTipoId: 3,
    })

    expect(result).toMatchObject({
      ordenId: null,
      gastoTipoId: 3,
      origenTipo: 'gasto',
      origenId: 3,
    })
  })
})
