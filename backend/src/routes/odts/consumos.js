import { parsePositiveInt } from '../operational-utils.js'
import { resolveOdtForWrite } from '../relation-guards.js'
import { getUserSucursalId } from '../caja/scope.js'
import { isOpenOdtEstado } from './operations.js'

export const ODT_CONSUMO_TIPOS = Object.freeze(['producto', 'material_taller', 'tela'])

export function getConsumoUsuario(user) {
  const nombre = user?.nombre ? String(user.nombre).trim() : ''
  if (nombre) return nombre
  const username = user?.username ? String(user.username).trim() : ''
  if (username) return username
  const email = user?.email ? String(user.email).trim() : ''
  return email || 'Sistema'
}

export function getConsumoUserId(user) {
  const userId = Number(user?.id)
  return Number.isInteger(userId) && userId > 0 ? userId : 1
}

export function parseConsumoRequest(body = {}) {
  const tipo = typeof body.tipo === 'string' ? body.tipo.trim().toLowerCase() : ''
  if (!ODT_CONSUMO_TIPOS.includes(tipo)) {
    return { error: 'tipo debe ser producto, material_taller o tela' }
  }

  const id = parsePositiveInt(body.id)
  if (!id) return { error: 'id invalido' }

  const cantidad = Number(body.cantidad)
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return { error: 'cantidad invalida' }
  }
  if (tipo === 'producto' && !Number.isInteger(cantidad)) {
    return { error: 'cantidad debe ser entera para producto' }
  }

  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
  if (!motivo) return { error: 'motivo requerido' }

  const taller = typeof body.taller === 'string' ? body.taller.trim() : ''

  return { tipo, id, cantidad, motivo, taller: taller || null }
}

function stockError(item, cantidad) {
  if (Number(item.stock ?? 0) >= cantidad) return null
  return {
    status: 409,
    error: 'Stock insuficiente',
    stockDisponible: Number(item.stock ?? 0),
  }
}

export function buildHistorialMaterialData({ odt, item, cantidad, usuario, taller = null, now = new Date() }) {
  return {
    odtId: odt.id,
    codigoInterno: item.codigoInterno ?? item.codigo ?? null,
    nombre: item.nombre ?? null,
    egreso: cantidad,
    ingreso: 0,
    unidad: item.unidadMedida ?? null,
    usuario,
    fecha: now,
    taller,
    sucursalId: item.sucursalId ?? odt.sucursalId ?? null,
  }
}

async function upsertTallerMaterial({ tx, odt, item, cantidad, taller = null }) {
  const codigoInterno = item.codigoInterno ?? item.codigo ?? null
  const current = await tx.tallerMaterial.findFirst({
    where: {
      odtId: odt.id,
      codigoInterno,
      taller,
    },
    select: { id: true },
  })
  const data = {
    odtId: odt.id,
    codigoInterno,
    nombre: item.nombre ?? null,
    unidad: item.unidadMedida ?? null,
    taller,
  }
  if (current) {
    return tx.tallerMaterial.update({
      where: { id: current.id },
      data: {
        ...data,
        cantidad: { increment: cantidad },
      },
    })
  }
  return tx.tallerMaterial.create({
    data: {
      ...data,
      cantidad,
    },
  })
}

export async function consumirProducto({ tx, odt, itemId, cantidad, motivo, userId, usuario, taller, now = new Date() }) {
  const producto = await tx.producto.findUnique({
    where: { id: itemId },
    select: { id: true, codigoInterno: true, nombre: true, unidadMedida: true, stock: true },
  })
  if (!producto) return { status: 404, error: 'Producto no encontrado' }
  const insufficient = stockError(producto, cantidad)
  if (insufficient) return insufficient

  const decrement = await tx.producto.updateMany({
    where: { id: producto.id, stock: { gte: cantidad } },
    data: { stock: { decrement: cantidad } },
  })
  if (decrement.count !== 1) return { status: 409, error: 'Stock insuficiente', stockDisponible: Number(producto.stock ?? 0) }
  const movimiento = await tx.movimientoBodega.create({
    data: {
      productoId: producto.id,
      tipo: 'egreso',
      cantidad: -cantidad,
      motivo,
      userId,
      ordenId: odt.ordenId,
      odtId: odt.id,
      origenTipo: 'odt_consumo',
      origenId: odt.id,
    },
  })
  const historial = await tx.tallerHistorialMaterial.create({
    data: buildHistorialMaterialData({ odt, item: producto, cantidad, usuario, taller, now }),
  })
  const materialAsignado = await upsertTallerMaterial({ tx, odt, item: producto, cantidad, taller })

  return {
    tipo: 'producto',
    id: producto.id,
    stockFinal: producto.stock - cantidad,
    movimiento,
    historial,
    materialAsignado,
  }
}

function scopedResourceWhere(id, sucursalId) {
  return {
    id,
    ...(sucursalId ? { OR: [{ sucursalId }, { sucursalId: null }] } : {}),
  }
}

