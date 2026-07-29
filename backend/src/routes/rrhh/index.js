// RRHH module — trabajadores y sub-recursos
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export default async function rrhhRoutes(fastify) {
  fastify.register(async function (f) {
    // ── Trabajadores ──────────────────────────────────────────────────
    f.get('/trabajadores', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'read')],
    }, async (request) => {
      const { page = '1' } = request.query
      const LIMIT = 100
      const offset = (parseInt(page) - 1) * LIMIT
      const where = buildTrabajadorWhere(request.query)
      const [items, total] = await Promise.all([
        f.prisma.trabajador.findMany({ where, orderBy: [{ apellidoPaterno: 'asc' }, { nombres: 'asc' }], take: LIMIT, skip: offset }),
        f.prisma.trabajador.count({ where }),
      ])
      return { items, total, limit: LIMIT }
    })

    // Cuentas de login para vincular a una ficha de trabajador ("quien soy yo"
    // al asignar tareas de taller). No reusa GET /usuarios (admin-only) - RRHH
    // solo necesita nombre/email/rol, no gestion de permisos.
    f.get('/trabajadores/cuentas-disponibles', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'read')],
    }, async () => {
      const [usuarios, vinculados] = await Promise.all([
        f.prisma.user.findMany({
          where: { activo: true },
          select: { id: true, nombre: true, email: true, role: true },
          orderBy: { nombre: 'asc' },
        }),
        f.prisma.trabajador.findMany({ where: { usuarioId: { not: null } }, select: { usuarioId: true } }),
      ])
      const linkedIds = new Set(vinculados.map(t => t.usuarioId))
      return { items: usuarios.map(u => ({ ...u, linked: linkedIds.has(u.id) })) }
    })

    f.get('/cargos', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'read')],
    }, async (request) => {
      const rows = await f.prisma.trabajador.findMany({
        where: buildCargoListWhere(request.query),
        distinct: ['cargo'],
        select: { cargo: true },
        orderBy: { cargo: 'asc' },
      })
      return normalizeCargoList(rows)
    })

    f.get('/operativo', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'read')],
    }, async (request) => {
      const now = new Date()
      const dias = parseOperativoDias(request.query?.dias)
      const hoy = startOfDay(now)
      const hasta = addDays(hoy, dias)
      const trabajadorWhere = buildTrabajadorWhere({
        empresa: request.query?.empresa,
        cargo: request.query?.cargo,
        estado: 'true',
      })
      const trabajadorRelationWhere = { estado: true }
      if (trabajadorWhere.empresa) trabajadorRelationWhere.empresa = trabajadorWhere.empresa
      if (trabajadorWhere.cargo) trabajadorRelationWhere.cargo = trabajadorWhere.cargo

      try {
        const [trabajadores, contratosPorVencer, licenciasActivas, vacacionesProgramadas] = await Promise.all([
          f.prisma.trabajador.findMany({
            where: trabajadorWhere,
            orderBy: [{ apellidoPaterno: 'asc' }, { nombres: 'asc' }],
            take: 1000,
            select: trabajadorOperativoSelect,
          }),
          f.prisma.contrato.findMany({
            where: {
              estado: true,
              termino: { gte: hoy, lte: hasta },
              trabajador: trabajadorRelationWhere,
            },
            orderBy: { termino: 'asc' },
            take: 30,
            include: { trabajador: { select: trabajadorOperativoSelect } },
          }),
          f.prisma.licencia.findMany({
            where: {
              estado: true,
              inicio: { lte: hoy },
              termino: { gte: hoy },
              trabajador: trabajadorRelationWhere,
            },
            orderBy: { termino: 'asc' },
            take: 30,
            include: { trabajador: { select: trabajadorOperativoSelect } },
          }),
          f.prisma.vacacion.findMany({
            where: {
              estado: true,
              fechaTermino: { gte: hoy },
              fechaInicio: { lte: hasta },
              trabajador: trabajadorRelationWhere,
            },
            orderBy: { fechaInicio: 'asc' },
            take: 30,
            include: { trabajador: { select: trabajadorOperativoSelect } },
          }),
        ])
        return buildRrhhOperativoSummary({
          trabajadores,
          contratosPorVencer,
          licenciasActivas,
          vacacionesProgramadas,
          now,
          dias,
        })
      } catch (error) {
        if (!isPrismaMissingRrhhTable(error)) throw error
        return { ...buildRrhhOperativoSummary({ now, dias }), rrhhSchemaDisponible: false }
      }
    })

    f.get('/trabajadores/:id', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'read')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id)
      if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
      const t = await f.prisma.trabajador.findUnique({
        where: { id },
        include: {
          contratos: { orderBy: { inicio: 'desc' } },
          liquidaciones: { orderBy: [{ anio: 'desc' }, { mes: 'desc' }], take: 24 },
          anticipos: { orderBy: { fecha: 'desc' }, take: 50 },
          licencias: { orderBy: { inicio: 'desc' } },
          vacaciones: { orderBy: { fechaInicio: 'desc' } },
          epps: { orderBy: { fechaEntrega: 'desc' } },
          hojasVida: { orderBy: { fecha: 'desc' } },
          reglamentos: true,
          subcontratos: { orderBy: { inicio: 'desc' } },
          certificadosAntecedentes: { orderBy: { fechaEmision: 'desc' } },
          vacunas: { orderBy: { fecha: 'desc' } },
        },
      })
      if (!t) return reply.code(404).send({ error: 'No encontrado' })
      return t
    })

    f.post('/trabajadores', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'write')],
    }, async (request, reply) => {
      const b = request.body || {}
      if (!b.nombres || !b.apellidoPaterno || !b.rut || !b.empresa) {
        return reply.code(400).send({ error: 'empresa, nombres, apellidoPaterno, rut requeridos' })
      }
      const data = pickTrabajador(b)
      try {
        const created = await f.prisma.trabajador.create({ data })
        return reply.code(201).send(created)
      } catch (e) {
        if (e.code === 'P2002') {
          return reply.code(409).send({ error: 'Esa cuenta de login ya esta vinculada a otro trabajador.' })
        }
        throw e
      }
    })

    f.put('/trabajadores/:id', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'write')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id)
      if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
      const data = pickTrabajador(request.body || {}, true)
      try {
        return await f.prisma.trabajador.update({ where: { id }, data })
      } catch (e) {
        if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
        if (e.code === 'P2002') {
          return reply.code(409).send({ error: 'Esa cuenta de login ya esta vinculada a otro trabajador.' })
        }
        throw e
      }
    })

    f.delete('/trabajadores/:id', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'delete')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id)
      if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
      try {
        await f.prisma.trabajador.update({ where: { id }, data: { estado: false } })
        return reply.code(204).send()
      } catch (e) {
        if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
        throw e
      }
    })

    // ── Sub-recursos por trabajador ──────────────────────────────────
    f.post('/upload-documento', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'write')],
      bodyLimit: 14 * 1024 * 1024,
    }, async (request, reply) => {
      const trabajadorId = parseInt(request.body?.trabajadorId, 10)
      if (!Number.isFinite(trabajadorId) || trabajadorId < 1) {
        return reply.code(400).send({ error: 'trabajadorId requerido' })
      }

      const parsed = parseRrhhDocumentDataUrl(request.body || {})
      if (parsed.error) return reply.code(400).send({ error: parsed.error })

      const dir = path.join(uploadsRoot(), 'rrhh', String(trabajadorId))
      await mkdir(dir, { recursive: true })
      const filename = `${randomUUID()}${parsed.ext}`
      await writeFile(path.join(dir, filename), parsed.bytes)
      return reply.code(201).send({ url: `/uploads/rrhh/${trabajadorId}/${filename}` })
    })

    registerSubResource(f, 'contratos', 'contrato', pickContrato)
    registerSubResource(f, 'liquidaciones', 'liquidacion', pickLiquidacion)
    registerSubResource(f, 'anticipos', 'anticipo', pickAnticipo)
    registerSubResource(f, 'licencias', 'licencia', pickLicencia)
    registerSubResource(f, 'vacaciones', 'vacacion', pickVacacion)
    registerSubResource(f, 'epps', 'epp', pickEpp)
    registerSubResource(f, 'hojas-vida', 'hojaVida', pickHojaVida)
    registerSubResource(f, 'horas-extras', 'horaExtra', pickHoraExtra)
    registerSubResource(f, 'reglamentos', 'reglamento', pickReglamento)
    registerSubResource(f, 'subcontratos', 'subcontrato', pickSubcontrato)
    registerSubResource(f, 'certificados-antecedentes', 'certificadoAntecedentes', pickCertificadoAntecedentes)
    registerSubResource(f, 'vacunas', 'vacuna', pickVacuna)

    // ── Asistencias (sin trabajadorId en path para reportería masiva) ───
    f.get('/asistencias', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'read')],
    }, async (request) => {
      const { trabajadorId, anio, mes } = request.query
      const where = {}
      if (trabajadorId) where.trabajadorId = parseInt(trabajadorId, 10)
      if (anio) where.anio = anio
      if (mes) where.mes = mes
      return f.prisma.asistencia.findMany({
        where,
        orderBy: [{ anio: 'desc' }, { mes: 'desc' }, { dia: 'asc' }],
        take: 1000,
      })
    })

    f.post('/asistencias', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'write')],
    }, async (request, reply) => {
      const b = request.body || {}
      if (!b.trabajadorId || !b.jornadaId) return reply.code(400).send({ error: 'trabajadorId y jornadaId requeridos' })
      const data = pickAsistencia(b)
      const created = await f.prisma.asistencia.create({ data })
      return reply.code(201).send(created)
    })

    f.put('/asistencias/:id', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'write')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id)
      if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
      try {
        return await f.prisma.asistencia.update({ where: { id }, data: pickAsistencia(request.body || {}, true) })
      } catch (e) {
        if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
        throw e
      }
    })

    f.delete('/asistencias/:id', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'delete')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id)
      if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
      try {
        await f.prisma.asistencia.delete({ where: { id } })
        return reply.code(204).send()
      } catch (e) {
        if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
        throw e
      }
    })

    // ── Catálogos compartidos ────────────────────────────────────────
    f.get('/jornadas', { preHandler: [f.authenticate, f.rbac('rrhh', 'read')] },
      async () => f.prisma.jornada.findMany({ orderBy: { jornada: 'asc' } }))
    f.post('/jornadas', { preHandler: [f.authenticate, f.rbac('rrhh', 'write')] }, async (req, reply) => {
      const b = req.body || {}
      if (!b.jornada || !b.ingreso || !b.salida) return reply.code(400).send({ error: 'jornada, ingreso, salida requeridos' })
      return reply.code(201).send(await f.prisma.jornada.create({ data: { jornada: b.jornada, ingreso: toTime(b.ingreso), salida: toTime(b.salida) } }))
    })

    f.get('/tipodias', { preHandler: [f.authenticate, f.rbac('rrhh', 'read')] },
      async () => f.prisma.tipoDia.findMany({ where: { estado: true }, orderBy: { tipo: 'asc' } }))

    f.get('/dias', { preHandler: [f.authenticate, f.rbac('rrhh', 'read')] },
      async () => f.prisma.diaSemana.findMany({ orderBy: { id: 'asc' } }))

    // ── Libros remuneración ───────────────────────────────────────────
    f.get('/libros-remuneracion', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'read')],
    }, async (request) => {
      const { empresa, anio, mes } = request.query
      const where = {}
      if (empresa) where.empresa = empresa
      if (anio) where.anio = anio
      if (mes) where.mes = mes
      return f.prisma.libroRemuneracion.findMany({ where, orderBy: [{ anio: 'desc' }, { mes: 'desc' }], take: 500 })
    })

    f.post('/libros-remuneracion', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'write')],
    }, async (request, reply) => {
      const b = request.body || {}
      if (!b.documento) return reply.code(400).send({ error: 'documento requerido' })
      return reply.code(201).send(await f.prisma.libroRemuneracion.create({ data: pickLibro(b) }))
    })

    // ── Registros empresa (libros legales por empresa/mes) ────────────
    f.get('/registros', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'read')],
    }, async (request) => {
      const { empresa, anio, mes } = request.query
      const where = {}
      if (empresa) where.empresa = empresa
      if (anio) where.anio = anio
      if (mes) where.mes = mes
      return f.prisma.registroEmpresa.findMany({ where, orderBy: [{ anio: 'desc' }, { mes: 'desc' }], take: 500 })
    })

    f.post('/registros', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'write')],
    }, async (request, reply) => {
      const b = request.body || {}
      if (!b.empresa) return reply.code(400).send({ error: 'empresa requerida' })
      return reply.code(201).send(await f.prisma.registroEmpresa.create({
        data: { empresa: b.empresa, anio: b.anio || null, mes: b.mes || null, imagen: b.imagen || null },
      }))
    })

    // ── Resumen dashboard RRHH ────────────────────────────────────────
    f.get('/resumen', {
      preHandler: [f.authenticate, f.rbac('rrhh', 'read')],
    }, async (request) => {
      const { empresa } = request.query
      const where = empresa ? { empresa } : {}
      const [total, activos, porEmpresa] = await Promise.all([
        f.prisma.trabajador.count({ where }),
        f.prisma.trabajador.count({ where: { ...where, estado: true } }),
        f.prisma.trabajador.groupBy({ by: ['empresa'], _count: true, where: { estado: true } }),
      ])
      return { total, activos, porEmpresa: porEmpresa.map(r => ({ empresa: r.empresa, count: r._count })) }
    })
  })
}

