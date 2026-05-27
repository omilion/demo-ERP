// Paridad legacy pasar_taller: venta -> OT taller -> items/talleres concurrentes.
import { getUserSucursalId } from '../caja/scope.js'
import { can } from '../../middleware/rbac.js'
import { resolveOdtForWrite } from '../relation-guards.js'

function cleanText(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function parsePositiveInt(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function getRequestUsuario(user) {
  return cleanText(user?.nombre) || cleanText(user?.email)
}

function canPasarTallerWrite(user) {
  return can(user?.role, 'taller', 'write', user?.permisosExtra) ||
    can(user?.role, 'ventas', 'write', user?.permisosExtra)
}

function canPasarTallerRead(user) {
  return can(user?.role, 'taller', 'read', user?.permisosExtra) ||
    canPasarTallerWrite(user)
}

async function requirePasarTallerRead(request, reply) {
  if (!request.user || !canPasarTallerRead(request.user)) {
    return reply.code(403).send({ error: 'Forbidden' })
  }
}

async function requirePasarTallerWrite(request, reply) {
  if (!request.user || !canPasarTallerWrite(request.user)) {
    return reply.code(403).send({ error: 'Forbidden' })
  }
}

function buildObs(item) {
  const descripcion = cleanText(item.descripcion)
  const obs = cleanText(item.obs)
  if (descripcion && obs && descripcion !== obs) return `${descripcion}\n${obs}`
  return obs || descripcion
}

function normalizePrioridad(value, fallback = 'alta') {
  const normalized = normalizeText(value)
  if (!normalized) return fallback
  if (['alta', 'media', 'baja', 'normal', 'urgente'].includes(normalized)) return normalized
  if (normalized === 'emergencia') return 'urgente'
  return fallback
}

function isOrdenActiva(orden) {
  return orden && !orden.eliminada && normalizeText(orden.estado || 'Activa') === 'activa'
}

function isOdtWritable(odt) {
  const estado = normalizeText(odt?.estado || 'Pendiente')
  return !odt?.eliminado && !['anulada', 'terminada', 'entregada'].includes(estado)
}

function isProductoTransitorio(producto) {
  return normalizeText(producto?.estadoInventario) === 'transitorio'
}

function tallerKind(nombre) {
  const normalized = normalizeText(nombre)
  if (normalized.includes('confe')) return 'confecciones'
  if (normalized.includes('espuma')) return 'espumas'
  if (normalized.includes('madera') || normalized.includes('externo')) return 'externo'
  return normalized
}

function tallerLabel(taller) {
  const kind = tallerKind(taller?.nombre)
  if (kind === 'externo') return 'Madera'
  if (kind === 'confecciones') return 'Confecciones'
  if (kind === 'espumas') return 'Espumas'
  return taller?.nombre || ''
}

async function resolveProducto(prisma, item) {
  const productoId = parsePositiveInt(item.productoId ?? item.producto_id)
  if (productoId) {
    return prisma.producto.findFirst({ where: { id: productoId, activo: true } })
  }

  const codigoInterno = cleanText(item.codigoInterno ?? item.codigo_interno)
  if (!codigoInterno) return null
  return prisma.producto.findFirst({ where: { codigoInterno, activo: true } })
}

async function resolveOrden(prisma, input = {}, user, options = {}) {
  const ordenId = parsePositiveInt(input.ordenId ?? input.orden_id)
  const nInterno = parsePositiveInt(input.nInterno ?? input.n_interno)
  if (!ordenId && !nInterno) return { status: 400, error: 'ordenId o nInterno requerido' }

  const sucursalId = getUserSucursalId(user)
  const where = {
    ...(ordenId ? { id: ordenId } : { nInterno }),
    ...(sucursalId ? { OR: [{ sucursalId }, { sucursalId: null }] } : {}),
  }
  const orden = await prisma.orden.findFirst({
    where,
    include: {
      items: {
        where: { eliminado: false },
        orderBy: [{ nombre: 'asc' }, { codigoInterno: 'asc' }],
      },
    },
  })
  if (!orden) return { status: 404, error: 'Orden no encontrada' }
  if (options.requireActive && !isOrdenActiva(orden)) return { status: 409, error: 'Orden no activa o eliminada' }
  return { orden }
}

async function attachCliente(prisma, orden) {
  if (!orden?.clienteId) return null
  return prisma.cliente.findUnique({
    where: { id: orden.clienteId },
    select: { id: true, nombre: true, razonSocial: true, rut: true },
  })
}

async function productosMapForItems(prisma, items = []) {
  const ids = [...new Set(items.map(item => item.productoId).filter(Boolean))]
  if (!ids.length) return {}
  const productos = await prisma.producto.findMany({
    where: { id: { in: ids } },
    select: { id: true, codigoInterno: true, nombre: true, estadoInventario: true, activo: true },
  })
  return Object.fromEntries(productos.map(producto => [producto.id, producto]))
}

function selectPrimaryTipo(talleres = []) {
  const kinds = talleres.map(t => tallerKind(t.nombre))
  if (kinds.includes('espumas')) return 'Espumas'
  if (kinds.includes('confecciones')) return 'Confecciones'
  if (kinds.includes('externo')) return 'Madera'
  return 'Espumas'
}

async function loadOdtState(prisma, ordenId) {
  const odts = await prisma.odt.findMany({
    where: { ordenId, eliminado: false },
    orderBy: { createdAt: 'asc' },
    include: {
      items: {
        where: { eliminado: false },
        orderBy: [{ nombre: 'asc' }, { codigoInterno: 'asc' }],
        include: { talleres: { include: { taller: true }, orderBy: { tallerId: 'asc' } } },
      },
    },
  })
  return { odts, odt: odts[0] || null }
}

function buildExistingByCodigo(odt) {
  const map = new Map()
  for (const item of odt?.items || []) {
    if (item.codigoInterno) map.set(normalizeText(item.codigoInterno), item)
  }
  return map
}

function serializeTallerAssignment(rel) {
  return {
    id: rel.id,
    tallerId: rel.tallerId,
    tallerNombre: rel.taller?.nombre || null,
    tallerLabel: tallerLabel(rel.taller),
    estado: rel.estado,
    obs: rel.obs,
    fechaInicio: rel.fechaInicio,
    fechaListo: rel.fechaListo,
  }
}

function serializeOdtItem(item) {
  return {
    id: item.id,
    productoId: item.productoId,
    codigoInterno: item.codigoInterno,
    nombre: item.nombre,
    cantidad: item.cantidad,
    obs: item.obs,
    estado: item.estado,
    talleres: (item.talleres || []).map(serializeTallerAssignment),
  }
}

function serializeOdt(odt) {
  if (!odt) return null
  return {
    id: odt.id,
    tipo: odt.tipo,
    descripcion: odt.descripcion,
    obsGeneral: odt.obsGeneral,
    prioridad: odt.prioridad,
    estado: odt.estado,
    fechaIngreso: odt.fechaIngreso,
    fechaInicio: odt.fechaInicio,
    fechaTermino: odt.fechaTermino,
    items: (odt.items || []).map(serializeOdtItem),
  }
}

function buildPasarItems(orden, productosMap, odt) {
  const existingByCodigo = buildExistingByCodigo(odt)
  return (orden.items || [])
    .map(item => {
      const producto = productosMap[item.productoId] || null
      return { item, producto }
    })
    .filter(({ item, producto }) => isProductoTransitorio(producto) && Number(item.nEntregados || 0) < Number(item.cantidad || 0))
    .map(({ item, producto }) => {
      const codigo = item.codigoInterno || producto?.codigoInterno || ''
      const existing = codigo ? existingByCodigo.get(normalizeText(codigo)) : null
      return {
        ordenItemId: item.id,
        productoId: item.productoId,
        codigoInterno: codigo,
        nombre: item.nombre || producto?.nombre,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        nEntregados: item.nEntregados,
        pendienteEntrega: Math.max(0, Number(item.cantidad || 0) - Number(item.nEntregados || 0)),
        estadoInventario: producto?.estadoInventario || null,
        enTaller: Boolean(existing),
        cantidadTaller: existing?.cantidad || 0,
        requiereNotificarCantidad: Boolean(existing && Number(existing.cantidad || 0) !== Number(item.cantidad || 0)),
        obs: existing?.obs || item.descripcion || '',
        estadoProducto: existing?.estado || null,
        talleres: (existing?.talleres || []).map(serializeTallerAssignment),
      }
    })
}

function buildTallerOptions(talleres) {
  return talleres.map(taller => ({
    id: taller.id,
    nombre: taller.nombre,
    label: tallerLabel(taller),
    kind: tallerKind(taller.nombre),
  }))
}

function resolveTallerIdsFromItem(item, talleres) {
  const byId = new Map(talleres.map(t => [t.id, t]))
  const byKind = new Map()
  for (const taller of talleres) byKind.set(tallerKind(taller.nombre), taller)

  const rawIds = []
  if (Array.isArray(item.tallerIds)) rawIds.push(...item.tallerIds)
  if (item.tallerId !== undefined && item.tallerId !== null && item.tallerId !== '') rawIds.push(item.tallerId)

  const ids = new Set()
  for (const raw of rawIds) {
    const id = parsePositiveInt(raw)
    if (!id || !byId.has(id)) return { error: 'tallerId no existe o esta inactivo' }
    ids.add(id)
  }

  const names = []
  if (Array.isArray(item.talleres)) names.push(...item.talleres)
  if (item.confecciones) names.push('confecciones')
  if (item.espumas) names.push('espumas')
  if (item.externo || item.madera) names.push('externo')

  for (const name of names) {
    const kind = tallerKind(name)
    const taller = byKind.get(kind) || (kind === 'madera' ? byKind.get('externo') : null)
    if (!taller) return { error: `taller ${name} no existe o esta inactivo` }
    ids.add(taller.id)
  }

  return { ids: [...ids] }
}

async function resolveOrderItemForPayload(prisma, orden, payloadItem) {
  const ordenItemId = parsePositiveInt(payloadItem.ordenItemId ?? payloadItem.orden_item_id)
  const byId = ordenItemId ? orden.items.find(item => item.id === ordenItemId) : null
  if (byId) return byId

  const producto = await resolveProducto(prisma, payloadItem)
  if (!producto) return null

  const codigo = normalizeText(payloadItem.codigoInterno ?? payloadItem.codigo_interno ?? producto.codigoInterno)
  return orden.items.find(item => {
    if (item.productoId && item.productoId === producto.id) return true
    return codigo && normalizeText(item.codigoInterno) === codigo
  }) || null
}

async function ensureOdt(tx, { existingOdt, orden, cliente, talleres, prioridad, obsGeneral, user }) {
  const usuario = getRequestUsuario(user)
  const prioridadFinal = normalizePrioridad(prioridad, existingOdt?.prioridad || 'alta')
  const obsFinal = cleanText(obsGeneral)

  if (existingOdt) {
    const data = {}
    if (prioridad !== undefined) data.prioridad = prioridadFinal
    if (obsGeneral !== undefined) data.obsGeneral = obsFinal
    if (talleres?.length) data.tipo = selectPrimaryTipo(talleres)
    if (Object.keys(data).length) {
      return tx.odt.update({ where: { id: existingOdt.id }, data })
    }
    return existingOdt
  }

  const descripcion = `OT Taller venta ${orden.nInterno || orden.id}`
  const odt = await tx.odt.create({
    data: {
      ordenId: orden.id,
      sucursalId: orden.sucursalId ?? user?.sucursalId ?? null,
      tipo: selectPrimaryTipo(talleres),
      clienteNombre: cliente?.razonSocial || cliente?.nombre || orden.rutCliente || null,
      descripcion,
      obsGeneral: obsFinal || 'No hay',
      prioridad: prioridadFinal,
      estado: 'Pendiente',
      fechaIngreso: new Date(),
    },
  })
  if (usuario) {
    await tx.bitacoraTaller.create({
      data: {
        odtId: odt.id,
        usuario,
        usuarioReporta: usuario,
        sucursalId: odt.sucursalId,
        fecha: new Date(),
        texto: `OT creada desde Pasar a Taller para venta ${orden.nInterno || orden.id}`,
      },
    })
  }
  return odt
}

async function lockOrdenPasarTaller(tx, ordenId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260530, ${ordenId})`
}

async function upsertOdtItem(tx, { odt, ordenItem, producto, payloadItem, tallerIds, user }) {
  const usuario = getRequestUsuario(user)
  const cantidad = parsePositiveInt(payloadItem.cantidad) || Number(ordenItem.cantidad || 0)
  if (!cantidad || cantidad <= 0) return { error: 'cantidad debe ser un entero mayor a 0' }
  if (cantidad > Number(ordenItem.cantidad || 0)) return { error: 'cantidad no puede superar la cantidad vendida' }

  const codigoInterno = ordenItem.codigoInterno || producto?.codigoInterno || cleanText(payloadItem.codigoInterno)
  const nombre = ordenItem.nombre || producto?.nombre || cleanText(payloadItem.nombre)
  const obs = buildObs({ ...payloadItem, descripcion: payloadItem.descripcion ?? ordenItem.descripcion })

  let odtItem = await tx.odtItem.findFirst({
    where: {
      odtId: odt.id,
      eliminado: false,
      OR: [
        ...(codigoInterno ? [{ codigoInterno }] : []),
        { productoId: ordenItem.productoId },
      ],
    },
    include: { talleres: true },
  })

  const data = {
    odtId: odt.id,
    productoId: ordenItem.productoId,
    codigoInterno,
    nombre,
    cantidad,
    obs,
    usuario,
  }

  if (odtItem) {
    odtItem = await tx.odtItem.update({
      where: { id: odtItem.id },
      data,
      include: { talleres: true },
    })
  } else {
    odtItem = await tx.odtItem.create({
      data: { ...data, estado: 'pendiente' },
      include: { talleres: true },
    })
  }

  const selected = new Set(tallerIds)
  const current = await tx.odtItemTaller.findMany({ where: { odtItemId: odtItem.id } })
  const toRemove = current.filter(rel => !selected.has(rel.tallerId))
  const locked = toRemove.filter(rel => normalizeText(rel.estado || 'pendiente') !== 'pendiente')
  if (locked.length) {
    return { error: 'No se puede quitar un taller con trabajo iniciado/listo; cambie su estado desde la ODT' }
  }
  if (toRemove.length) {
    await tx.odtItemTaller.deleteMany({
      where: { id: { in: toRemove.map(rel => rel.id) } },
    })
  }

  for (const tallerId of tallerIds) {
    await tx.odtItemTaller.upsert({
      where: { odtItemId_tallerId: { odtItemId: odtItem.id, tallerId } },
      update: { obs, usuario },
      create: {
        odtItemId: odtItem.id,
        tallerId,
        obs,
        usuario,
      },
    })
  }

  await tx.bitacoraTaller.create({
    data: {
      odtId: odt.id,
      usuario: usuario || 'Sistema',
      usuarioReporta: usuario || 'Sistema',
      sucursalId: odt.sucursalId ?? null,
      fecha: new Date(),
      texto: `Producto enviado/actualizado en taller: ${[codigoInterno, nombre].filter(Boolean).join(' - ')} x${cantidad}`,
    },
  })

  return { odtItem }
}

export default async function pasarTallerRoutes(fastify) {
  fastify.get('/orden/:ordenId', {
    preHandler: [fastify.authenticate, requirePasarTallerRead],
  }, async (request, reply) => {
    const resolved = await resolveOrden(fastify.prisma, { ordenId: request.params.ordenId }, request.user)
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })

    const [cliente, productosMap, odtState, talleres] = await Promise.all([
      attachCliente(fastify.prisma, resolved.orden),
      productosMapForItems(fastify.prisma, resolved.orden.items),
      loadOdtState(fastify.prisma, resolved.orden.id),
      fastify.prisma.taller.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    ])

    return {
      orden: {
        id: resolved.orden.id,
        nInterno: resolved.orden.nInterno,
        tipo: resolved.orden.tipo,
        estado: resolved.orden.estado,
        sucursalId: resolved.orden.sucursalId,
        cliente,
      },
      talleres: buildTallerOptions(talleres),
      odt: serializeOdt(odtState.odt),
      odts: odtState.odts.map(serializeOdt),
      items: buildPasarItems(resolved.orden, productosMap, odtState.odt),
    }
  })

  fastify.get('/orden', {
    preHandler: [fastify.authenticate, requirePasarTallerRead],
  }, async (request, reply) => {
    const resolved = await resolveOrden(fastify.prisma, request.query, request.user)
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
    request.params = { ordenId: String(resolved.orden.id) }
    const [cliente, productosMap, odtState, talleres] = await Promise.all([
      attachCliente(fastify.prisma, resolved.orden),
      productosMapForItems(fastify.prisma, resolved.orden.items),
      loadOdtState(fastify.prisma, resolved.orden.id),
      fastify.prisma.taller.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    ])
    return {
      orden: {
        id: resolved.orden.id,
        nInterno: resolved.orden.nInterno,
        tipo: resolved.orden.tipo,
        estado: resolved.orden.estado,
        sucursalId: resolved.orden.sucursalId,
        cliente,
      },
      talleres: buildTallerOptions(talleres),
      odt: serializeOdt(odtState.odt),
      odts: odtState.odts.map(serializeOdt),
      items: buildPasarItems(resolved.orden, productosMap, odtState.odt),
    }
  })

  fastify.post('/enviar', {
    preHandler: [fastify.authenticate, requirePasarTallerWrite],
  }, async (request, reply) => {
    const body = request.body || {}
    const items = Array.isArray(body.items) ? body.items : []
    if (!items.length && body.prioridad === undefined && body.obsGeneral === undefined) {
      return reply.code(400).send({ error: 'items, prioridad u obsGeneral requerido' })
    }

    let existingOdt = null
    let orden = null
    if (body.odtId) {
      const odtResolved = await resolveOdtForWrite(fastify.prisma, body.odtId, {
        user: request.user,
        requireActive: true,
        includeSucursal: true,
      })
      if (odtResolved.error) return reply.code(odtResolved.status).send({ error: odtResolved.error })
      if (!isOdtWritable(odtResolved.odt)) return reply.code(409).send({ error: 'ODT cerrada o anulada' })
      existingOdt = odtResolved.odt
      const ordenResolved = await resolveOrden(fastify.prisma, { ordenId: existingOdt.ordenId }, request.user, { requireActive: true })
      if (ordenResolved.error) return reply.code(ordenResolved.status).send({ error: ordenResolved.error })
      orden = ordenResolved.orden
    } else {
      const ordenResolved = await resolveOrden(fastify.prisma, body, request.user, { requireActive: true })
      if (ordenResolved.error) return reply.code(ordenResolved.status).send({ error: ordenResolved.error })
      orden = ordenResolved.orden
      const odtState = await loadOdtState(fastify.prisma, orden.id)
      existingOdt = odtState.odt
      if (existingOdt && !isOdtWritable(existingOdt)) return reply.code(409).send({ error: 'ODT cerrada o anulada' })
    }

    if (body.ordenId && parsePositiveInt(body.ordenId) !== orden.id) {
      return reply.code(409).send({ error: 'La ODT no pertenece a la orden indicada' })
    }

    const [cliente, talleres, productosMap] = await Promise.all([
      attachCliente(fastify.prisma, orden),
      fastify.prisma.taller.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      productosMapForItems(fastify.prisma, orden.items),
    ])
    if (!talleres.length && items.length) return reply.code(400).send({ error: 'No hay talleres activos configurados' })

    const prepared = []
    for (const [index, it] of items.entries()) {
      if (!it || typeof it !== 'object') return reply.code(400).send({ error: `items[${index}] debe ser un objeto` })

      const ordenItem = await resolveOrderItemForPayload(fastify.prisma, orden, it)
      if (!ordenItem) return reply.code(400).send({ error: `items[${index}].producto no pertenece a la orden` })

      const producto = productosMap[ordenItem.productoId] || await resolveProducto(fastify.prisma, it)
      if (!producto) return reply.code(400).send({ error: `items[${index}].producto no encontrado` })
      if (!isProductoTransitorio(producto)) return reply.code(409).send({ error: `items[${index}].producto no es transitorio` })
      if (Number(ordenItem.nEntregados || 0) >= Number(ordenItem.cantidad || 0)) {
        return reply.code(409).send({ error: `items[${index}].producto ya fue entregado completo` })
      }

      const resolvedTallerIds = resolveTallerIdsFromItem(it, talleres)
      if (resolvedTallerIds.error) return reply.code(400).send({ error: `items[${index}].${resolvedTallerIds.error}` })
      if (!resolvedTallerIds.ids.length) return reply.code(400).send({ error: `items[${index}].talleres requerido` })

      prepared.push({ ordenItem, producto, payloadItem: it, tallerIds: resolvedTallerIds.ids })
    }

    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        await lockOrdenPasarTaller(tx, orden.id)
        const txExistingOdt = existingOdt?.id
          ? await tx.odt.findFirst({ where: { id: existingOdt.id, ordenId: orden.id, eliminado: false } })
          : await tx.odt.findFirst({ where: { ordenId: orden.id, eliminado: false }, orderBy: { createdAt: 'asc' } })
        if (txExistingOdt && !isOdtWritable(txExistingOdt)) {
          const error = new Error('ODT cerrada o anulada')
          error.statusCode = 409
          throw error
        }
        const selectedTallerIds = new Set(prepared.flatMap(entry => entry.tallerIds))
        const selectedTalleres = talleres.filter(taller => selectedTallerIds.has(taller.id))
        const odt = await ensureOdt(tx, {
          existingOdt: txExistingOdt,
          orden,
          cliente,
          talleres: selectedTalleres,
          prioridad: body.prioridad,
          obsGeneral: body.obsGeneral,
          user: request.user,
        })
        const affected = []
        for (const entry of prepared) {
          const saved = await upsertOdtItem(tx, { odt, ...entry, user: request.user })
          if (saved.error) {
            const error = new Error(saved.error)
            error.statusCode = 409
            throw error
          }
          affected.push(saved.odtItem)
        }
        return { odt, affected }
      })
      return { ok: true, odtId: result.odt.id, created: result.affected, updated: result.affected }
    } catch (error) {
      if (error.statusCode) return reply.code(error.statusCode).send({ error: error.message })
      throw error
    }
  })

  fastify.delete('/items/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'delete')],
  }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'id invalido' })
    const sucursalId = getUserSucursalId(request.user)
    const item = await fastify.prisma.odtItem.findFirst({
      where: {
        id,
        eliminado: false,
        ...(sucursalId ? { odt: { is: { OR: [{ sucursalId }, { sucursalId: null }] } } } : {}),
      },
      include: { odt: true, talleres: true },
    })
    if (!item) return reply.code(404).send({ error: 'Item taller no encontrado' })
    if (!isOdtWritable(item.odt)) return reply.code(409).send({ error: 'ODT cerrada o anulada' })
    if ((item.talleres || []).some(rel => normalizeText(rel.estado || 'pendiente') !== 'pendiente')) {
      return reply.code(409).send({ error: 'No se puede quitar un item con trabajo iniciado/listo' })
    }

    const usuario = getRequestUsuario(request.user) || 'Sistema'
    await fastify.prisma.$transaction(async (tx) => {
      await tx.odtItem.update({ where: { id }, data: { eliminado: true, estado: 'cancelado', usuario } })
      await tx.bitacoraTaller.create({
        data: {
          odtId: item.odtId,
          usuario,
          usuarioReporta: usuario,
          sucursalId: item.odt?.sucursalId ?? null,
          fecha: new Date(),
          texto: `Item eliminado desde Pasar a Taller: ${[item.codigoInterno, item.nombre].filter(Boolean).join(' - ') || `#${item.id}`}`,
        },
      })
    })
    return { ok: true }
  })

  fastify.get('/talleres', {
    preHandler: [fastify.authenticate, requirePasarTallerRead],
  }, async () => {
    const talleres = await fastify.prisma.taller.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } })
    return buildTallerOptions(talleres)
  })

  fastify.post('/talleres', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user?.role !== 'admin') return reply.code(403).send({ error: 'Solo admin' })
    const { nombre } = request.body || {}
    if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
    try { return await fastify.prisma.taller.create({ data: { nombre } }) }
    catch (e) { if (e.code === 'P2002') return reply.code(409).send({ error: 'ya existe' }); throw e }
  })
}
