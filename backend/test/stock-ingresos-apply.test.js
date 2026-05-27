import { describe, expect, it, vi } from 'vitest'
import { normalizeDetalleDestino, reverseStockIngreso, validateAndApplyStockIngreso } from '../src/routes/stock-ingresos/apply.js'

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

  it('does not create partial missing items when another missing line cannot be created', async () => {
    const tx = {
      producto: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      bodegaTaller: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      tela: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      movimientoBodega: { create: vi.fn() },
      bodegaTallerMovimiento: { create: vi.fn() },
      telaMovimiento: { create: vi.fn() },
    }
    const result = await validateAndApplyStockIngreso({
      tx,
      detalles: [
        { codigoInterno: 'NEW-OK', destino: 'producto', cantidad: 2, precio: 100, nombre: 'Nuevo OK' },
        { codigoInterno: 'NO-NAME', destino: 'material', cantidad: 1, precio: 50 },
      ],
      pago: { id: 10, documento: 'Factura', nDoc: 'F-PRE', usuario: 'QA' },
      userId: 7,
      sucursalId: 1,
    })

    expect(result).toMatchObject({
      error: 'items no encontrados para ingresar stock',
      items: [{ codigoInterno: 'NO-NAME', destino: 'material' }],
    })
    expect(tx.producto.create).not.toHaveBeenCalled()
    expect(tx.bodegaTaller.create).not.toHaveBeenCalled()
    expect(tx.producto.update).not.toHaveBeenCalled()
    expect(tx.bodegaTaller.update).not.toHaveBeenCalled()
  })

  it('rejects missing material creation with mismatched category and subcategory', async () => {
    const tx = {
      bodegaTaller: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      categoriaBodegaTaller: {
        findFirst: vi.fn().mockResolvedValue({ id: 2, activo: true }),
      },
      subcategoriaBodegaTaller: {
        findFirst: vi.fn().mockResolvedValue({ id: 3, categoriaId: 1, activo: true }),
      },
      bodegaTallerMovimiento: { create: vi.fn() },
    }
    const result = await validateAndApplyStockIngreso({
      tx,
      detalles: [
        {
          codigoInterno: 'MAT-MISMATCH',
          destino: 'material',
          cantidad: 1,
          precio: 50,
          nombre: 'Material mismatch',
          categoriaId: 2,
          subcategoriaId: 3,
        },
      ],
      pago: { id: 11, documento: 'Factura', nDoc: 'F-CAT', usuario: 'QA' },
      userId: 7,
      sucursalId: 1,
    })

    expect(result).toMatchObject({
      error: 'Subcategoria no pertenece a la categoria',
      codigoInterno: 'MAT-MISMATCH',
      destino: 'material',
    })
    expect(tx.bodegaTaller.create).not.toHaveBeenCalled()
    expect(tx.bodegaTaller.update).not.toHaveBeenCalled()
    expect(tx.bodegaTallerMovimiento.create).not.toHaveBeenCalled()
  })

  it('applies credit notes as stock egresos instead of positive ingresos', async () => {
    const tx = {
      producto: {
        findMany: vi.fn().mockResolvedValue([{ id: 1, codigoInterno: 'P1', stock: 5, precioLista: 100 }]),
        update: vi.fn().mockResolvedValue({}),
      },
      bodegaTaller: { findMany: vi.fn().mockResolvedValue([]) },
      tela: { findMany: vi.fn().mockResolvedValue([]) },
      movimientoBodega: { create: vi.fn().mockResolvedValue({}) },
    }
    const result = await validateAndApplyStockIngreso({
      tx,
      detalles: [{ codigoInterno: 'P1', destino: 'producto', cantidad: 2, precio: 90 }],
      pago: { id: 10, documento: 'Nota', nDoc: 'NC-1', usuario: 'QA' },
      userId: 7,
    })

    expect(result.aplicados).toEqual([{ codigoInterno: 'P1', destino: 'producto', ok: true, cantidad: -2 }])
    expect(tx.producto.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { stock: { increment: -2 } } })
    expect(tx.movimientoBodega.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: 'egreso', cantidad: -2, pagoProveedorId: 10 }),
    })
  })

  it('reverses an applied invoice with inverse stock movement', async () => {
    const tx = {
      producto: {
        findMany: vi.fn().mockResolvedValue([{ id: 1, codigoInterno: 'P1', stock: 5, precioLista: 100 }]),
        update: vi.fn().mockResolvedValue({}),
      },
      bodegaTaller: { findMany: vi.fn().mockResolvedValue([]) },
      tela: { findMany: vi.fn().mockResolvedValue([]) },
      movimientoBodega: { create: vi.fn().mockResolvedValue({}) },
    }
    const result = await reverseStockIngreso({
      tx,
      detalles: [{ codigoInterno: 'P1', destino: 'producto', cantidad: 2, precio: 100 }],
      pago: { id: 11, documento: 'Factura', nDoc: 'F-1', usuario: 'QA' },
      userId: 7,
    })

    expect(result.aplicados[0].cantidad).toBe(-2)
    expect(tx.movimientoBodega.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: 'egreso', origenTipo: 'pago_proveedor_reversa' }),
    })
  })

  it('creates a missing product from invoice detail before applying stock', async () => {
    const tx = {
      producto: {
        findMany: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 4, codigoInterno: 'NEW-1', stock: 0, precioLista: 500 }]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      bodegaTaller: { findMany: vi.fn().mockResolvedValue([]) },
      tela: { findMany: vi.fn().mockResolvedValue([]) },
      movimientoBodega: { create: vi.fn().mockResolvedValue({}) },
    }
    const result = await validateAndApplyStockIngreso({
      tx,
      detalles: [{ codigoInterno: 'NEW-1', destino: 'producto', cantidad: 3, precio: 500, nombre: 'Nuevo producto', unidadMedida: 'un' }],
      pago: { id: 12, proveedorId: 2, documento: 'Factura', nDoc: 'F-NEW', usuario: 'QA' },
      userId: 7,
    })

    expect(result.aplicados).toHaveLength(1)
    expect(tx.producto.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ codigoInterno: 'NEW-1', nombre: 'Nuevo producto', proveedorId: 2, precioLista: 500, stock: 0 }),
    })
    expect(tx.producto.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { stock: { increment: 3 }, precioLista: 500 },
    })
  })
})
