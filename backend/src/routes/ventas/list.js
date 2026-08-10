import { attachClientes, attachProductos } from './helpers.js'
import { computeVentaFinancialState } from './financial.js'
import { parseDate, parsePagination, parsePositiveInt } from '../operational-utils.js'
import { buildOrdenScopeWhere, getPrimerRegistroInterno, mergeWhere, parseOrdenScope } from '../historico/corte.js'
import { getUserSucursalId } from '../caja/scope.js'

function normalizeTipo(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function buildTipoWhere(tipo) {
  const text = normalizeTipo(tipo)
  if (text === 'licitacion-convenio' || text === 'licitacion convenio') return { in: ['Licitación', 'Convenio Marco'] }
  if (text === 'licitacion') return 'Licitación'
  if (text === 'convenio-marco' || text === 'convenio marco' || text === 'convenio') return 'Convenio Marco'
  return tipo
}

export default async function listVentas(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const {
      estadoPago,
      estadoEntrega,
      tipo,
      search,
      orderBy: orderParam,
      clienteId,
      scope: scopeParam,
      desde,
      hasta,
      fechaDesde,
      fechaHasta,
      fechaDocDesde,
      fechaDocHasta,
      documento,
      nDoc,
      creador,
      cobranzaFiltro,
    } = request.query
    const pagination = parsePagination(request.query, { defaultLimit: 100, maxLimit: 500 })
    if (!pagination) return reply.code(400).send({ error: 'Paginacion invalida' })
    const scope = parseOrdenScope(scopeParam, 'operacional')
    if (!scope) return reply.code(400).send({ error: 'scope invalido' })

    const sucursalId = getUserSucursalId(request.user)
    let where = { eliminada: false, ...(sucursalId ? { sucursalId } : {}) }
    if (estadoPago) where.estadoPago = estadoPago
    if (estadoEntrega) where.estadoEntrega = estadoEntrega
    if (tipo) where.tipo = buildTipoWhere(tipo)
    if (desde || hasta || fechaDesde || fechaHasta) {
      const gte = parseDate(fechaDesde || desde)
      const lte = parseDate(fechaHasta || hasta, true)
      if (((fechaDesde || desde) && !gte) || ((fechaHasta || hasta) && !lte)) return reply.code(400).send({ error: 'Rango de fechas invalido' })
      where.createdAt = {}
      if (gte) where.createdAt.gte = gte
      if (lte) where.createdAt.lte = lte
    }
    if (creador) where.creadorNombre = { contains: creador, mode: 'insensitive' }
    if (cobranzaFiltro) {
      if (!['entregados_sin_factura', 'entregados_con_saldo'].includes(String(cobranzaFiltro))) {
        return reply.code(400).send({ error: 'cobranzaFiltro invalido' })
      }
      where.estadoEntrega = 'Entregada'
      if (cobranzaFiltro === 'entregados_con_saldo') where.estadoPago = { not: 'Pagada' }
      if (cobranzaFiltro === 'entregados_sin_factura') {
        const facturados = await fastify.prisma.factDocumento.findMany({
          where: {
            ordenId: { not: null },
            tipoDte: { in: [33, 39] },
            estado: { notIn: ['borrador', 'rechazado', 'error', 'anulado'] },
          },
          select: { ordenId: true },
        })
        const facturadosIds = [...new Set(facturados.map(documento => documento.ordenId).filter(Boolean))]
        if (facturadosIds.length) where = mergeWhere(where, { id: { notIn: facturadosIds } })
      }
    }
    if (clienteId) {
      const parsedClienteId = parsePositiveInt(clienteId)
      if (!parsedClienteId) return reply.code(400).send({ error: 'clienteId invalido' })
      where.clienteId = parsedClienteId
    }
    if (documento || nDoc || fechaDocDesde || fechaDocHasta) {
      const docWhere = { eliminado: false, ordenId: { not: null } }
      if (documento) docWhere.documento = { contains: documento, mode: 'insensitive' }
      if (nDoc) docWhere.nDoc = { contains: nDoc, mode: 'insensitive' }
      if (fechaDocDesde || fechaDocHasta) {
        const gte = parseDate(fechaDocDesde)
        const lte = parseDate(fechaDocHasta, true)
        if ((fechaDocDesde && !gte) || (fechaDocHasta && !lte)) return reply.code(400).send({ error: 'Rango de fechas de documento invalido' })
        docWhere.fecha = {}
        if (gte) docWhere.fecha.gte = gte
        if (lte) docWhere.fecha.lte = lte
      }
      const documentos = await fastify.prisma.movimientoCaja.findMany({
        where: docWhere,
        select: { ordenId: true },
        take: 5000,
      })
      const ids = [...new Set(documentos.map(d => d.ordenId).filter(Boolean))]
      where = mergeWhere(where, { id: ids.length ? { in: ids } : -1 })
    }
    if (search) {
      const text = search.trim()
      const isNum = /^\d+$/.test(text)
      const [clientes, documentos] = await Promise.all([
        fastify.prisma.cliente.findMany({
          where: {
            OR: [
              { nombre: { contains: text, mode: 'insensitive' } },
              { razonSocial: { contains: text, mode: 'insensitive' } },
              { rut: { contains: text, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
          take: 100,
        }),
        fastify.prisma.movimientoCaja.findMany({
          where: {
            eliminado: false,
            OR: [
              { documento: { contains: text, mode: 'insensitive' } },
              { nDoc: { contains: text, mode: 'insensitive' } },
            ],
          },
          select: { ordenId: true },
          take: 500,
        }),
      ])
      const clienteIds = clientes.map(c => c.id)
      const ordenIds = [...new Set(documentos.map(d => d.ordenId).filter(Boolean))]
      where.OR = [
        { creadorNombre: { contains: search, mode: 'insensitive' } },
        { licitacion: { contains: search, mode: 'insensitive' } },
        { observaciones: { contains: search, mode: 'insensitive' } },
        { rutCliente: { contains: search, mode: 'insensitive' } },
        { emailCliente: { contains: search, mode: 'insensitive' } },
        ...(clienteIds.length ? [{ clienteId: { in: clienteIds } }] : []),
        ...(ordenIds.length ? [{ id: { in: ordenIds } }] : []),
        ...(isNum ? [{ id: parseInt(search, 10) }, { nInterno: parseInt(search, 10) }] : []),
      ]
    }

    // Cobranza: más antiguas primero (más urgentes). Default: más recientes primero.
    const corte = await getPrimerRegistroInterno(fastify.prisma)
    where = mergeWhere(where, buildOrdenScopeWhere(scope, corte))

    const orderBy = orderParam === 'asc' ? { createdAt: 'asc' } : { createdAt: 'desc' }

    const [ordenes, total, statsOrdenes] = await Promise.all([
      fastify.prisma.orden.findMany({
        where,
        include: { items: true, cargos: true },
        orderBy,
        skip: pagination.skip,
        take: pagination.limit,
      }),
      fastify.prisma.orden.count({ where }),
      fastify.prisma.orden.findMany({
        where,
        include: { items: true, cargos: true },
      }),
    ])

    const ordenIds = [...new Set([...ordenes, ...statsOrdenes].map(o => o.id))]
    const [pagosArr, multasArr, notasInternasArr] = ordenIds.length ? await Promise.all([
      fastify.prisma.movimientoCaja.findMany({
        where: { ordenId: { in: ordenIds }, eliminado: false },
        orderBy: { createdAt: 'desc' },
      }),
      fastify.prisma.multa.findMany({
        where: { ordenId: { in: ordenIds } },
        orderBy: { fecha: 'desc' },
      }),
      fastify.prisma.notaCreditoInterna.findMany({
        where: { ordenId: { in: ordenIds }, estado: 'activa' },
      }),
    ]) : [[], [], []]
    const pagosMap = {}
    for (const pago of pagosArr) (pagosMap[pago.ordenId] ||= []).push(pago)
    const multasMap = {}
    for (const multa of multasArr) (multasMap[multa.ordenId] ||= []).push(multa)
    const notasInternasMap = {}
    for (const nota of notasInternasArr) (notasInternasMap[nota.ordenId] ||= []).push(nota)

    const withClientes = await attachClientes(fastify, ordenes)
    const enriched = await Promise.all(
      withClientes.map(async o => {
        const financialState = computeVentaFinancialState(o, {
          movimientos: pagosMap[o.id] || [],
          multas: multasMap[o.id] || [],
          notasInternas: notasInternasMap[o.id] || [],
        })
        return {
          ...o,
          ...financialState,
          items: await attachProductos(fastify, o.items),
          pagos: pagosMap[o.id] || [],
          multas: multasMap[o.id] || [],
          notasInternas: notasInternasMap[o.id] || [],
        }
      })
    )
    return {
      items: enriched,
      total,
      limit: pagination.limit,
      page: pagination.page,
      stats: statsOrdenes.reduce((acc, o) => {
        const financialState = computeVentaFinancialState(o, {
          movimientos: pagosMap[o.id] || [],
          multas: multasMap[o.id] || [],
          notasInternas: notasInternasMap[o.id] || [],
        })
        acc.montoPendiente += financialState.saldo
        if (diasDesde(o.createdAt) > 30) acc.masDe30 += 1
        if (Number(o.abono || 0) > 0) acc.conAbono += 1
        return acc
      }, { montoPendiente: 0, masDe30: 0, conAbono: 0 }),
    }
  })
}

function diasDesde(fecha) {
  if (!fecha) return 0
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
}
