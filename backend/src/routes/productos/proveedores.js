// Proveedores y costos por producto (S1 incremento 3).
// Lista las filas ProductoProveedor con su costo/cantidad y expone el
// costo ponderado y el stock total. Permite sembrar/corregir filas a mano
// (necesario para migrar productos legacy con varios proveedores).
import { computeCosteoPonderado, recomputeProductoCosteo } from './costeo.js'

function parseId(value) {
  const n = Number.parseInt(value, 10)
  return Number.isInteger(n) && n > 0 ? n : null
}

function parseCosto(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function parseCantidad(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number.parseInt(value, 10)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

function cleanText(value) {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text || null
}

async function listProveedores(prisma, productoId) {
  const rows = await prisma.productoProveedor.findMany({
    where: { productoId, activo: true },
    select: {
      id: true, proveedorId: true, costo: true, cantidad: true, ultimaCompra: true, codigoProveedor: true,
      proveedor: { select: { nombre: true, rut: true } },
    },
    orderBy: [{ cantidad: 'desc' }, { id: 'asc' }],
  })
  const { stockTotal, costoPonderado } = computeCosteoPonderado(rows)
  return {
    items: rows.map(r => ({
      id: r.id,
      proveedorId: r.proveedorId,
      proveedorNombre: r.proveedor?.nombre || null,
      proveedorRut: r.proveedor?.rut || null,
      codigoProveedor: r.codigoProveedor || null,
      costo: r.costo,
      cantidad: r.cantidad,
      ultimaCompra: r.ultimaCompra,
    })),
    stockTotal,
    costoPonderado,
  }
}

export default async function proveedoresProductoRoutes(fastify) {
  fastify.get('/:id/proveedores', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request, reply) => {
    const productoId = parseId(request.params.id)
    if (!productoId) return reply.code(400).send({ error: 'ID invalido' })
    return listProveedores(fastify.prisma, productoId)
  })

  fastify.post('/:id/proveedores', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const productoId = parseId(request.params.id)
    if (!productoId) return reply.code(400).send({ error: 'ID invalido' })
    const proveedorId = parseId(request.body?.proveedorId)
    if (!proveedorId) return reply.code(400).send({ error: 'proveedorId requerido' })
    const costo = parseCosto(request.body?.costo)
    const cantidad = parseCantidad(request.body?.cantidad)
    if (costo === undefined) return reply.code(400).send({ error: 'costo invalido' })
    if (cantidad === undefined) return reply.code(400).send({ error: 'cantidad invalida' })
    const codigoProveedor = cleanText(request.body?.codigoProveedor)

    const producto = await fastify.prisma.producto.findUnique({ where: { id: productoId }, select: { id: true } })
    if (!producto) return reply.code(404).send({ error: 'Producto no encontrado' })
    const proveedor = await fastify.prisma.proveedor.findUnique({ where: { id: proveedorId }, select: { id: true } })
    if (!proveedor) return reply.code(404).send({ error: 'Proveedor no encontrado' })

    if (codigoProveedor) {
      const otro = await fastify.prisma.productoProveedor.findFirst({
        where: { proveedorId, codigoProveedor: { equals: codigoProveedor, mode: 'insensitive' }, activo: true, productoId: { not: productoId } },
        select: { productoId: true, producto: { select: { nombre: true } } },
      })
      if (otro) return reply.code(409).send({ error: `Ese código ya está mapeado a "${otro.producto?.nombre || 'otro producto'}" para este proveedor`, productoId: otro.productoId })
    }

    const result = await fastify.prisma.$transaction(async (tx) => {
      await tx.productoProveedor.upsert({
        where: { productoId_proveedorId: { productoId, proveedorId } },
        update: { costo: costo ?? 0, cantidad: cantidad ?? 0, activo: true, ...(codigoProveedor !== undefined ? { codigoProveedor } : {}) },
        create: { productoId, proveedorId, costo: costo ?? 0, cantidad: cantidad ?? 0, activo: true, codigoProveedor: codigoProveedor || null },
      })
      await recomputeProductoCosteo(tx, productoId)
      return listProveedores(tx, productoId)
    })
    return reply.code(201).send(result)
  })

  fastify.put('/:id/proveedores/:proveedorId', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const productoId = parseId(request.params.id)
    const proveedorId = parseId(request.params.proveedorId)
    if (!productoId || !proveedorId) return reply.code(400).send({ error: 'ID invalido' })
    const costo = parseCosto(request.body?.costo)
    const cantidad = parseCantidad(request.body?.cantidad)
    if (costo === undefined) return reply.code(400).send({ error: 'costo invalido' })
    if (cantidad === undefined) return reply.code(400).send({ error: 'cantidad invalida' })
    const codigoProveedor = cleanText(request.body?.codigoProveedor)

    const existing = await fastify.prisma.productoProveedor.findUnique({
      where: { productoId_proveedorId: { productoId, proveedorId } },
      select: { id: true },
    })
    if (!existing) return reply.code(404).send({ error: 'Fila de proveedor no encontrada' })

    if (codigoProveedor) {
      const otro = await fastify.prisma.productoProveedor.findFirst({
        where: { proveedorId, codigoProveedor: { equals: codigoProveedor, mode: 'insensitive' }, activo: true, productoId: { not: productoId } },
        select: { productoId: true, producto: { select: { nombre: true } } },
      })
      if (otro) return reply.code(409).send({ error: `Ese código ya está mapeado a "${otro.producto?.nombre || 'otro producto'}" para este proveedor`, productoId: otro.productoId })
    }

    const data = {}
    if (costo !== null) data.costo = costo
    if (cantidad !== null) data.cantidad = cantidad
    if (codigoProveedor !== undefined) data.codigoProveedor = codigoProveedor
    const result = await fastify.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.productoProveedor.update({ where: { id: existing.id }, data })
      }
      await recomputeProductoCosteo(tx, productoId)
      return listProveedores(tx, productoId)
    })
    return result
  })

  fastify.delete('/:id/proveedores/:proveedorId', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const productoId = parseId(request.params.id)
    const proveedorId = parseId(request.params.proveedorId)
    if (!productoId || !proveedorId) return reply.code(400).send({ error: 'ID invalido' })
    const existing = await fastify.prisma.productoProveedor.findUnique({
      where: { productoId_proveedorId: { productoId, proveedorId } },
      select: { id: true },
    })
    if (!existing) return reply.code(404).send({ error: 'Fila de proveedor no encontrada' })

    const result = await fastify.prisma.$transaction(async (tx) => {
      await tx.productoProveedor.update({ where: { id: existing.id }, data: { activo: false, cantidad: 0 } })
      await recomputeProductoCosteo(tx, productoId)
      return listProveedores(tx, productoId)
    })
    return result
  })
}
