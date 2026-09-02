function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function isVentaDirectaStockTipo(tipo) {
  const text = normalize(tipo)
  return text === 'normal' || text === 'venta sala' || text === 'venta directa' || text === 'venta web' || text === 'convenio marco' || text === 'licitacion' || text === 'marketplace'
}

function addDelta(map, productId, delta) {
  if (!productId || !delta) return
  map.set(productId, (map.get(productId) || 0) + delta)
}

export function buildStockDeltasFromItems(items = [], multiplier = 1) {
  const deltas = new Map()
  for (const item of items) {
    addDelta(deltas, Number(item.productoId), Number(item.cantidad || 0) * multiplier)
  }
  return deltas
}

export function buildReplacementStockDeltas(oldItems = [], newItems = [], oldTipo, newTipo) {
  const oldApplies = isVentaDirectaStockTipo(oldTipo)
  const newApplies = isVentaDirectaStockTipo(newTipo)
  const deltas = new Map()
  if (oldApplies) {
    for (const item of oldItems) addDelta(deltas, Number(item.productoId), -Number(item.cantidad || 0))
  }
  if (newApplies) {
    for (const item of newItems) addDelta(deltas, Number(item.productoId), Number(item.cantidad || 0))
  }
  return deltas
}

export async function applyVentaStockDeltas(tx, { deltas, ordenId, nInterno, tipo, userId, user, motivo }) {
  const entries = [...(deltas || new Map()).entries()].filter(([, delta]) => Number(delta) !== 0)
  if (!entries.length) return { ok: true }

  const productIds = entries.map(([productId]) => productId)
  const productos = await tx.producto.findMany({
    where: { id: { in: productIds } },
    select: { id: true, stock: true, stockReservado: true, stockDanado: true, estadoInventario: true },
  })
  const productoMap = Object.fromEntries(productos.map(p => [p.id, p]))
  const usuarioId = Number(userId || user?.id || 1)

  for (const [productId, delta] of entries) {
    const producto = productoMap[productId]
    if (!producto) return { error: 'Producto no encontrado para stock de venta', status: 404 }
    if (normalize(producto.estadoInventario) !== 'inventariado') continue

    const stockDisponible = Math.max(0, Number(producto.stock || 0) - Number(producto.stockReservado || 0) - Number(producto.stockDanado || 0))
    if (delta > 0 && stockDisponible < delta) {
      return {
        error: 'Stock insuficiente para venta directa',
        status: 409,
        productoId: productId,
        stockDisponible,
        cantidadSolicitada: delta,
      }
    }

    if (delta > 0) {
      const updated = await tx.producto.updateMany({
        where: {
          id: productId,
          stock: { gte: delta + Number(producto.stockReservado || 0) + Number(producto.stockDanado || 0) },
          stockReservado: Number(producto.stockReservado || 0),
          stockDanado: Number(producto.stockDanado || 0),
        },
        data: { stock: { decrement: delta } },
      })
      if (updated.count !== 1) {
        return {
          error: 'Stock insuficiente para venta directa',
          status: 409,
          productoId: productId,
          stockDisponible,
          cantidadSolicitada: delta,
        }
      }
    } else {
      await tx.producto.update({
        where: { id: productId },
        data: { stock: { increment: Math.abs(delta) } },
      })
    }
    await tx.movimientoBodega.create({
      data: {
        productoId: productId,
        tipo: delta > 0 ? 'egreso' : 'ingreso',
        // El kardex conserva la cantidad con signo: egreso negativo e ingreso
        // positivo. Las ventas eran el único flujo que invertía esa convención.
        cantidad: -delta,
        stockAnterior: Number(producto.stock || 0),
        stockPosterior: Number(producto.stock || 0) - delta,
        reservadoFinal: Number(producto.stockReservado || 0),
        danadoFinal: Number(producto.stockDanado || 0),
        motivo: motivo || `Venta directa ${nInterno || ordenId || ''}`.trim(),
        userId: usuarioId,
        ordenId,
        origenTipo: 'venta_directa',
        origenId: ordenId,
      },
    })
  }

  return { ok: true }
}
