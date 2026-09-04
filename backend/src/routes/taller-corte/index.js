import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getUserSucursalId } from '../caja/scope.js'

const CORTE_NOMBRE = 'Taller de Corte'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

function usuarioActual(user) {
  return String(user?.nombre || user?.email || 'Sistema').trim() || 'Sistema'
}

function uploadsRoot() {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'))
}

function parsePositiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function parseDate(value) {
  if (!value) return new Date()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function corteTallerWhere() {
  return { activo: true, nombre: { equals: CORTE_NOMBRE, mode: 'insensitive' } }
}

function scopedOdt(user) {
  const sucursalId = getUserSucursalId(user)
  return {
    eliminado: false,
    ...(sucursalId ? { OR: [{ sucursalId }, { sucursalId: null }] } : {}),
  }
}

function relationWhere(tallerId, user, tallerItemId = null) {
  return {
    ...(tallerItemId ? { id: tallerItemId } : {}),
    tallerId,
    odtItem: {
      is: {
        eliminado: false,
        odt: { is: scopedOdt(user) },
      },
    },
  }
}

function parseImageDataUrl(value) {
  const raw = String(value || '')
  const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) return { error: 'La evidencia debe ser una imagen JPG, PNG o WEBP' }
  const mimeType = match[1].toLowerCase()
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length) return { error: 'La imagen esta vacia' }
  if (bytes.length > MAX_IMAGE_BYTES) return { error: 'La imagen supera el maximo de 5 MB' }
  return { bytes, mimeType, ext: IMAGE_TYPES[mimeType] }
}

function buildProgressSummary(item, avances = []) {
  const total = avances.reduce((sum, avance) => sum + Number(avance.cantidadTerminada || 0), 0)
  const objetivo = Number(item?.odtItem?.cantidad || 0)
  const porcentaje = objetivo > 0 ? Math.min(100, Math.round((total / objetivo) * 1000) / 10) : 0
  return {
    totalTerminado: Math.round(total * 100) / 100,
    objetivo,
    porcentaje,
    restante: Math.max(0, Math.round((objetivo - total) * 100) / 100),
    registros: avances,
  }
}

export function getCorteAdvanceBlocker({ objetivo, totalPrevio, cantidad }) {
  if (Number(objetivo) > 0 && Number(totalPrevio) + Number(cantidad) > Number(objetivo) + 0.0001) {
    return `El avance supera la cantidad objetivo (${objetivo})`
  }
  return null
}

function serializeItem(item, context) {
  const avances = context.avancesByItem.get(item.id) || []
  const evidencias = context.evidenciasByItem.get(item.id) || []
  const estado = item.estado === 'pendiente' && !item.operarioResponsableId ? 'sin_asignar' : item.estado
  const actualInicio = item.fechaInicio ? new Date(item.fechaInicio) : null
  const actualFin = item.fechaListo ? new Date(item.fechaListo) : null
  const tiempoRealMinutos = actualInicio && actualFin
    ? Math.max(0, Math.round((actualFin.getTime() - actualInicio.getTime()) / 60000))
    : null

  return {
    id: item.id,
    estado: item.estado,
    estadoVista: estado,
    obs: item.obs,
    fechaInicio: item.fechaInicio,
    fechaListo: item.fechaListo,
    usuario: item.usuario,
    operarioResponsableId: item.operarioResponsableId,
    operarioResponsable: item.operarioResponsable,
    taller: item.taller,
    odtItem: item.odtItem,
    odt: item.odtItem?.odt,
    orden: context.ordenById.get(item.odtItem?.odt?.ordenId) || null,
    cliente: context.clienteById.get(context.ordenById.get(item.odtItem?.odt?.ordenId)?.clienteId) || null,
    producto: context.productoById.get(item.odtItem?.productoId) || null,
    progreso: buildProgressSummary(item, avances),
    tiempoRealMinutos,
    evidencias,
  }
}

async function getCorte(prisma) {
  return prisma.taller.findFirst({ where: corteTallerWhere() })
}

async function findCorteItem(prisma, id, user) {
  const corte = await getCorte(prisma)
  if (!corte) return { error: 'Taller de Corte no esta configurado', status: 503 }
  const item = await prisma.odtItemTaller.findFirst({
    where: relationWhere(corte.id, user, id),
    include: {
      taller: true,
      operarioResponsable: { select: { id: true, nombre: true, email: true, role: true } },
      odtItem: { include: { odt: true } },
    },
  })
  if (!item) return { error: 'Tarea de Taller de Corte no encontrada', status: 404 }
  return { corte, item }
}

