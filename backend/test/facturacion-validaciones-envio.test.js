import { describe, expect, it, vi } from 'vitest'
import { assertMismoReceptorReferencia, estadoDesdeRespuestaSii, findDocumentoVentaVigente, requiereConsultaIndividualDte } from '../src/facturacion/engine.js'
import { enviarLotePorTipo } from '../src/routes/facturacion/index.js'

describe('facturacion/validaciones de venta', () => {
  const candidata = { id: 20, ordenId: 77, tipoDte: 33, estado: 'borrador' }
  const factura = { id: 10, ordenId: 77, tipoDte: 33, folio: 501, estado: 'emitido', referencias: [] }

  it('bloquea una segunda Factura/Boleta activa para la misma venta', () => {
    expect(findDocumentoVentaVigente(candidata, [factura, candidata])).toEqual(factura)
  })

  it('permite facturar nuevamente cuando una NC activa referencia la factura por docLocalId', () => {
    const nc = { id: 11, ordenId: 77, tipoDte: 61, estado: 'emitido', referencias: [{ docLocalId: factura.id, razon: 'Anula' }] }
    expect(findDocumentoVentaVigente(candidata, [factura, nc, candidata])).toBeNull()
  })

  it('una NC rechazada no libera la venta y las guias no participan en la restriccion', () => {
    const ncRechazada = { id: 12, ordenId: 77, tipoDte: 61, estado: 'rechazado', referencias: [{ docLocalId: factura.id }] }
    expect(findDocumentoVentaVigente(candidata, [factura, ncRechazada])).toEqual(factura)
    expect(findDocumentoVentaVigente({ ...candidata, tipoDte: 52 }, [factura])).toBeNull()
  })

  it('impide que una NC/ND local referencie un DTE de otro receptor', () => {
    const nota = { tipoDte: 61, receptor: { rut: '11.111.111-1' } }
    const mismoReceptor = { receptor: { rut: '11111111-1' } }
    const otroReceptor = { receptor: { rut: '22.222.222-2' } }
    expect(() => assertMismoReceptorReferencia(nota, mismoReceptor)).not.toThrow()
    expect(() => assertMismoReceptorReferencia(nota, otroReceptor)).toThrow(/mismo receptor/)
  })
})

describe('facturacion/estado SII', () => {
  it('solo acepta EPR cuando todos los DTE informados fueron aceptados', () => {
    expect(estadoDesdeRespuestaSii('enviado', {
      estado: 'EPR',
      resumen: { informados: 1, aceptados: 1, rechazados: 0 }
    })).toBe('aceptado')
    expect(estadoDesdeRespuestaSii('enviado', {
      estado: 'EPR',
      resumen: { informados: 1, aceptados: 0, rechazados: 1 }
    })).toBe('rechazado')
    expect(estadoDesdeRespuestaSii('enviado', { estado: 'SOK' })).toBe('enviado')
    expect(estadoDesdeRespuestaSii('enviado', { estado: 'DOK' })).toBe('aceptado')
  })

  it('consulta el DTE individual cuando EPR informa rechazo, reparos o no decide el resultado', () => {
    expect(requiereConsultaIndividualDte({
      estado: 'EPR',
      resumen: { informados: 1, aceptados: 0, rechazados: 1, reparos: 0 }
    })).toBe(true)
    expect(requiereConsultaIndividualDte({
      estado: 'EPR',
      resumen: { informados: 1, aceptados: 0, rechazados: 0, reparos: 1 }
    })).toBe(true)
    expect(requiereConsultaIndividualDte({
      estado: 'EPR',
      resumen: { informados: 1, aceptados: 1, rechazados: 0, reparos: 0 }
    })).toBe(false)
  })
})

describe('facturacion/envio de lote', () => {
  it('separa boletas del resto y devuelve exito/error por documento sin contactar al SII real', async () => {
    const docs = new Map([
      [1, { id: 1, tipoDte: 39, folio: 101, estado: 'emitido' }],
      [2, { id: 2, tipoDte: 33, folio: 201, estado: 'emitido' }],
      [3, { id: 3, tipoDte: 52, folio: 301, estado: 'emitido' }],
    ])
    const db = { documentos: { get: vi.fn(id => Promise.resolve(docs.get(Number(id)) || null)) } }
    const engine = {
      enviar: vi.fn(async ids => {
        if (ids.includes(2)) throw new Error('Sobre DTE rechazado por mock')
        return { trackId: 'TRACK-BOLETA', documentos: ids.map(id => ({ ...docs.get(id), estado: 'enviado' })) }
      }),
    }

    const result = await enviarLotePorTipo({ ids: [1, 2, 3, 999], db, engine })

    expect(engine.enviar).toHaveBeenNthCalledWith(1, [1])
    expect(engine.enviar).toHaveBeenNthCalledWith(2, [2, 3])
    expect(result).toMatchObject({ exitosos: 1, fallidos: 3 })
    expect(result.resultados).toEqual([
      expect.objectContaining({ id: 1, ok: true, trackId: 'TRACK-BOLETA' }),
      expect.objectContaining({ id: 2, ok: false, error: 'Sobre DTE rechazado por mock' }),
      expect.objectContaining({ id: 3, ok: false, error: 'Sobre DTE rechazado por mock' }),
      expect.objectContaining({ id: 999, ok: false, error: 'Documento no encontrado.' }),
    ])
  })
})
