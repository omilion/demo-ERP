import { recomputeProductoCosteo } from '../productos/costeo.js'

const DESTINOS = new Set(['producto', 'material', 'tela'])
const CREDIT_NOTE_DOCS = new Set(['nota', 'nota credito', 'nota de credito', 'nc', 'n/c'])

function normalizeDestino(value) {
  const destino = String(value || 'producto').toLowerCase()
  return DESTINOS.has(destino) ? destino : 'producto'
}

function normalizePlainText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function cleanText(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number.parseInt(value, 10)
  return Number.isInteger(n) && n > 0 ? n : null
}

function precioHistorialData(productoId, precioAnterior, precioNuevo, usuarioNombre) {
  const pct = precioAnterior === 0 && precioNuevo === 0
    ? 0
    : Number((precioAnterior === 0 ? 100 : ((precioNuevo - precioAnterior) / precioAnterior) * 100).toFixed(1))
  return { productoId, precioAnterior, precioNuevo, pct, usuarioNombre }
}

function productoProveedorWhere(productoId, proveedorId) {
  return { productoId_proveedorId: { productoId, proveedorId } }
}

async function upsertProductoProveedorStock({ tx, productoId, proveedorId, signedQty, precio, reverse }) {
  const where = productoProveedorWhere(productoId, proveedorId)
  if (signedQty < 0) {
    const existing = await tx.productoProveedor.findUnique({
      where,
      select: { cantidad: true },
    })
    const nextCantidad = Math.max(0, Number(existing?.cantidad || 0) - Math.abs(signedQty))
    await tx.productoProveedor.upsert({
      where,
      update: { cantidad: nextCantidad, activo: true },
      create: { productoId, proveedorId, cantidad: 0, costo: 0, activo: true },
    })
    return
  }

  const now = new Date()
  const update = {
    cantidad: { increment: signedQty },
    activo: true,
    ...(!reverse && precio > 0 ? { costo: precio, ultimaCompra: now } : {}),
  }
  await tx.productoProveedor.upsert({
    where,
    update,
    create: {
      productoId,
      proveedorId,
      cantidad: signedQty,
      costo: precio > 0 ? precio : 0,
      ultimaCompra: !reverse ? now : null,
      activo: true,
    },
  })
}

export function isCreditNotePago(pago = {}) {
  const doc = normalizePlainText(pago.documento)
  return Boolean(pago.nc) || CREDIT_NOTE_DOCS.has(doc)
}

function normalizeDetalle(d) {
  return {
    codigoInterno: cleanText(d.codigoInterno),
    destino: normalizeDestino(d.destino),
    cantidad: Number(d.cantidad),
    precio: Number.isFinite(Number(d.precio)) ? Number(d.precio) : 0,
    nombre: cleanText(d.nombre),
    unidadMedida: cleanText(d.unidadMedida),
    categoriaId: parseOptionalInt(d.categoriaId),
    subcategoriaId: parseOptionalInt(d.subcategoriaId),
    proveedorId: parseOptionalInt(d.proveedorId),
  }
}

async function loadStockTargets(tx, normalized, sucursalId = null) {
  const byDestino = {
    producto: normalized.filter(d => d.destino === 'producto'),
    material: normalized.filter(d => d.destino === 'material'),
    tela: normalized.filter(d => d.destino === 'tela'),
  }

  const productos = byDestino.producto.length
    ? await tx.producto.findMany({
        where: { codigoInterno: { in: [...new Set(byDestino.producto.map(d => d.codigoInterno))] } },
        select: { id: true, codigoInterno: true, stock: true, precioLista: true },
      })
    : []
  const materiales = byDestino.material.length
    ? await tx.bodegaTaller.findMany({
        where: {
          codigoInterno: { in: [...new Set(byDestino.material.map(d => d.codigoInterno))] },
          ...(sucursalId ? { sucursalId } : {}),
        },
        select: { id: true, codigoInterno: true, stock: true, precio: true },
      })
    : []
  const telas = byDestino.tela.length
    ? await tx.tela.findMany({
        where: { codigo: { in: [...new Set(byDestino.tela.map(d => d.codigoInterno))] } },
        select: { id: true, codigo: true, stock: true, precio: true },
      })
    : []

  return {
    producto: new Map(productos.map(p => [p.codigoInterno, p])),
    material: new Map(materiales.map(m => [m.codigoInterno, m])),
    tela: new Map(telas.map(t => [t.codigo, t])),
  }
}

