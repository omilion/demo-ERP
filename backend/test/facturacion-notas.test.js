import { describe, expect, it } from 'vitest'
import { assertNotaDteInput, evaluarDocumentoParaNota, motivosPermitidosNota } from '../src/facturacion/notas.js'

const factura = {
  id: 10,
  tipoDte: 33,
  folio: 501,
  estado: 'aceptado',
  receptor: { rut: '76.354.051-0' },
  totales: { total: 119000 },
  referencias: [],
}

describe('flujo de Notas de Crédito y Débito SII', () => {
  it('usa el catálogo SII correcto: 2 texto y 3 montos', () => {
    expect(motivosPermitidosNota(61, 33)).toEqual([
      { codigo: 1, label: 'Anula el documento de referencia' },
      { codigo: 2, label: 'Corrige texto del documento de referencia' },
      { codigo: 3, label: 'Corrige montos' },
    ])
    expect(motivosPermitidosNota(56, 33)).toEqual([{ codigo: 3, label: 'Corrige montos' }])
    expect(motivosPermitidosNota(56, 61).map(motivo => motivo.codigo)).toEqual([1, 3])
  })

  it('descuenta NC parciales del saldo y evita anular el total después', () => {
    const parcial = {
      id: 20,
      tipoDte: 61,
      estado: 'aceptado',
      totales: { total: 19000 },
      referencias: [{ docLocalId: factura.id, codRef: 3 }],
    }
    const result = evaluarDocumentoParaNota({ documento: factura, tipoNota: 61, notas: [factura, parcial] })
    expect(result.saldoDisponible).toBe(100000)
    expect(result.motivosPermitidos.map(motivo => motivo.codigo)).toEqual([2, 3])
  })

  it('oculta un documento que ya fue anulado por una nota vigente', () => {
    const anulacion = {
      id: 21,
      tipoDte: 61,
      estado: 'enviado',
      totales: { total: 119000 },
      referencias: [{ docLocalId: factura.id, codRef: 1 }],
    }
    expect(evaluarDocumentoParaNota({ documento: factura, tipoNota: 61, notas: [factura, anulacion] }).elegible).toBe(false)
  })

  it('rechaza una NC de monto superior al saldo disponible', async () => {
    const parcial = {
      id: 20,
      tipoDte: 61,
      estado: 'aceptado',
      totales: { total: 19000 },
      referencias: [{ docLocalId: factura.id, codRef: 3 }],
    }
    const db = {
      documentos: {
        get: async id => Number(id) === factura.id ? factura : null,
        list: async () => [factura, parcial],
      },
    }
    await expect(assertNotaDteInput({
      doc: {
        tipoDte: 61,
        receptor: { rut: '76.354.051-0' },
        totales: { total: 110000 },
        referencias: [{ docLocalId: factura.id, codRef: 3, razon: 'Devolución parcial' }],
      },
      db,
    })).rejects.toThrow(/saldo disponible/i)
  })

  it('acepta corrección de texto por cero y exige el mismo RUT', async () => {
    const db = { documentos: { get: async () => factura, list: async () => [factura] } }
    await expect(assertNotaDteInput({
      doc: {
        tipoDte: 61,
        receptor: { rut: '76.354.051-0' },
        totales: { total: 0 },
        referencias: [{ docLocalId: factura.id, codRef: 2, razon: 'Corrige glosa' }],
      },
      db,
    })).resolves.toBeUndefined()
    await expect(assertNotaDteInput({
      doc: {
        tipoDte: 61,
        receptor: { rut: '11.111.111-1' },
        totales: { total: 0 },
        referencias: [{ docLocalId: factura.id, codRef: 2, razon: 'Corrige glosa' }],
      },
      db,
    })).rejects.toThrow(/mismo RUT/i)
  })
})
