import { describe, expect, it } from 'vitest'
import {
  buildCargoListWhere,
  buildRrhhOperativoSummary,
  buildTrabajadorWhere,
  pickTrabajador,
  parseOperativoDias,
} from '../src/routes/rrhh/index.js'

const containsInsensitive = value => ({ contains: value, mode: 'insensitive' })

describe('RRHH trabajador helpers', () => {
  it('builds cargo filters and includes cargo in text search', () => {
    expect(buildTrabajadorWhere({ cargo: ' tapic ', search: ' ana ' })).toEqual({
      cargo: containsInsensitive('tapic'),
      OR: [
        { nombres: containsInsensitive('ana') },
        { apellidoPaterno: containsInsensitive('ana') },
        { apellidoMaterno: containsInsensitive('ana') },
        { rut: containsInsensitive('ana') },
        { cargo: containsInsensitive('ana') },
      ],
    })
  })

  it('parses estado filters and trabajador payload booleans', () => {
    expect(buildTrabajadorWhere({ estado: 'true' })).toEqual({ estado: true })
    expect(buildTrabajadorWhere({ estado: '1' })).toEqual({ estado: true })
    expect(buildTrabajadorWhere({ estado: 'false' })).toEqual({ estado: false })
    expect(buildTrabajadorWhere({ estado: '0' })).toEqual({ estado: false })
    expect(buildTrabajadorWhere({ estado: '' })).toEqual({})

    expect(pickTrabajador({ estado: '1' }, true)).toEqual({ estado: true })
    expect(pickTrabajador({ estado: 'false' }, true)).toEqual({ estado: false })
  })

  it('builds active non-empty cargo list filters with optional empresa', () => {
    expect(buildCargoListWhere()).toEqual({
      estado: true,
      NOT: [{ cargo: null }, { cargo: '' }],
    })

    expect(buildCargoListWhere({ empresa: ' Plastimar ' })).toEqual({
      empresa: 'Plastimar',
      estado: true,
      NOT: [{ cargo: null }, { cargo: '' }],
    })
  })

  it('bounds operativo window days', () => {
    expect(parseOperativoDias()).toBe(30)
    expect(parseOperativoDias('0')).toBe(30)
    expect(parseOperativoDias('45')).toBe(45)
    expect(parseOperativoDias('999')).toBe(180)
  })

  it('builds operational RRHH alerts and upcoming events', () => {
    const trabajadores = [
      { id: 1, nombres: 'Ana', apellidoPaterno: 'Rojas', rut: '1-9', empresa: 'plastimar', cargo: 'Costura', sueldoLiquido: '$900.000', fechaIngreso: '2025-01-01', estado: true },
      { id: 2, nombres: 'Luis', apellidoPaterno: 'Diaz', rut: '2-7', empresa: 'plastimar', cargo: '', sueldoLiquido: '', fechaIngreso: '', estado: true },
      { id: 3, nombres: 'Baja', apellidoPaterno: 'No', rut: '3-5', empresa: 'plastimar', cargo: 'Bodega', sueldoLiquido: '$1', fechaIngreso: '2025-01-01', estado: false },
    ]
    const summary = buildRrhhOperativoSummary({
      trabajadores,
      contratosPorVencer: [{ id: 10, contrato: 'Plazo fijo', termino: new Date('2026-06-20'), trabajador: trabajadores[0] }],
      licenciasActivas: [{ id: 11, tipo: 'Medica', inicio: new Date('2026-06-01'), termino: new Date('2026-06-05'), trabajador: trabajadores[1] }],
      vacacionesProgramadas: [{ id: 12, periodo: '2026', fechaInicio: new Date('2026-06-10'), fechaTermino: new Date('2026-06-15'), trabajador: trabajadores[0] }],
      now: new Date('2026-06-02T10:00:00.000Z'),
      dias: 30,
    })

    expect(summary).toMatchObject({
      dias: 30,
      rrhhSchemaDisponible: true,
      totalActivos: 2,
      alertas: {
        sinSueldo: 1,
        sinCargo: 1,
        sinFechaIngreso: 1,
        contratosPorVencer: 1,
        licenciasActivas: 1,
        vacacionesProgramadas: 1,
      },
      dotacionPorCargo: [
        { cargo: 'Costura', total: 1 },
        { cargo: 'Sin cargo', total: 1 },
      ],
      sinSueldo: [{ id: 2, nombre: 'Luis Diaz', rut: '2-7', empresa: 'plastimar', cargo: null }],
      contratosPorVencer: [{ id: 10, trabajador: { id: 1, nombre: 'Ana Rojas' }, contrato: 'Plazo fijo' }],
      licenciasActivas: [{ id: 11, trabajador: { id: 2, nombre: 'Luis Diaz' }, tipo: 'Medica' }],
      vacacionesProgramadas: [{ id: 12, trabajador: { id: 1, nombre: 'Ana Rojas' }, periodo: '2026' }],
    })
  })
})
