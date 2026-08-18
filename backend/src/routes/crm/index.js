import {
  CRM_CANALES,
  CRM_ETAPAS,
  CRM_RESULTADOS,
  CRM_TIPOS_VENTA,
  crmCatalogos,
  normalizeEtapa,
} from '../../domain/crm/constants.js'
import { addSemaforo, createCrmGestion, elapsedDays, transitionCrm } from '../../domain/crm/service.js'

const CRM_ESTADOS = new Set(['0', '1', '2', '3'])

function normalizeEstado(value) {
  if (value === null || value === '') return null
  if (value === undefined) return undefined
  const estado = String(value)
  return CRM_ESTADOS.has(estado) ? estado : undefined
}

// Visibilidad por rol: el admin ve todos los registros; un vendedor (u otro rol)
// ve SOLO los suyos (vendedorId = su id). Restricción de servidor, no del cliente.
// Los registros legacy sin vendedorId (null) quedan visibles solo para admin.
function applyScopeByRole(where, user) {
  if (user?.role !== 'admin') where.vendedorId = user?.id ?? -1
  return where
}

async function ensureCrmAccess(prisma, id, user) {
  const where = { id }
  if (user?.role !== 'admin') where.vendedorId = user?.id ?? -1
  return prisma.crmRegistro.findFirst({ where, select: { id: true } })
}

function handleDomainError(error, reply) {
  if (!error?.statusCode) throw error
  return reply.code(error.statusCode).send({ error: error.message })
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

    // GET /api/crm?ejecutiva=...&estado=...&prioridad=...&search=...&page=1
    f.get('/', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const { ejecutiva, estado, etapa, resultadoCierre, canalVenta, tipoVenta, semaforo, prioridad, search, page = '1', fechaDesde, fechaHasta } = request.query
      const LIMIT = 500
      const offset = (parseInt(page) - 1) * LIMIT

      const where = applyScopeByRole({}, request.user)
      if (ejecutiva) where.ejecutiva = { contains: ejecutiva, mode: 'insensitive' }
      if (prioridad) where.prioridad = prioridad
      if (etapa) where.etapaComercial = String(etapa).toUpperCase()
      if (resultadoCierre) where.resultadoCierre = String(resultadoCierre).toUpperCase()
      if (canalVenta) where.canalVenta = String(canalVenta).toUpperCase()
      if (tipoVenta) where.tipoVenta = String(tipoVenta).toUpperCase()
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
        }),
        f.prisma.crmRegistro.count({ where }),
      ])

      const enriched = addSemaforo(items)
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
        const canalVenta = String(b.canalVenta || 'OTRO').trim().toUpperCase()
        const tipoVenta = String(b.tipoVenta || 'OTRA').trim().toUpperCase()
        if (!CRM_CANALES.includes(canalVenta)) return { status: 400, error: 'Canal de venta invalido' }
        if (!CRM_TIPOS_VENTA.includes(tipoVenta)) return { status: 400, error: 'Tipo de venta invalido' }
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
        request.user?.role === 'admin'
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
      const { fechaDesde, fechaHasta } = request.query

      // Visibilidad por rol: admin ve todo; vendedor solo sus métricas.
      const where = applyScopeByRole({}, request.user)
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
          estado: { not: '3' }
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
      if (!await ensureCrmAccess(f.prisma, id, request.user)) return reply.code(404).send({ error: 'Registro CRM no encontrado' })
      const item = await f.prisma.crmRegistro.findUnique({
        where: { id },
        include: {
          cliente: { select: { id: true, rut: true, nombre: true } },
          orden: { select: { id: true, nInterno: true, tipo: true, estado: true, estadoPago: true, estadoEntrega: true, facturado: true } },
          gestiones: { orderBy: { realizadaAt: 'desc' }, take: 100 },
          estadosHistorial: { orderBy: { createdAt: 'desc' }, take: 100 },
        },
      })
      return { ...item, ...addSemaforo([item])[0] }
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
      // Asignación de vendedor: solo el admin puede asignar/reasignar el dueño.
      if (isAdmin && b.vendedorId !== undefined) {
        existing = await f.prisma.crmRegistro.findUnique({ where: { id: parseInt(id) } })
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
        if (value && !CRM_CANALES.includes(value)) return reply.status(400).send({ error: 'Canal de venta invalido' })
        data.canalVenta = value || null
      }
      if (b.tipoVenta !== undefined) {
        const value = String(b.tipoVenta || '').toUpperCase()
        if (value && !CRM_TIPOS_VENTA.includes(value)) return reply.status(400).send({ error: 'Tipo de venta invalido' })
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
      if (!await ensureCrmAccess(f.prisma, id, request.user)) return reply.code(404).send({ error: 'Registro CRM no encontrado' })
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

    // GET /api/crm/:id/orden — buscar orden v2 por nInterno = ncotizacion
    f.get('/:id/orden', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const id = parseInt(request.params.id)
      if (!await ensureCrmAccess(f.prisma, id, request.user)) return { orden: null }
      const c = await f.prisma.crmRegistro.findUnique({ where: { id }, select: { ncotizacion: true } })
      if (!c?.ncotizacion) return { orden: null }
      const raw = String(c.ncotizacion).trim()
      if (!/^\d{1,9}$/.test(raw)) return { orden: null }
      const ni = parseInt(raw, 10)
      const orden = await f.prisma.orden.findFirst({
        where: { nInterno: ni },
        select: { id: true, nInterno: true, tipo: true, estado: true, estadoPago: true, estadoEntrega: true, createdAt: true, clienteId: true },
      })
      if (orden) await f.prisma.crmRegistro.update({ where: { id }, data: { ordenId: orden.id, clienteId: orden.clienteId || undefined } })
      return { orden }
    })

    // GET /api/crm/ejecutivas — unique list (unified with active users)
    f.get('/ejecutivas', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async () => {
      const crmRows = await f.prisma.$queryRaw`
        SELECT ejecutiva, COUNT(*)::int AS total
        FROM ventas.crm_registros
        WHERE ejecutiva IS NOT NULL AND ejecutiva <> ''
        GROUP BY ejecutiva
      `

      const users = await f.prisma.user.findMany({
        where: {
          activo: true,
          role: { in: ['admin', 'vendedor'] }
        },
        select: { id: true, nombre: true }
      })

      const namesSet = new Set()
      const result = []

      for (const u of users) {
        if (u.nombre && u.nombre.trim()) {
          const name = u.nombre.trim()
          namesSet.add(name.toLowerCase())
          result.push({ ejecutiva: name, vendedorId: u.id, source: 'user' })
        }
      }

      for (const r of crmRows) {
        const name = r.ejecutiva.trim()
        if (name && !namesSet.has(name.toLowerCase())) {
          namesSet.add(name.toLowerCase())
          result.push({ ejecutiva: name, source: 'crm' })
        }
      }

      result.sort((a, b) => a.ejecutiva.localeCompare(b.ejecutiva))
      return result
    })
  })
}
