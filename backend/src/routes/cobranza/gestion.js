import { createHash } from 'node:crypto'
import { z } from 'zod'

const TARGET_FIELDS = {
  ordenId: z.number().int().positive().optional().nullable(),
  cobranzaHistoricoId: z.number().int().positive().optional().nullable(),
}

const GESTION_SCHEMA = z.object({
  ...TARGET_FIELDS,
  tipo: z.enum(['CONTACTO', 'SEGUIMIENTO', 'COMPROMISO', 'RECLAMO', 'OTRO']),
  canal: z.string().trim().max(80).optional().nullable(),
  resultado: z.string().trim().max(160).optional().nullable(),
  detalle: z.string().trim().min(3).max(2000),
  compromiso: z.object({
    fechaCompromiso: z.coerce.date(),
    monto: z.number().positive(),
    observacion: z.string().trim().max(1000).optional().nullable(),
  }).optional(),
}).refine(value => Boolean(value.ordenId) !== Boolean(value.cobranzaHistoricoId), {
  message: 'Indica una venta o un registro histórico, no ambos',
}).refine(value => value.tipo !== 'COMPROMISO' || value.compromiso, {
  message: 'Una gestión de compromiso requiere fecha y monto',
})

const CARTOLA_ITEM_SCHEMA = z.object({
  fecha: z.coerce.date(),
  descripcion: z.string().trim().min(1).max(500),
  referencia: z.string().trim().max(200).optional().nullable(),
  monto: z.number().refine(value => Number.isFinite(value) && value !== 0, 'El monto no puede ser cero'),
  moneda: z.string().trim().min(3).max(8).default('CLP'),
  banco: z.string().trim().max(100).optional().nullable(),
  cuenta: z.string().trim().max(100).optional().nullable(),
})

const CONCILIAR_SCHEMA = z.object({
  ...TARGET_FIELDS,
  movimientoCajaId: z.number().int().positive().optional().nullable(),
  observacion: z.string().trim().max(1000).optional().nullable(),
}).refine(value => value.ordenId || value.cobranzaHistoricoId || value.movimientoCajaId, {
  message: 'Selecciona una venta, un registro histórico o un movimiento de caja',
})

