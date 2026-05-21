const DESTINOS = new Set(['producto', 'material', 'tela'])

function normalizeDestino(value) {
  const destino = String(value || 'producto').toLowerCase()
  return DESTINOS.has(destino) ? destino : 'producto'
}

export async function validateAndApplyStockIngreso({ tx, detalles, pago, userId }) {
  const normalized = detalles.map(d => ({
    codigoInterno: d.codigoInterno,
    destino: normalizeDestino(d.destino),
    cantidad: Number(d.cantidad),
  }))

  const invalid = normalized.find(d => !d.codigoInterno || !Number.isFinite(d.cantidad) || d.cantidad <= 0)
  if (invalid) return { error: 'detalle de stock invalido', codigoInterno: invalid?.codigoInterno }

  const invalidProduct = normalized.find(d => d.destino === 'producto' && !Number.isInteger(d.cantidad))
  if (invalidProduct) {
    return {
      error: 'cantidad debe ser entera y mayor que cero para ingresar stock de productos',
      codigoInterno: invalidProduct.codigoInterno,
    }
  }

  const byDestino = {
    producto: normalized.filter(d => d.destino === 'producto'),
    material: normalized.filter(d => d.destino === 'material'),
    tela: normalized.filter(d => d.destino === 'tela'),
  }
  const productos = byDestino.producto.length
    ? await tx.producto.findMany({
        where: { codigoInterno: { in: [...new Set(byDestino.producto.map(d => d.codigoInterno))] } },
        select: { id: true, codigoInterno: true },
      })
    : []
  const materiales = byDestino.material.length
    ? await tx.bodegaTaller.findMany({
        where: { codigoInterno: { in: [...new Set(byDestino.material.map(d => d.codigoInterno))] } },
        select: { id: true, codigoInterno: true },
      })
    : []
  const telas = byDestino.tela.length
    ? await tx.tela.findMany({
        where: { codigo: { in: [...new Set(byDestino.tela.map(d => d.codigoInterno))] } },
        select: { id: true, codigo: true },
      })
    : []

  const maps = {
    producto: new Map(productos.map(p => [p.codigoInterno, p])),
    material: new Map(materiales.map(m => [m.codigoInterno, m])),
    tela: new Map(telas.map(t => [t.codigo, t])),
  }
  const missing = normalized.filter(d => !maps[d.destino].has(d.codigoInterno))
  if (missing.length) {
    return {
      error: 'items no encontrados para ingresar stock',
      items: missing.map(d => ({ codigoInterno: d.codigoInterno, destino: d.destino })),
    }
  }

  const motivo = `Ingreso factura ${pago.documento || ''} ${pago.nDoc || ''}`.trim()
  const aplicados = []
  for (const d of normalized) {
    if (d.destino === 'producto') {
      const prod = maps.producto.get(d.codigoInterno)
      await tx.producto.update({ where: { id: prod.id }, data: { stock: { increment: d.cantidad } } })
      await tx.movimientoBodega.create({
        data: {
          productoId: prod.id,
          tipo: 'ingreso',
          cantidad: d.cantidad,
          motivo,
          userId,
          pagoProveedorId: pago.id,
          origenTipo: 'pago_proveedor',
          origenId: pago.id,
        },
      })
    } else if (d.destino === 'material') {
      const material = maps.material.get(d.codigoInterno)
      await tx.bodegaTaller.update({ where: { id: material.id }, data: { stock: { increment: d.cantidad } } })
      await tx.bodegaTallerMovimiento.create({
        data: {
          bodegaTallerId: material.id,
          tipo: 'ingreso',
          cantidad: d.cantidad,
          motivo,
          userId,
          pagoProveedorId: pago.id,
          origenTipo: 'pago_proveedor',
          origenId: pago.id,
        },
      })
    } else {
      const tela = maps.tela.get(d.codigoInterno)
      await tx.tela.update({ where: { id: tela.id }, data: { stock: { increment: d.cantidad } } })
      await tx.telaMovimiento.create({
        data: {
          telaId: tela.id,
          tipo: 'ingreso',
          cantidad: d.cantidad,
          factura: pago.nDoc,
          usuario: pago.usuario || 'Sistema',
          pagoProveedorId: pago.id,
          origenTipo: 'pago_proveedor',
          origenId: pago.id,
        },
      })
    }
    aplicados.push({ codigoInterno: d.codigoInterno, destino: d.destino, ok: true, cantidad: d.cantidad })
  }

  return { aplicados }
}

export function normalizeDetalleDestino(value) {
  return normalizeDestino(value)
}
