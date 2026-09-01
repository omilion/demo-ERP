import { getUserSucursalId } from '../caja/scope.js'
import {
  buildBodegaTallerWhere,
  enrichBodegaTallerItems,
  filterStockCriticoItems,
  parsePositiveIntValue,
} from './helpers.js'

function parseOptionalPositiveInt(value) {
  if (value === undefined) return { provided: false, value: undefined }
  if (value === null || value === '') return { provided: true, value: null }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return { provided: true, error: 'ID invalido' }
  return { provided: true, value: parsed }
}

function parseOptionalNumber(value, field, { min = null } = {}) {
  if (value === undefined) return { provided: false, value: undefined }
  if (value === null || value === '') return { provided: true, value: 0 }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return { provided: true, error: `${field} invalido` }
  if (min !== null && parsed < min) return { provided: true, error: `${field} debe ser mayor o igual a ${min}` }
  return { provided: true, value: parsed }
}

function cleanText(value) {
  if (value === undefined) return undefined
  if (value === null) return null
  const text = String(value).trim()
  return text || null
}

async function validateClasificacionTaller(prisma, { categoriaId, subcategoriaId }) {
  if (subcategoriaId && !categoriaId) return { status: 400, error: 'categoria requerida para subcategoria' }

  if (categoriaId) {
    const categoria = await prisma.categoriaBodegaTaller.findFirst({ where: { id: categoriaId, activo: true } })
    if (!categoria) return { status: 404, error: 'Categoria no encontrada' }
  }

  if (subcategoriaId) {
    const subcategoria = await prisma.subcategoriaBodegaTaller.findFirst({ where: { id: subcategoriaId, activo: true } })
    if (!subcategoria) return { status: 404, error: 'Subcategoria no encontrada' }
    if (subcategoria.categoriaId !== categoriaId) {
      return { status: 400, error: 'Subcategoria no pertenece a la categoria' }
    }
  }

  return null
}

async function validateProveedor(prisma, proveedorId) {
  if (!proveedorId) return null
  const proveedor = await prisma.proveedor.findFirst({ where: { id: proveedorId, activo: true }, select: { id: true } })
  return proveedor ? null : { status: 404, error: 'Proveedor no encontrado' }
}

async function validateSucursal(prisma, sucursalId) {
  if (!sucursalId) return null
  const sucursal = await prisma.sucursal.findFirst({ where: { id: sucursalId, activo: true }, select: { id: true } })
  return sucursal ? null : { status: 404, error: 'Sucursal no encontrada' }
}

async function validateUniqueCodes(prisma, { id = null, codigoInterno, codigoBarra }) {
  const OR = []
  if (codigoInterno) OR.push({ codigoInterno: { equals: codigoInterno, mode: 'insensitive' } })
  if (codigoBarra) OR.push({ codigoBarra: { equals: codigoBarra, mode: 'insensitive' } })
  if (!OR.length) return null
  const duplicate = await prisma.bodegaTaller.findFirst({
    where: { activo: true, OR, ...(id ? { id: { not: id } } : {}) },
    select: { codigoInterno: true, codigoBarra: true },
  })
  if (!duplicate) return null
  if (codigoInterno && duplicate.codigoInterno?.toLowerCase() === codigoInterno.toLowerCase()) {
    return { status: 409, error: 'codigoInterno ya existe' }
  }
  return { status: 409, error: 'codigoBarra ya existe' }
}

function resolveSucursalForWrite(user, parsedSucursal) {
  const userSucursalId = getUserSucursalId(user)
  if (userSucursalId) return userSucursalId
  return parsedSucursal.provided ? parsedSucursal.value : null
}

async function enrichOne(prisma, item) {
  const enriched = await enrichBodegaTallerItems(prisma, [item])
  return enriched[0]
}

