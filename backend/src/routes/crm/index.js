import {
  CRM_CANALES,
  CRM_ETAPAS,
  CRM_RESULTADOS,
  CRM_TIPOS_VENTA,
  crmCatalogos,
  isCrmFlowComercial,
  normalizeEtapa,
} from '../../domain/crm/constants.js'
import { addSemaforo, createCrmGestion, elapsedDays, transitionCrm } from '../../domain/crm/service.js'
import { canApplyDescuento, requiresDescuentoPermission } from '../ventas/descuentos-permissions.js'
import { validateDescuentoContraReglas } from '../ventas/descuentos-guard.js'

const CRM_ESTADOS = new Set(['0', '1', '2', '3'])

function normalizeEstado(value) {
  if (value === null || value === '') return null
  if (value === undefined) return undefined
  const estado = String(value)
  return CRM_ESTADOS.has(estado) ? estado : undefined
}

// coordinador_comercial es igual a vendedor en todo (backend/src/middleware/rbac.js),
// salvo esta unica ampliacion: ve el CRM de todos los vendedores, igual que admin.
// No gana poder de escritura sobre leads ajenos por esto (ver ensureCrmAccess).
function hasCrmFullVisibility(user) {
  return user?.role === 'admin' || user?.role === 'coordinador_comercial'
}

// Visibilidad por rol: admin y coordinador_comercial ven todos los registros;
// un vendedor (u otro rol) ve SOLO los suyos (vendedorId = su id). Restriccion
// de servidor, no del cliente. Los registros legacy sin vendedorId (null)
// quedan visibles solo para quien tiene visibilidad completa.
function applyScopeByRole(where, user) {
  if (!hasCrmFullVisibility(user)) where.vendedorId = user?.id ?? -1
  return where
}

// Para lectura (detalle, gestiones, orden vinculada): usa la visibilidad ampliada.
async function ensureCrmVisible(prisma, id, user) {
  const where = { id }
  if (!hasCrmFullVisibility(user)) where.vendedorId = user?.id ?? -1
  return prisma.crmRegistro.findFirst({ where, select: { id: true } })
}

// Para escritura (gestiones, transiciones, convertir a cliente): solo admin
// puede actuar sobre leads ajenos. coordinador_comercial queda igual que
// vendedor aqui — visibilidad ampliada no es poder de escritura ampliado.
async function ensureCrmAccess(prisma, id, user) {
  const where = { id }
  if (user?.role !== 'admin') where.vendedorId = user?.id ?? -1
  return prisma.crmRegistro.findFirst({ where, select: { id: true } })
}

function handleDomainError(error, reply) {
  if (!error?.statusCode) throw error
  return reply.code(error.statusCode).send({ error: error.message })
}

function sumarLineas(items, campoPrecio) {
  if (!Array.isArray(items) || !items.length) return null
  return items.reduce((total, item) => {
    const cantidad = Number(item.cantidad)
    const precio = Number(item[campoPrecio])
    return total + (Number.isFinite(cantidad) ? cantidad : 0) * (Number.isFinite(precio) ? precio : 0)
  }, 0)
}

// La cabecera importada de una OC puede contener un total antiguo o incompleto.
// Cuando hay detalle, la fuente de verdad comercial es la suma de sus líneas.
function totalCotizado(ordenCompraOnline) {
  const porLineas = sumarLineas(ordenCompraOnline?.items, 'precio')
  if (porLineas !== null) return porLineas
  const stored = Number(ordenCompraOnline?.total)
  return Number.isFinite(stored) ? stored : 0
}

// Monto de la oportunidad, venga de donde venga.
//
// Una oportunidad tiene una sola fuente segun su origen: la OC online para lo
// importado de la web, la cotizacion de licitacion para lo importado de
// licitaciones, o la cotizacion comercial para lo que nace en el CRM. El tablero
// mostraba monto solo para la primera, asi que las licitaciones y las
// cotizaciones nuevas aparecian en cero.
function montoCotizado(registro) {
  const propia = sumarLineas(registro?.cotizacionComercial?.items, 'precioUnitario')
  if (propia !== null) return propia
  if (registro?.ordenCompraOnline) return totalCotizado(registro.ordenCompraOnline)
  const licitacion = sumarLineas(registro?.cotizacionLicitacion?.items, 'precio')
  if (licitacion !== null) return licitacion
  return 0
}

const ORIGENES_CRM = Object.freeze({
  OC_ONLINE: ['OC_ONLINE_LEGACY'],
  LICITACION: ['LICITACION_LEGACY', 'CRM_LICITACION'],
  COMPRA_AGIL: ['COMPRA_AGIL', 'CRM_COMPRA_AGIL'],
  COTIZACION_SIMPLE: ['CRM_COTIZACION_SIMPLE'],
})

function origenesParaFiltro(value) {
  return ORIGENES_CRM[String(value || '').toUpperCase()] || []
}

function startAndEndOfToday() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