async function createMissingTargets({ tx, missing, pago, proveedorId, sucursalId }) {
  for (const d of missing) {
    if (!d.nombre) continue
    if (d.destino === 'producto') {
      await tx.producto.create({
        data: {
          codigoInterno: d.codigoInterno,
          nombre: d.nombre,
          categoriaId: d.categoriaId,
          subcategoriaId: d.subcategoriaId,
          proveedorId: d.proveedorId ?? proveedorId,
          unidadMedida: d.unidadMedida,
          bodega: 'Inventario',
          precioLista: d.precio > 0 ? d.precio : 0,
          stock: 0,
          stockCritico: 1,
          estadoInventario: 'Inventariado',
          activo: true,
        },
      })
    } else if (d.destino === 'material') {
      await tx.bodegaTaller.create({
        data: {
          codigoInterno: d.codigoInterno,
          nombre: d.nombre,
          unidadMedida: d.unidadMedida,
          categoriaId: d.categoriaId,
          subcategoriaId: d.subcategoriaId,
          proveedorId: d.proveedorId ?? proveedorId,
          sucursalId,
          precio: d.precio > 0 ? d.precio : 0,
          stock: 0,
          stockCritico: 0,
          activo: true,
        },
      })
    } else if (d.destino === 'tela') {
      await tx.tela.create({
        data: {
          codigo: d.codigoInterno,
          nombre: d.nombre,
          proveedor: pago?.proveedor || null,
          precio: d.precio > 0 ? d.precio : null,
          stock: 0,
          activo: true,
        },
      })
    }
  }
}

async function validateMissingMaterialClassifications(tx, missing) {
  for (const d of missing.filter(item => item.destino === 'material')) {
    if (d.subcategoriaId && !d.categoriaId) {
      return { error: 'categoria requerida para subcategoria', codigoInterno: d.codigoInterno, destino: d.destino }
    }
    if (d.categoriaId) {
      const categoria = await tx.categoriaBodegaTaller.findFirst({ where: { id: d.categoriaId, activo: true } })
      if (!categoria) return { error: 'Categoria no encontrada', codigoInterno: d.codigoInterno, destino: d.destino }
    }
    if (d.subcategoriaId) {
      const subcategoria = await tx.subcategoriaBodegaTaller.findFirst({ where: { id: d.subcategoriaId, activo: true } })
      if (!subcategoria) return { error: 'Subcategoria no encontrada', codigoInterno: d.codigoInterno, destino: d.destino }
      if (subcategoria.categoriaId !== d.categoriaId) {
        return { error: 'Subcategoria no pertenece a la categoria', codigoInterno: d.codigoInterno, destino: d.destino }
      }
    }
  }
  return null
}

async function validateMissingProductClassifications(tx, missing) {
  for (const d of missing.filter(item => item.destino === 'producto')) {
    if (d.subcategoriaId && !d.categoriaId) {
      return { error: 'categoria requerida para subcategoria', codigoInterno: d.codigoInterno, destino: d.destino }
    }
    if (d.categoriaId) {
      const categoria = await tx.categoria.findFirst({ where: { id: d.categoriaId, activo: true } })
      if (!categoria) return { error: 'Categoria no encontrada', codigoInterno: d.codigoInterno, destino: d.destino }
    }
    if (d.subcategoriaId) {
      const subcategoria = await tx.subcategoria.findFirst({ where: { id: d.subcategoriaId, activo: true } })
      if (!subcategoria) return { error: 'Subcategoria no encontrada', codigoInterno: d.codigoInterno, destino: d.destino }
      if (subcategoria.categoriaId !== d.categoriaId) {
        return { error: 'Subcategoria no pertenece a la categoria', codigoInterno: d.codigoInterno, destino: d.destino }
      }
    }
  }
  return null
}

function validateQuantities(normalized) {
  const invalid = normalized.find(d => !d.codigoInterno || !Number.isFinite(d.cantidad) || d.cantidad <= 0)
  if (invalid) return { error: 'detalle de stock invalido', codigoInterno: invalid?.codigoInterno }

  const invalidProduct = normalized.find(d => d.destino === 'producto' && !Number.isInteger(d.cantidad))
  if (invalidProduct) {
    return {
      error: 'cantidad debe ser entera y mayor que cero para ingresar stock de productos',
      codigoInterno: invalidProduct.codigoInterno,
    }
  }
  return null
}

function stockUnderflow(normalized, maps, direction) {
  if (direction > 0) return null
  for (const d of normalized) {
    const target = maps[d.destino].get(d.codigoInterno)
    const stock = Number(target?.stock || 0)
    if (stock < d.cantidad) {
      return {
        error: 'egreso supera el stock disponible',
        codigoInterno: d.codigoInterno,
        destino: d.destino,
        stockDisponible: stock,
        cantidad: d.cantidad,
      }
    }
  }
  return null
}