// ── Helpers ────────────────────────────────────────────────────────────
function registerSubResource(f, path, model, picker) {
  f.get(`/trabajadores/:id/${path}`, {
    preHandler: [f.authenticate, f.rbac('rrhh', 'read')],
  }, async (request, reply) => {
    const trabajadorId = parseInt(request.params.id)
    if (isNaN(trabajadorId)) return reply.code(400).send({ error: 'ID inválido' })
    return f.prisma[model].findMany({ where: { trabajadorId }, orderBy: { createdAt: 'desc' }, take: 500 })
  })

  f.post(`/trabajadores/:id/${path}`, {
    preHandler: [f.authenticate, f.rbac('rrhh', 'write')],
  }, async (request, reply) => {
    const trabajadorId = parseInt(request.params.id)
    if (isNaN(trabajadorId)) return reply.code(400).send({ error: 'ID inválido' })
    const data = { ...picker(request.body || {}), trabajadorId }
    return reply.code(201).send(await f.prisma[model].create({ data }))
  })

  f.put(`/${path}/:itemId`, {
    preHandler: [f.authenticate, f.rbac('rrhh', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.itemId)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      return await f.prisma[model].update({ where: { id }, data: picker(request.body || {}, true) })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
      throw e
    }
  })

  f.delete(`/${path}/:itemId`, {
    preHandler: [f.authenticate, f.rbac('rrhh', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.itemId)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      await f.prisma[model].delete({ where: { id } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
      throw e
    }
  })
}

const TRABAJADOR_SEARCH_FIELDS = ['nombres', 'apellidoPaterno', 'apellidoMaterno', 'rut', 'cargo']

const toDate = v => (v == null || v === '' ? null : new Date(v))
const toTime = v => {
  if (v == null || v === '') return null
  // accept "HH:MM" or "HH:MM:SS" → 1970-01-01T...
  const s = String(v).length === 5 ? `${v}:00` : v
  return new Date(`1970-01-01T${s}Z`)
}
const toInt = v => (v == null || v === '' ? null : parseInt(v, 10))
const toFloat = v => (v == null || v === '' ? null : parseFloat(v))
const toBool = v => v === true || v === '1' || v === 1 || v === 'true'
const queryText = v => (v == null ? '' : String(v).trim())
const MAX_RRHH_DOCUMENT_BYTES = 10 * 1024 * 1024
const RRHH_DOCUMENT_EXT = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}
const trabajadorOperativoSelect = {
  id: true,
  empresa: true,
  nombres: true,
  apellidoPaterno: true,
  apellidoMaterno: true,
  rut: true,
  cargo: true,
  fechaIngreso: true,
  fechaTermino: true,
  tipoContrato: true,
  sueldoLiquido: true,
  estado: true,
}

function uploadsRoot() {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'))
}

function parseRrhhDocumentDataUrl(body = {}) {
  const raw = String(body.data || '')
  const match = raw.match(/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return { error: 'Documento debe ser PDF, JPG, PNG o WEBP' }
  const [, mime, base64] = match
  const bytes = Buffer.from(base64, 'base64')
  if (!bytes.length) return { error: 'Documento vacio' }
  if (bytes.length > MAX_RRHH_DOCUMENT_BYTES) return { error: 'Documento supera maximo 10 MB' }
  return { bytes, ext: RRHH_DOCUMENT_EXT[mime] }
}

function startOfDay(date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(date, days) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function blank(value) {
  return queryText(value) === ''
}

function trabajadorNombre(t = {}) {
  return [t.nombres, t.apellidoPaterno, t.apellidoMaterno].filter(Boolean).join(' ').trim() || `Trabajador #${t.id}`
}

function trabajadorOperativoMini(t = {}) {
  return {
    id: t.id,
    nombre: trabajadorNombre(t),
    rut: t.rut || null,
    empresa: t.empresa || null,
    cargo: t.cargo || null,
  }
}

function normalizeOperativoItem(item = {}, extra = {}) {
  return {
    id: item.id,
    trabajador: trabajadorOperativoMini(item.trabajador || item),
    ...extra,
  }
}

export function parseOperativoDias(value) {
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 30
  return Math.min(parsed, 180)
}

export function isPrismaMissingRrhhTable(error) {
  const text = `${error?.message || ''} ${error?.meta?.modelName || ''} ${error?.meta?.table || ''}`
  return error?.code === 'P2021' || /relation .* does not exist|table .* does not exist|does not exist/i.test(text)
}

export function buildRrhhOperativoSummary({
  trabajadores = [],
  contratosPorVencer = [],
  licenciasActivas = [],
  vacacionesProgramadas = [],
  now = new Date(),
  dias = 30,
} = {}) {
  const activos = trabajadores.filter(t => t?.estado !== false)
  const sinSueldo = activos.filter(t => blank(t.sueldoLiquido))
  const sinCargo = activos.filter(t => blank(t.cargo))
  const sinFechaIngreso = activos.filter(t => blank(t.fechaIngreso))
  const porCargo = new Map()

  for (const trabajador of activos) {
    const cargo = queryText(trabajador.cargo) || 'Sin cargo'
    porCargo.set(cargo, (porCargo.get(cargo) || 0) + 1)
  }

  return {
    generadoEn: now,
    dias,
    rrhhSchemaDisponible: true,
    totalActivos: activos.length,
    alertas: {
      sinSueldo: sinSueldo.length,
      sinCargo: sinCargo.length,
      sinFechaIngreso: sinFechaIngreso.length,
      contratosPorVencer: contratosPorVencer.length,
      licenciasActivas: licenciasActivas.length,
      vacacionesProgramadas: vacacionesProgramadas.length,
    },
    dotacionPorCargo: [...porCargo.entries()]
      .map(([cargo, total]) => ({ cargo, total }))
      .sort((a, b) => b.total - a.total || a.cargo.localeCompare(b.cargo)),
    sinSueldo: sinSueldo.slice(0, 12).map(trabajadorOperativoMini),
    sinCargo: sinCargo.slice(0, 12).map(trabajadorOperativoMini),
    sinFechaIngreso: sinFechaIngreso.slice(0, 12).map(trabajadorOperativoMini),
    contratosPorVencer: contratosPorVencer.map(item => normalizeOperativoItem(item, {
      contrato: item.contrato || null,
      plazo: item.plazo || null,
      inicio: item.inicio || null,
      termino: item.termino || null,
    })),
    licenciasActivas: licenciasActivas.map(item => normalizeOperativoItem(item, {
      tipo: item.tipo || null,
      reposo: item.reposo || null,
      inicio: item.inicio || null,
      termino: item.termino || null,
      dias: item.dias || null,
    })),
    vacacionesProgramadas: vacacionesProgramadas.map(item => normalizeOperativoItem(item, {
      periodo: item.periodo || null,
      fechaInicio: item.fechaInicio || null,
      fechaTermino: item.fechaTermino || null,
      dias: item.dias || null,
      saldo: item.saldo || null,
    })),
  }
}

export function buildTrabajadorWhere(query = {}) {
  const where = {}
  const empresa = queryText(query.empresa)
  const cargo = queryText(query.cargo)
  const search = queryText(query.search)

  if (empresa) where.empresa = empresa
  if (query.estado !== undefined && queryText(query.estado) !== '') where.estado = toBool(query.estado)
  if (cargo) where.cargo = { contains: cargo, mode: 'insensitive' }
  if (search) {
    where.OR = TRABAJADOR_SEARCH_FIELDS.map(field => ({
      [field]: { contains: search, mode: 'insensitive' },
    }))
  }

  return where
}

export function buildCargoListWhere(query = {}) {
  const where = {
    estado: true,
    NOT: [{ cargo: null }, { cargo: '' }],
  }
  const empresa = queryText(query.empresa)
  if (empresa) where.empresa = empresa
  return where
}

function normalizeCargoList(rows) {
  const seen = new Set()
  const cargos = []
  for (const row of rows) {
    const cargo = queryText(row?.cargo)
    if (!cargo || seen.has(cargo)) continue
    seen.add(cargo)
    cargos.push(cargo)
  }
  return cargos
}

export function pickTrabajador(b, partial = false) {
  const d = {}
  const set = (k, v) => { if (!partial || v !== undefined) d[k] = v ?? null }
  set('empresa', b.empresa)
  set('apellidoPaterno', b.apellidoPaterno)
  // apellidoMaterno: NOT NULL en DB; default '' solo en create
  if (b.apellidoMaterno !== undefined) d.apellidoMaterno = b.apellidoMaterno ?? ''
  else if (!partial) d.apellidoMaterno = ''
  set('nombres', b.nombres)
  set('rut', b.rut)
  set('fechaNacimiento', b.fechaNacimiento)
  set('estadoCivil', b.estadoCivil)
  set('cargasFamiliares', b.cargasFamiliares)
  set('direccion', b.direccion)
  set('comuna', b.comuna)
  set('nacionalidad', b.nacionalidad)
  set('afp', b.afp)
  set('salud', b.salud)
  set('telefono', b.telefono)
  set('contactoEmergencia', b.contactoEmergencia)
  set('numeroEmergencia', b.numeroEmergencia)
  set('email', b.email)
  set('banco', b.banco)
  set('tipoCuenta', b.tipoCuenta)
  set('numeroCuenta', b.numeroCuenta)
  set('cargo', b.cargo)
  set('fechaIngreso', b.fechaIngreso)
  if (b.fechaTermino !== undefined) d.fechaTermino = toDate(b.fechaTermino)
  set('tipoContrato', b.tipoContrato)
  set('sueldoLiquido', b.sueldoLiquido)
  set('observacion', b.observacion)
  set('user', b.user)
  if (b.estado !== undefined) d.estado = toBool(b.estado)
  set('foto', b.foto)
  if (b.sueldoBase !== undefined) d.sueldoBase = toInt(b.sueldoBase)
  else if (!partial) d.sueldoBase = null
  if (b.valorHoraExtra !== undefined) d.valorHoraExtra = toInt(b.valorHoraExtra)
  else if (!partial) d.valorHoraExtra = null
  // Cuenta de login vinculada (para saber "quien soy yo" al asignar tareas de
  // taller). Distinto del campo "user" (texto libre historico, sin relacion).
  if (b.usuarioId !== undefined) d.usuarioId = b.usuarioId === null || b.usuarioId === '' ? null : toInt(b.usuarioId)
  return d
}

function pickContrato(b) {
  return {
    contrato: b.contrato || '',
    plazo: b.plazo || null,
    inicio: toDate(b.inicio),
    termino: toDate(b.termino),
    estado: b.estado !== undefined ? toBool(b.estado) : true,
    imagen: b.imagen || null,
  }
}
function pickLiquidacion(b) {
  return {
    anio: b.anio || null, mes: b.mes || null,
    sueldoBase: toInt(b.sueldoBase), totalImponible: toInt(b.totalImponible),
    totalHaberes: toInt(b.totalHaberes), totalDescuentos: toInt(b.totalDescuentos),
    liquidoPagar: toInt(b.liquidoPagar), horasExtras: toFloat(b.horasExtras),
    totalExtras: toInt(b.totalExtras), imagen: b.imagen || null,
    estado: b.estado !== undefined ? toBool(b.estado) : true,
  }
}
function pickAnticipo(b) {
  return {
    anio: b.anio || null, mes: b.mes || null,
    banco: b.banco || null, tipoCuenta: b.tipoCuenta || null, cuenta: b.cuenta || null,
    fecha: toDate(b.fecha), monto: toInt(b.monto),
  }
}
function pickLicencia(b) {
  return {
    fecha: toDate(b.fecha), inicio: toDate(b.inicio), termino: toDate(b.termino),
    dias: toInt(b.dias), tipo: b.tipo || null, reposo: b.reposo || null,
    imagen: b.imagen || null,
    estado: b.estado !== undefined ? toBool(b.estado) : true,
  }
}
function pickVacacion(b) {
  return {
    inicioContrato: toDate(b.inicioContrato), diasPendientes: b.diasPendientes || null,
    periodo: b.periodo || null, dias: toInt(b.dias), saldo: toInt(b.saldo),
    fechaInicio: toDate(b.fechaInicio), fechaTermino: toDate(b.fechaTermino),
    imagen: b.imagen || null,
    estado: b.estado !== undefined ? toBool(b.estado) : true,
  }
}
function pickEpp(b) {
  return {
    epp: b.epp || '', marca: b.marca || null, cantidad: toInt(b.cantidad) || 0,
    fechaEntrega: toDate(b.fechaEntrega), documento: b.documento || null, observacion: b.observacion || null,
  }
}
function pickHojaVida(b) {
  return {
    fecha: toDate(b.fecha), documento: b.documento || null, imagen: b.imagen || null,
    estado: b.estado !== undefined ? toBool(b.estado) : true,
  }
}
function pickHoraExtra(b) {
  return {
    contrato: b.contrato || null, plazo: b.plazo || null,
    inicio: toDate(b.inicio), termino: toDate(b.termino),
    estado: b.estado !== undefined ? toBool(b.estado) : true,
    imagen: b.imagen || null,
  }
}
function pickReglamento(b) {
  return {
    nombre: b.nombre || '', documento: b.documento || null, link: b.link || null,
    fechaEntrega: b.fechaEntrega || null,
    estado: b.estado !== undefined ? toBool(b.estado) : true,
  }
}
function pickSubcontrato(b) {
  return {
    empresa: b.empresa || null,
    contrato: b.contrato || null,
    inicio: toDate(b.inicio),
    termino: toDate(b.termino),
    documento: b.documento || null,
    imagen: b.imagen || null,
    estado: b.estado !== undefined ? toBool(b.estado) : true,
  }
}
function pickCertificadoAntecedentes(b) {
  return {
    fechaEmision: toDate(b.fechaEmision),
    fechaVencimiento: toDate(b.fechaVencimiento),
    documento: b.documento || null,
    imagen: b.imagen || null,
    observacion: b.observacion || null,
    estado: b.estado !== undefined ? toBool(b.estado) : true,
  }
}
function pickVacuna(b) {
  return {
    tipo: b.tipo || null,
    dosis: b.dosis || null,
    fecha: toDate(b.fecha),
    documento: b.documento || null,
    imagen: b.imagen || null,
    observacion: b.observacion || null,
    estado: b.estado !== undefined ? toBool(b.estado) : true,
  }
}
function pickAsistencia(b, partial = false) {
  const d = {}
  const set = (k, v) => { if (!partial || v !== undefined) d[k] = v }
  if (b.trabajadorId !== undefined) d.trabajadorId = parseInt(b.trabajadorId, 10)
  set('anio', b.anio)
  set('mes', b.mes)
  set('dia', b.dia)
  if (b.tipoDiaId !== undefined) d.tipoDiaId = b.tipoDiaId == null ? null : parseInt(b.tipoDiaId, 10)
  if (b.jornadaId !== undefined) d.jornadaId = parseInt(b.jornadaId, 10)
  if (b.horaIngresoAm !== undefined) d.horaIngresoAm = toTime(b.horaIngresoAm)
  if (b.horaSalidaAm !== undefined) d.horaSalidaAm = toTime(b.horaSalidaAm)
  if (b.horaIngresoPm !== undefined) d.horaIngresoPm = toTime(b.horaIngresoPm)
  if (b.horaSalidaPm !== undefined) d.horaSalidaPm = toTime(b.horaSalidaPm)
  if (b.totalHoras !== undefined) d.totalHoras = toFloat(b.totalHoras)
  if (b.horasExtras !== undefined) d.horasExtras = toFloat(b.horasExtras)
  return d
}
function pickLibro(b) {
  return {
    documento: b.documento, empresa: b.empresa || null, anio: b.anio || null, mes: b.mes || null,
    totalImponible: toInt(b.totalImponible), totalNoImponible: toInt(b.totalNoImponible),
    totalDescuentos: toInt(b.totalDescuentos), anticipos: toInt(b.anticipos),
    liquidoPagar: toInt(b.liquidoPagar), totalHorasExtras: toInt(b.totalHorasExtras),
    cantidadTrabajadores: toInt(b.cantidadTrabajadores), imagen: b.imagen || null,
  }
}
