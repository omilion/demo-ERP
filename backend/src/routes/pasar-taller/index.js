// Paridad legacy pasar_taller: venta -> OT taller -> items/talleres concurrentes.
import { getUserSucursalId } from '../caja/scope.js'
import { can } from '../../middleware/rbac.js'
import { resolveOdtForWrite } from '../relation-guards.js'

import {
  cleanText,
  normalizeText,
  parsePositiveInt,
  getRequestUsuario,
  normalizePrioridad,
  isOrdenActiva,
  isOdtWritable,
  isProductoTransitorio,
  tallerKind,
  tallerLabel,
  selectPrimaryTipo,
  ensureOdt,
  lockOrdenPasarTaller,
  upsertOdtItem,
  resolveTallerIdsFromItem
} from './service.js';

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

// El catalogo de talleres lo consume tambien Costeo (ficha de materia prima y
// tarifas). Es una lista de nombres, no la operacion de pasar a taller, asi que
// tiene su propio guard en vez de abrir todo el modulo.
async function requireTalleresCatalogRead(request, reply) {
  const user = request.user
  // Suma a quien ya podia leerlo: Costeo lo necesita para la ficha de materia
  // prima y las tarifas, sin darle el resto del modulo de taller.
  const permitido = user && (canPasarTallerRead(user) || can(user?.role, 'costeo', 'read', user?.permisosExtra))
  if (!permitido) {
    return reply.code(403).send({ error: 'Forbidden' })
  }
}

async function requirePasarTallerWrite(request, reply) {
  if (!request.user || !canPasarTallerWrite(request.user)) {
    return reply.code(403).send({ error: 'Forbidden' })
  }
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
    select: { id: true, codigoInterno: true, nombre: true, estadoInventario: true, activo: true, tallerId: true },
  })
  return Object.fromEntries(productos.map(producto => [producto.id, producto]))
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
  // La OT vigente es la abierta, no la mas antigua: una venta puede arrastrar
  // OTs cerradas y trabajar contra ellas daria por faltante lo que ya se fabrica.
  return { odts, odt: odts.find(isOdtWritable) || odts.at(-1) || null }
}

function odtList(odtsOrOdt) {
  if (!odtsOrOdt) return []
  return Array.isArray(odtsOrOdt) ? odtsOrOdt.filter(Boolean) : [odtsOrOdt]
}

