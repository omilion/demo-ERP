import { describe, expect, it, vi } from 'vitest'
import {
  ODT_ESTADOS,
  ODT_ESTADOS_ABIERTOS,
  ODT_ESTADOS_ACTUALES,
  applyOdtStateSideEffects,
  attachOperarios,
  buildOdtUpdateBitacoraEntries,
  buildOperarioCargaItems,
  isOpenOdtEstado,
  isTerminalOdtEstado,
  validateOperario,
} from '../src/routes/odts/operations.js'

const NOW = new Date('2026-05-23T12:00:00.000Z')

describe('ODT operation helpers', () => {
  it('keeps the accepted ODT states explicit, including legacy Prioritaria only in the full list', () => {
    expect(ODT_ESTADOS).toEqual([
      'Pendiente',
      'Asignada',
      'En proceso',
      'Control calidad',
      'Terminada',
      'Entregada',
      'Prioritaria',
      'Anulada',
    ])
    expect(ODT_ESTADOS_ACTUALES).toEqual([
      'Pendiente',
      'Asignada',
      'En proceso',
      'Control calidad',
      'Terminada',
      'Entregada',
    ])
    expect(ODT_ESTADOS_ABIERTOS).toEqual([
      'Pendiente',
      'Asignada',
      'En proceso',
      'Control calidad',
      'Prioritaria',
    ])
    expect(isTerminalOdtEstado('Terminada')).toBe(true)
    expect(isTerminalOdtEstado('Entregada')).toBe(true)
    expect(isTerminalOdtEstado('Anulada')).toBe(true)
    expect(isTerminalOdtEstado('En proceso')).toBe(false)
    expect(isOpenOdtEstado('Pendiente')).toBe(true)
    expect(isOpenOdtEstado('Terminada')).toBe(false)
  })

  it('sets fechaInicio when moving to En proceso and leaves other states untouched', () => {
    expect(applyOdtStateSideEffects({ estado: 'En proceso' }, {}, NOW)).toEqual({
      estado: 'En proceso',
      fechaInicio: NOW,
    })

    expect(applyOdtStateSideEffects({ estado: 'Asignada' }, {}, NOW)).toEqual({
      estado: 'Asignada',
    })
  })

  it('sets fechaTermino when moving to Terminada or Entregada', () => {
    expect(applyOdtStateSideEffects({ estado: 'Terminada' }, {}, NOW)).toEqual({
      estado: 'Terminada',
      fechaTermino: NOW,
    })

    expect(applyOdtStateSideEffects({ estado: 'Entregada' }, {}, NOW)).toEqual({
      estado: 'Entregada',
      fechaTermino: NOW,
    })

    expect(applyOdtStateSideEffects({ estado: 'Anulada' }, {}, NOW)).toEqual({
      estado: 'Anulada',
      fechaTermino: NOW,
      eliminado: true,
    })
  })

  it('does not overwrite existing or explicitly provided operational dates', () => {
    const existingInicio = new Date('2026-05-20T08:00:00.000Z')
    const existingTermino = new Date('2026-05-21T16:00:00.000Z')
    const explicitInicio = new Date('2026-05-22T09:30:00.000Z')
    const explicitTermino = new Date('2026-05-22T18:15:00.000Z')

    expect(applyOdtStateSideEffects(
      { estado: 'En proceso' },
      { fechaInicio: existingInicio },
      NOW,
    )).toEqual({ estado: 'En proceso' })

    expect(applyOdtStateSideEffects(
      { estado: 'Terminada' },
      { fechaTermino: existingTermino },
      NOW,
    )).toEqual({ estado: 'Terminada' })

    expect(applyOdtStateSideEffects(
      { estado: 'En proceso', fechaInicio: explicitInicio },
      {},
      NOW,
    )).toEqual({ estado: 'En proceso', fechaInicio: explicitInicio })

    expect(applyOdtStateSideEffects(
      { estado: 'Entregada', fechaTermino: explicitTermino },
      {},
      NOW,
    )).toEqual({ estado: 'Entregada', fechaTermino: explicitTermino })
  })

  it('clears fechaTermino when reopening to an open state unless explicitly provided', () => {
    const existingTermino = new Date('2026-05-21T16:00:00.000Z')

    expect(applyOdtStateSideEffects(
      { estado: 'Pendiente' },
      { estado: 'Terminada', fechaTermino: existingTermino },
      NOW,
    )).toEqual({ estado: 'Pendiente', fechaTermino: null })

    expect(applyOdtStateSideEffects(
      { estado: 'En proceso' },
      { estado: 'Entregada', fechaInicio: new Date('2026-05-20T08:00:00.000Z'), fechaTermino: existingTermino },
      NOW,
    )).toEqual({ estado: 'En proceso', fechaTermino: null })

    expect(applyOdtStateSideEffects(
      { estado: 'Pendiente', fechaTermino: existingTermino },
      { estado: 'Terminada', fechaTermino: existingTermino },
      NOW,
    )).toEqual({ estado: 'Pendiente', fechaTermino: existingTermino })
  })

  it('validates operario with an active trabajador lookup and allows empty values', async () => {
    const trabajador = {
      id: 10,
      nombres: 'Ana',
      apellidoPaterno: 'Rojas',
      apellidoMaterno: 'Diaz',
      cargo: 'Tapicera',
      empresa: 'Plastimar',
    }
    const prisma = {
      trabajador: {
        findFirst: vi.fn().mockResolvedValue(trabajador),
      },
    }

    await expect(validateOperario(prisma, undefined)).resolves.toBeNull()
    await expect(validateOperario(prisma, null)).resolves.toBeNull()
    await expect(validateOperario(prisma, 10)).resolves.toBe(trabajador)

    expect(prisma.trabajador.findFirst).toHaveBeenCalledTimes(1)
    expect(prisma.trabajador.findFirst).toHaveBeenCalledWith({
      where: { id: 10, estado: true },
      select: {
        id: true,
        nombres: true,
        apellidoPaterno: true,
        apellidoMaterno: true,
        cargo: true,
        empresa: true,
      },
    })
  })

  it('returns a validation error when operario is missing or inactive', async () => {
    const prisma = {
      trabajador: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }

    await expect(validateOperario(prisma, 99)).resolves.toEqual({
      error: 'Operario no encontrado o inactivo',
    })
  })

  it('enriches ODTs with operario records using one distinct trabajador query', async () => {
    const trabajadores = [
      { id: 1, nombres: 'Ana', apellidoPaterno: 'Rojas', apellidoMaterno: null, cargo: 'Tapicera', empresa: 'Plastimar', estado: true },
      { id: 2, nombres: 'Luis', apellidoPaterno: 'Perez', apellidoMaterno: 'Soto', cargo: 'Cortador', empresa: 'Plastimar', estado: false },
    ]
    const prisma = {
      trabajador: {
        findMany: vi.fn().mockResolvedValue(trabajadores),
      },
    }
    const odts = [
      { id: 100, operarioId: 1 },
      { id: 101, operarioId: 1 },
      { id: 102, operarioId: 2 },
      { id: 103, operarioId: 999 },
      { id: 104, operarioId: null },
    ]

    const enriched = await attachOperarios(prisma, odts)

    expect(prisma.trabajador.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.trabajador.findMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2, 999] } },
      select: {
        id: true,
        nombres: true,
        apellidoPaterno: true,
        apellidoMaterno: true,
        cargo: true,
        empresa: true,
        estado: true,
      },
    })
    expect(enriched).toEqual([
      { id: 100, operarioId: 1, operario: trabajadores[0] },
      { id: 101, operarioId: 1, operario: trabajadores[0] },
      { id: 102, operarioId: 2, operario: trabajadores[1] },
      { id: 103, operarioId: 999, operario: null },
      { id: 104, operarioId: null, operario: null },
    ])
  })

  it('enriches a single ODT and skips Prisma when no operarioId exists', async () => {
    const prismaWithoutIds = {
      trabajador: {
        findMany: vi.fn(),
      },
    }
    await expect(attachOperarios(prismaWithoutIds, { id: 1, operarioId: null })).resolves.toEqual({
      id: 1,
      operarioId: null,
      operario: null,
    })
    expect(prismaWithoutIds.trabajador.findMany).not.toHaveBeenCalled()

    const trabajador = { id: 5, nombres: 'Marta', apellidoPaterno: 'Vega', apellidoMaterno: null, cargo: 'Jefa taller', empresa: 'Plastimar', estado: true }
    const prismaWithId = {
      trabajador: {
        findMany: vi.fn().mockResolvedValue([trabajador]),
      },
    }

    await expect(attachOperarios(prismaWithId, { id: 2, operarioId: 5 })).resolves.toEqual({
      id: 2,
      operarioId: 5,
      operario: trabajador,
    })
  })

  it('builds audit bitacora entries for state and responsible changes', () => {
    const entries = buildOdtUpdateBitacoraEntries({
      current: { id: 15, estado: 'Pendiente', operarioId: null, sucursalId: 3 },
      data: { estado: 'En proceso', operarioId: 7 },
      operario: { id: 7, nombres: 'Ana', apellidoPaterno: 'Rojas' },
      user: { nombre: 'Jefe Taller' },
    })

    expect(entries).toEqual([
      {
        odtId: 15,
        usuario: 'Jefe Taller',
        usuarioReporta: 'Jefe Taller',
        sucursalId: 3,
        fecha: expect.any(Date),
        texto: 'Estado ODT: Pendiente -> En proceso',
      },
      {
        odtId: 15,
        usuario: 'Jefe Taller',
        usuarioReporta: 'Jefe Taller',
        sucursalId: 3,
        fecha: expect.any(Date),
        texto: 'Responsable ODT actualizado: Ana Rojas',
      },
    ])
  })

  it('builds open workload by responsible worker and sorts by total', () => {
    const groups = [
      { operarioId: 2, estado: 'Pendiente', _count: { _all: 1 } },
      { operarioId: 1, estado: 'En proceso', _count: { _all: 3 } },
      { operarioId: 1, estado: 'Control calidad', _count: { _all: 2 } },
      { operarioId: null, estado: 'Pendiente', _count: { _all: 9 } },
    ]
    const trabajadores = [
      { id: 1, nombres: 'Luis', apellidoPaterno: 'Soto' },
      { id: 2, nombres: 'Ana', apellidoPaterno: 'Rojas' },
    ]

    expect(buildOperarioCargaItems(groups, trabajadores)).toEqual([
      {
        operarioId: 1,
        operario: trabajadores[0],
        total: 5,
        estados: {
          Pendiente: 0,
          Asignada: 0,
          'En proceso': 3,
          'Control calidad': 2,
          Prioritaria: 0,
        },
      },
      {
        operarioId: 2,
        operario: trabajadores[1],
        total: 1,
        estados: {
          Pendiente: 1,
          Asignada: 0,
          'En proceso': 0,
          'Control calidad': 0,
          Prioritaria: 0,
        },
      },
    ])
  })
})
