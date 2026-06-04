import { canApplyDescuento } from '../ventas/descuentos-permissions.js'
import { can } from '../../middleware/rbac.js'
import {
  buildDiscountSnapshot,
  evaluateDiscountRules,
} from './rules-engine.js'

function parseId(value) {
  const id = parseInt(value, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

function parseValor(body, { integerOnly = false } = {}) {
  const raw = body?.valor
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { error: 'valor requerido' }
  }
  const valor = Number(raw)
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
    return { error: 'valor debe estar entre 0 y 100' }
  }
  if (integerOnly && !Number.isInteger(valor)) {
    return { error: 'valor debe ser entero entre 0 y 100' }
  }
  return { valor }
}

function rulesEnabled() {
  return process.env.DESCUENTOS_REGLAS_ENABLED !== 'false'
}

function canReadDescuentos(user) {
  if (!user) return false
  return can(user.role, 'ventas', 'read', user.permisosExtra) ||
    can(user.role, 'descuentos', 'read', user.permisosExtra) ||
    canApplyDescuento(user)
}

function parseJsonArray(value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    return value.split(',').map(v => v.trim()).filter(Boolean)
  }
  return []
}

function parseNullableInt(value, field) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return { error: `${field} invalido` }
  return parsed
}

function parseNullableDate(value, field) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return { error: `${field} invalida` }
  return parsed
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `regla-${Date.now()}`
}

function parseRuleBody(body = {}, { partial = false } = {}) {
  const data = {}
  if (!partial || body.nombre !== undefined) {
    const nombre = String(body.nombre || '').trim()
    if (!nombre) return { error: 'nombre requerido' }
    data.nombre = nombre
    if (!partial || body.codigo !== undefined) data.codigo = slug(body.codigo || nombre)
  }

  if (!partial || body.descripcion !== undefined) data.descripcion = body.descripcion ? String(body.descripcion).trim() : null
  if (!partial || body.alcance !== undefined) data.alcance = body.alcance ? String(body.alcance).trim() : 'ventas'
  data.tipoDescuento = 'porcentaje'

  const condiciones = {}
  for (const key of ['tiposVenta', 'productoIds', 'categoriaIds', 'subcategoriaIds', 'proveedorIds', 'categoriaNombres', 'proveedorNombres']) {
    if (!partial || body[key] !== undefined) condiciones[key] = parseJsonArray(body[key])
  }

  for (const [field, label] of [['sucursalId', 'sucursalId'], ['clienteId', 'clienteId']]) {
    if (!partial || body[field] !== undefined) {
      const parsed = parseNullableInt(body[field], label)
      if (parsed?.error) return parsed
      condiciones[field] = parsed
    }
  }

  if (!partial || body.clienteSegmento !== undefined) {
    condiciones.clienteSegmento = body.clienteSegmento === undefined ? undefined : (String(body.clienteSegmento || '').trim() || null)
  }

  for (const [field, label, target] of [['vigenciaDesde', 'vigenciaDesde', 'vigenteDesde'], ['vigenciaHasta', 'vigenciaHasta', 'vigenteHasta']]) {
    if (!partial || body[field] !== undefined) {
      const parsed = parseNullableDate(body[field], label)
      if (parsed?.error) return parsed
      data[target] = parsed
    }
  }

  const effect = {}
  for (const [field, min, max, target] of [
    ['montoMinimo', 0, Infinity, 'condiciones'],
    ['porcentajeSugerido', 0, 100, 'efecto'],
    ['porcentajeAutoaprobado', 0, 100, 'efecto'],
    ['porcentajeMaximo', 0, 100, 'data'],
    ['montoMax', 0, Infinity, 'data'],
  ]) {
    if (!partial || body[field] !== undefined) {
      const raw = body[field] ?? 0
      const parsed = Number(raw)
      if (!Number.isFinite(parsed) || parsed < min || parsed > max) return { error: `${field} invalido` }
      if (target === 'condiciones') condiciones[field] = parsed
      else if (target === 'efecto') effect[field] = parsed
      else if (field === 'porcentajeMaximo') data.porcentajeMax = parsed
      else data[field] = parsed
    }
  }

  if (!partial || body.requiereAprobacion !== undefined) data.requiereAprobacion = Boolean(body.requiereAprobacion)
  if (!partial || body.activo !== undefined) data.activo = body.activo === undefined ? true : Boolean(body.activo)
  if (!partial || body.prioridad !== undefined) {
    const prioridad = Number(body.prioridad ?? 0)
    if (!Number.isInteger(prioridad)) return { error: 'prioridad invalida' }
    data.prioridad = prioridad
  }

  if (effect.porcentajeAutoaprobado !== undefined && data.porcentajeMax !== undefined &&
    Number(effect.porcentajeAutoaprobado) > Number(data.porcentajeMax)) {
    return { error: 'porcentajeAutoaprobado no puede superar porcentajeMaximo' }
  }
  if (effect.porcentajeSugerido !== undefined && data.porcentajeMax !== undefined &&
    Number(effect.porcentajeSugerido) > Number(data.porcentajeMax)) {
    return { error: 'porcentajeSugerido no puede superar porcentajeMaximo' }
  }

  if (Object.keys(condiciones).length) data.condiciones = condiciones
  if (Object.keys(effect).length) data.efecto = effect
  Object.keys(data).forEach(key => data[key] === undefined && delete data[key])
  return { data }
}

