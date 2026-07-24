import { describe, it, expect } from 'vitest'
import { HOSTS, getSemilla, getToken, parseEstadoEnvio } from '../src/facturacion/siiClient.js'

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

  it('conserva los contadores EPR para distinguir sobre procesado de DTE aceptado', () => {
    const parsed = parseEstadoEnvio(`
      <SII:RESPUESTA><SII:RESP_BODY><TIPO_DOCTO>33</TIPO_DOCTO>
      <INFORMADOS>1</INFORMADOS><ACEPTADOS>0</ACEPTADOS>
      <RECHAZADOS>1</RECHAZADOS><REPAROS>0</REPAROS></SII:RESP_BODY>
      <SII:RESP_HDR><ESTADO>EPR</ESTADO><GLOSA>Envio Procesado</GLOSA></SII:RESP_HDR></SII:RESPUESTA>
    `)
    expect(parsed).toMatchObject({
      estado: 'EPR',
      resumen: { tipoDte: 33, informados: 1, aceptados: 0, rechazados: 1, reparos: 0 }
    })
  })
})