async function enrichItems(prisma, items) {
  const odtIds = [...new Set(items.map(item => item.odtItem?.odt?.id).filter(Boolean))]
  const ordenIds = [...new Set(items.map(item => item.odtItem?.odt?.ordenId).filter(Boolean))]
  const productoIds = [...new Set(items.map(item => item.odtItem?.productoId).filter(Boolean))]
  const [ordenes, productos, avances, evidencias] = await Promise.all([
    ordenIds.length
      ? prisma.orden.findMany({
        where: { id: { in: ordenIds } },
        select: { id: true, nInterno: true, tipo: true, licitacion: true, observaciones: true, clienteId: true },
      })
      : [],
    productoIds.length
      ? prisma.producto.findMany({
        where: { id: { in: productoIds } },
        select: { id: true, codigoInterno: true, nombre: true, fotoUrl: true, fotoUrlGrande: true },
      })
      : [],
    items.length
      ? prisma.odtAvance.findMany({
        where: { odtItemTallerId: { in: items.map(item => item.id) } },
        orderBy: [{ fechaTrabajo: 'desc' }, { createdAt: 'desc' }],
      })
      : [],
    items.length
      ? prisma.tallerEvidencia.findMany({
        where: { odtItemTallerId: { in: items.map(item => item.id) } },
        orderBy: { createdAt: 'desc' },
      })
      : [],
  ])
  const clienteIds = [...new Set(ordenes.map(orden => orden.clienteId).filter(Boolean))]
  const clientes = clienteIds.length
    ? await prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, nombre: true, razonSocial: true, rut: true } })
    : []
  return {
    ordenById: new Map(ordenes.map(orden => [orden.id, orden])),
    clienteById: new Map(clientes.map(cliente => [cliente.id, cliente])),
    productoById: new Map(productos.map(producto => [producto.id, producto])),
    avancesByItem: new Map(items.map(item => [item.id, avances.filter(avance => avance.odtItemTallerId === item.id)])),
    evidenciasByItem: new Map(items.map(item => [item.id, evidencias.filter(evidencia => evidencia.odtItemTallerId === item.id)])),
    odtIds,
  }
}

export { buildProgressSummary, parseImageDataUrl, CORTE_NOMBRE }