export default async function descuentosRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!canReadDescuentos(request.user)) return reply.code(403).send({ error: 'Forbidden' })
    const [normales, marco] = await Promise.all([
      fastify.prisma.descuentoPorc.findMany({ where: { activo: true }, orderBy: { valor: 'asc' } }),
      fastify.prisma.descuentoPorcMarco.findMany({ where: { activo: true }, orderBy: { valor: 'asc' } }),
    ])
    return { normales, marco }
  })

  fastify.get('/reglas', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!canReadDescuentos(request.user)) return reply.code(403).send({ error: 'Forbidden' })
    if (!rulesEnabled()) return []
    return fastify.prisma.descuentoRegla.findMany({
      orderBy: [{ activo: 'desc' }, { prioridad: 'desc' }, { id: 'asc' }],
    })
  })

  fastify.post('/reglas', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!rulesEnabled()) return reply.code(404).send({ error: 'Reglas de descuento deshabilitadas' })
    if (!canApplyDescuento(request.user)) return reply.code(403).send({ error: 'No tiene permiso para administrar reglas de descuento' })
    const parsed = parseRuleBody(request.body)
    if (parsed.error) return reply.code(400).send({ error: parsed.error })
    const regla = await fastify.prisma.descuentoRegla.create({ data: parsed.data })
    return reply.code(201).send(regla)
  })

  fastify.put('/reglas/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!rulesEnabled()) return reply.code(404).send({ error: 'Reglas de descuento deshabilitadas' })
    if (!canApplyDescuento(request.user)) return reply.code(403).send({ error: 'No tiene permiso para administrar reglas de descuento' })
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = parseRuleBody(request.body, { partial: true })
    if (parsed.error) return reply.code(400).send({ error: parsed.error })
    try {
      return await fastify.prisma.descuentoRegla.update({ where: { id }, data: parsed.data })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Regla no encontrada' })
      throw e
    }
  })

  fastify.delete('/reglas/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!rulesEnabled()) return reply.code(404).send({ error: 'Reglas de descuento deshabilitadas' })
    if (!canApplyDescuento(request.user)) return reply.code(403).send({ error: 'No tiene permiso para administrar reglas de descuento' })
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    try {
      await fastify.prisma.descuentoRegla.update({ where: { id }, data: { activo: false } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Regla no encontrada' })
      throw e
    }
  })

  fastify.post('/evaluar', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request) => {
    if (!rulesEnabled()) return { reglas: [], selected: null }
    return evaluateDiscountRules(fastify.prisma, request.body || {}, request.user)
  })

  fastify.post('/solicitudes', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    if (!rulesEnabled()) return reply.code(404).send({ error: 'Reglas de descuento deshabilitadas' })
    const reglaId = parseId(request.body?.reglaId)
    if (!reglaId) return reply.code(400).send({ error: 'reglaId requerido' })
    const evaluation = await evaluateDiscountRules(fastify.prisma, { ...(request.body || {}), reglaId }, request.user)
    const selected = evaluation.selected
    if (!selected) return reply.code(409).send({ error: 'La regla no aplica al borrador actual', evaluation })
    const snapshot = buildDiscountSnapshot(evaluation, selected)
    const solicitud = await fastify.prisma.descuentoSolicitud.create({
      data: {
        reglaId,
        estado: selected.estado,
        origenTipo: request.body?.origenTipo || 'venta',
        contextoSnapshot: { ...evaluation.draft, draftHash: evaluation.draftHash },
        resultadoSnapshot: snapshot,
        subtotalBase: selected.baseElegible,
        descuentoPctSolicitado: selected.porcentaje,
        descuentoPctAprobado: selected.estado === 'AUTORIZADA' ? selected.porcentaje : null,
        descuentoMontoSolicitado: selected.montoDescuento,
        descuentoMontoAprobado: selected.estado === 'AUTORIZADA' ? selected.montoDescuento : null,
        solicitanteId: request.user?.id || null,
        solicitanteNombre: request.user?.nombre || request.user?.email || null,
        motivo: selected.motivo,
      },
    })
    return reply.code(201).send({ solicitud, evaluation: selected })
  })

  fastify.get('/solicitudes', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    if (!rulesEnabled()) return []
    const canManage = request.user?.role === 'admin' || canApplyDescuento(request.user)
    return fastify.prisma.descuentoSolicitud.findMany({
      where: canManage ? {} : { solicitanteId: request.user?.id || -1 },
      include: { regla: { select: { id: true, codigo: true, nombre: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
  })

  fastify.post('/solicitudes/:id/aprobar', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!rulesEnabled()) return reply.code(404).send({ error: 'Reglas de descuento deshabilitadas' })
    if (request.user?.role !== 'admin') return reply.code(403).send({ error: 'Solo admin puede aprobar descuentos' })
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    try {
      return await fastify.prisma.$transaction(async (tx) => {
        const solicitud = await tx.descuentoSolicitud.findUnique({ where: { id } })
        if (!solicitud) {
          const err = new Error('Solicitud no encontrada')
          err.statusCode = 404
          throw err
        }
        const aprobadoAt = new Date()
        const descuentoPctAprobado = solicitud.descuentoPctAprobado ?? solicitud.descuentoPctSolicitado
        const descuentoMontoAprobado = solicitud.descuentoMontoAprobado ?? solicitud.descuentoMontoSolicitado
        if (solicitud.estado === 'APLICADA') {
          const err = new Error('Solicitud ya aplicada')
          err.statusCode = 409
          throw err
        }
        if (solicitud.estado === 'RECHAZADA') {
          const err = new Error('Solicitud rechazada no puede aprobarse')
          err.statusCode = 409
          throw err
        }
        const resultadoSnapshot = {
          ...(solicitud.resultadoSnapshot || {}),
          estado: 'AUTORIZADA',
          porcentaje: descuentoPctAprobado,
          montoDescuento: descuentoMontoAprobado,
          aprobadoAt: aprobadoAt.toISOString(),
        }
        const updated = await tx.descuentoSolicitud.update({
          where: { id },
          data: {
            estado: 'AUTORIZADA',
            descuentoPctAprobado,
            descuentoMontoAprobado,
            resultadoSnapshot,
            aprobadorId: request.user?.id || null,
            aprobadorNombre: request.user?.nombre || request.user?.email || null,
            resueltoAt: aprobadoAt,
            comentarioResolucion: request.body?.motivo || 'Aprobada por admin',
          },
        })
        if (solicitud.origenTipo === 'cotizacion' && solicitud.contextoSnapshot?.cotizacionId) {
          const cot = await tx.cotizacionLicitacion.findUnique({
            where: { id: Number(solicitud.contextoSnapshot.cotizacionId) },
            include: { items: true },
          })
          if (!cot) {
            const err = new Error('Cotizacion asociada no encontrada')
            err.statusCode = 404
            throw err
          }
          let clienteId = null
          let clienteSegmento = null
          if (cot.rutCliente) {
            const cliente = await tx.cliente.findUnique({
              where: { rut: cot.rutCliente },
              select: { id: true, segmento: true },
            })
            clienteId = cliente?.id || null
            clienteSegmento = cliente?.segmento || null
          }
          const currentEvaluation = await evaluateDiscountRules(tx, {
            tipo: solicitud.contextoSnapshot?.tipo || 'Licitacion',
            clienteId,
            clienteSegmento,
            sucursalId: cot.sucursalId ?? solicitud.contextoSnapshot?.sucursalId ?? null,
            reglaId: solicitud.reglaId,
            descuentoPct: descuentoPctAprobado,
            items: (cot.items || []).map(item => ({
              codigoInterno: item.codigoInterno,
              nombre: item.nombre,
              cantidad: Number(item.cantAdjudicados || 0) > 0 ? item.cantAdjudicados : item.cantidad,
              precioUnitario: item.precio,
            })),
          }, request.user)
          const storedHash = solicitud.resultadoSnapshot?.draftHash || solicitud.contextoSnapshot?.draftHash
          if (currentEvaluation.draftHash !== storedHash || currentEvaluation.selected?.estado === 'RECHAZADA') {
            const err = new Error('La cotizacion cambio despues de solicitar el descuento; reevalue la regla')
            err.statusCode = 409
            throw err
          }
          await tx.cotizacionLicitacion.updateMany({
            where: { id: Number(solicitud.contextoSnapshot.cotizacionId) },
            data: {
              descuentoSolicitudId: solicitud.id,
              descuentoMonto: descuentoMontoAprobado,
              descuentoSnapshot: resultadoSnapshot,
              descuentoPct: descuentoPctAprobado,
            },
          })
        }
        return updated
      })
    } catch (e) {
      if (e.statusCode) return reply.code(e.statusCode).send({ error: e.message })
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Solicitud no encontrada' })
      throw e
    }
  })

  fastify.post('/solicitudes/:id/rechazar', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!rulesEnabled()) return reply.code(404).send({ error: 'Reglas de descuento deshabilitadas' })
    if (request.user?.role !== 'admin') return reply.code(403).send({ error: 'Solo admin puede rechazar descuentos' })
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    try {
      const current = await fastify.prisma.descuentoSolicitud.findUnique({ where: { id }, select: { estado: true } })
      if (!current) return reply.code(404).send({ error: 'Solicitud no encontrada' })
      if (current.estado === 'APLICADA') return reply.code(409).send({ error: 'Solicitud ya aplicada no puede rechazarse' })
      return await fastify.prisma.descuentoSolicitud.update({
        where: { id },
        data: {
          estado: 'RECHAZADA',
          aprobadorId: request.user?.id || null,
          aprobadorNombre: request.user?.nombre || request.user?.email || null,
          resueltoAt: new Date(),
          comentarioResolucion: request.body?.motivo || 'Rechazada por admin',
        },
      })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Solicitud no encontrada' })
      throw e
    }
  })

  for (const [path, model, integerOnly] of [['normales', 'descuentoPorc', true], ['marco', 'descuentoPorcMarco', false]]) {
    fastify.post(`/${path}`, {
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      if (!canApplyDescuento(request.user)) return reply.code(403).send({ error: 'No tiene permiso para administrar descuentos' })
      const parsed = parseValor(request.body, { integerOnly })
      if (parsed.error) return reply.code(400).send({ error: parsed.error })
      const exists = await fastify.prisma[model].findFirst({
        where: { valor: parsed.valor, activo: true },
        select: { id: true },
      })
      if (exists) return reply.code(409).send({ error: 'Valor de descuento ya existe' })
      const item = await fastify.prisma[model].create({ data: { valor: parsed.valor } })
      return reply.code(201).send(item)
    })

    fastify.put(`/${path}/:id`, {
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      if (!canApplyDescuento(request.user)) return reply.code(403).send({ error: 'No tiene permiso para administrar descuentos' })
      const id = parseId(request.params.id)
      if (!id) return reply.code(400).send({ error: 'ID invalido' })
      const parsed = parseValor(request.body, { integerOnly })
      if (parsed.error) return reply.code(400).send({ error: parsed.error })
      const exists = await fastify.prisma[model].findFirst({
        where: { valor: parsed.valor, activo: true, id: { not: id } },
        select: { id: true },
      })
      if (exists) return reply.code(409).send({ error: 'Valor de descuento ya existe' })

      const updated = await fastify.prisma[model].updateMany({
        where: { id, activo: true },
        data: { valor: parsed.valor },
      })
      if (updated.count === 0) return reply.code(404).send({ error: 'No encontrado' })
      return fastify.prisma[model].findUnique({ where: { id } })
    })

    fastify.delete(`/${path}/:id`, {
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      if (!canApplyDescuento(request.user)) return reply.code(403).send({ error: 'No tiene permiso para administrar descuentos' })
      const id = parseId(request.params.id)
      if (!id) return reply.code(400).send({ error: 'ID invalido' })
      try {
        await fastify.prisma[model].update({ where: { id }, data: { activo: false } })
        return reply.code(204).send()
      } catch (e) {
        if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
        throw e
      }
    })
  }
}