function buildExistingByCodigo(odtsOrOdt) {
  const map = new Map()
  for (const odt of odtList(odtsOrOdt)) {
    for (const item of odt?.items || []) {
      if (item.codigoInterno) map.set(normalizeText(item.codigoInterno), item)
    }
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

function buildPasarItems(orden, productosMap, odtsOrOdt) {
  const existingByCodigo = buildExistingByCodigo(odtsOrOdt)
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

// Bandeja de pendientes: la auto-notificacion (autoNotifyTaller) cubre el flujo
// normal, pero falla en silencio en varios bordes -- ODT ya cerrada cuando la
// venta suma items, upsert de un item que no prospera (solo queda en el log), o
// un producto transitorio cuyo taller se resolvio por fallback. Sin esta vista
// esos productos quedan vendidos y nunca fabricados, sin rastro en pantalla.
const PENDIENTES_DIAS_DEFAULT = 180
const PENDIENTES_LIMIT_DEFAULT = 50
const PENDIENTES_LIMIT_MAX = 200
const PENDIENTES_SCAN_MAX = 600

const MOTIVO_LABEL = {
  sin_odt: 'Sin orden de taller',
  odt_cerrada: 'ODT cerrada con items pendientes',
  items_faltantes: 'Items que no llegaron a la ODT',
  cantidad_desfasada: 'Cantidad distinta a la vendida',
  taller_por_defecto: 'Taller asignado por defecto',
}

// Replica la cascada de autoNotifyTaller para detectar el tercer caso: el
// producto no dice a que taller va y el nombre no lo delata, asi que el
// automatismo lo manda a Espumas (o al primer taller) sin avisar a nadie.
export function resolveTallerOrigen(producto, byKind) {
  if (!producto) return 'desconocido'
  if (producto.tallerId) return 'producto'
  const kind = tallerKind(producto.nombre)
  const matched = byKind.get(kind) || (kind === 'madera' ? byKind.get('externo') : null)
  return matched ? 'nombre' : 'defecto'
}

export function buildPendienteRow(orden, cliente, productosMap, odtState, byKind) {
  const todasLasOdts = odtState?.odts?.length ? odtState.odts : (odtState?.odt ? [odtState.odt] : [])
  // Una venta puede tener mas de una ODT (por ejemplo, si la primera se cerro y
  // se abrio otra). Para saber si un producto ya esta en taller hay que mirarlas
  // todas: quedarse con la primera daria por faltante lo que ya se fabrica.
  const items = buildPasarItems(orden, productosMap, todasLasOdts)
  if (!items.length) return null

  // La ODT de referencia es la abierta; solo si no hay ninguna se reporta la
  // ultima cerrada, que es la que explica por que el trabajo no entro.
  const odtAbiertaRef = todasLasOdts.find(isOdtWritable) || null
  const odt = odtAbiertaRef || todasLasOdts.at(-1) || null
  const odtAbierta = Boolean(odtAbiertaRef)
  const faltantes = items.filter(item => !item.enTaller)
  const desfasados = items.filter(item => item.enTaller && item.requiereNotificarCantidad)

  const detalle = items
    .filter(item => !item.enTaller || item.requiereNotificarCantidad || resolveTallerOrigen(productosMap[item.productoId], byKind) === 'defecto')
    .map(item => ({
      ordenItemId: item.ordenItemId,
      productoId: item.productoId,
      codigoInterno: item.codigoInterno,
      nombre: item.nombre,
      cantidad: item.cantidad,
      pendienteEntrega: item.pendienteEntrega,
      cantidadTaller: item.cantidadTaller,
      enTaller: item.enTaller,
      tallerOrigen: resolveTallerOrigen(productosMap[item.productoId], byKind),
      talleres: item.talleres,
    }))

  const motivos = []
  if (!odt && faltantes.length) motivos.push('sin_odt')
  if (odt && !odtAbierta && (faltantes.length || desfasados.length)) motivos.push('odt_cerrada')
  if (odt && odtAbierta && faltantes.length) motivos.push('items_faltantes')
  if (desfasados.length) motivos.push('cantidad_desfasada')
  if (detalle.some(item => item.tallerOrigen === 'defecto')) motivos.push('taller_por_defecto')

  if (!motivos.length) return null

  return {
    ordenId: orden.id,
    nInterno: orden.nInterno,
    tipo: orden.tipo,
    createdAt: orden.createdAt,
    fechaPlazo: orden.fechaPlazo,
    cliente,
    odtId: odt?.id || null,
    odtEstado: odt?.estado || null,
    odtAbierta,
    motivos,
    motivosLabel: motivos.map(motivo => MOTIVO_LABEL[motivo] || motivo),
    itemsTransitorios: items.length,
    itemsFaltantes: faltantes.length,
    itemsDesfasados: desfasados.length,
    detalle,
  }
}

export default async function pasarTallerRoutes(fastify) {
  fastify.get('/pendientes', {
    preHandler: [fastify.authenticate, requirePasarTallerRead],
  }, async (request, reply) => {
    const limitRaw = request.query.limit
    const limitParsed = limitRaw === undefined || limitRaw === ''
      ? PENDIENTES_LIMIT_DEFAULT
      : parsePositiveInt(limitRaw)
    if (!limitParsed) return reply.code(400).send({ error: 'limit invalido' })
    const limit = Math.min(limitParsed, PENDIENTES_LIMIT_MAX)

    const diasRaw = request.query.dias
    const dias = diasRaw === undefined || diasRaw === ''
      ? PENDIENTES_DIAS_DEFAULT
      : parsePositiveInt(diasRaw)
    if (!dias) return reply.code(400).send({ error: 'dias invalido' })

    const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
    const talleres = await fastify.prisma.taller.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    })
    const byKind = new Map(talleres.map(taller => [tallerKind(taller.nombre), taller]))

    const transitorios = await fastify.prisma.producto.findMany({
      where: { estadoInventario: { equals: 'transitorio', mode: 'insensitive' } },
      select: { id: true, codigoInterno: true, nombre: true, estadoInventario: true, activo: true, tallerId: true },
    })
    if (!transitorios.length) {
      return { items: [], total: 0, scanned: 0, dias, limit, talleres: buildTallerOptions(talleres) }
    }
    const productosMap = Object.fromEntries(transitorios.map(producto => [producto.id, producto]))
    const transitorioIds = transitorios.map(producto => producto.id)

    const sucursalId = getUserSucursalId(request.user)
    const ordenes = await fastify.prisma.orden.findMany({
      where: {
        eliminada: false,
        estado: { equals: 'Activa', mode: 'insensitive' },
        createdAt: { gte: cutoff },
        ...(sucursalId ? { OR: [{ sucursalId }, { sucursalId: null }] } : {}),
        items: { some: { eliminado: false, productoId: { in: transitorioIds } } },
      },
      include: {
        items: {
          where: { eliminado: false },
          orderBy: [{ nombre: 'asc' }, { codigoInterno: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(PENDIENTES_SCAN_MAX, Math.max(limit * 4, 200)),
    })

    const ordenIds = ordenes.map(orden => orden.id)
    const [odts, clientes] = await Promise.all([
      ordenIds.length
        ? fastify.prisma.odt.findMany({
            where: { ordenId: { in: ordenIds }, eliminado: false },
            orderBy: { createdAt: 'asc' },
            include: {
              items: {
                where: { eliminado: false },
                orderBy: [{ nombre: 'asc' }, { codigoInterno: 'asc' }],
                include: { talleres: { include: { taller: true }, orderBy: { tallerId: 'asc' } } },
              },
            },
          })
        : [],
      fastify.prisma.cliente.findMany({
        where: { id: { in: [...new Set(ordenes.map(orden => orden.clienteId).filter(Boolean))] } },
        select: { id: true, nombre: true, razonSocial: true, rut: true },
      }),
    ])

    const odtsByOrden = new Map()
    for (const odt of odts) {
      if (!odtsByOrden.has(odt.ordenId)) odtsByOrden.set(odt.ordenId, [])
      odtsByOrden.get(odt.ordenId).push(odt)
    }
    const clientesById = new Map(clientes.map(cliente => [cliente.id, cliente]))

    const rows = []
    for (const orden of ordenes) {
      const ordenOdts = odtsByOrden.get(orden.id) || []
      const row = buildPendienteRow(
        orden,
        orden.clienteId ? clientesById.get(orden.clienteId) || null : null,
        productosMap,
        { odts: ordenOdts, odt: ordenOdts[0] || null },
        byKind,
      )
      if (row) rows.push(row)
    }

    return {
      items: rows.slice(0, limit),
      total: rows.length,
      scanned: ordenes.length,
      truncated: rows.length > limit,
      dias,
      limit,
      talleres: buildTallerOptions(talleres),
    }
  })

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
      items: buildPasarItems(resolved.orden, productosMap, odtState.odts),
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
      items: buildPasarItems(resolved.orden, productosMap, odtState.odts),
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

    // Abrir una segunda OT es deliberado, nunca automatico: se pide explicito
    // desde la pantalla para que nadie duplique el trabajo del taller sin querer.
    const crearNuevaOdt = body.nuevaOdt === true || body.nuevaOdt === 'true'

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
      // Una venta puede acumular varias ODTs, asi que se trabaja sobre la abierta
      // y no sobre la mas antigua. Si todas estan cerradas y la venta sumo items
      // despues, la unica salida es abrir otra: sin eso el producto queda vendido
      // y sin fabricar, que es justo lo que la bandeja de excepciones reporta.
      existingOdt = odtState.odts.find(isOdtWritable) || null
      if (!existingOdt && odtState.odts.length && !crearNuevaOdt) {
        return reply.code(409).send({
          error: 'La OT de esta venta está cerrada o anulada. Abre una nueva OT para enviar estos productos.',
          code: 'ODT_CERRADA',
          odtId: odtState.odts.at(-1)?.id ?? null,
        })
      }
    }

    if (body.ordenId && parsePositiveInt(body.ordenId) !== orden.id) {
      return reply.code(409).send({ error: 'La ODT no pertenece a la orden indicada' })
    }

    // Sin items solo se puede AJUSTAR una OT que ya existe (su prioridad o su
    // observacion). Crear una desde cero sin nada que fabricar dejaba una OT vacia,
    // y la Matriz la cuenta igual: la venta aparecia con trabajo en taller cuando no
    // habia ninguno. Se rechaza al crear, no al actualizar.
    if (!items.length && !existingOdt) {
      return reply.code(400).send({ error: 'Indica al menos un item para abrir la OT' })
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
        // Se relee dentro del lock: entre la validacion y aqui otro usuario pudo
        // cerrar la OT, o haber abierto ya la nueva que este request iba a crear.
        const odtsTx = await tx.odt.findMany({
          where: { ordenId: orden.id, eliminado: false },
          orderBy: { createdAt: 'asc' },
        })
        const abiertaTx = odtsTx.find(isOdtWritable) || null
        let txExistingOdt = null
        if (existingOdt?.id) {
          txExistingOdt = odtsTx.find(item => item.id === existingOdt.id) || null
          if (txExistingOdt && !isOdtWritable(txExistingOdt)) {
            const error = new Error('ODT cerrada o anulada')
            error.statusCode = 409
            throw error
          }
        } else if (abiertaTx) {
          // Aparecio una OT abierta mientras tanto: se usa esa en vez de crear otra.
          txExistingOdt = abiertaTx
        } else if (odtsTx.length && !crearNuevaOdt) {
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
          texto: `Item eliminado desde Excepciones de Taller: ${[item.codigoInterno, item.nombre].filter(Boolean).join(' - ') || `#${item.id}`}`,
        },
      })
    })
    return { ok: true }
  })

  fastify.get('/talleres', {
    preHandler: [fastify.authenticate, requireTalleresCatalogRead],
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