async function applyStockMovements({ tx, normalized, maps, pago, userId, direction, reverse = false }) {
  const doc = `${pago.documento || ''} ${pago.nDoc || ''}`.trim()
  const motivo = `${reverse ? 'Reversa' : direction > 0 ? 'Ingreso' : 'Nota credito'} factura ${doc}`.trim()
  const tipo = direction > 0 ? 'ingreso' : 'egreso'
  const aplicados = []

  for (const d of normalized) {
    const signedQty = d.cantidad * direction
    if (d.destino === 'producto') {
      const prod = maps.producto.get(d.codigoInterno)
      const updateData = { stock: { increment: signedQty } }
      const provId = d.proveedorId ?? parseOptionalInt(pago?.proveedorId)
      let precioNuevoHistorial = null
      if (!provId && !reverse && direction > 0 && d.precio > 0) {
        updateData.precioLista = d.precio
        precioNuevoHistorial = d.precio
      }
      await tx.producto.update({ where: { id: prod.id }, data: updateData })
      if (provId) {
        await upsertProductoProveedorStock({
          tx,
          productoId: prod.id,
          proveedorId: provId,
          signedQty,
          precio: d.precio,
          reverse,
        })
        const costeo = await recomputeProductoCosteo(tx, prod.id)
        if (costeo.stockTotal > 0) precioNuevoHistorial = costeo.costoPonderado
      }
      if (precioNuevoHistorial !== null && Number(prod.precioLista) !== Number(precioNuevoHistorial)) {
        await tx.precioHistorial.create({
          data: precioHistorialData(prod.id, Number(prod.precioLista || 0), Number(precioNuevoHistorial), pago.usuario || 'Sistema'),
        })
        prod.precioLista = precioNuevoHistorial
      }
      await tx.movimientoBodega.create({
        data: {
          productoId: prod.id,
          tipo,
          cantidad: signedQty,
          motivo,
          userId,
          pagoProveedorId: pago.id,
          origenTipo: reverse ? 'pago_proveedor_reversa' : 'pago_proveedor',
          origenId: pago.id,
        },
      })
    } else if (d.destino === 'material') {
      const material = maps.material.get(d.codigoInterno)
      const updateData = { stock: { increment: signedQty } }
      if (!reverse && direction > 0 && d.precio > 0) updateData.precio = d.precio
      await tx.bodegaTaller.update({ where: { id: material.id }, data: updateData })
      await tx.bodegaTallerMovimiento.create({
        data: {
          bodegaTallerId: material.id,
          tipo,
          cantidad: signedQty,
          motivo,
          userId,
          pagoProveedorId: pago.id,
          origenTipo: reverse ? 'pago_proveedor_reversa' : 'pago_proveedor',
          origenId: pago.id,
        },
      })
    } else {
      const tela = maps.tela.get(d.codigoInterno)
      const updateData = { stock: { increment: signedQty } }
      if (!reverse && direction > 0 && d.precio > 0) updateData.precio = d.precio
      await tx.tela.update({ where: { id: tela.id }, data: updateData })
      await tx.telaMovimiento.create({
        data: {
          telaId: tela.id,
          tipo,
          cantidad: signedQty,
          factura: pago.nDoc,
          usuario: pago.usuario || 'Sistema',
          pagoProveedorId: pago.id,
          origenTipo: reverse ? 'pago_proveedor_reversa' : 'pago_proveedor',
          origenId: pago.id,
        },
      })
    }
    aplicados.push({ codigoInterno: d.codigoInterno, destino: d.destino, ok: true, cantidad: signedQty })
  }

  return { aplicados }
}

export async function validateAndApplyStockIngreso({
  tx,
  detalles,
  pago,
  userId,
  allowCreateMissing = true,
  sucursalId = null,
  reverse = false,
}) {
  const normalized = detalles.map(normalizeDetalle)
  const invalid = validateQuantities(normalized)
  if (invalid) return invalid

  const baseDirection = isCreditNotePago(pago) ? -1 : 1
  const direction = reverse ? baseDirection * -1 : baseDirection

  let maps = await loadStockTargets(tx, normalized, sucursalId)
  let missing = normalized.filter(d => !maps[d.destino].has(d.codigoInterno))
  const uncreatableMissing = missing.filter(d => !(allowCreateMissing && direction > 0 && d.nombre))
  if (uncreatableMissing.length) {
    return {
      error: 'items no encontrados para ingresar stock',
      items: uncreatableMissing.map(d => ({ codigoInterno: d.codigoInterno, destino: d.destino })),
    }
  }

  if (missing.length) {
    const productClassificationError = await validateMissingProductClassifications(tx, missing)
    if (productClassificationError) return productClassificationError

    const classificationError = await validateMissingMaterialClassifications(tx, missing)
    if (classificationError) return classificationError

    await createMissingTargets({
      tx,
      missing,
      pago,
      proveedorId: parseOptionalInt(pago?.proveedorId),
      sucursalId,
    })
    maps = await loadStockTargets(tx, normalized, sucursalId)
    missing = normalized.filter(d => !maps[d.destino].has(d.codigoInterno))
  }

  if (missing.length) {
    return {
      error: 'items no encontrados para ingresar stock',
      items: missing.map(d => ({ codigoInterno: d.codigoInterno, destino: d.destino })),
    }
  }

  const underflow = stockUnderflow(normalized, maps, direction)
  if (underflow) return underflow

  return applyStockMovements({ tx, normalized, maps, pago, userId, direction, reverse })
}

export async function reverseStockIngreso({ tx, detalles, pago, userId }) {
  return validateAndApplyStockIngreso({
    tx,
    detalles,
    pago,
    userId,
    allowCreateMissing: false,
    reverse: true,
    sucursalId: pago?.sucursalId ?? null,
  })
}

export function normalizeDetalleDestino(value) {
  return normalizeDestino(value)
}
