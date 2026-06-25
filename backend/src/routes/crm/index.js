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

export default async function crmRoutes(fastify) {
  fastify.register(async function (f) {
    // GET /api/crm?ejecutiva=...&estado=...&prioridad=...&search=...&page=1
    f.get('/', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const { ejecutiva, estado, prioridad, search, page = '1', fechaDesde, fechaHasta } = request.query
      const LIMIT = 500
      const offset = (parseInt(page) - 1) * LIMIT

      const where = applyScopeByRole({}, request.user)
      if (ejecutiva) where.ejecutiva = { contains: ejecutiva, mode: 'insensitive' }
      if (prioridad) where.prioridad = prioridad
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

      return { items, total, limit: LIMIT }
    })

    // GET /api/crm/pendientes-hoy — vendedor pending tasks
    f.get('/pendientes-hoy', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const endOfToday = new Date()
      endOfToday.setHours(23, 59, 59, 999)

      // Visibilidad por rol: admin ve todo; vendedor solo sus leads (vendedorId).
      const where = applyScopeByRole({
        estado: { not: '3' },
        fechaProximo: { lte: endOfToday }
      }, request.user)

      const pendingLeads = await f.prisma.crmRegistro.findMany({
        where,
        orderBy: { fechaProximo: 'asc' }
      })

      const now = new Date()
      now.setHours(0, 0, 0, 0)

      const hoy = []
      const vencidas = []

      for (const lead of pendingLeads) {
        if (lead.fechaProximo && new Date(lead.fechaProximo) < now) {
          vencidas.push(lead)
        } else {
          hoy.push(lead)
        }
      }

      return { hoy, vencidas }
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

      const totalCerrados = porEstado['3']
      const tasaCierre = total > 0 ? (totalCerrados / total) * 100 : 0

      const allLeads = await f.prisma.crmRegistro.findMany({
        where,
        select: { ejecutiva: true, estado: true }
      })

      const ejecutivasMap = {}
      for (const lead of allLeads) {
        const exec = lead.ejecutiva || 'Sin Asignar'
        if (!ejecutivasMap[exec]) {
          ejecutivasMap[exec] = { total: 0, cerrados: 0 }
        }
        ejecutivasMap[exec].total++
        if (lead.estado === '3') {
          ejecutivasMap[exec].cerrados++
        }
      }

      const porEjecutiva = Object.entries(ejecutivasMap).map(([ejecutiva, stats]) => ({
        ejecutiva,
        total: stats.total,
        cerrados: stats.cerrados,
        tasaCierre: stats.total > 0 ? (stats.cerrados / stats.total) * 100 : 0
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
        tasaCierre,
        porEjecutiva,
        tiempoPromedioEnPipeline // // POR CONFIRMAR: validez de la métrica basada en createdAt
      }
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
      // Asignación de vendedor: solo el admin puede asignar/reasignar el dueño.
      if (isAdmin && b.vendedorId !== undefined) {
        data.vendedorId = b.vendedorId === null || b.vendedorId === '' ? null : parseInt(b.vendedorId, 10)
      }
      if (b.estado !== undefined) {
        const normalizedEstado = normalizeEstado(b.estado)
        if (normalizedEstado === undefined) return reply.status(400).send({ error: 'Estado CRM invalido' })
        data.estado = normalizedEstado
      }
      if (b.prioridad !== undefined) data.prioridad = b.prioridad || null
      if (b.comentarios !== undefined) data.comentarios = b.comentarios || null
      if (b.fechaProximo !== undefined) data.fechaProximo = b.fechaProximo ? new Date(b.fechaProximo) : null
      if (b.ejecutiva !== undefined) data.ejecutiva = b.ejecutiva || null
      if (b.nombre !== undefined) data.nombre = b.nombre || null
      if (b.rsocial !== undefined) data.rsocial = b.rsocial || null
      if (b.email !== undefined) data.email = b.email || null
      if (b.telefono !== undefined) data.telefono = b.telefono || null
      if (b.ncotizacion !== undefined) data.ncotizacion = b.ncotizacion || null
      if (b.accion !== undefined) data.accion = b.accion || null
      if (b.resultado !== undefined) data.resultado = b.resultado || null
      if (b.fechaCotizacion !== undefined) data.fechaCotizacion = b.fechaCotizacion ? new Date(b.fechaCotizacion) : null

      if (Object.keys(data).length === 0) return reply.status(400).send({ error: 'Nothing to update' })
      const updated = await f.prisma.crmRegistro.update({ where: { id: parseInt(id) }, data })
      return updated
    })

    // POST /api/crm/:id/convertir-cliente — Convert CRM lead to Customer
    f.post('/:id/convertir-cliente', {
      preHandler: [f.authenticate, f.rbac('clientes', 'write')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id)
      if (isNaN(id)) return reply.code(400).send({ error: 'ID de lead inválido' })

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

      return reply.code(201).send({ clienteId: created.id, creado: true })
    })

    // GET /api/crm/:id/orden — buscar orden v2 por nInterno = ncotizacion
    f.get('/:id/orden', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const id = parseInt(request.params.id)
      const c = await f.prisma.crmRegistro.findUnique({ where: { id }, select: { ncotizacion: true } })
      if (!c?.ncotizacion) return { orden: null }
      const raw = String(c.ncotizacion).trim()
      if (!/^\d{1,9}$/.test(raw)) return { orden: null }
      const ni = parseInt(raw, 10)
      const orden = await f.prisma.orden.findFirst({
        where: { nInterno: ni },
        select: { id: true, nInterno: true, tipo: true, estado: true, estadoPago: true, estadoEntrega: true, createdAt: true, clienteId: true },
      })
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
        select: {
          nombre: true
        }
      })

      const namesSet = new Set()
      const result = []

      for (const u of users) {
        if (u.nombre && u.nombre.trim()) {
          const name = u.nombre.trim()
          namesSet.add(name.toLowerCase())
          result.push({ ejecutiva: name, source: 'user' })
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
