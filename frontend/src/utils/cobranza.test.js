import { describe, expect, it } from 'vitest'
import { activeReferentialDocs, collectibleDocuments, docPaidAmount, docSaldo } from './cobranza'

const factura = {
  id: 1,
  tipo: 'Ingreso',
  monto: 10_000,
  medioPago: 'Referencial',
  documento: 'Factura Plast',
  nDoc: '123',
  estadoDoc: 'Activa',
}

describe('documentos cobrables', () => {
  it('no habilita el cobro sin una factura o boleta activa', () => {
    expect(collectibleDocuments({ pagos: [] })).toEqual([])
    expect(collectibleDocuments({ pagos: [{ ...factura, estadoDoc: 'Nula' }] })).toEqual([])
  })

  it('mantiene cobrable un documento con saldo para permitir abonos parciales', () => {
    const abono = { tipo: 'Ingreso', monto: 4_000, medioPago: 'Efectivo', documento: 'Factura Plast', nDoc: '123' }
    const venta = { pagos: [factura, abono] }

    expect(activeReferentialDocs(venta)).toEqual([factura])
    expect(docPaidAmount(venta, factura)).toBe(4_000)
    expect(docSaldo(venta, factura)).toBe(6_000)
    expect(collectibleDocuments(venta)).toEqual([factura])
  })

  it('deja de ofrecer el pago cuando el documento ya esta saldado', () => {
    const pago = { tipo: 'Ingreso', monto: 10_000, medioPago: 'Transferencia', documento: 'Factura Plast', nDoc: '123' }
    expect(collectibleDocuments({ pagos: [factura, pago] })).toEqual([])
  })

  it('ignora pagos anulados al calcular el saldo del documento', () => {
    const pagoAnulado = { tipo: 'Ingreso', monto: 10_000, medioPago: 'Efectivo', documento: 'Factura Plast', nDoc: '123', eliminado: true }
    expect(docSaldo({ pagos: [factura, pagoAnulado] }, factura)).toBe(10_000)
  })
})