async function selectRoundRobinSeller(tx) {
  const vendedores = await tx.user.findMany({
    where: { activo: true, role: 'vendedor' },
    select: { id: true, nombre: true, email: true },
    orderBy: { id: 'asc' },
  })
  if (!vendedores.length) return null
  const { start, end } = startAndEndOfToday()
  const [counts, recent] = await Promise.all([
    tx.crmAsignacionHistorial.groupBy({
      by: ['vendedorId'],
      where: { vendedorId: { in: vendedores.map(vendedor => vendedor.id) }, createdAt: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    tx.crmAsignacionHistorial.findMany({
      where: { vendedorId: { in: vendedores.map(vendedor => vendedor.id) } },
      select: { vendedorId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  const countMap = new Map(counts.map(row => [row.vendedorId, row._count._all]))
  const recentMap = new Map()
  for (const row of recent) if (!recentMap.has(row.vendedorId)) recentMap.set(row.vendedorId, row.createdAt)
  return vendedores
    .map(vendedor => ({ ...vendedor, asignacionesHoy: countMap.get(vendedor.id) || 0, ultimaAsignacion: recentMap.get(vendedor.id)?.getTime() || 0 }))
    .filter(vendedor => vendedor.asignacionesHoy < 10)
    .sort((a, b) => a.asignacionesHoy - b.asignacionesHoy || a.ultimaAsignacion - b.ultimaAsignacion || a.id - b.id)[0] || null
}

async function assignLead(tx, crmId, { origen, asignadoPorId = null, motivo = null, vendedorAnteriorId = null } = {}) {
  const vendedor = await selectRoundRobinSeller(tx)
  if (!vendedor) return null
  const now = new Date()
  const lead = await tx.crmRegistro.update({
    where: { id: crmId },
    data: { vendedorId: vendedor.id, ejecutiva: vendedor.nombre, asignadoAt: now, asignacionOrigen: origen },
  })
  await tx.crmAsignacionHistorial.create({
    data: { crmId, vendedorId: vendedor.id, vendedorAnteriorId, origen, motivo, asignadoPorId },
  })
  return { lead, vendedor }
}

export default async function crmRoutes(fastify) {
  fastify.register(async function (f) {
    f.get('/catalogos', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async () => crmCatalogos())

    // La ficha comercial se guarda como cotizacion CRM. No crea una Orden ni
    // entra a Matriz de Ventas: esa conversion ocurre al aprobar la oportunidad.
    f.post('/cotizaciones', {
      preHandler: [f.authenticate, f.rbac('ventas', 'write')],
    }, async (request, reply) => {
      const b = request.body || {}
      const tipo = String(b.tipo || '').trim()
      const esCotizacionSimple = String(b.crmQuoteMode || '').toUpperCase() === 'PROSPECCION_DIRECTA'
      const canalVenta = esCotizacionSimple ? 'PROSPECCION_DIRECTA' : tipo === 'Licitación' ? 'LICITACION' : null
      const tipoVenta = esCotizacionSimple ? 'COTIZACION_SIMPLE' : canalVenta === 'LICITACION' ? 'LICITACION' : null
      const clienteId = Number(b.clienteId)
      const crmId = b.crmId === undefined || b.crmId === null || b.crmId === '' ? null : Number(b.crmId)
      const descuentoPct = Number(b.descuentoPct || 0)
      const rawItems = Array.isArray(b.items) ? b.items : []
      if (!canalVenta) return reply.code(400).send({ error: 'Selecciona una cotizacion CRM valida' })
      if (!Number.isInteger(clienteId) || clienteId <= 0) return reply.code(400).send({ error: 'Selecciona un cliente' })
      if (crmId !== null && (!Number.isInteger(crmId) || crmId <= 0)) return reply.code(400).send({ error: 'Registro CRM invalido' })
      if (crmId !== null && !await ensureCrmAccess(f.prisma, crmId, request.user)) return reply.code(404).send({ error: 'Registro CRM no encontrado' })
      if (!rawItems.length) return reply.code(400).send({ error: 'Agrega al menos un producto' })
      if (!Number.isFinite(descuentoPct) || descuentoPct < 0 || descuentoPct > 100) return reply.code(400).send({ error: 'Descuento invalido' })
      if (requiresDescuentoPermission(descuentoPct) && !canApplyDescuento(request.user)) {
        return reply.code(403).send({ error: 'No tiene permiso para aplicar descuentos' })
      }
      if (tipo === 'Licitación' && (!String(b.licitacion || '').trim() || !b.licitacionFecha)) return reply.code(400).send({ error: 'Licitacion requiere ID y fecha' })
      if (!/^\S+@\S+\.\S+$/.test(String(b.emailContactoDespacho || '').trim())) return reply.code(400).send({ error: 'Ingresa el correo del contacto de despacho' })
      const productIds = [...new Set(rawItems.map(item => Number(item.productoId)).filter(Number.isInteger))]
      if (productIds.length !== rawItems.length) return reply.code(400).send({ error: 'Cada item debe corresponder a un producto del catalogo' })

      const result = await f.prisma.$transaction(async tx => {
        const [cliente, productos] = await Promise.all([
          tx.cliente.findUnique({ where: { id: clienteId }, select: { id: true, activo: true, rut: true, nombre: true, email: true, telefono: true } }),
          tx.producto.findMany({ where: { id: { in: productIds } }, select: { id: true, activo: true, codigoInterno: true, nombre: true, descripcion: true } }),
        ])
        if (!cliente) throw Object.assign(new Error('Cliente no encontrado'), { statusCode: 404 })
        if (!cliente.activo) throw Object.assign(new Error('Cliente inactivo no puede cotizar'), { statusCode: 409 })
        if (b.clienteSucursalId) {
          const sucursal = await tx.clienteSucursal.findFirst({
            where: { id: Number(b.clienteSucursalId), clienteId: cliente.id, activo: true },
            select: { id: true },
          })
          if (!sucursal) throw Object.assign(new Error('Sucursal no pertenece al cliente'), { statusCode: 400 })
        }
        if (productos.length !== productIds.length || productos.some(producto => !producto.activo)) throw Object.assign(new Error('Hay productos inexistentes o inactivos'), { statusCode: 400 })
        const byId = new Map(productos.map(producto => [producto.id, producto]))
        const items = rawItems.map((item, index) => {
          const producto = byId.get(Number(item.productoId))
          const cantidad = Number(item.cantidad)
          const precioUnitario = Number(item.precioUnitario)
          if (!Number.isInteger(cantidad) || cantidad < 1 || !Number.isFinite(precioUnitario) || precioUnitario < 0) {
            throw Object.assign(new Error(`Item ${index + 1} tiene cantidad o precio invalido`), { statusCode: 400 })
          }
          return {
            productoId: producto.id,
            codigoInterno: String(item.codigoInterno || producto.codigoInterno || '').trim() || null,
            nombre: String(item.nombre || producto.nombre || '').trim() || null,
            descripcion: String(item.descripcion || producto.descripcion || '').trim() || null,
            cantidad,
            precioUnitario,
          }
        })
        // El descuento se valida recien aca: la guarda necesita los items ya
        // resueltos para saber sobre que base aplicaria la regla.
        const guard = await validateDescuentoContraReglas(tx, {
          tipo: esCotizacionSimple ? 'Venta Web' : tipo,
          descuentoPct,
          clienteId: cliente.id,
          items,
        }, request.user)
        if (guard.error) throw Object.assign(new Error(guard.error), { statusCode: guard.statusCode || 400 })
        const now = new Date()
        const vendedorId = request.user.role === 'admin' && Number.isInteger(Number(b.vendedorId)) ? Number(b.vendedorId) : request.user.id
        const vendedor = await tx.user.findFirst({ where: { id: vendedorId, activo: true }, select: { id: true, nombre: true } })
        if (!vendedor) throw Object.assign(new Error('Vendedor no valido'), { statusCode: 400 })
        let lead
        if (crmId !== null) {
          const actual = await tx.crmRegistro.findUnique({
            where: { id: crmId },
            include: { cotizacionComercial: { select: { id: true } } },
          })
          if (!actual) throw Object.assign(new Error('Registro CRM no encontrado'), { statusCode: 404 })
          if (actual.cotizacionComercial) throw Object.assign(new Error('Este registro CRM ya tiene una cotizacion vinculada'), { statusCode: 409 })
          lead = await tx.crmRegistro.update({
            where: { id: crmId },
            data: {
              nombre: cliente.nombre || actual.nombre || null,
              rsocial: cliente.nombre || actual.rsocial || null,
              rut: cliente.rut || actual.rut || null,
              email: cliente.email || actual.email || null,
              telefono: cliente.telefono || actual.telefono || null,
              prioridad: String(b.prioridad || actual.prioridad || 'Media'),
              accion: String(b.observaciones || '').trim() || actual.accion || 'Cotizacion creada desde CRM',
              comentarios: String(b.observaciones || '').trim() || actual.comentarios || null,
              fechaCotizacion: now,
              etapaComercial: CRM_ETAPAS.COTIZACION_ENVIADA,
              canalVenta,
              tipoVenta,
              origenDato: esCotizacionSimple ? 'CRM_COTIZACION_SIMPLE' : 'CRM_LICITACION',
              estadoCambiadoAt: now,
              ultimaGestionAt: now,
              clienteId: cliente.id,
            },
          })
        } else lead = await tx.crmRegistro.create({
          data: {
            ncotizacion: null,
            nombre: cliente.nombre || null,
            rsocial: cliente.nombre || null,
            rut: cliente.rut || null,
            email: cliente.email || null,
            telefono: cliente.telefono || null,
            prioridad: String(b.prioridad || 'Media'),
            accion: String(b.observaciones || '').trim() || 'Cotizacion creada desde CRM',
            comentarios: String(b.observaciones || '').trim() || null,
            fecha: now,
            fechaCotizacion: now,
            estado: '0',
            etapaComercial: CRM_ETAPAS.COTIZACION_ENVIADA,
            canalVenta,
            tipoVenta,
            origenDato: esCotizacionSimple ? 'CRM_COTIZACION_SIMPLE' : 'CRM_LICITACION',
            estadoCambiadoAt: now,
            ultimaGestionAt: now,
            clienteId: cliente.id,
            vendedorId: vendedor.id,
            ejecutiva: vendedor.nombre,
            asignadoAt: now,
            asignacionOrigen: 'cotizacion_crm',
            usuario: request.user.nombre || request.user.email || null,
          },
        })
        const cotizacion = await tx.crmCotizacion.create({
          data: {
            crmId: lead.id, tipo: esCotizacionSimple ? 'Venta Directa' : tipo, clienteSucursalId: b.clienteSucursalId ? Number(b.clienteSucursalId) : null, vendedorId: vendedor.id,
            licitacion: String(b.licitacion || '').trim() || null,
            licitacionFecha: b.licitacionFecha ? new Date(b.licitacionFecha) : null,
            licitacionPlazo: String(b.licitacionPlazo || '').trim() || null,
            licitacionReferencia: String(b.licitacionReferencia || '').trim() || null,
            licitacionOC: String(b.licitacionOC || '').trim() || null,
            observaciones: String(b.observaciones || '').trim() || null,
            descuentoPct,
            enviosParciales: !!b.enviosParciales, montoDespacho: Number(b.montoDespacho) || 0,
            fechaPlazo: b.fechaPlazo ? new Date(b.fechaPlazo) : null,
            plazoEntregaDias: b.plazoEntregaDias === '' || b.plazoEntregaDias == null ? null : Number(b.plazoEntregaDias),
            plazoEntregaTipo: String(b.plazoEntregaTipo || '').trim() || null,
            direccionDespacho: String(b.direccionDespacho || '').trim() || null,
            direccionDespachoExtra: String(b.direccionDespachoExtra || '').trim() || null,
            contactoDespacho: String(b.contactoDespacho || '').trim() || null,
            telefonoContactoDespacho: String(b.telefonoContactoDespacho || '').trim() || null,
            emailContactoDespacho: String(b.emailContactoDespacho || '').trim() || null,
            regionDespacho: String(b.regionDespacho || '').trim() || null,
            comunaDespacho: String(b.comunaDespacho || '').trim() || null,
            items: { create: items },
          }, include: { items: true },
        })
        await tx.crmRegistro.update({ where: { id: lead.id }, data: { ncotizacion: `CRM-${lead.id}` } })
        if (crmId === null) await tx.crmAsignacionHistorial.create({ data: { crmId: lead.id, vendedorId: vendedor.id, origen: 'cotizacion_crm', asignadoPorId: Number(request.user.id) || null } })
        return { lead: { ...lead, ncotizacion: `CRM-${lead.id}` }, cotizacion }
      })
      return reply.code(201).send(result)
    })

    // La cotización que nace en CRM se edita siempre desde su oportunidad; no
    // se crea una segunda licitación ni una orden de venta al guardar.
    f.put('/:id/cotizacion', {
      preHandler: [f.authenticate, f.rbac('ventas', 'write')],
    }, async (request, reply) => {
      const crmId = parseInt(request.params.id, 10)
      if (!Number.isInteger(crmId) || crmId <= 0) return reply.code(400).send({ error: 'ID CRM invalido' })
      if (!await ensureCrmAccess(f.prisma, crmId, request.user)) return reply.code(404).send({ error: 'Registro CRM no encontrado' })
      const rawItems = Array.isArray(request.body?.items) ? request.body.items : null
      if (!rawItems?.length) return reply.code(400).send({ error: 'La cotizacion debe tener al menos un producto' })
      const productIds = [...new Set(rawItems.map(item => Number(item.productoId)).filter(Number.isInteger))]
      if (productIds.length !== rawItems.length) return reply.code(400).send({ error: 'Cada item debe corresponder a un producto del catalogo' })
      try {
        const cotizacion = await f.prisma.$transaction(async tx => {
          const actual = await tx.crmCotizacion.findUnique({ where: { crmId }, select: { id: true } })
          if (!actual) throw Object.assign(new Error('El registro CRM no tiene una cotizacion propia'), { statusCode: 409 })
          const productos = await tx.producto.findMany({
            where: { id: { in: productIds }, activo: true },
            select: { id: true, codigoInterno: true, nombre: true, descripcion: true },
          })
          if (productos.length !== productIds.length) throw Object.assign(new Error('Hay productos inexistentes o inactivos'), { statusCode: 400 })
          const byId = new Map(productos.map(producto => [producto.id, producto]))
          const items = rawItems.map((item, index) => {
            const producto = byId.get(Number(item.productoId))
            const cantidad = Number(item.cantidad)
            const precioUnitario = Number(item.precioUnitario)
            if (!Number.isInteger(cantidad) || cantidad < 1 || !Number.isFinite(precioUnitario) || precioUnitario < 0) {
              throw Object.assign(new Error(`Item ${index + 1} tiene cantidad o precio invalido`), { statusCode: 400 })
            }
            // CU-03: adjudicacion parcial. Se distingue "no registrada" (null,
            // se vende lo cotizado) de "no me adjudicaron nada" (0, no pasa a la
            // venta); con el 0 por defecto del legacy no se pueden separar.
            let cantAdjudicados = null
            if (item.cantAdjudicados !== undefined && item.cantAdjudicados !== null && item.cantAdjudicados !== '') {
              cantAdjudicados = Number(item.cantAdjudicados)
              if (!Number.isInteger(cantAdjudicados) || cantAdjudicados < 0) {
                throw Object.assign(new Error(`Item ${index + 1}: la cantidad adjudicada debe ser un entero no negativo`), { statusCode: 400 })
              }
              if (cantAdjudicados > cantidad) {
                throw Object.assign(new Error(`Item ${index + 1}: no se puede adjudicar ${cantAdjudicados} si se cotizaron ${cantidad}`), { statusCode: 400 })
              }
            }
            return {
              productoId: producto.id,
              codigoInterno: String(item.codigoInterno || producto.codigoInterno || '').trim() || null,
              nombre: String(item.nombre || producto.nombre || '').trim() || null,
              descripcion: String(item.descripcion || producto.descripcion || '').trim() || null,
              cantidad,
              cantAdjudicados,
              precioUnitario,
            }
          })
          const patch = {}
          for (const field of ['licitacion', 'licitacionPlazo', 'licitacionReferencia', 'licitacionOC', 'observaciones', 'direccionDespacho', 'direccionDespachoExtra', 'contactoDespacho', 'telefonoContactoDespacho', 'emailContactoDespacho', 'regionDespacho', 'comunaDespacho']) {
            if (request.body?.[field] !== undefined) patch[field] = String(request.body[field] || '').trim() || null
          }
          if (request.body?.licitacionFecha !== undefined) patch.licitacionFecha = request.body.licitacionFecha ? new Date(request.body.licitacionFecha) : null
          if (request.body?.fechaPlazo !== undefined) patch.fechaPlazo = request.body.fechaPlazo ? new Date(request.body.fechaPlazo) : null
          if (request.body?.enviosParciales !== undefined) patch.enviosParciales = Boolean(request.body.enviosParciales)
          if (request.body?.montoDespacho !== undefined) patch.montoDespacho = Number(request.body.montoDespacho) || 0
          await tx.crmCotizacionItem.deleteMany({ where: { cotizacionId: actual.id } })
          return tx.crmCotizacion.update({ where: { id: actual.id }, data: { ...patch, items: { create: items } }, include: { items: true } })
        })
        return cotizacion
      } catch (error) {
        if (error.statusCode) return reply.code(error.statusCode).send({ error: error.message })
        throw error
      }
    })

    // GET /api/crm?ejecutiva=...&estado=...&prioridad=...&search=...&page=1
    f.get('/', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const { ejecutiva, vendedorId, estado, etapa, resultadoCierre, canalVenta, tipoVenta, origen, semaforo, prioridad, search, page = '1', fechaDesde, fechaHasta, historico } = request.query
      const LIMIT = 500
      const offset = (parseInt(page) - 1) * LIMIT

      const where = applyScopeByRole({}, request.user)
      if (vendedorId) where.vendedorId = Number(vendedorId)
      else if (ejecutiva) where.ejecutiva = { equals: String(ejecutiva).trim(), mode: 'insensitive' }
      if (prioridad) where.prioridad = prioridad
      if (etapa) where.etapaComercial = String(etapa).toUpperCase()
      if (resultadoCierre) where.resultadoCierre = String(resultadoCierre).toUpperCase()
      if (canalVenta) where.canalVenta = String(canalVenta).toUpperCase()
      if (tipoVenta) where.tipoVenta = String(tipoVenta).toUpperCase()
      if (origen) {
        const origenes = origenesParaFiltro(origen)
        if (origenes.length) where.origenDato = { in: origenes }
      }
      if (historico === '1') where.esHistorico = true
      if (historico === '0') where.esHistorico = false
      if (estado !== undefined && estado !== '') {
        const normalizedEstado = normalizeEstado(estado)
        if (normalizedEstado !== undefined) where.estado = normalizedEstado
      }
      if (fechaDesde || fechaHasta) {
        where.fecha = {}
        if (fechaDesde) where.fecha.gte = new Date(fechaDesde)
        if (fechaHasta) where.fecha.lte = new Date(fechaHasta + 'T23:59:59')
      }
      if (search) {
        where.OR = [
          { nombre: { contains: search, mode: 'insensitive' } },
          { rsocial: { contains: search, mode: 'insensitive' } },
          { rut: { contains: search, mode: 'insensitive' } },
          { comentarios: { contains: search, mode: 'insensitive' } },
        ]
      }

      const [items, total] = await Promise.all([
        f.prisma.crmRegistro.findMany({
          where,
          orderBy: { fecha: 'desc' },
          skip: offset,
          take: LIMIT,
          include: {
            ordenCompraOnline: {
              select: {
                id: true, nCompra: true, total: true, estadoCompra: true,
                items: { select: { cantidad: true, precio: true } },
              },
            },
            cotizacionLicitacion: {
              select: {
                id: true, idLicitacion: true, estado: true,
                items: { select: { cantidad: true, precio: true } },
              },
            },
            cotizacionComercial: {
              select: {
                id: true, tipo: true, licitacion: true,
                items: { select: { cantidad: true, precioUnitario: true } },
              },
            },
          },
        }),
        f.prisma.crmRegistro.count({ where }),
      ])

      const enriched = addSemaforo(items).map(item => {
        // El monto se resuelve aca, del lado del servidor, para que la tarjeta no
        // tenga que saber de que origen viene cada oportunidad.
        const monto = montoCotizado(item)
        if (!item.ordenCompraOnline) return { ...item, montoCotizado: monto }
        const { items: ocItems, ...ordenCompraOnline } = item.ordenCompraOnline
        return {
          ...item,
          montoCotizado: monto,
          ordenCompraOnline: { ...ordenCompraOnline, totalCalculado: totalCotizado({ ...ordenCompraOnline, items: ocItems }) },
        }
      })
      const filtered = semaforo ? enriched.filter(item => item.semaforo === String(semaforo).toUpperCase()) : enriched
      return { items: filtered, total: semaforo ? filtered.length : total, limit: LIMIT }
    })

    f.post('/', {
      preHandler: [f.authenticate, f.rbac('ventas', 'write')],
    }, async (request, reply) => {
      const b = request.body || {}
      const nombre = String(b.nombre || '').trim()
      const rsocial = String(b.rsocial || '').trim()
      const email = String(b.email || '').trim()
      const telefono = String(b.telefono || '').trim()
      if (!nombre && !rsocial) return reply.code(400).send({ error: 'Indica nombre o razon social' })
      if (!email && !telefono) return reply.code(400).send({ error: 'Indica correo o telefono de contacto' })
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return reply.code(400).send({ error: 'Correo invalido' })

      const result = await f.prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('crm-round-robin')::bigint)`
        const vendedor = await selectRoundRobinSeller(tx)
        if (!vendedor) return { status: 409, error: 'No hay vendedores disponibles: todos alcanzaron el maximo de 10 leads diarios o no existen vendedores activos' }
        const now = new Date()
        const canalVenta = String(b.canalVenta || 'WEB').trim().toUpperCase()
        const tipoVenta = String(b.tipoVenta || 'VENTA_WEB').trim().toUpperCase()
        if (!CRM_CANALES.includes(canalVenta)) return { status: 400, error: 'Canal de venta invalido' }
        if (!CRM_TIPOS_VENTA.includes(tipoVenta)) return { status: 400, error: 'Tipo de venta invalido' }
        if (!isCrmFlowComercial(canalVenta, tipoVenta)) return { status: 400, error: 'Canal y tipo de venta no corresponden al mismo flujo comercial' }
        const etapaComercial = b.etapaComercial
          ? normalizeEtapa(b.etapaComercial)
          : (String(b.ncotizacion || '').trim() ? CRM_ETAPAS.COTIZACION_ENVIADA : CRM_ETAPAS.PENDIENTE_CLASIFICACION)
        const lead = await tx.crmRegistro.create({
          data: {
            nombre: nombre || null,
            rsocial: rsocial || null,
            rut: String(b.rut || '').trim() || null,
            email: email || null,
            telefono: telefono || null,
            accion: String(b.accion || '').trim() || 'Nuevo contacto',
            comentarios: String(b.comentarios || '').trim() || null,
            prioridad: String(b.prioridad || '').trim() || 'Media',
            estado: '0',
            etapaComercial,
            canalVenta,
            tipoVenta,
            estadoCambiadoAt: now,
            ultimaGestionAt: now,
            fecha: new Date(),
            usuario: request.user?.nombre || request.user?.email || null,
            vendedorId: vendedor.id,
            ejecutiva: vendedor.nombre,
            asignadoAt: now,
            asignacionOrigen: String(b.origen || 'ingreso_manual').trim(),
          },
        })
        await tx.crmAsignacionHistorial.create({
          data: { crmId: lead.id, vendedorId: vendedor.id, origen: String(b.origen || 'ingreso_manual').trim(), asignadoPorId: Number(request.user?.id) || null },
        })
        return { lead, vendedor }
      })
      if (result?.error) return reply.code(result.status || 400).send({ error: result.error })
      return reply.code(201).send(result)
    })

    f.post('/asignar-pendientes', {
      preHandler: [f.authenticate, f.rbac('admin', 'write', { allowExtra: false })],
    }, async (request) => {
      return f.prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('crm-round-robin')::bigint)`
        const pendientes = await tx.crmRegistro.findMany({ where: { vendedorId: null, estado: { not: '3' } }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 500 })
        const asignados = []
        for (const pendiente of pendientes) {
          const assigned = await assignLead(tx, pendiente.id, { origen: 'regularizacion_automatica', asignadoPorId: Number(request.user?.id) || null })
          if (!assigned) break
          asignados.push({ crmId: pendiente.id, vendedorId: assigned.vendedor.id, ejecutiva: assigned.vendedor.nombre })
        }
        return { asignados, total: asignados.length, pendientesSinAsignar: pendientes.length - asignados.length }
      })
    })

    // GET /api/crm/pendientes-hoy — vendedor pending tasks
    f.get('/pendientes-hoy', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const { start, end } = startAndEndOfToday()

      // Visibilidad por rol: admin ve todo; vendedor solo sus leads (vendedorId).
      const where = applyScopeByRole({
        estado: { not: '3' },
        fechaProximo: { lt: end }
      }, request.user)

      // La agenda es un resumen: evita enviar/renderizar miles de registros legacy.
      const [pendingLeads, vencidasTotal, hoyTotal, sinAsignarTotal] = await Promise.all([
        f.prisma.crmRegistro.findMany({
          where,
          orderBy: { fechaProximo: 'asc' },
          take: 10,
        }),
        f.prisma.crmRegistro.count({ where: { ...where, fechaProximo: { lt: start } } }),
        f.prisma.crmRegistro.count({ where: { ...where, fechaProximo: { gte: start, lt: end } } }),
        hasCrmFullVisibility(request.user)
          ? f.prisma.crmRegistro.count({ where: { ...where, vendedorId: null } })
          : Promise.resolve(0),
      ])

      const hoy = []
      const vencidas = []

      for (const lead of pendingLeads) {
        if (lead.fechaProximo && new Date(lead.fechaProximo) < start) {
          vencidas.push(lead)
        } else {
          hoy.push(lead)
        }
      }

      return {
        hoy,
        vencidas,
        resumen: {
          total: vencidasTotal + hoyTotal,
          vencidas: vencidasTotal,
          hoy: hoyTotal,
          sinAsignar: sinAsignarTotal,
        },
      }
    })

    // GET /api/crm/metricas — conversion KPIs
    f.get('/metricas', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const { fechaDesde, fechaHasta, historico } = request.query

      // Visibilidad por rol: admin ve todo; vendedor solo sus métricas.
      const where = applyScopeByRole({}, request.user)
      if (historico === '1') where.esHistorico = true
      if (historico === '0') where.esHistorico = false
      if (fechaDesde || fechaHasta) {
        where.fecha = {}
        if (fechaDesde) where.fecha.gte = new Date(fechaDesde)
        if (fechaHasta) where.fecha.lte = new Date(fechaHasta + 'T23:59:59')
      }

      const countByEstado = await f.prisma.crmRegistro.groupBy({
        by: ['estado'],
        _count: { _all: true },
        where
      })

      const porEstado = { '0': 0, '1': 0, '2': 0, '3': 0 }
      let total = 0
      for (const group of countByEstado) {
        const est = group.estado || '0'
        if (est in porEstado) {
          porEstado[est] = group._count._all
        }
        total += group._count._all
      }

      // Compatibilidad legacy: porEstado se conserva, pero no representa éxito comercial.

      const allLeads = await f.prisma.crmRegistro.findMany({
        where,
        select: { ejecutiva: true, estado: true, etapaComercial: true, resultadoCierre: true, prioridad: true }
      })

      const porEtapa = Object.fromEntries(Object.values(CRM_ETAPAS).map(etapa => [etapa, 0]))
      const porResultado = { GANADO: 0, PERDIDO: 0, SIN_CLASIFICAR: 0 }
      const ejecutivasMap = {}
      for (const lead of allLeads) {
        const etapa = normalizeEtapa(lead.etapaComercial, lead.estado)
        porEtapa[etapa] = (porEtapa[etapa] || 0) + 1
        const resultado = lead.resultadoCierre in porResultado
          ? lead.resultadoCierre
          : (etapa === CRM_ETAPAS.CERRADO ? CRM_RESULTADOS.SIN_CLASIFICAR : null)
        if (resultado) porResultado[resultado]++
        const exec = lead.ejecutiva || 'Sin Asignar'
        if (!ejecutivasMap[exec]) {
          ejecutivasMap[exec] = { total: 0, ganados: 0, perdidos: 0, sinClasificar: 0 }
        }
        ejecutivasMap[exec].total++
        if (resultado === CRM_RESULTADOS.GANADO) ejecutivasMap[exec].ganados++
        if (resultado === CRM_RESULTADOS.PERDIDO) ejecutivasMap[exec].perdidos++
        if (resultado === CRM_RESULTADOS.SIN_CLASIFICAR) ejecutivasMap[exec].sinClasificar++
      }

      const prioridadAlta = allLeads.filter(lead => String(lead.prioridad || '').toLowerCase() === 'alta').length

      const cierresClasificados = porResultado.GANADO + porResultado.PERDIDO
      const tasaCierre = cierresClasificados > 0 ? (porResultado.GANADO / cierresClasificados) * 100 : 0
      const porEjecutiva = Object.entries(ejecutivasMap).map(([ejecutiva, stats]) => ({
        ejecutiva,
        total: stats.total,
        ...stats,
        cerrados: stats.ganados + stats.perdidos + stats.sinClasificar,
        tasaCierre: stats.ganados + stats.perdidos > 0 ? (stats.ganados / (stats.ganados + stats.perdidos)) * 100 : 0
      })).sort((a, b) => b.total - a.total)

      const activeLeads = await f.prisma.crmRegistro.findMany({
        where: {
          ...where,
          estado: { not: '3' },
          esHistorico: false,
        },
        select: { createdAt: true }
      })

      let totalDays = 0
      const nowMs = Date.now()
      for (const lead of activeLeads) {
        const createdMs = new Date(lead.createdAt).getTime()
        const diffMs = nowMs - createdMs
        const diffDays = diffMs / (1000 * 60 * 60 * 24)
        totalDays += Math.max(0, diffDays)
      }

      const tiempoPromedioEnPipeline = activeLeads.length > 0
        ? totalDays / activeLeads.length
        : 0

      return {
        porEstado,
        porEtapa,
        porResultado,
        tasaCierre,
        prioridadAlta,
        porEjecutiva,
        total: allLeads.length,
        tiempoPromedioEnPipeline // // POR CONFIRMAR: validez de la métrica basada en createdAt
      }
    })

    f.get('/:id', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID CRM invalido' })
      if (!await ensureCrmVisible(f.prisma, id, request.user)) return reply.code(404).send({ error: 'Registro CRM no encontrado' })
      const item = await f.prisma.crmRegistro.findUnique({
        where: { id },
        include: {
          cliente: { select: { id: true, rut: true, nombre: true } },
          orden: { select: { id: true, nInterno: true, tipo: true, estado: true, estadoPago: true, estadoEntrega: true, facturado: true } },
          cotizacionComercial: { include: { items: true } },
          cotizacionLicitacion: {
            select: {
              id: true, idLicitacion: true, fecha: true, estado: true, usuario: true,
              rutCliente: true, obs: true, plazo: true, ordenCompra: true, ordenId: true,
              items: { select: { id: true, codigoInterno: true, nombre: true, descripcion: true, cantidad: true, precio: true } },
            },
          },
          ordenCompraOnline: {
            select: {
              id: true, nCompra: true, fechaHora: true, fechaCotizacion: true,
              total: true, estadoCompra: true, tipoDocumento: true, canal: true,
              codigoVendedor: true, obsCliente: true,
              items: { select: { id: true, codigoInterno: true, nombre: true, descripcion: true, cantidad: true, precio: true } },
            },
          },
          gestiones: { orderBy: { realizadaAt: 'desc' }, take: 100 },
          estadosHistorial: { orderBy: { createdAt: 'desc' }, take: 100 },
        },
      })
      const ocItems = item?.ordenCompraOnline?.items || []
      const licitacionItems = item?.cotizacionLicitacion?.items || []
      const codes = [...new Set([...ocItems, ...licitacionItems].map(row => String(row.codigoInterno || '').trim()).filter(Boolean))]
      const products = codes.length
        ? await f.prisma.producto.findMany({ where: { codigoInterno: { in: codes } }, select: { codigoInterno: true, fotoUrl: true } })
        : []
      const productByCode = new Map(products.map(product => [product.codigoInterno, product]))
      const ordenCompraOnline = item?.ordenCompraOnline
        ? { ...item.ordenCompraOnline, totalCalculado: totalCotizado(item.ordenCompraOnline), items: ocItems.map(row => ({ ...row, producto: productByCode.get(row.codigoInterno) || null })) }
        : null
      const cotizacionLicitacion = item?.cotizacionLicitacion
        ? { ...item.cotizacionLicitacion, items: licitacionItems.map(row => ({ ...row, producto: productByCode.get(row.codigoInterno) || null })) }
        : null
      return { ...item, ...addSemaforo([item])[0], montoCotizado: montoCotizado(item), ordenCompraOnline, cotizacionLicitacion }
    })

    // PATCH /api/crm/:id
    f.patch('/:id', {
      preHandler: [f.authenticate, f.rbac('ventas', 'write')],
    }, async (request, reply) => {
      const { id } = request.params
      const b = request.body
      const isAdmin = request.user?.role === 'admin'

      // Seguridad: un no-admin solo puede editar SUS registros (scope por vendedorId).
      // Esto evita que un vendedor modifique leads de otro vía el PATCH.
      if (!isAdmin) {
        const owned = await f.prisma.crmRegistro.findFirst({
          where: { id: parseInt(id), vendedorId: request.user.id },
          select: { id: true },
        })
        if (!owned) return reply.status(403).send({ error: 'No tienes acceso a este registro CRM' })
      }

      const data = {}
      let existing = null
      if (b.canalVenta !== undefined || b.tipoVenta !== undefined) {
        existing = await f.prisma.crmRegistro.findUnique({
          where: { id: parseInt(id) },
          select: { id: true, canalVenta: true, tipoVenta: true, vendedorId: true },
        })
        if (!existing) return reply.status(404).send({ error: 'Registro CRM no encontrado' })
      }
      // Asignación de vendedor: solo el admin puede asignar/reasignar el dueño.
      if (isAdmin && b.vendedorId !== undefined) {
        existing = existing || await f.prisma.crmRegistro.findUnique({ where: { id: parseInt(id) } })
        if (!existing) return reply.status(404).send({ error: 'Registro CRM no encontrado' })
        data.vendedorId = b.vendedorId === null || b.vendedorId === '' ? null : parseInt(b.vendedorId, 10)
        data.asignadoAt = new Date()
        data.asignacionOrigen = 'reasignacion_manual'
        if (data.vendedorId) {
          const vendedor = await f.prisma.user.findFirst({ where: { id: data.vendedorId, activo: true, role: 'vendedor' }, select: { id: true, nombre: true } })
          if (!vendedor) return reply.status(400).send({ error: 'Vendedor no valido o inactivo' })
          data.ejecutiva = vendedor.nombre
        } else {
          data.ejecutiva = null
        }
      }
      if (b.estado !== undefined) {
        const normalizedEstado = normalizeEstado(b.estado)
        if (normalizedEstado === undefined) return reply.status(400).send({ error: 'Estado CRM invalido' })
        data.estado = normalizedEstado
      }
      if (b.prioridad !== undefined) data.prioridad = b.prioridad || null
      if (b.canalVenta !== undefined) {
        const value = String(b.canalVenta || '').toUpperCase()
        if (value && !CRM_CANALES.includes(value) && value !== existing?.canalVenta) return reply.status(400).send({ error: 'Canal de venta invalido para nuevas oportunidades' })
        data.canalVenta = value || null
      }
      if (b.tipoVenta !== undefined) {
        const value = String(b.tipoVenta || '').toUpperCase()
        if (value && !CRM_TIPOS_VENTA.includes(value) && value !== existing?.tipoVenta) return reply.status(400).send({ error: 'Tipo de venta invalido para nuevas oportunidades' })
        data.tipoVenta = value || null
      }
      if (b.subestadoEspera !== undefined) data.subestadoEspera = b.subestadoEspera || null
      if (b.comentarios !== undefined) data.comentarios = b.comentarios || null
      if (b.fechaProximo !== undefined) data.fechaProximo = b.fechaProximo ? new Date(b.fechaProximo) : null
      if (b.ejecutiva !== undefined && !(isAdmin && b.vendedorId !== undefined)) data.ejecutiva = b.ejecutiva || null
      if (b.nombre !== undefined) data.nombre = b.nombre || null
      if (b.rsocial !== undefined) data.rsocial = b.rsocial || null
      if (b.email !== undefined) data.email = b.email || null
      if (b.telefono !== undefined) data.telefono = b.telefono || null
      if (b.ncotizacion !== undefined) data.ncotizacion = b.ncotizacion || null
      if (b.accion !== undefined) data.accion = b.accion || null
      if (b.resultado !== undefined) data.resultado = b.resultado || null
      if (b.fechaCotizacion !== undefined) data.fechaCotizacion = b.fechaCotizacion ? new Date(b.fechaCotizacion) : null

      if (Object.keys(data).length === 0) return reply.status(400).send({ error: 'Nothing to update' })
      const reassigned = isAdmin && b.vendedorId !== undefined && existing.vendedorId !== data.vendedorId
      if (reassigned && String(b.motivoReasignacion || '').trim().length < 5) {
        return reply.status(400).send({ error: 'Indica el motivo de la reasignacion' })
      }
      if (!reassigned) return f.prisma.crmRegistro.update({ where: { id: parseInt(id) }, data })
      const updated = await f.prisma.$transaction(async tx => {
        const saved = await tx.crmRegistro.update({ where: { id: parseInt(id) }, data })
        await tx.crmAsignacionHistorial.create({ data: { crmId: saved.id, vendedorId: data.vendedorId, vendedorAnteriorId: existing.vendedorId, origen: 'reasignacion_manual', motivo: String(b.motivoReasignacion || '').trim(), asignadoPorId: Number(request.user?.id) || null } })
        return saved
      })
      return updated
    })

    f.get('/:id/gestiones', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (!await ensureCrmVisible(f.prisma, id, request.user)) return reply.code(404).send({ error: 'Registro CRM no encontrado' })
      return f.prisma.crmGestion.findMany({ where: { crmId: id }, orderBy: { realizadaAt: 'desc' }, take: 200 })
    })

    f.post('/:id/gestiones', {
      preHandler: [f.authenticate, f.rbac('ventas', 'write')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (!await ensureCrmAccess(f.prisma, id, request.user)) return reply.code(404).send({ error: 'Registro CRM no encontrado' })
      try {
        return reply.code(201).send(await createCrmGestion(f.prisma, id, request.body || {}, request.user))
      } catch (error) {
        return handleDomainError(error, reply)
      }
    })

    f.post('/:id/transiciones', {
      preHandler: [f.authenticate, f.rbac('ventas', 'write')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (!await ensureCrmAccess(f.prisma, id, request.user)) return reply.code(404).send({ error: 'Registro CRM no encontrado' })
      try {
        return await transitionCrm(f.prisma, id, request.body || {}, request.user, { isAdmin: request.user?.role === 'admin' })
      } catch (error) {
        return handleDomainError(error, reply)
      }
    })

    // POST /api/crm/:id/convertir-cliente — Convert CRM lead to Customer
    f.post('/:id/convertir-cliente', {
      preHandler: [f.authenticate, f.rbac('clientes', 'write')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id)
      if (isNaN(id)) return reply.code(400).send({ error: 'ID de lead inválido' })
      if (!await ensureCrmAccess(f.prisma, id, request.user)) return reply.code(404).send({ error: 'Lead no encontrado' })

      const crm = await f.prisma.crmRegistro.findUnique({ where: { id } })
      if (!crm) return reply.code(404).send({ error: 'Lead no encontrado' })

      const cleanRut = String(crm.rut || '').trim()
      if (!cleanRut) {
        return reply.code(400).send({ error: 'El lead no tiene RUT, no se puede crear cliente' })
      }

      const existing = await f.prisma.cliente.findFirst({
        where: { rut: { equals: cleanRut, mode: 'insensitive' } }
      })

      if (existing) {
        await f.prisma.crmRegistro.update({ where: { id }, data: { clienteId: existing.id } })
        return { clienteId: existing.id, creado: false }
      }

      const clientName = String(crm.rsocial || crm.nombre || '').trim()
      if (!clientName) {
        return reply.code(400).send({ error: 'El lead no tiene Nombre ni Razón Social' })
      }

      const created = await f.prisma.cliente.create({
        data: {
          rut: cleanRut,
          nombre: clientName,
          email: crm.email ? String(crm.email).trim() : null,
          telefono: crm.telefono ? String(crm.telefono).trim() : null,
          activo: true
        }
      })

      await f.prisma.crmRegistro.update({ where: { id }, data: { clienteId: created.id } })

      return reply.code(201).send({ clienteId: created.id, creado: true })
    })

    // GET /api/crm/:id/orden — la orden ya vinculada (ordenId), o buscar por
    // coincidencia de folio (nInterno = ncotizacion) si aun no hay vinculo.
    const ORDEN_SELECT = { id: true, nInterno: true, tipo: true, estado: true, estadoPago: true, estadoEntrega: true, createdAt: true, clienteId: true }
    f.get('/:id/orden', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const id = parseInt(request.params.id)
      if (!await ensureCrmVisible(f.prisma, id, request.user)) return { orden: null }
      const c = await f.prisma.crmRegistro.findUnique({ where: { id }, select: { ncotizacion: true, ordenId: true } })
      if (!c) return { orden: null }
      if (c.ordenId) {
        const linked = await f.prisma.orden.findUnique({ where: { id: c.ordenId }, select: ORDEN_SELECT })
        if (linked) return { orden: linked }
      }
      const raw = String(c.ncotizacion || '').trim()
      if (!/^\d{1,9}$/.test(raw)) return { orden: null }
      const ni = parseInt(raw, 10)
      const orden = await f.prisma.orden.findFirst({ where: { nInterno: ni }, select: ORDEN_SELECT })
      if (orden) await f.prisma.crmRegistro.update({ where: { id }, data: { ordenId: orden.id, clienteId: orden.clienteId || undefined } })
      return { orden }
    })

    // GET /api/crm/ejecutivas — unique list (unified with active users)
    f.get('/ejecutivas', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const query = request.query || {}
      const where = applyScopeByRole({ ejecutiva: { not: null } }, request.user)
      if (query.historico === '1') where.esHistorico = true
      if (query.historico === '0') where.esHistorico = false
      if (query.prioridad) where.prioridad = query.prioridad
      if (query.canalVenta) where.canalVenta = String(query.canalVenta).toUpperCase()
      if (query.tipoVenta) where.tipoVenta = String(query.tipoVenta).toUpperCase()
      if (query.origen) {
        const origenes = origenesParaFiltro(query.origen)
        if (origenes.length) where.origenDato = { in: origenes }
      }
      if (query.fechaDesde || query.fechaHasta) {
        where.fecha = {}
        if (query.fechaDesde) where.fecha.gte = new Date(query.fechaDesde)
        if (query.fechaHasta) where.fecha.lte = new Date(`${query.fechaHasta}T23:59:59`)
      }
      if (query.search) {
        where.OR = [
          { nombre: { contains: query.search, mode: 'insensitive' } },
          { rsocial: { contains: query.search, mode: 'insensitive' } },
          { rut: { contains: query.search, mode: 'insensitive' } },
          { comentarios: { contains: query.search, mode: 'insensitive' } },
        ]
      }
      const crmRows = await f.prisma.crmRegistro.findMany({
        where,
        select: {
          ejecutiva: true, vendedorId: true, esHistorico: true, etapaComercial: true,
          estado: true, ultimaGestionAt: true, fechaCotizacion: true, fecha: true, createdAt: true,
        },
      })
      const rows = query.semaforo
        ? addSemaforo(crmRows).filter(row => row.semaforo === String(query.semaforo).toUpperCase())
        : crmRows

      // Agrupa por vendedorId (fuente de verdad) para no duplicar al mismo
      // vendedor cuando el texto legacy `ejecutiva` tiene variantes (login vs
      // nombre completo, mayusculas, etc). Filas sin vendedorId se agrupan
      // por el texto crudo como fallback.
      const totalsByVendedorId = new Map()
      const totalsByName = new Map() // key -> { label, total }
      for (const row of rows) {
        if (row.vendedorId) {
          totalsByVendedorId.set(row.vendedorId, (totalsByVendedorId.get(row.vendedorId) || 0) + 1)
          continue
        }
        const name = String(row.ejecutiva || '').trim()
        if (!name) continue
        const key = name.toLocaleLowerCase('es-CL')
        const entry = totalsByName.get(key) || { label: name, total: 0 }
        entry.total += 1
        totalsByName.set(key, entry)
      }

      const users = await f.prisma.user.findMany({
        where: {
          activo: true,
          role: { in: ['admin', 'vendedor'] }
        },
        select: { id: true, nombre: true }
      })

      const result = []
      for (const u of users) {
        if (!u.nombre || !u.nombre.trim()) continue
        result.push({ ejecutiva: u.nombre.trim(), vendedorId: u.id, source: 'user', total: totalsByVendedorId.get(u.id) || 0 })
      }

      // Fallback: registros sin vendedorId asignado (texto legacy huerfano)
      for (const { label, total } of totalsByName.values()) {
        result.push({ ejecutiva: label, vendedorId: null, source: 'crm', total })
      }

      result.sort((a, b) => b.total - a.total)
      return result
    })
  })
}
