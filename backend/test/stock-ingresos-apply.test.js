import { describe, expect, it, vi } from 'vitest'
import { normalizeDetalleDestino, validateAndApplyStockIngreso } from '../src/routes/stock-ingresos/apply.js'

describe('stock ingresos apply helper', () => {
  it('normalizes supported destinations', () => {
    expect(normalizeDetalleDestino('producto')).toBe('producto')
    expect(normalizeDetalleDestino('material')).toBe('material')
    expect(normalizeDetalleDestino('tela')).toBe('tela')
    expect(normalizeDetalleDestino('otro')).toBe('producto')
  })

  it('rejects decimal quantities for commercial products only', async () => {
    const tx = {
      producto: { findMany: vi.fn() },
      bodegaTaller: { findMany: vi.fn() },
      tela: { findMany: vi.fn() },
    }
    const result = await validateAndApplyStockIngreso({
      tx,
      detalles: [{ codigoInterno: 'P1', destino: 'producto', cantidad: 1.5 }],
      pago: { id: 1 },
      userId: 1,
    })
    expect(result.error).toMatch(/cantidad debe ser entera/)
  })

  it('applies mixed product, material and fabric stock with traceability', async () => {
    const tx = {
      producto: {
        findMany: vi.fn().mockResolvedValue([{ id: 1, codigoInterno: 'P1' }]),
        update: vi.fn().mockResolvedValue({}),
      },
      bodegaTaller: {
        findMany: vi.fn().mockResolvedValue([{ id: 2, codigoInterno: 'M1' }]),
        update: vi.fn().mockResolvedValue({}),
      },
      tela: {
        findMany: vi.fn().mockResolvedValue([{ id: 3, codigo: 'T1' }]),
        update: vi.fn().mockResolvedValue({}),
      },
      movimientoBodega: { create: vi.fn().mockResolvedValue({}) },
      bodegaTallerMovimiento: { create: vi.fn().mockResolvedValue({}) },
      telaMovimiento: { create: vi.fn().mockResolvedValue({}) },
    }
    const result = await validateAndApplyStockIngreso({
      tx,
      detalles: [
        { codigoInterno: 'P1', destino: 'producto', cantidad: 2 },
        { codigoInterno: 'M1', destino: 'material', cantidad: 1.5 },
        { codigoInterno: 'T1', destino: 'tela', cantidad: 3.25 },
      ],
      pago: { id: 9, documento: 'Factura', nDoc: 'F-1', usuario: 'QA' },
      userId: 7,
    })
    expect(result.aplicados).toHaveLength(3)
    expect(tx.movimientoBodega.create).toHaveBeenCalledOnce()
    expect(tx.bodegaTallerMovimiento.create).toHaveBeenCalledOnce()
    expect(tx.telaMovimiento.create).toHaveBeenCalledOnce()
    expect(tx.movimientoBodega.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productoId: 1,
        pagoProveedorId: 9,
        origenTipo: 'pago_proveedor',
        origenId: 9,
        userId: 7,
      }),
    })
    expect(tx.bodegaTallerMovimiento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bodegaTallerId: 2,
        pagoProveedorId: 9,
        origenTipo: 'pago_proveedor',
        origenId: 9,
        userId: 7,
      }),
    })
    expect(tx.telaMovimiento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        telaId: 3,
        pagoProveedorId: 9,
        origenTipo: 'pago_proveedor',
        origenId: 9,
        usuario: 'QA',
      }),
    })
  })

  it('preflights mixed destinations before mutating stock', async () => {
    const tx = {
      producto: {
        findMany: vi.fn().mockResolvedValue([{ id: 1, codigoInterno: 'P1' }]),
        update: vi.fn(),
      },
      bodegaTaller: {
        findMany: vi.fn().mockResolvedValue([{ id: 2, codigoInterno: 'M1' }]),
        update: vi.fn(),
      },
      tela: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      movimientoBodega: { create: vi.fn() },
      bodegaTallerMovimiento: { create: vi.fn() },
      telaMovimiento: { create: vi.fn() },
    }
    const result = await validateAndApplyStockIngreso({
      tx,
      detalles: [
        { codigoInterno: 'P1', destino: 'producto', cantidad: 2 },
        { codigoInterno: 'M1', destino: 'material', cantidad: 1.5 },
        { codigoInterno: 'T-MISSING', destino: 'tela', cantidad: 3.25 },
      ],
      pago: { id: 9, documento: 'Factura', nDoc: 'F-1', usuario: 'QA' },
      userId: 7,
    })

    expect(result).toMatchObject({
      error: 'items no encontrados para ingresar stock',
      items: [{ codigoInterno: 'T-MISSING', destino: 'tela' }],
    })
    expect(tx.producto.update).not.toHaveBeenCalled()
    expect(tx.bodegaTaller.update).not.toHaveBeenCalled()
    expect(tx.tela.update).not.toHaveBeenCalled()
    expect(tx.movimientoBodega.create).not.toHaveBeenCalled()
    expect(tx.bodegaTallerMovimiento.create).not.toHaveBeenCalled()
    expect(tx.telaMovimiento.create).not.toHaveBeenCalled()
  })
})
