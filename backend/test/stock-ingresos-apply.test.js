import { describe, expect, it, vi } from 'vitest'
import { normalizeDetalleDestino, reverseStockIngreso, validateAndApplyStockIngreso } from '../src/routes/stock-ingresos/apply.js'

function applyData(row, data) {
  for (const [key, value] of Object.entries(data || {})) {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'increment')) {
      row[key] = Number(row[key] || 0) + value.increment
    } else {
      row[key] = value
    }
  }
}

function selectFields(row, select) {
  if (!select) return { ...row }
  return Object.fromEntries(Object.keys(select).map(key => [key, row[key]]))
}

function buildStockTx({ productos = [], productoProveedores = [] } = {}) {
  const productRows = new Map(productos.map(producto => [producto.codigoInterno, { ...producto }]))
  const providerRows = productoProveedores.map((row, index) => ({
    id: row.id ?? index + 1,
    activo: row.activo ?? true,
    ...row,
  }))
  let nextProviderRowId = providerRows.length + 1

  function findProviderRow(where) {
    const key = where?.productoId_proveedorId
    if (!key) return null
    return providerRows.find(row => row.productoId === key.productoId && row.proveedorId === key.proveedorId) || null
  }

  const tx = {
    producto: {
      findMany: vi.fn(async (args = {}) => {
        const codes = args.where?.codigoInterno?.in || []
        return codes.map(code => productRows.get(code)).filter(Boolean).map(row => selectFields(row, args.select))
      }),
      update: vi.fn(async ({ where, data }) => {
        const product = [...productRows.values()].find(row => row.id === where.id)
        if (!product) return {}
        applyData(product, data)
        return { ...product }
      }),
    },
    bodegaTaller: { findMany: vi.fn().mockResolvedValue([]) },
    tela: { findMany: vi.fn().mockResolvedValue([]) },
    productoProveedor: {
      findMany: vi.fn(async (args = {}) => {
        let rows = providerRows
        if (args.where?.productoId !== undefined) rows = rows.filter(row => row.productoId === args.where.productoId)
        if (args.where?.activo !== undefined) rows = rows.filter(row => row.activo === args.where.activo)
        if (args.where?.cantidad?.gt !== undefined) rows = rows.filter(row => row.cantidad > args.where.cantidad.gt)
        return rows.map(row => selectFields(row, args.select))
      }),
      findUnique: vi.fn(async ({ where, select }) => {
        const row = findProviderRow(where)
        return row ? selectFields(row, select) : null
      }),
      upsert: vi.fn(async ({ where, update, create }) => {
        let row = findProviderRow(where)
        if (row) {
          applyData(row, update)
        } else {
          row = { id: nextProviderRowId++, ...create }
          providerRows.push(row)
        }
        return { ...row }
      }),
      update: vi.fn(async ({ where, data }) => {
        const row = providerRows.find(item => item.id === where.id)
        if (!row) return {}
        applyData(row, data)
        return { ...row }
      }),
    },
    precioHistorial: { create: vi.fn().mockResolvedValue({}) },
    movimientoBodega: { create: vi.fn().mockResolvedValue({}) },
  }

  tx.__state = { productRows, providerRows }
  return tx
}

