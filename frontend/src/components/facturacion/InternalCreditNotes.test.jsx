import { describe, expect, it } from 'vitest'
import { hasActiveSalesDte } from '../../utils/facturacion'

describe('hasActiveSalesDte', () => {
  it.each(['emitido', 'enviado', 'aceptado'])('bloquea la NC interna con una venta DTE en estado %s', estado => {
    expect(hasActiveSalesDte([{ tipoDte: 33, estado }])).toBe(true)
    expect(hasActiveSalesDte([{ tipoDte: '39', estado }])).toBe(true)
  })

  it.each(['borrador', 'rechazado', 'error', 'anulado'])('permite la NC interna con una venta DTE en estado %s', estado => {
    expect(hasActiveSalesDte([{ tipoDte: 33, estado }])).toBe(false)
  })

  it('no confunde notas de credito o debito SII con la factura o boleta de la venta', () => {
    expect(hasActiveSalesDte([
      { tipoDte: 56, estado: 'aceptado' },
      { tipoDte: 61, estado: 'aceptado' },
    ])).toBe(false)
  })
})
