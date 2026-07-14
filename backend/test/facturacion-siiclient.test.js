import { describe, it, expect } from 'vitest'
import { HOSTS, getSemilla, getToken } from '../src/facturacion/siiClient.js'

describe('facturacion/siiClient', () => {
  it('HOSTS maps certificacion to maullin/apicert/pangal and produccion to palena/api/rahue', () => {
    expect(HOSTS.certificacion).toEqual({
      soap: 'maullin.sii.cl',
      boletaApi: 'apicert.sii.cl',
      boletaEnvio: 'pangal.sii.cl'
    })
    expect(HOSTS.produccion).toEqual({
      soap: 'palena.sii.cl',
      boletaApi: 'api.sii.cl',
      boletaEnvio: 'rahue.sii.cl'
    })
  })

  it('exports the expected function surface for the engine', () => {
    expect(typeof getSemilla).toBe('function')
    expect(typeof getToken).toBe('function')
  })
})
