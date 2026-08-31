// Descuadres de inventario en licitaciones / paquetes consolidados: el
// vinculo de verdad de cada OrdenItem es productoId (ese es el que rebaja
// stock real). codigoInterno/nombre en OrdenItem son un SNAPSHOT que casi
// siempre coincide con el producto vinculado — salvo cuando alguien tipeo un
// codigo distinto a mano (paquete de licitacion, codigo alterado). Esta
// vista junta esos casos: lo que quedo escrito en la venta vs. el producto
// real cuyo stock efectivamente se movio.
import { sendExport } from '../../utils/export.js'
import { parseDate, parsePositiveInt } from '../operational-utils.js'

const DIA_MS = 24 * 60 * 60 * 1000
const DEFAULT_DIAS_ATRAS = 365
// El tipo "Licitacion" tiene variantes historicas por problemas de
// encoding UTF-8 doble en imports viejos (ver comisiones.js).
const TIPOS_LICITACION = ['Licitación', 'Licitacion', 'LicitaciÃ³n']

function normalizar(value) {
  return String(value ?? '').trim().toLowerCase()
}

function esLicitacion(tipo) {
  return normalizar(tipo).startsWith('licitaci')
}

async function buildMovimientosAnormales(fastify, query = {}) {
  const hasta = query.hasta ? parseDate(query.hasta, true) : new Date()
  if (query.hasta && !hasta) return { error: 'Fecha "hasta" inválida' }
  const desde = query.desde ? parseDate(query.desde) : new Date((hasta || new Date()).getTime() - DEFAULT_DIAS_ATRAS * DIA_MS)
  if (query.desde && !desde) return { error: 'Fecha "desde" inválida' }

  const soloLicitacion = ['1', 'true', 'si', 'sí'].includes(normalizar(query.soloLicitacion))
  const limit = Math.min(Math.max(parsePositiveInt(query.limit) || 50, 1), 500)
  const offset = Math.max(parsePositiveInt(query.offset) || 0, 0)

  const ordenWhere = {
    eliminada: false,
    createdAt: { gte: desde, lte: hasta },
    ...(soloLicitacion ? { tipo: { in: TIPOS_LICITACION } } : {}),
  }

  const ordenItems = await fastify.prisma.ordenItem.findMany({
    where: {
      eliminado: false,
      codigoInterno: { not: null },
      orden: ordenWhere,
    },
    select: {
      id: true, ordenId: true, productoId: true, codigoInterno: true, nombre: true, cantidad: true,
      orden: { select: { nInterno: true, tipo: true, createdAt: true, rutCliente: true, licitacion: true } },
    },
    orderBy: { id: 'desc' },
    take: 20000,
  })

  const productoIds = [...new Set(ordenItems.map(item => item.productoId))]
  const productos = productoIds.length
    ? await fastify.prisma.producto.findMany({
        where: { id: { in: productoIds } },
        select: { id: true, codigoInterno: true, nombre: true, stock: true, activo: true },
      })
    : []
  const productoMap = new Map(productos.map(p => [p.id, p]))

  const anomalias = ordenItems
    .map(item => {
      const producto = productoMap.get(item.productoId)
      if (!producto) return null
      const codigoDistinto = Boolean(normalizar(item.codigoInterno) && normalizar(item.codigoInterno) !== normalizar(producto.codigoInterno))
      const nombreDistinto = Boolean(item.nombre && normalizar(item.nombre) !== normalizar(producto.nombre))
      if (!codigoDistinto && !nombreDistinto) return null
      return {
        ordenItemId: item.id,
        ordenId: item.ordenId,
        nInterno: item.orden?.nInterno ?? null,
        tipo: item.orden?.tipo ?? null,
        fechaOrden: item.orden?.createdAt ?? null,
        rutCliente: item.orden?.rutCliente ?? null,
        licitacion: item.orden?.licitacion ?? null,
        cantidad: item.cantidad,
        codigoDeclarado: item.codigoInterno,
        nombreDeclarado: item.nombre,
        productoId: producto.id,
        codigoReal: producto.codigoInterno,
        nombreReal: producto.nombre,
        stockActual: producto.stock,
        productoActivo: producto.activo,
        motivo: codigoDistinto && nombreDistinto ? 'codigo_y_nombre' : codigoDistinto ? 'codigo' : 'nombre',
      }
    })
    .filter(Boolean)

  const total = anomalias.length
  return {
    pager: { total, limit, offset },
    resumen: {
      totalCasos: total,
      totalOrdenes: new Set(anomalias.map(a => a.ordenId)).size,
      totalLicitaciones: new Set(anomalias.filter(a => esLicitacion(a.tipo)).map(a => a.ordenId)).size,
      rangoDesde: desde,
      rangoHasta: hasta,
    },
    items: anomalias.slice(offset, offset + limit),
  }
}

export function registerMovimientosAnormalesReportRoutes(fastify) {
  const bodegaRead = fastify.rbac('bodega', 'read')

  fastify.get('/movimientos-anormales', {
    preHandler: [fastify.authenticate, bodegaRead],
  }, async (request, reply) => {
    const reporte = await buildMovimientosAnormales(fastify, request.query)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return reporte
  })

  fastify.get('/export/movimientos-anormales', {
    preHandler: [fastify.authenticate, bodegaRead],
  }, async (request, reply) => {
    const reporte = await buildMovimientosAnormales(fastify, { ...request.query, limit: '500', offset: '0' })
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return sendExport(reply, {
      archivo: request.query?.archivo,
      nombre: `movimientos_anormales_${new Date().toISOString().slice(0, 10)}`,
      rows: reporte.items,
      columns: [
      { key: 'nInterno', label: 'N Interno' },
      { key: 'fechaOrden', label: 'Fecha' },
      { key: 'tipo', label: 'Tipo venta' },
      { key: 'licitacion', label: 'Licitación' },
      { key: 'rutCliente', label: 'RUT cliente' },
      { key: 'codigoDeclarado', label: 'Código declarado (venta)' },
      { key: 'nombreDeclarado', label: 'Nombre declarado (venta)' },
      { key: 'codigoReal', label: 'Código real (producto)' },
      { key: 'nombreReal', label: 'Nombre real (producto)' },
      { key: 'cantidad', label: 'Cantidad' },
      { key: 'stockActual', label: 'Stock actual producto real' },
      { key: 'motivo', label: 'Motivo del descuadre' },
    ],
    })
  })
}