export default async function tallerCorteRoutes(fastify) {
  fastify.get('/config', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async () => {
    const taller = await getCorte(fastify.prisma)
    return {
      taller: taller ? { id: taller.id, nombre: taller.nombre, activo: taller.activo } : null,
      estados: [
        { id: 'sin_asignar', label: 'Sin Asignar' },
        { id: 'pendiente', label: 'Pendiente' },
        { id: 'en_proceso', label: 'En Proceso' },
        { id: 'listo', label: 'Listo' },
      ],
      flujo: [
        'Coordinación notifica la OT desde la venta',
        'Supervisor asigna la tarea a un usuario con cuenta activa',
        'Operario inicia, registra avances diarios y adjunta evidencia',
        'Supervisor valida y marca la tarea como lista para continuar producción',
      ],
    }
  })

  fastify.get('/items', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const corte = await getCorte(fastify.prisma)
    if (!corte) return reply.code(503).send({ error: 'Taller de Corte no esta configurado' })
    const soloMias = request.query?.mine === 'true' || request.query?.mine === '1'
    const estado = String(request.query?.estado || '').trim()
    const items = await fastify.prisma.odtItemTaller.findMany({
      where: {
        ...relationWhere(corte.id, request.user),
        ...(estado === 'sin_asignar' ? { estado: 'pendiente', operarioResponsableId: null } : {}),
        ...(estado && estado !== 'sin_asignar' ? { estado } : {}),
        ...(soloMias ? { operarioResponsableId: request.user.id } : {}),
      },
      include: {
        taller: true,
        operarioResponsable: { select: { id: true, nombre: true, email: true, role: true } },
        odtItem: { include: { odt: true } },
      },
      orderBy: [{ odtItem: { odt: { id: 'desc' } } }, { id: 'desc' }],
    })
    const context = await enrichItems(fastify.prisma, items)
    return { items: items.map(item => serializeItem(item, context)), taller: corte }
  })

  fastify.get('/items/:id/avances', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const resolved = await findCorteItem(fastify.prisma, Number.parseInt(request.params.id, 10), request.user)
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
    return fastify.prisma.odtAvance.findMany({
      where: { odtItemTallerId: resolved.item.id },
      orderBy: [{ fechaTrabajo: 'desc' }, { createdAt: 'desc' }],
    })
  })

  // Registrar el avance propio es el trabajo del operario, no gestion del taller.
  // Con taller:write, el rol taller_operario -que tiene taller:read y
  // taller.avance:write- quedaba bloqueado justo de la pantalla para la que existe:
  // una cortadora no podia anotar lo que acababa de cortar.
  fastify.post('/items/:id/avances', {
    preHandler: [fastify.authenticate, fastify.rbac('taller.avance', 'write')],
  }, async (request, reply) => {
    const resolved = await findCorteItem(fastify.prisma, Number.parseInt(request.params.id, 10), request.user)
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
    const cantidad = parsePositiveNumber(request.body?.cantidadTerminada)
    if (!cantidad) return reply.code(400).send({ error: 'cantidadTerminada debe ser mayor que cero' })
    const fechaTrabajo = parseDate(request.body?.fechaTrabajo)
    if (!fechaTrabajo) return reply.code(400).send({ error: 'fechaTrabajo invalida' })
    if (['listo', 'cancelado'].includes(resolved.item.estado)) return reply.code(409).send({ error: 'La tarea ya esta cerrada' })

    const usuario = usuarioActual(request.user)
    const observacion = request.body?.observacion ? String(request.body.observacion).trim() : null
    try {
      const avance = await fastify.prisma.$transaction(async tx => {
        // Serializa avance, cambios de estación y cierre de la misma ODT; se
        // vuelve a leer la tarea dentro de la transacción antes de sumar.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`odt-workflow:${resolved.item.odtItem.odtId}`})::bigint)`
        const item = await tx.odtItemTaller.findFirst({
          where: relationWhere(resolved.corte.id, request.user, resolved.item.id),
          include: { odtItem: { include: { odt: true } } },
        })
        if (!item) {
          const error = new Error('Tarea de Taller de Corte no encontrada')
          error.statusCode = 404
          throw error
        }
        if (['listo', 'cancelado'].includes(item.estado)) {
          const error = new Error('La tarea ya esta cerrada')
          error.statusCode = 409
          throw error
        }
        const previo = await tx.odtAvance.aggregate({
          where: { odtItemTallerId: item.id },
          _sum: { cantidadTerminada: true },
        })
        const blocker = getCorteAdvanceBlocker({
          objetivo: Number(item.odtItem.cantidad || 0),
          totalPrevio: Number(previo._sum.cantidadTerminada || 0),
          cantidad,
        })
        if (blocker) {
          const error = new Error(blocker)
          error.statusCode = 409
          throw error
        }
      const created = await tx.odtAvance.create({
        data: {
          odtItemTallerId: item.id,
          cantidadTerminada: cantidad,
          fechaTrabajo,
          observacion,
          usuario,
          ipEquipo: request.ip,
        },
      })
      const transition = item.estado === 'pendiente'
        ? { estado: 'en_proceso', fechaInicio: item.fechaInicio || new Date(), usuario }
        : null
      if (transition) await tx.odtItemTaller.update({ where: { id: item.id }, data: transition })
      await tx.bitacoraTaller.create({
        data: {
          odtId: item.odtItem.odtId,
          usuario,
          usuarioReporta: usuario,
          ipEquipo: request.ip,
          sucursalId: item.odtItem.odt.sucursalId ?? getUserSucursalId(request.user),
          fecha: new Date(),
          texto: `Avance Taller de Corte: ${item.odtItem.codigoInterno || item.odtItem.nombre || `item #${item.id}`} +${cantidad}. ${observacion || 'Sin observaciones.'}`,
        },
      })
      return created
      })
      return reply.code(201).send(avance)
    } catch (error) {
      if (error.statusCode) return reply.code(error.statusCode).send({ error: error.message })
      throw error
    }
  })

  // La foto es parte del mismo avance: quien puede declararlo puede documentarlo.
  fastify.post('/items/:id/evidencias', {
    preHandler: [fastify.authenticate, fastify.rbac('taller.avance', 'write')],
    bodyLimit: 7 * 1024 * 1024,
  }, async (request, reply) => {
    const resolved = await findCorteItem(fastify.prisma, Number.parseInt(request.params.id, 10), request.user)
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
    const parsed = parseImageDataUrl(request.body?.data)
    if (parsed.error) return reply.code(400).send({ error: parsed.error })
    const odtId = resolved.item.odtItem.odtId
    const dir = path.join(uploadsRoot(), 'taller-corte', String(odtId))
    await mkdir(dir, { recursive: true })
    const filename = `${randomUUID()}${parsed.ext}`
    await writeFile(path.join(dir, filename), parsed.bytes)
    const usuario = usuarioActual(request.user)
    const evidencia = await fastify.prisma.$transaction(async tx => {
      const created = await tx.tallerEvidencia.create({
        data: {
          odtId,
          odtItemTallerId: resolved.item.id,
          archivoUrl: `/uploads/taller-corte/${odtId}/${filename}`,
          nombreArchivo: String(request.body?.nombreArchivo || filename).slice(0, 180),
          mimeType: parsed.mimeType,
          usuario,
          ipEquipo: request.ip,
        },
      })
      await tx.bitacoraTaller.create({
        data: {
          odtId,
          usuario,
          usuarioReporta: usuario,
          ipEquipo: request.ip,
          sucursalId: resolved.item.odtItem.odt.sucursalId ?? getUserSucursalId(request.user),
          fecha: new Date(),
          texto: `Evidencia fotografica adjunta en Taller de Corte: ${created.nombreArchivo}`,
        },
      })
      return created
    })
    return reply.code(201).send(evidencia)
  })
}