export default async function bodegaTallerRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const filter = await buildBodegaTallerWhere(fastify.prisma, request.query, request.user)
    if (filter.error) return reply.code(400).send({ error: filter.error })
    const LIMIT = 200
    const offset = (filter.page - 1) * LIMIT
    const fetchAll = filter.stockCritico

    const [rawItems, total] = await Promise.all([
      fastify.prisma.bodegaTaller.findMany({
        where: filter.where,
        orderBy: { nombre: 'asc' },
        take: fetchAll ? 5000 : LIMIT,
        skip: fetchAll ? 0 : offset,
      }),
      fastify.prisma.bodegaTaller.count({ where: filter.where }),
    ])

    let items = fetchAll ? filterStockCriticoItems(rawItems) : rawItems
    const responseTotal = fetchAll ? items.length : total
    if (fetchAll) items = items.slice(offset, offset + LIMIT)

    return {
      items: await enrichBodegaTallerItems(fastify.prisma, items),
      total: responseTotal,
      limit: LIMIT,
      page: filter.page,
      pages: Math.max(1, Math.ceil(responseTotal / LIMIT)),
    }
  })

  fastify.get('/autocomplete', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const q = String(request.query.q || '').trim()
    if (q.length < 2) return []
    const filter = await buildBodegaTallerWhere(fastify.prisma, { search: q, page: '1' }, request.user)
    if (filter.error) return reply.code(400).send({ error: filter.error })
    const items = await fastify.prisma.bodegaTaller.findMany({
      where: filter.where,
      select: {
        id: true,
        codigoInterno: true,
        codigoBarra: true,
        nombre: true,
        unidadMedida: true,
        stock: true,
        stockCritico: true,
        precio: true,
        densidadKgM3: true,
        espesorMm: true,
        formato: true,
        categoriaId: true,
        subcategoriaId: true,
        proveedorId: true,
        sucursalId: true,
      },
      orderBy: { nombre: 'asc' },
      take: 20,
    })
    return enrichBodegaTallerItems(fastify.prisma, items)
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const filter = await buildBodegaTallerWhere(fastify.prisma, { page: '1' }, request.user)
    if (filter.error) return reply.code(400).send({ error: filter.error })
    const item = await fastify.prisma.bodegaTaller.findFirst({ where: { ...filter.where, id } })
    if (!item) return reply.code(404).send({ error: 'Material no encontrado' })
    return enrichOne(fastify.prisma, item)
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const {
      codigoInterno,
      codigoBarra,
      nombre,
      detalle,
      unidadMedida,
      stock,
      stockCritico,
      precio,
      categoriaId,
      subcategoriaId,
      tallerId,
      proveedorId,
      sucursalId,
      densidadKgM3, espesorMm, formato,
    } = request.body || {}
    const codigoFinal = cleanText(codigoInterno)
    const nombreFinal = cleanText(nombre)
    if (!codigoFinal || !nombreFinal) return reply.code(400).send({ error: 'codigoInterno y nombre requeridos' })

    const parsedCategoria = parseOptionalPositiveInt(categoriaId)
    const parsedSubcategoria = parseOptionalPositiveInt(subcategoriaId)
    const parsedTaller = parseOptionalPositiveInt(tallerId)
    const parsedProveedor = parseOptionalPositiveInt(proveedorId)
    const parsedSucursal = parsePositiveIntValue(sucursalId, 'sucursalId')
    const parsedStock = parseOptionalNumber(stock, 'stock', { min: 0 })
    const parsedStockCritico = parseOptionalNumber(stockCritico, 'stockCritico', { min: 0 })
    const parsedPrecio = parseOptionalNumber(precio, 'precio', { min: 0 })
    const parsedDensidad = parseOptionalNumber(densidadKgM3, 'densidadKgM3', { min: 0 })
    const parsedEspesor = parseOptionalNumber(espesorMm, 'espesorMm', { min: 0 })
    if (parsedCategoria.error) return reply.code(400).send({ error: 'categoriaId invalido' })
    if (parsedSubcategoria.error) return reply.code(400).send({ error: 'subcategoriaId invalido' })
    if (parsedTaller.error) return reply.code(400).send({ error: 'tallerId invalido' })
    if (parsedProveedor.error) return reply.code(400).send({ error: 'proveedorId invalido' })
    if (parsedSucursal.error) return reply.code(400).send({ error: parsedSucursal.error })
    if (parsedStock.error) return reply.code(400).send({ error: parsedStock.error })
    if (parsedStockCritico.error) return reply.code(400).send({ error: parsedStockCritico.error })
    if (parsedPrecio.error) return reply.code(400).send({ error: parsedPrecio.error })
    if (parsedDensidad.error) return reply.code(400).send({ error: parsedDensidad.error })
    if (densidadKgM3 !== undefined && densidadKgM3 !== null && densidadKgM3 !== '' && parsedDensidad.value <= 0) return reply.code(400).send({ error: 'densidadKgM3 debe ser mayor a cero' })
    if (parsedEspesor.error) return reply.code(400).send({ error: parsedEspesor.error })
    if (parsedDensidad.value != null && Number(parsedStock.value || 0) > 0) {
      return reply.code(409).send({ error: 'Cree la espuma con stock cero y registre el ingreso como lote aprobado para mantener la trazabilidad' })
    }

    const categoriaFinal = parsedCategoria.value ?? null
    const subcategoriaFinal = parsedSubcategoria.value ?? null
    const tallerFinal = parsedTaller.value ?? null
    const proveedorFinal = parsedProveedor.value ?? null
    const sucursalFinal = resolveSucursalForWrite(request.user, parsedSucursal)

    const clasificacionError = await validateClasificacionTaller(fastify.prisma, {
      categoriaId: categoriaFinal,
      subcategoriaId: subcategoriaFinal,
    })
    if (clasificacionError) return reply.code(clasificacionError.status).send({ error: clasificacionError.error })
    const proveedorError = await validateProveedor(fastify.prisma, proveedorFinal)
    if (proveedorError) return reply.code(proveedorError.status).send({ error: proveedorError.error })
    const sucursalError = await validateSucursal(fastify.prisma, sucursalFinal)
    if (sucursalError) return reply.code(sucursalError.status).send({ error: sucursalError.error })
    const uniqueError = await validateUniqueCodes(fastify.prisma, {
      codigoInterno: codigoFinal,
      codigoBarra: cleanText(codigoBarra),
    })
    if (uniqueError) return reply.code(uniqueError.status).send({ error: uniqueError.error })

    try {
      const item = await fastify.prisma.bodegaTaller.create({
        data: {
          codigoInterno: codigoFinal,
          codigoBarra: cleanText(codigoBarra),
          nombre: nombreFinal,
          detalle: cleanText(detalle),
          unidadMedida: cleanText(unidadMedida),
          categoriaId: categoriaFinal,
          subcategoriaId: subcategoriaFinal,
          tallerId: tallerFinal,
          proveedorId: proveedorFinal,
          sucursalId: sucursalFinal,
          stock: parsedStock.value ?? 0,
          stockCritico: parsedStockCritico.value ?? 0,
          precio: parsedPrecio.value ?? 0,
          densidadKgM3: parsedDensidad.provided ? parsedDensidad.value || null : null,
          espesorMm: parsedEspesor.provided ? parsedEspesor.value || null : null,
          formato: cleanText(formato),
        },
      })
      return reply.code(201).send(await enrichOne(fastify.prisma, item))
    } catch (e) {
      if (e.code === 'P2002') return reply.code(409).send({ error: 'codigoInterno ya existe' })
      throw e
    }
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const body = request.body || {}
    const filter = await buildBodegaTallerWhere(fastify.prisma, { page: '1' }, request.user)
    if (filter.error) return reply.code(400).send({ error: filter.error })
    const current = await fastify.prisma.bodegaTaller.findFirst({
      where: { ...filter.where, id },
      select: { id: true, categoriaId: true, subcategoriaId: true, sucursalId: true, stock: true, precio: true, codigoInterno: true, codigoBarra: true, densidadKgM3: true },
    })
    if (!current) return reply.code(404).send({ error: 'No encontrado' })

    const data = {}
    if (body.codigoInterno !== undefined) {
      const codigo = cleanText(body.codigoInterno)
      if (!codigo) return reply.code(400).send({ error: 'codigoInterno requerido' })
      data.codigoInterno = codigo
    }
    for (const field of ['codigoBarra', 'nombre', 'detalle', 'unidadMedida']) {
      if (body[field] !== undefined) data[field] = cleanText(body[field])
    }
    if (body.nombre !== undefined && !data.nombre) return reply.code(400).send({ error: 'nombre requerido' })
    if (body.activo !== undefined) data.activo = Boolean(body.activo)
    for (const field of ['stockCritico', 'stock', 'precio', 'densidadKgM3', 'espesorMm']) {
      if (body[field] !== undefined) {
        const parsed = parseOptionalNumber(body[field], field, { min: 0 })
        if (parsed.error) return reply.code(400).send({ error: parsed.error })
        data[field] = parsed.value
      }
    }
    for (const field of ['densidadKgM3', 'espesorMm']) {
      if (body[field] !== undefined) {
        if (body[field] === null || body[field] === '') data[field] = null
        else {
          const parsed = parseOptionalNumber(body[field], field, { min: 0 })
          if (parsed.error) return reply.code(400).send({ error: parsed.error })
          if (field === 'densidadKgM3' && parsed.value <= 0) return reply.code(400).send({ error: 'densidadKgM3 debe ser mayor a cero' })
          data[field] = parsed.value
        }
      }
    }
    if (body.formato !== undefined) data.formato = cleanText(body.formato)

    const parsedCategoria = parseOptionalPositiveInt(body.categoriaId)
    const parsedSubcategoria = parseOptionalPositiveInt(body.subcategoriaId)
    const parsedTaller = parseOptionalPositiveInt(body.tallerId)
    const parsedProveedor = parseOptionalPositiveInt(body.proveedorId)
    const parsedSucursal = parsePositiveIntValue(body.sucursalId, 'sucursalId')
    if (parsedCategoria.error) return reply.code(400).send({ error: 'categoriaId invalido' })
    if (parsedSubcategoria.error) return reply.code(400).send({ error: 'subcategoriaId invalido' })
    if (parsedTaller.error) return reply.code(400).send({ error: 'tallerId invalido' })
    if (parsedProveedor.error) return reply.code(400).send({ error: 'proveedorId invalido' })
    if (parsedSucursal.error) return reply.code(400).send({ error: parsedSucursal.error })

    const nextCategoriaId = parsedCategoria.provided ? parsedCategoria.value : current.categoriaId
    const nextSubcategoriaId = parsedSubcategoria.provided ? parsedSubcategoria.value : current.subcategoriaId
    const clasificacionError = await validateClasificacionTaller(fastify.prisma, {
      categoriaId: nextCategoriaId,
      subcategoriaId: nextSubcategoriaId,
    })
    if (clasificacionError) return reply.code(clasificacionError.status).send({ error: clasificacionError.error })
    if (parsedCategoria.provided) data.categoriaId = parsedCategoria.value
    if (parsedSubcategoria.provided) data.subcategoriaId = parsedSubcategoria.value
    if (parsedTaller.provided) data.tallerId = parsedTaller.value
    if (parsedProveedor.provided) {
      const proveedorError = await validateProveedor(fastify.prisma, parsedProveedor.value)
      if (proveedorError) return reply.code(proveedorError.status).send({ error: proveedorError.error })
      data.proveedorId = parsedProveedor.value
    }
    if (parsedSucursal.provided || getUserSucursalId(request.user)) {
      const sucursalFinal = resolveSucursalForWrite(request.user, parsedSucursal)
      const sucursalError = await validateSucursal(fastify.prisma, sucursalFinal)
      if (sucursalError) return reply.code(sucursalError.status).send({ error: sucursalError.error })
      data.sucursalId = sucursalFinal
    }
    const uniqueError = await validateUniqueCodes(fastify.prisma, {
      id,
      codigoInterno: data.codigoInterno,
      codigoBarra: data.codigoBarra,
    })
    if (uniqueError) return reply.code(uniqueError.status).send({ error: uniqueError.error })

    // Una espuma nunca puede tener más saldo global que el trazado en lotes
    // aprobados. Cubre tanto la conversión del stock histórico como un ajuste
    // manual posterior de stock.
    const nextDensidad = data.densidadKgM3 !== undefined ? data.densidadKgM3 : current.densidadKgM3
    const nextStock = data.stock !== undefined ? data.stock : current.stock
    if (nextDensidad != null && Number(nextStock) > 0 && (data.densidadKgM3 !== undefined || data.stock !== undefined)) {
      const saldoLotes = await fastify.prisma.bodegaTallerLote.aggregate({
        where: { bodegaTallerId: id, estadoCalidad: 'aprobado' },
        _sum: { cantidadDisponible: true },
      })
      if (Number(saldoLotes._sum.cantidadDisponible || 0) < Number(nextStock)) {
        return reply.code(409).send({ error: 'El stock de espuma debe quedar cubierto por lotes aprobados; regularice el stock existente antes de asignar densidad o aumentar el saldo' })
      }
    }

    try {
      const item = await fastify.prisma.$transaction(async tx => {
        const updated = await tx.bodegaTaller.update({ where: { id }, data })
        if (data.stock !== undefined && Number(data.stock) !== Number(current.stock)) {
          await tx.bodegaTallerMovimiento.create({
            data: {
              bodegaTallerId: id,
              tipo: 'ajuste',
              cantidad: Number(data.stock) - Number(current.stock || 0),
              motivo: 'Ajuste manual bodega taller',
              userId: request.user?.id ?? null,
              origenTipo: 'ajuste_manual',
              origenId: id,
            },
          })
        }
        if (data.precio !== undefined && Number(data.precio) !== Number(current.precio || 0)) {
          await tx.bodegaTallerPrecioHistorial.create({
            data: {
              bodegaTallerId: id,
              precioAnterior: Number(current.precio || 0),
              precioNuevo: Number(data.precio),
              motivo: body.motivo || 'Actualización de precio',
              userId: request.user?.id ?? null,
              userNombre: request.user?.nombre ?? null,
            },
          })
        }
        return updated
      })
      return enrichOne(fastify.prisma, item)
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
      if (e.code === 'P2002') return reply.code(409).send({ error: 'codigoInterno ya existe' })
      throw e
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const filter = await buildBodegaTallerWhere(fastify.prisma, { page: '1' }, request.user)
    if (filter.error) return reply.code(400).send({ error: filter.error })
    const current = await fastify.prisma.bodegaTaller.findFirst({ where: { ...filter.where, id }, select: { id: true } })
    if (!current) return reply.code(404).send({ error: 'No encontrado' })
    await fastify.prisma.bodegaTaller.update({ where: { id }, data: { activo: false } })
    return reply.code(204).send()
  })

  fastify.get('/:id/lotes', { preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')] }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'ID invalido' })
    const filter = await buildBodegaTallerWhere(fastify.prisma, { page: '1' }, request.user)
    if (filter.error) return reply.code(400).send({ error: filter.error })
    const item = await fastify.prisma.bodegaTaller.findFirst({ where: { ...filter.where, id }, select: { id: true } })
    if (!item) return reply.code(404).send({ error: 'Material no encontrado' })
    return { items: await fastify.prisma.bodegaTallerLote.findMany({ where: { bodegaTallerId: id }, orderBy: { recibidoAt: 'asc' } }) }
  })

  fastify.post('/:id/lotes', { preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')] }, async (request, reply) => {
    const bodegaTallerId = parseInt(request.params.id, 10)
    const codigo = cleanText(request.body?.codigo)
    const cantidad = Number(request.body?.cantidad)
    if (!Number.isInteger(bodegaTallerId) || !codigo || !Number.isFinite(cantidad) || cantidad <= 0) return reply.code(400).send({ error: 'codigo y cantidad positiva requeridos' })
    const estadoCalidad = String(request.body?.estadoCalidad || 'aprobado').toLowerCase()
    if (!['aprobado', 'observado', 'rechazado'].includes(estadoCalidad)) return reply.code(400).send({ error: 'estadoCalidad invalido' })
    const regularizarExistente = Boolean(request.body?.regularizarExistente)
    const filter = await buildBodegaTallerWhere(fastify.prisma, { page: '1' }, request.user)
    if (filter.error) return reply.code(400).send({ error: filter.error })
    const lote = await fastify.prisma.$transaction(async tx => {
      const item = await tx.bodegaTaller.findFirst({ where: { ...filter.where, id: bodegaTallerId }, select: { id: true, stock: true } })
      if (!item) {
        const error = new Error('Material no encontrado')
        error.statusCode = 404
        throw error
      }
      const loteCount = await tx.bodegaTallerLote.count({ where: { bodegaTallerId } })
      if (regularizarExistente && (estadoCalidad !== 'aprobado' || loteCount > 0 || Number(cantidad) !== Number(item.stock))) {
        const error = new Error('La regularizacion debe ser el primer lote aprobado e igualar el stock existente')
        error.statusCode = 409
        throw error
      }
      const created = await tx.bodegaTallerLote.create({ data: { bodegaTallerId, codigo, cantidadInicial: cantidad, cantidadDisponible: estadoCalidad === 'aprobado' ? cantidad : 0, estadoCalidad, observacion: cleanText(request.body?.observacion) } })
      if (estadoCalidad === 'aprobado' && !regularizarExistente) await tx.bodegaTaller.update({ where: { id: bodegaTallerId }, data: { stock: { increment: cantidad } } })
      return created
    })
    return reply.code(201).send(lote)
  })
}