export async function consumirMaterialTaller({ tx, odt, itemId, cantidad, motivo, userId, usuario, taller, sucursalId, now = new Date() }) {
  const scopeSucursalId = sucursalId ?? odt.sucursalId ?? null
  const material = await tx.bodegaTaller.findFirst({
    where: scopedResourceWhere(itemId, scopeSucursalId),
    select: {
      id: true,
      codigoInterno: true,
      nombre: true,
      unidadMedida: true,
      stock: true,
      sucursalId: true,
    },
  })
  if (!material) return { status: 404, error: 'Material de taller no encontrado' }
  const insufficient = stockError(material, cantidad)
  if (insufficient) return insufficient

  const decrement = await tx.bodegaTaller.updateMany({
    where: { ...scopedResourceWhere(material.id, scopeSucursalId), stock: { gte: cantidad } },
    data: { stock: { decrement: cantidad } },
  })
  if (decrement.count !== 1) return { status: 409, error: 'Stock insuficiente', stockDisponible: Number(material.stock ?? 0) }
  const movimiento = await tx.bodegaTallerMovimiento.create({
    data: {
      bodegaTallerId: material.id,
      tipo: 'egreso',
      cantidad: -cantidad,
      motivo,
      userId,
      origenTipo: 'odt_consumo',
      origenId: odt.id,
    },
  })
  const historial = await tx.tallerHistorialMaterial.create({
    data: buildHistorialMaterialData({ odt, item: material, cantidad, usuario, taller, now }),
  })
  const materialAsignado = await upsertTallerMaterial({ tx, odt, item: material, cantidad, taller })

  return {
    tipo: 'material_taller',
    id: material.id,
    stockFinal: material.stock - cantidad,
    movimiento,
    historial,
    materialAsignado,
  }
}

export async function consumirTela({ tx, odt, itemId, cantidad, usuario, taller, now = new Date() }) {
  const tela = await tx.tela.findUnique({
    where: { id: itemId },
    select: { id: true, codigo: true, nombre: true, stock: true, ubicacion: true },
  })
  if (!tela) return { status: 404, error: 'Tela no encontrada' }
  const insufficient = stockError(tela, cantidad)
  if (insufficient) return insufficient

  const decrement = await tx.tela.updateMany({
    where: { id: tela.id, stock: { gte: cantidad } },
    data: { stock: { decrement: cantidad } },
  })
  if (decrement.count !== 1) return { status: 409, error: 'Stock insuficiente', stockDisponible: Number(tela.stock ?? 0) }
  const movimiento = await tx.telaMovimiento.create({
    data: {
      telaId: tela.id,
      tipo: 'egreso',
      cantidad,
      origenTipo: 'odt_consumo',
      origenId: odt.id,
      ubicacion: tela.ubicacion ?? null,
      usuario,
    },
  })
  const telaConUnidad = { ...tela, unidadMedida: 'm' }
  const historial = await tx.tallerHistorialMaterial.create({
    data: buildHistorialMaterialData({ odt, item: telaConUnidad, cantidad, usuario, taller, now }),
  })
  const materialAsignado = await upsertTallerMaterial({ tx, odt, item: telaConUnidad, cantidad, taller })

  return {
    tipo: 'tela',
    id: tela.id,
    stockFinal: tela.stock - cantidad,
    movimiento,
    historial,
    materialAsignado,
  }
}

export function buildConsumoErrorResponse(result) {
  const { status: _status, error, ...details } = result
  return { error, ...details }
}

export async function applyOdtConsumo({ tx, odt, consumo, userId, usuario, sucursalId = null, now = new Date() }) {
  const common = {
    tx,
    odt,
    itemId: consumo.id,
    cantidad: consumo.cantidad,
    motivo: consumo.motivo,
    taller: consumo.taller,
    userId,
    usuario,
    sucursalId,
    now,
  }

  if (consumo.tipo === 'producto') return consumirProducto(common)
  if (consumo.tipo === 'material_taller') return consumirMaterialTaller(common)
  if (consumo.tipo === 'tela') return consumirTela(common)
  return { status: 400, error: 'tipo debe ser producto, material_taller o tela' }
}

export default async function odtConsumosRoutes(fastify) {
  fastify.get('/:id/materiales', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const resolved = await resolveOdtForWrite(fastify.prisma, request.params.id, {
      user: request.user,
      allowWithoutOrden: true,
    })
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
    const items = await fastify.prisma.tallerMaterial.findMany({
      where: { odtId: resolved.odt.id },
      orderBy: [{ taller: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
    })
    return { items, total: items.length }
  })

  fastify.delete('/:id/materiales/:materialId', {
    preHandler: [fastify.authenticate, fastify.rbac('taller.materiales', 'delete')],
  }, async (request, reply) => {
    const resolved = await resolveOdtForWrite(fastify.prisma, request.params.id, {
      user: request.user,
      allowWithoutOrden: true,
    })
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
    const materialId = parsePositiveInt(request.params.materialId)
    if (!materialId) return reply.code(400).send({ error: 'materialId invalido' })
    const current = await fastify.prisma.tallerMaterial.findFirst({
      where: { id: materialId, odtId: resolved.odt.id },
      select: { id: true },
    })
    if (!current) return reply.code(404).send({ error: 'Material no encontrado' })
    return fastify.prisma.tallerMaterial.delete({ where: { id: materialId } })
  })

  // El operario declara lo que consumio al trabajar.
  fastify.post('/:id/consumos', {
    preHandler: [fastify.authenticate, fastify.rbac('taller.avance', 'write')],
  }, async (request, reply) => {
    const consumo = parseConsumoRequest(request.body || {})
    if (consumo.error) return reply.code(400).send({ error: consumo.error })

    const resolved = await resolveOdtForWrite(fastify.prisma, request.params.id, {
      user: request.user,
      requireActive: true,
      includeSucursal: true,
    })
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
    if (!isOpenOdtEstado(resolved.odt.estado)) {
      return reply.code(409).send({ error: 'ODT cerrada o anulada' })
    }

    const result = await fastify.prisma.$transaction((tx) => applyOdtConsumo({
      tx,
      odt: resolved.odt,
      consumo,
      userId: getConsumoUserId(request.user),
      usuario: getConsumoUsuario(request.user),
      sucursalId: getUserSucursalId(request.user),
    }))
    if (result.error) {
      return reply.code(result.status || 400).send(buildConsumoErrorResponse(result))
    }

    return reply.code(201).send(result)
  })
}