function startUtcDay(value) {
  const date = new Date(value)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function deriveCompromisoAlert(compromiso, now = new Date()) {
  if (String(compromiso?.estado || '').toUpperCase() !== 'PENDIENTE') return null
  const fecha = new Date(compromiso.fechaCompromiso)
  if (Number.isNaN(fecha.getTime())) return null
  const diasRestantes = Math.ceil((startUtcDay(fecha) - startUtcDay(now)) / 86400000)
  if (diasRestantes > 15) return null
  const umbral = diasRestantes <= 0 ? 0 : diasRestantes <= 5 ? 5 : 15
  return {
    ...compromiso,
    diasRestantes,
    umbral,
    severidad: umbral === 0 ? 'critica' : umbral === 5 ? 'alta' : 'preventiva',
  }
}

export function cartolaFingerprint(item) {
  const canonical = [
    new Date(item.fecha).toISOString(),
    Number(item.monto).toFixed(2),
    String(item.descripcion || '').trim().toLowerCase(),
    String(item.referencia || '').trim().toLowerCase(),
    String(item.banco || '').trim().toLowerCase(),
    String(item.cuenta || '').trim().toLowerCase(),
  ].join('|')
  return createHash('sha256').update(canonical).digest('hex')
}

function parsePositiveInt(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function assertTargetExists(prisma, target) {
  if (target.ordenId) {
    const orden = await prisma.orden.findUnique({ where: { id: target.ordenId }, select: { id: true } })
    if (!orden) return 'Venta no encontrada'
  }
  if (target.cobranzaHistoricoId) {
    const historico = await prisma.cobranzaHistorico.findUnique({ where: { id: target.cobranzaHistoricoId }, select: { id: true } })
    if (!historico) return 'Registro histórico no encontrado'
  }
  if (target.movimientoCajaId) {
    const movimiento = await prisma.movimientoCaja.findUnique({ where: { id: target.movimientoCajaId }, select: { id: true } })
    if (!movimiento) return 'Movimiento de caja no encontrado'
  }
  return null
}

function parseBody(schema, body, reply) {
  const parsed = schema.safeParse(body)
  if (parsed.success) return parsed.data
  reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Datos inválidos' })
  return null
}

async function attachGestionCompromisos(prisma, gestiones) {
  const ids = gestiones.map(item => item.id)
  if (!ids.length) return gestiones
  const compromisos = await prisma.cobranzaCompromisoPago.findMany({ where: { gestionId: { in: ids } } })
  const byGestion = Object.fromEntries(compromisos.map(item => [item.gestionId, item]))
  return gestiones.map(item => ({ ...item, compromiso: byGestion[item.id] || null }))
}

async function attachAlertTargets(prisma, alerts) {
  const ordenIds = [...new Set(alerts.map(item => item.ordenId).filter(Boolean))]
  const historicoIds = [...new Set(alerts.map(item => item.cobranzaHistoricoId).filter(Boolean))]
  const [ordenes, historicos] = await Promise.all([
    ordenIds.length ? prisma.orden.findMany({
      where: { id: { in: ordenIds } },
      select: { id: true, nInterno: true, clienteId: true, estadoPago: true, creadorNombre: true },
    }) : [],
    historicoIds.length ? prisma.cobranzaHistorico.findMany({
      where: { id: { in: historicoIds } },
      select: { id: true, interno: true, ndoc: true, cliente: true, rut: true, estado: true },
    }) : [],
  ])
  const ordenMap = Object.fromEntries(ordenes.map(item => [item.id, item]))
  const historicoMap = Object.fromEntries(historicos.map(item => [item.id, item]))
  return alerts.map(item => ({
    ...item,
    objetivo: item.ordenId ? ordenMap[item.ordenId] || null : historicoMap[item.cobranzaHistoricoId] || null,
  }))
}

export default async function cobranzaGestionRoutes(f) {
  const readAuth = { preHandler: [f.authenticate, f.rbac('cobranza', 'read')] }
  const writeAuth = { preHandler: [f.authenticate, f.rbac('cobranza', 'write')] }

  f.get('/gestiones', readAuth, async (request, reply) => {
    const ordenId = request.query.ordenId ? parsePositiveInt(request.query.ordenId) : null
    const cobranzaHistoricoId = request.query.cobranzaHistoricoId ? parsePositiveInt(request.query.cobranzaHistoricoId) : null
    if (request.query.ordenId && !ordenId) return reply.code(400).send({ error: 'ordenId inválido' })
    if (request.query.cobranzaHistoricoId && !cobranzaHistoricoId) return reply.code(400).send({ error: 'cobranzaHistoricoId inválido' })
    const items = await f.prisma.cobranzaGestion.findMany({
      where: { ...(ordenId ? { ordenId } : {}), ...(cobranzaHistoricoId ? { cobranzaHistoricoId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return { items: await attachGestionCompromisos(f.prisma, items) }
  })

  f.post('/gestiones', writeAuth, async (request, reply) => {
    const input = parseBody(GESTION_SCHEMA, request.body, reply)
    if (!input) return
    const targetError = await assertTargetExists(f.prisma, input)
    if (targetError) return reply.code(404).send({ error: targetError })

    const created = await f.prisma.$transaction(async tx => {
      const gestion = await tx.cobranzaGestion.create({
        data: {
          ordenId: input.ordenId || null,
          cobranzaHistoricoId: input.cobranzaHistoricoId || null,
          tipo: input.tipo,
          canal: input.canal || null,
          resultado: input.resultado || null,
          detalle: input.detalle,
          usuarioId: request.user?.id || null,
          usuarioNombre: request.user?.nombre || null,
        },
      })
      const compromiso = input.compromiso ? await tx.cobranzaCompromisoPago.create({
        data: {
          gestionId: gestion.id,
          ordenId: input.ordenId || null,
          cobranzaHistoricoId: input.cobranzaHistoricoId || null,
          fechaCompromiso: input.compromiso.fechaCompromiso,
          monto: input.compromiso.monto,
          observacion: input.compromiso.observacion || null,
          usuarioId: request.user?.id || null,
          usuarioNombre: request.user?.nombre || null,
        },
      }) : null
      return { ...gestion, compromiso }
    })
    return reply.code(201).send(created)
  })

  f.patch('/compromisos/:id', writeAuth, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID inválido' })
    const parsed = z.object({
      estado: z.enum(['PENDIENTE', 'CUMPLIDO', 'INCUMPLIDO', 'CANCELADO']),
      observacion: z.string().trim().max(1000).optional().nullable(),
    }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Datos inválidos' })
    const exists = await f.prisma.cobranzaCompromisoPago.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return reply.code(404).send({ error: 'Compromiso no encontrado' })
    return f.prisma.cobranzaCompromisoPago.update({
      where: { id },
      data: {
        estado: parsed.data.estado,
        observacion: parsed.data.observacion,
        cumplidoAt: parsed.data.estado === 'CUMPLIDO' ? new Date() : null,
      },
    })
  })

  f.get('/alertas', readAuth, async () => {
    const now = new Date()
    const limite = new Date(now)
    limite.setUTCDate(limite.getUTCDate() + 15)
    const compromisos = await f.prisma.cobranzaCompromisoPago.findMany({
      where: { estado: 'PENDIENTE', fechaCompromiso: { lte: limite } },
      orderBy: { fechaCompromiso: 'asc' },
      take: 500,
    })
    const alerts = compromisos.map(item => deriveCompromisoAlert(item, now)).filter(Boolean)
    const items = await attachAlertTargets(f.prisma, alerts)
    return {
      items,
      counts: {
        preventiva: items.filter(item => item.umbral === 15).length,
        alta: items.filter(item => item.umbral === 5).length,
        critica: items.filter(item => item.umbral === 0).length,
      },
    }
  })

  f.get('/cartola', readAuth, async (request, reply) => {
    const estado = request.query.estado ? String(request.query.estado).toUpperCase() : null
    if (estado && !['PENDIENTE', 'CONCILIADO', 'DESCARTADO'].includes(estado)) {
      return reply.code(400).send({ error: 'estado inválido' })
    }
    const items = await f.prisma.cobranzaCartolaMovimiento.findMany({
      where: estado ? { estado } : {},
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 500,
    })
    const internos = [...new Set(items.flatMap(item => {
      const matches = `${item.referencia || ''} ${item.descripcion || ''}`.match(/\b\d{3,10}\b/g) || []
      return matches.map(Number).filter(Number.isSafeInteger)
    }))]
    const ordenes = internos.length ? await f.prisma.orden.findMany({
      where: { nInterno: { in: internos } },
      select: { id: true, nInterno: true, estadoPago: true },
    }) : []
    const ordenByInterno = Object.fromEntries(ordenes.map(item => [item.nInterno, item]))
    return {
      items: items.map(item => {
        const texto = `${item.referencia || ''} ${item.descripcion || ''}`
        const nInterno = (texto.match(/\b\d{3,10}\b/g) || []).map(Number).find(value => ordenByInterno[value])
        const sugerida = nInterno ? ordenByInterno[nInterno] : null
        return {
          ...item,
          sugerencia: sugerida ? {
            ordenId: sugerida.id,
            nInterno: sugerida.nInterno,
            estadoPago: sugerida.estadoPago,
            motivo: 'N° interno detectado en cartola',
          } : null,
        }
      }),
    }
  })

  f.post('/cartola/importar', writeAuth, async (request, reply) => {
    const parsed = z.object({ movimientos: z.array(CARTOLA_ITEM_SCHEMA).min(1).max(500) }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Cartola inválida' })
    const data = parsed.data.movimientos.map(item => ({
      ...item,
      referencia: item.referencia || null,
      banco: item.banco || null,
      cuenta: item.cuenta || null,
      fingerprint: cartolaFingerprint(item),
    }))
    const result = await f.prisma.cobranzaCartolaMovimiento.createMany({ data, skipDuplicates: true })
    return reply.code(201).send({ importados: result.count, duplicados: data.length - result.count })
  })

  f.post('/cartola/:id/conciliar', writeAuth, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID inválido' })
    const input = parseBody(CONCILIAR_SCHEMA, request.body, reply)
    if (!input) return
    const targetError = await assertTargetExists(f.prisma, input)
    if (targetError) return reply.code(404).send({ error: targetError })
    const exists = await f.prisma.cobranzaCartolaMovimiento.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'Movimiento de cartola no encontrado' })
    if (exists.estado === 'CONCILIADO') return reply.code(409).send({ error: 'El movimiento ya está conciliado' })
    return f.prisma.cobranzaCartolaMovimiento.update({
      where: { id },
      data: {
        estado: 'CONCILIADO',
        ordenId: input.ordenId || null,
        cobranzaHistoricoId: input.cobranzaHistoricoId || null,
        movimientoCajaId: input.movimientoCajaId || null,
        observacion: input.observacion || null,
        conciliadoPorId: request.user?.id || null,
        conciliadoPorNombre: request.user?.nombre || null,
        conciliadoAt: new Date(),
      },
    })
  })

  f.post('/cartola/:id/descartar', writeAuth, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID inválido' })
    const exists = await f.prisma.cobranzaCartolaMovimiento.findUnique({ where: { id }, select: { id: true, estado: true } })
    if (!exists) return reply.code(404).send({ error: 'Movimiento de cartola no encontrado' })
    if (exists.estado === 'CONCILIADO') return reply.code(409).send({ error: 'No se puede descartar un movimiento conciliado' })
    const parsed = z.object({ observacion: z.string().trim().max(1000).optional().nullable() }).safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Datos inválidos' })
    return f.prisma.cobranzaCartolaMovimiento.update({
      where: { id },
      data: { estado: 'DESCARTADO', observacion: parsed.data.observacion || null },
    })
  })
}
