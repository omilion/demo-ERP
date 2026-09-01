import { z } from 'zod'
import { resolveOrdenForWrite } from '../relation-guards.js'
import { computeVentaFinancialState, computeVentaFinancialStateFromDb, resolveEstadoPago, syncOrdenFinancialState } from '../ventas/financial.js'
import { getUserSucursalId, isMovimientoInUserSucursal, isReferencialMedioPago, withTurnoSucursalScope } from './scope.js'
import { approveCrmFromOrderPayment } from '../../domain/crm/service.js'

const MEDIOS_PAGO = [
  'Efectivo',
  'Debito',
  'Credito',
  'Débito',
  'Crédito',
  'Transferencia',
  'Cheque',
  'Cheque dia',
  'Cheque fecha',
  'Referencial',
  'Webpay',
  'Transbank',
]

const optionalPositiveInt = z.number().int().positive().optional()

const Schema = z.object({
  tipo: z.enum(['Ingreso', 'Egreso']),
  monto: z.number().positive(),
  medioPago: z.enum(MEDIOS_PAGO),
  referencia: z.string().optional(),
  ordenId: optionalPositiveInt,
  documento: z.string().optional(),
  nDoc: z.string().optional(),
  tipoDocumento: z.string().optional(),
  cuotas: optionalPositiveInt,
  pagaCon: z.number().min(0).optional(),
  nMedioPago: z.string().optional(),
  origenMedioPago: z.string().optional(),
  gastoTipoId: optionalPositiveInt,
  origenTipo: z.string().trim().min(1).optional(),
  origenId: optionalPositiveInt,
})

const PagoCobranzaSchema = z.object({
  monto: z.number().positive(),
  medioPago: z.enum(MEDIOS_PAGO).default('Efectivo'),
  referencia: z.string().optional(),
  documento: z.string().optional(),
  nDoc: z.string().optional(),
  tipoDocumento: z.string().optional(),
  cuotas: optionalPositiveInt,
  pagaCon: z.number().min(0).optional(),
  nMedioPago: z.string().optional(),
  origenMedioPago: z.string().optional(),
})

const DocumentoVentaSchema = z.object({
  monto: z.number().positive(),
  documento: z.string().trim().min(1),
  nDoc: z.string().trim().min(1),
  tipoDocumento: z.string().optional(),
  referencia: z.string().optional(),
  fecha: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
})

const CambioEstadoMovimientoSchema = z.object({
  motivo: z.string().trim().min(3),
})

