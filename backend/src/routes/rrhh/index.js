// RRHH module — trabajadores y sub-recursos
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
      const created = await f.prisma.trabajador.create({ data })
      return reply.code(201).send(created)
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
    registerSubResource(f, 'contratos', 'contrato', pickContrato)
    registerSubResource(f, 'liquidaciones', 'liquidacion', pickLiquidacion)
    registerSubResource(f, 'anticipos', 'anticipo', pickAnticipo)
    registerSubResource(f, 'licencias', 'licencia', pickLicencia)
    registerSubResource(f, 'vacaciones', 'vacacion', pickVacacion)
    registerSubResource(f, 'epps', 'epp', pickEpp)
    registerSubResource(f, 'hojas-vida', 'hojaVida', pickHojaVida)
    registerSubResource(f, 'horas-extras', 'horaExtra', pickHoraExtra)
    registerSubResource(f, 'reglamentos', 'reglamento', pickReglamento)

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
