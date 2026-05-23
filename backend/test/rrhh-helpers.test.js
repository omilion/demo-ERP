import { describe, expect, it } from 'vitest'
import {
  buildCargoListWhere,
  buildTrabajadorWhere,
  pickTrabajador,
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
})