function cleanText(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

async function lockReferentialDocumentKey(prisma, { documento, nDoc, sucursalId } = {}) {
  const key = [
    'caja',
    'referencial',
    sucursalId || 'global',
    String(documento || '').trim().toLowerCase(),
    String(nDoc || '').trim().toLowerCase(),
  ].join(':')
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`
}

async function validateCajaDocumentUnique(prisma, data, excludeId = null, sucursalId = null) {
  const nDoc = cleanText(data.nDoc)
  const documento = cleanText(data.documento)
  if (!nDoc || !documento || !isReferencialMedioPago(data.medioPago)) return { ok: true }
  await lockReferentialDocumentKey(prisma, { documento, nDoc, sucursalId })
  const where = {
    eliminado: false,
    nDoc: { equals: nDoc, mode: 'insensitive' },
    documento: { equals: documento, mode: 'insensitive' },
    medioPago: { equals: 'Referencial', mode: 'insensitive' },
    ...(sucursalId ? { sucursalId } : {}),
    ...(excludeId ? { id: { not: excludeId } } : {}),
  }
  const existing = await prisma.movimientoCaja.findFirst({
    where,
    select: { id: true },
  })
  if (existing) return { status: 409, error: 'Documento ya registrado en caja' }
  return { ok: true }
}

async function syncReferentialDocumentPaymentState(prisma, { documento, nDoc, sucursalId } = {}) {
  const doc = cleanText(documento)
  const number = cleanText(nDoc)
  if (!doc || !number) return

  const scopedWhere = {
    eliminado: false,
    documento: doc,
    nDoc: number,
    ...(sucursalId ? { sucursalId } : {}),
  }
  const referenciales = await prisma.movimientoCaja.findMany({
    where: {
      ...scopedWhere,
      medioPago: { equals: 'Referencial', mode: 'insensitive' },
    },
    select: { id: true, monto: true },
  })
  if (!referenciales.length) return

  const movimientos = await prisma.movimientoCaja.findMany({
    where: { ...scopedWhere, tipo: 'Ingreso', monto: { gt: 0 } },
    select: { monto: true, medioPago: true },
  })
  const totalDocumento = referenciales.reduce((sum, mov) => sum + Number(mov.monto || 0), 0)
  const totalPagado = movimientos
    .filter(mov => !isReferencialMedioPago(mov.medioPago))
    .reduce((sum, mov) => sum + Number(mov.monto || 0), 0)
  const estadoPagoDoc = totalPagado <= 0 ? 'No pagada' : totalPagado >= totalDocumento ? 'Pagada' : 'Parcial'

  await prisma.movimientoCaja.updateMany({
    where: { id: { in: referenciales.map(mov => mov.id) } },
    data: { estadoPagoDoc },
  })
}

async function validatePaymentDocumentReference(prisma, { ordenId, documento, nDoc, sucursalId, monto } = {}) {
  const referenciales = await prisma.movimientoCaja.findMany({
    where: {
      ordenId,
      eliminado: false,
      estadoDoc: 'Activa',
      medioPago: { equals: 'Referencial', mode: 'insensitive' },
      ...(sucursalId ? { sucursalId } : {}),
    },
    select: { id: true, documento: true, nDoc: true, monto: true },
  })
  const doc = cleanText(documento)
  const number = cleanText(nDoc)
  // El pago se imputa contra un documento, no contra la venta: primero se registra
  // la boleta o factura -el movimiento "referencial", que es la obligacion- y luego
  // los pagos que la van saldando, que pueden ser varios y de distinto medio. El
  // mensaje nombra ese paso previo: sin el, el cajero solo veia que no podia cobrar.
  if (!referenciales.length) {
    if (doc || number) {
      return { status: 404, error: 'Ese documento no esta registrado en la venta. Registralo primero en Cobranza y despues imputa el pago.' }
    }
    return { status: 400, error: 'Antes de cobrar hay que registrar el documento de la venta (boleta o factura) en Cobranza. El pago se imputa contra ese documento.' }
  }
  if (!doc || !number) {
    return { status: 400, error: 'Selecciona un documento referencial activo para registrar el pago' }
  }
  const referencial = referenciales.find(mov => cleanText(mov.documento) === doc && cleanText(mov.nDoc) === number)
  if (!referencial) return { status: 404, error: 'Documento referencial no encontrado para la venta' }

  const pagos = await prisma.movimientoCaja.findMany({
    where: {
      ordenId,
      eliminado: false,
      tipo: 'Ingreso',
      monto: { gt: 0 },
      documento: doc,
      nDoc: number,
      ...(sucursalId ? { sucursalId } : {}),
    },
    select: { monto: true, medioPago: true },
  })
  const totalPagado = pagos
    .filter(mov => !isReferencialMedioPago(mov.medioPago))
    .reduce((sum, mov) => sum + Number(mov.monto || 0), 0)
  const saldoDocumento = Math.max(0, Number(referencial.monto || 0) - totalPagado)
  if (Number(monto || 0) > saldoDocumento) {
    return { status: 409, error: 'El monto excede el saldo del documento referencial' }
  }
  return { ok: true }
}

export function resolveOrdenPaymentUpdate(orden, monto, financialState = null) {
  const state = financialState || computeVentaFinancialState(orden)
  const total = state.total
  const abonoActual = state.abono || 0
  const ajustesFinancieros = state.ajustesFinancieros || 0
  const saldo = state.saldo

  if (saldo <= 0) {
    return { status: 409, error: 'La venta ya esta pagada' }
  }
  if (monto > saldo) {
    return { status: 409, error: 'El monto excede el saldo pendiente' }
  }

  const abono = abonoActual + monto
  const estadoPago = resolveEstadoPago({ total, abono, ajustesFinancieros })
  return {
    total,
    saldo,
    abono,
    estadoPago,
    ajustesFinancieros,
    saldoPosterior: Math.max(0, total - abono - ajustesFinancieros),
  }
}

export function resolveOrdenPaymentReversal(orden, monto, financialState = null) {
  const state = financialState || computeVentaFinancialState(orden)
  const total = state.total
  const abonoActual = state.abono || 0
  const ajustesFinancieros = state.ajustesFinancieros || 0

  if (abonoActual < monto) {
    return { status: 409, error: 'El abono de la venta es menor al pago a reversar' }
  }

  const abono = Math.max(0, abonoActual - monto)
  const estadoPago = resolveEstadoPago({ total, abono, ajustesFinancieros })
  return { total, abono, estadoPago, ajustesFinancieros }
}

export function validateCajaMovementReversal(mov) {
  if (!mov) return { status: 404, error: 'no encontrado' }
  if (mov.eliminado) return { status: 409, error: 'Movimiento ya eliminado' }
  if (mov.turno?.estado === 'cerrado') {
    return { status: 409, error: 'No se puede eliminar movimiento de turno cerrado' }
  }
  return { ok: true }
}

export async function resolveCajaMovementTraceability(prisma, data, options = {}) {
  let ordenId = data.ordenId ?? null
  const gastoTipoId = data.gastoTipoId ?? null
  const origenTipoInput = cleanText(data.origenTipo)
  const allowedOrigenTipos = new Set(['manual', 'orden', 'gasto'])

  if (data.tipo === 'Ingreso' && gastoTipoId) {
    return { status: 400, error: 'gastoTipoId solo aplica a egresos' }
  }

  if (data.tipo === 'Ingreso' && ordenId) {
    return {
      status: 400,
      error: 'Los pagos de venta deben registrarse por cobranza',
    }
  }

  if (ordenId) {
    const resolvedOrden = await resolveOrdenForWrite(prisma, { ordenId }, { user: options.user })
    if (resolvedOrden.error) return resolvedOrden
  }

  if (gastoTipoId) {
    const gasto = await prisma.gasto.findUnique({
      where: { id: gastoTipoId },
      select: { id: true, activo: true },
    })
    if (!gasto) return { status: 404, error: 'Tipo de gasto no encontrado' }
    if (!gasto.activo) return { status: 409, error: 'Tipo de gasto inactivo' }
  }

  if (data.tipo === 'Egreso' && !ordenId && !gastoTipoId) {
    return { status: 400, error: 'gastoTipoId u ordenId requerido para egreso' }
  }

  const origenTipo = origenTipoInput || (ordenId ? 'orden' : gastoTipoId ? 'gasto' : 'manual')
  if (!allowedOrigenTipos.has(origenTipo)) {
    return { status: 400, error: 'origenTipo invalido' }
  }

  const origenId = data.origenId ?? ordenId ?? gastoTipoId ?? null

  if (origenTipo === 'manual' && (ordenId || gastoTipoId || origenId)) {
    return { status: 400, error: 'Movimiento manual no debe tener origen asociado' }
  }

  if (origenTipo === 'orden' && !ordenId) {
    return { status: 400, error: 'origenTipo orden requiere ordenId' }
  }

  if (origenTipo === 'gasto' && !gastoTipoId) {
    return { status: 400, error: 'origenTipo gasto requiere gastoTipoId' }
  }

  if (origenTipo === 'orden' && origenId !== ordenId) {
    return { status: 409, error: 'origenId no coincide con ordenId' }
  }

  if (origenTipo === 'gasto' && origenId !== gastoTipoId) {
    return { status: 409, error: 'origenId no coincide con gastoTipoId' }
  }

  return { ordenId, gastoTipoId, origenTipo, origenId }
}

export default async function movimientosRoutes(fastify) {
  fastify.post('/cobranza/orden/:id/documento', {
    preHandler: [fastify.authenticate, fastify.rbac('cobranza', 'write'), fastify.rbac('caja', 'write')],
  }, async (request, reply) => {
    const ordenId = parseInt(request.params.id, 10)
    if (isNaN(ordenId) || ordenId <= 0) return reply.code(400).send({ error: 'ID invalido' })

    const parsed = DocumentoVentaSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const d = parsed.data

    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM ventas.ordenes
          WHERE id = ${ordenId}
          FOR UPDATE
        `
        const orden = await tx.orden.findUnique({
          where: { id: ordenId },
          include: { items: true, cargos: true },
        })
        if (!orden || orden.eliminada) {
          const err = new Error('Venta no encontrada')
          err.statusCode = 404
          throw err
        }
        const userSucursalId = getUserSucursalId(request.user)
        if (userSucursalId && orden.sucursalId && orden.sucursalId !== userSucursalId) {
          const err = new Error('Venta no encontrada')
          err.statusCode = 404
          throw err
        }
        const movimientoSucursalId = orden.sucursalId ?? userSucursalId
        const uniqueDocument = await validateCajaDocumentUnique(tx, { ...d, medioPago: 'Referencial' }, null, movimientoSucursalId)
        if (uniqueDocument.error) {
          const err = new Error(uniqueDocument.error)
          err.statusCode = uniqueDocument.status
          throw err
        }

        const usuario = request.user?.nombre || request.user?.username || null
        const fecha = d.fecha ? new Date(d.fecha) : new Date()
        const movimiento = await tx.movimientoCaja.create({
          data: {
            tipo: 'Ingreso',
            monto: Math.abs(d.monto),
            medioPago: 'Referencial',
            referencia: cleanText(d.referencia) || `Documento venta ${orden.nInterno ? `N interno ${orden.nInterno}` : `#${orden.id}`}`,
            ordenId,
            sucursalId: movimientoSucursalId,
            documento: d.documento,
            nDoc: d.nDoc,
            tipoDocumento: d.tipoDocumento,
            estadoDoc: 'Activa',
            estadoPagoDoc: 'No pagada',
            origenTipo: 'orden',
            origenId: ordenId,
            usuario,
            fecha,
          },
        })
        const financialState = await syncOrdenFinancialState(tx, ordenId, {
          userMod: usuario,
          fecha,
          sucursalId: movimientoSucursalId,
        })

        return { movimiento, orden: financialState ? { ...orden, ...financialState } : orden }
      })

      return reply.code(201).send(result)
    } catch (e) {
      if (e.statusCode) return reply.code(e.statusCode).send({ error: e.message })
      throw e
    }
  })

  fastify.post('/cobranza/orden/:id/pago', {
    preHandler: [fastify.authenticate, fastify.rbac('cobranza', 'write'), fastify.rbac('caja', 'write')],
  }, async (request, reply) => {
    const ordenId = parseInt(request.params.id, 10)
    if (isNaN(ordenId) || ordenId <= 0) return reply.code(400).send({ error: 'ID invalido' })

    const parsed = PagoCobranzaSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })

    const d = parsed.data
    if (isReferencialMedioPago(d.medioPago)) {
      return reply.code(400).send({ error: 'Medio Referencial no registra abono de caja' })
    }
    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        const turnoCandidate = await tx.turno.findFirst({
          where: withTurnoSucursalScope(request.user, { estado: 'abierto' }),
          include: { caja: true },
          orderBy: { apertura: 'desc' },
        })
        if (!turnoCandidate) {
          const err = new Error('No hay turno abierto')
          err.statusCode = 400
          throw err
        }
        await tx.$queryRaw`
          SELECT id
          FROM caja.turnos
          WHERE id = ${turnoCandidate.id}
          FOR UPDATE
        `
        const turno = await tx.turno.findFirst({
          where: withTurnoSucursalScope(request.user, { id: turnoCandidate.id }),
          include: { caja: true },
        })
        if (!turno || turno.estado !== 'abierto') {
          const err = new Error('No hay turno abierto')
          err.statusCode = 400
          throw err
        }

        await tx.$queryRaw`
          SELECT id
          FROM ventas.ordenes
          WHERE id = ${ordenId}
          FOR UPDATE
        `
        const orden = await tx.orden.findUnique({
          where: { id: ordenId },
          include: { items: true, cargos: true },
        })
        if (!orden || orden.eliminada) {
          const err = new Error('Venta no encontrada')
          err.statusCode = 404
          throw err
        }
        const userSucursalId = getUserSucursalId(request.user)
        if (userSucursalId && orden.sucursalId && orden.sucursalId !== userSucursalId) {
          const err = new Error('Venta no encontrada')
          err.statusCode = 404
          throw err
        }
        const movimientoSucursalId = turno.caja?.sucursalId ?? orden.sucursalId ?? userSucursalId

        const documentReference = await validatePaymentDocumentReference(tx, {
          ordenId,
          documento: d.documento,
          nDoc: d.nDoc,
          sucursalId: movimientoSucursalId,
          monto: d.monto,
        })
        if (documentReference.error) {
          const err = new Error(documentReference.error)
          err.statusCode = documentReference.status
          throw err
        }

        const currentFinancialState = await computeVentaFinancialStateFromDb(tx, orden, { sucursalId: movimientoSucursalId })
        const paymentUpdate = resolveOrdenPaymentUpdate(orden, d.monto, currentFinancialState)
        if (paymentUpdate.error) {
          const err = new Error(paymentUpdate.error)
          err.statusCode = paymentUpdate.status
          throw err
        }

        const uniqueDocument = await validateCajaDocumentUnique(tx, d, null, movimientoSucursalId)
        if (uniqueDocument.error) {
          const err = new Error(uniqueDocument.error)
          err.statusCode = uniqueDocument.status
          throw err
        }

        const usuario = request.user?.nombre || request.user?.username || null
        const fecha = new Date()
        const applied = await tx.orden.updateMany({
          where: {
            id: ordenId,
            eliminada: false,
            abono: { lte: paymentUpdate.total - d.monto },
          },
          data: {
            abono: { increment: d.monto },
            userMod: usuario,
            fecham: fecha,
          },
        })
        if (applied.count !== 1) {
          const err = new Error('El saldo de la venta cambio; vuelve a intentar')
          err.statusCode = 409
          throw err
        }

        const ordenConAbono = await tx.orden.findUnique({
          where: { id: ordenId },
          include: { items: true, cargos: true },
        })
        const estadoPago = resolveEstadoPago({
          total: paymentUpdate.total,
          abono: ordenConAbono.abono || 0,
          ajustesFinancieros: paymentUpdate.ajustesFinancieros,
        })
        const referencia = cleanText(d.referencia)
          || `Pago venta ${orden.nInterno ? `N interno ${orden.nInterno}` : `#${orden.id}`}`
        const movimiento = await tx.movimientoCaja.create({
          data: {
            turnoId: turno.id,
            tipo: 'Ingreso',
            monto: Math.abs(d.monto),
            medioPago: d.medioPago,
            referencia,
            ordenId,
            sucursalId: movimientoSucursalId,
            documento: d.documento,
            nDoc: d.nDoc,
            tipoDocumento: d.tipoDocumento,
            estadoDoc: 'Activa',
            estadoPagoDoc: estadoPago,
            cuotas: d.cuotas,
            pagaCon: d.pagaCon,
            nMedioPago: d.nMedioPago,
            origenMedioPago: d.origenMedioPago,
            origenTipo: 'orden',
            origenId: ordenId,
            usuario,
            fecha,
          },
        })
        await syncReferentialDocumentPaymentState(tx, {
          documento: d.documento,
          nDoc: d.nDoc,
          sucursalId: movimientoSucursalId,
        })
        const financialState = await syncOrdenFinancialState(tx, ordenId, {
          userMod: usuario,
          fecha,
          sucursalId: movimientoSucursalId,
        })
        await approveCrmFromOrderPayment(tx, ordenId, {
          medioPago: d.medioPago,
          referencia,
          actor: request.user,
          now: fecha,
        })

        return {
          movimiento,
          orden: {
            ...ordenConAbono,
            estadoPago: financialState?.estadoPago || estadoPago,
            total: financialState?.total ?? paymentUpdate.total,
            saldo: financialState?.saldo ?? Math.max(0, paymentUpdate.total - (ordenConAbono.abono || 0) - paymentUpdate.ajustesFinancieros),
            ajustesFinancieros: financialState?.ajustesFinancieros ?? paymentUpdate.ajustesFinancieros,
          },
        }
      })

      return reply.code(201).send(result)
    } catch (e) {
      if (e.statusCode) return reply.code(e.statusCode).send({ error: e.message })
      throw e
    }
  })

  fastify.post('/turno/:id/movimientos', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'write')],
  }, async (request, reply) => {
    const turnoId = parseInt(request.params.id, 10)
    if (isNaN(turnoId) || turnoId <= 0) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })

    const d = parsed.data
    const traceability = await resolveCajaMovementTraceability(fastify.prisma, d, { user: request.user })
    if (traceability.error) return reply.code(traceability.status || 400).send({ error: traceability.error })

    const result = await fastify.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw`
        SELECT id
        FROM caja.turnos
        WHERE id = ${turnoId}
        FOR UPDATE
      `
      if (!lockedRows[0]) return { status: 404, payload: { error: 'Turno no encontrado' } }
      const turno = await tx.turno.findFirst({
        where: withTurnoSucursalScope(request.user, { id: turnoId }),
        include: { caja: true },
      })
      if (!turno) return { status: 404, payload: { error: 'Turno no encontrado' } }
      if (turno.estado !== 'abierto') return { status: 400, payload: { error: 'Turno cerrado' } }
      const movimientoSucursalId = turno.caja?.sucursalId ?? getUserSucursalId(request.user)

      const uniqueDocument = await validateCajaDocumentUnique(tx, d, null, movimientoSucursalId)
      if (uniqueDocument.error) return { status: uniqueDocument.status, payload: { error: uniqueDocument.error } }

      const mov = await tx.movimientoCaja.create({
        data: {
          turnoId,
          tipo: d.tipo,
          monto: d.tipo === 'Egreso' ? -Math.abs(d.monto) : Math.abs(d.monto),
          medioPago: d.medioPago,
          referencia: d.referencia,
          ordenId: traceability.ordenId,
          sucursalId: movimientoSucursalId,
          documento: d.documento,
          nDoc: d.nDoc,
          tipoDocumento: d.tipoDocumento,
          estadoDoc: 'Activa',
          cuotas: d.cuotas,
          pagaCon: d.pagaCon,
          nMedioPago: d.nMedioPago,
          origenMedioPago: d.origenMedioPago,
          gastoTipoId: traceability.gastoTipoId,
          origenTipo: traceability.origenTipo,
          origenId: traceability.origenId,
          usuario: request.user?.nombre || request.user?.username || null,
          fecha: new Date(),
        },
      })
      return { status: 201, payload: mov }
    })

    return reply.code(result.status).send(result.payload)
  })

  fastify.delete('/movimientos/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id) || id <= 0) return reply.code(400).send({ error: 'ID invalido' })
    const parsedBody = CambioEstadoMovimientoSchema.safeParse(request.body || {})
    if (!parsedBody.success) return reply.code(400).send({ error: 'motivo requerido' })

    const result = await fastify.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw`
        SELECT id
        FROM caja.movimientos_caja
        WHERE id = ${id}
        FOR UPDATE
      `
      if (!lockedRows[0]) return { status: 404, payload: { error: 'no encontrado' } }

      const mov = await tx.movimientoCaja.findUnique({
        where: { id },
        include: {
          turno: { select: { estado: true, caja: { select: { sucursalId: true } } } },
          orden: { include: { items: true, cargos: true } },
        },
      })
      if (!isMovimientoInUserSucursal(request.user, mov)) return { status: 404, payload: { error: 'no encontrado' } }
      const reversible = validateCajaMovementReversal(mov)
      if (reversible.error) return { status: reversible.status, payload: { error: reversible.error } }

      const usuario = request.user?.nombre || request.user?.username || null
      const fecha = new Date()
      const movimientoSucursalId = mov.sucursalId ?? mov.turno?.caja?.sucursalId ?? getUserSucursalId(request.user)
      const reversaPagoVenta = mov.ordenId && mov.tipo === 'Ingreso' && mov.monto > 0 && !isReferencialMedioPago(mov.medioPago)

      if (reversaPagoVenta) {
        await tx.$queryRaw`
          SELECT id
          FROM ventas.ordenes
          WHERE id = ${mov.ordenId}
          FOR UPDATE
        `
        mov.orden = await tx.orden.findUnique({
          where: { id: mov.ordenId },
          include: { items: true, cargos: true },
        })
        if (!mov.orden || mov.orden.eliminada) {
          return { status: 409, payload: { error: 'Venta asociada no encontrada para reversar pago' } }
        }

        const currentFinancialState = await computeVentaFinancialStateFromDb(tx, mov.orden, { sucursalId: movimientoSucursalId })
        const paymentReversal = resolveOrdenPaymentReversal(mov.orden, mov.monto, currentFinancialState)
        if (paymentReversal.error) return { status: paymentReversal.status, payload: { error: paymentReversal.error } }
        await tx.orden.update({
          where: { id: mov.ordenId },
          data: {
            abono: paymentReversal.abono,
            estadoPago: paymentReversal.estadoPago,
            userMod: usuario,
            fecham: fecha,
          },
        })
      }

      await tx.movimientoCaja.update({
        where: { id },
        data: { eliminado: true, estadoDoc: 'Nula', userMod: usuario, fecham: fecha },
      })
      await syncReferentialDocumentPaymentState(tx, {
        documento: mov.documento,
        nDoc: mov.nDoc,
        sucursalId: movimientoSucursalId,
      })
      if (mov.ordenId) {
        await syncOrdenFinancialState(tx, mov.ordenId, { userMod: usuario, fecha, sucursalId: movimientoSucursalId })
      }
      return { status: 204 }
    })

    if (result.status === 204) return reply.code(204).send()
    return reply.code(result.status).send(result.payload)
  })

  fastify.patch('/movimientos/:id/reactivar', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id) || id <= 0) return reply.code(400).send({ error: 'ID invalido' })
    const parsedBody = CambioEstadoMovimientoSchema.safeParse(request.body || {})
    if (!parsedBody.success) return reply.code(400).send({ error: 'motivo requerido' })

    const result = await fastify.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw`
        SELECT id
        FROM caja.movimientos_caja
        WHERE id = ${id}
        FOR UPDATE
      `
      if (!lockedRows[0]) return { status: 404, payload: { error: 'no encontrado' } }

      const mov = await tx.movimientoCaja.findUnique({
        where: { id },
        include: {
          turno: { select: { estado: true, caja: { select: { sucursalId: true } } } },
          orden: { include: { items: true, cargos: true } },
        },
      })
      if (!isMovimientoInUserSucursal(request.user, mov)) return { status: 404, payload: { error: 'no encontrado' } }
      if (!mov.eliminado) return { status: 409, payload: { error: 'Movimiento no esta anulado' } }
      if (mov.turno?.estado === 'cerrado') {
        return { status: 409, payload: { error: 'No se puede reactivar movimiento de turno cerrado' } }
      }

      const uniqueDocument = await validateCajaDocumentUnique(tx, mov, mov.id, mov.sucursalId ?? mov.turno?.caja?.sucursalId ?? getUserSucursalId(request.user))
      if (uniqueDocument.error) return { status: uniqueDocument.status, payload: { error: uniqueDocument.error } }

      const usuario = request.user?.nombre || request.user?.username || null
      const fecha = new Date()
      const movimientoSucursalId = mov.sucursalId ?? mov.turno?.caja?.sucursalId ?? getUserSucursalId(request.user)
      const reactivaPagoVenta = mov.ordenId && mov.tipo === 'Ingreso' && mov.monto > 0 && !isReferencialMedioPago(mov.medioPago)

      if (reactivaPagoVenta) {
        await tx.$queryRaw`
          SELECT id
          FROM ventas.ordenes
          WHERE id = ${mov.ordenId}
          FOR UPDATE
        `
        mov.orden = await tx.orden.findUnique({
          where: { id: mov.ordenId },
          include: { items: true, cargos: true },
        })
        if (!mov.orden || mov.orden.eliminada) {
          return { status: 409, payload: { error: 'Venta asociada no encontrada para reactivar pago' } }
        }
        const currentFinancialState = await computeVentaFinancialStateFromDb(tx, mov.orden, { sucursalId: movimientoSucursalId })
        const paymentUpdate = resolveOrdenPaymentUpdate(mov.orden, mov.monto, currentFinancialState)
        if (paymentUpdate.error) return { status: paymentUpdate.status, payload: { error: paymentUpdate.error } }
        await tx.orden.update({
          where: { id: mov.ordenId },
          data: {
            abono: paymentUpdate.abono,
            estadoPago: paymentUpdate.estadoPago,
            userMod: usuario,
            fecham: fecha,
          },
        })
      }

      const restored = await tx.movimientoCaja.update({
        where: { id },
        data: { eliminado: false, estadoDoc: 'Activa', userMod: usuario, fecham: fecha },
      })
      await syncReferentialDocumentPaymentState(tx, {
        documento: mov.documento,
        nDoc: mov.nDoc,
        sucursalId: movimientoSucursalId,
      })
      if (mov.ordenId) {
        await syncOrdenFinancialState(tx, mov.ordenId, { userMod: usuario, fecha, sucursalId: movimientoSucursalId })
      }
      return { status: 200, payload: restored }
    })

    return reply.code(result.status).send(result.payload)
  })
}