describe('stock ingresos apply helper', () => {
  it('normalizes supported destinations', () => {
    expect(normalizeDetalleDestino('producto')).toBe('producto')
    expect(normalizeDetalleDestino('material')).toBe('material')
    expect(normalizeDetalleDestino('tela')).toBe('tela')
    expect(normalizeDetalleDestino('otro')).toBe('producto')
  })

  it('ingresa dos proveedores y recalcula precioLista con costo ponderado', async () => {
    const tx = buildStockTx({
      productos: [{ id: 1, codigoInterno: 'P1', stock: 0, precioLista: 0 }],
    })

    await validateAndApplyStockIngreso({
      tx,
      detalles: [{ codigoInterno: 'P1', destino: 'producto', cantidad: 10, precio: 100 }],
      pago: { id: 20, proveedorId: 1, documento: 'Factura', nDoc: 'F-A', usuario: 'QA' },
      userId: 7,
    })
    await validateAndApplyStockIngreso({
      tx,
      detalles: [{ codigoInterno: 'P1', destino: 'producto', cantidad: 30, precio: 120 }],
      pago: { id: 21, proveedorId: 2, documento: 'Factura', nDoc: 'F-B', usuario: 'QA' },
      userId: 7,
    })

    const product = tx.__state.productRows.get('P1')
    expect(product.stock).toBe(40)
    expect(product.precioLista).toBe(115)
    expect(tx.__state.providerRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ productoId: 1, proveedorId: 1, cantidad: 10, costo: 100 }),
      expect.objectContaining({ productoId: 1, proveedorId: 2, cantidad: 30, costo: 120 }),
    ]))
  })

  it('locks product stock with the shared ventas key before applying an ingress', async () => {
    const tx = buildStockTx({
      productos: [{ id: 71, codigoInterno: 'LOCK-1', stock: 4, precioLista: 100 }],
    })
    tx.$executeRaw = vi.fn()

    await validateAndApplyStockIngreso({
      tx,
      detalles: [{ codigoInterno: 'LOCK-1', destino: 'producto', cantidad: 1, precio: 100 }],
      pago: { id: 72, proveedorId: 1, documento: 'Factura', nDoc: 'LOCK-72', usuario: 'QA' },
      userId: 7,
    })

    expect(tx.$executeRaw).toHaveBeenCalledOnce()
    expect(tx.__state.productRows.get('LOCK-1').stock).toBe(5)
  })

  it('acumula cantidad del mismo proveedor y usa costo de ultima compra', async () => {
    const tx = buildStockTx({
      productos: [{ id: 1, codigoInterno: 'P1', stock: 0, precioLista: 0 }],
    })

    await validateAndApplyStockIngreso({
      tx,
      detalles: [{ codigoInterno: 'P1', destino: 'producto', cantidad: 10, precio: 100 }],
      pago: { id: 22, proveedorId: 1, documento: 'Factura', nDoc: 'F-1', usuario: 'QA' },
      userId: 7,
    })
    await validateAndApplyStockIngreso({
      tx,
      detalles: [{ codigoInterno: 'P1', destino: 'producto', cantidad: 5, precio: 130 }],
      pago: { id: 23, proveedorId: 1, documento: 'Factura', nDoc: 'F-2', usuario: 'QA' },
      userId: 7,
    })

    expect(tx.__state.providerRows).toHaveLength(1)
    expect(tx.__state.providerRows[0]).toMatchObject({ productoId: 1, proveedorId: 1, cantidad: 15, costo: 130 })
    expect(tx.__state.productRows.get('P1')).toMatchObject({ stock: 15, precioLista: 130 })
  })

  it('nota de credito reduce cantidad del proveedor y recalcula ponderado', async () => {
    const tx = buildStockTx({
      productos: [{ id: 1, codigoInterno: 'P1', stock: 40, precioLista: 115 }],
      productoProveedores: [
        { id: 1, productoId: 1, proveedorId: 1, cantidad: 10, costo: 100 },
        { id: 2, productoId: 1, proveedorId: 2, cantidad: 30, costo: 120 },
      ],
    })

    const result = await validateAndApplyStockIngreso({
      tx,
      detalles: [{ codigoInterno: 'P1', destino: 'producto', cantidad: 10, precio: 120 }],
      pago: { id: 24, proveedorId: 2, documento: 'Nota', nDoc: 'NC-1', usuario: 'QA' },
      userId: 7,
    })

    expect(result.aplicados).toEqual([{ codigoInterno: 'P1', destino: 'producto', ok: true, cantidad: -10 }])
    expect(tx.__state.providerRows.find(row => row.proveedorId === 2)).toMatchObject({ cantidad: 20, costo: 120 })
    expect(tx.__state.productRows.get('P1')).toMatchObject({ stock: 30, precioLista: 113 })
  })

  it('reversa de factura reduce cantidad del proveedor sin cambiar su costo', async () => {
    const tx = buildStockTx({
      productos: [{ id: 1, codigoInterno: 'P1', stock: 40, precioLista: 115 }],
      productoProveedores: [
        { id: 1, productoId: 1, proveedorId: 1, cantidad: 10, costo: 100 },
        { id: 2, productoId: 1, proveedorId: 2, cantidad: 30, costo: 120 },
      ],
    })

    await reverseStockIngreso({
      tx,
      detalles: [{ codigoInterno: 'P1', destino: 'producto', cantidad: 10, precio: 999 }],
      pago: { id: 25, proveedorId: 2, documento: 'Factura', nDoc: 'F-REV', usuario: 'QA' },
      userId: 7,
    })

    expect(tx.__state.providerRows.find(row => row.proveedorId === 2)).toMatchObject({ cantidad: 20, costo: 120 })
    expect(tx.__state.productRows.get('P1')).toMatchObject({ stock: 30, precioLista: 113 })
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
      productoProveedor: {
        upsert: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([{ costo: 500, cantidad: 3 }]),
      },
      precioHistorial: { create: vi.fn() },
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
      data: { stock: { increment: 3 } },
    })
    expect(tx.productoProveedor.upsert).toHaveBeenCalledWith({
      where: { productoId_proveedorId: { productoId: 4, proveedorId: 2 } },
      update: expect.objectContaining({ cantidad: { increment: 3 }, costo: 500, activo: true }),
      create: expect.objectContaining({ productoId: 4, proveedorId: 2, cantidad: 3, costo: 500, activo: true }),
    })
    expect(tx.producto.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { precioLista: 500 },
    })
  })
})
