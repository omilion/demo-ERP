import { attachCliente, attachProductos } from './helpers.js'
import { computeVentaFinancialState } from './financial.js'
import { getUserSucursalId } from '../caja/scope.js'
import { attachEstadoFlujo } from './estados-normalize.js'
import { deriveEstadoLogistico, resumenPreparacion } from '../despachos/estado-logistico.js'

function ignoreMissingLegacyColumn(error) {
  return error.code === 'P2022' ? [] : Promise.reject(error)
}

// OdtItem.estado nunca se actualiza tras la creacion (queda "pendiente" para
// siempre); el avance real por estacion de taller vive en OdtItemTaller. Sin
// esto, la venta le muestra a Ventas un item "pendiente" aunque el taller ya
// lo haya terminado en todas sus estaciones.
export function resolveOdtItemEstadoTaller(talleres = []) {
  const relevantes = talleres.filter(t => t.estado !== 'cancelado')
  return relevantes.length > 0 && relevantes.every(t => t.estado === 'listo') ? 'listo' : 'pendiente'
}

function attachEstadoTallerReal(odts) {
  return odts.map(odt => ({
    ...odt,
    items: odt.items.map(({ talleres, ...item }) => ({ ...item, estado: resolveOdtItemEstadoTaller(talleres) })),
  }))
}

export default async function getVenta(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })

    const sucursalId = getUserSucursalId(request.user)
    const o = await fastify.prisma.orden.findFirst({
      where: { id, ...(sucursalId ? { sucursalId } : {}) },
      include: { items: true, cargos: true },
    })
    if (!o) return reply.code(404).send({ error: 'Venta no encontrada' })

    const [odts, pagos, multas, despachos, guias, cobranza, cotizaciones] = await Promise.all([
      fastify.prisma.odt.findMany({
        where: { ordenId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            where: { eliminado: false },
            select: { id: true, productoId: true, estado: true, fechaListo: true, talleres: { select: { estado: true } } },
          },
        },
      }),
      fastify.prisma.movimientoCaja.findMany({ where: { ordenId: id, eliminado: false }, orderBy: { createdAt: 'desc' } }),
      fastify.prisma.multa.findMany({ where: { ordenId: id }, orderBy: { fecha: 'desc' } }),
      fastify.prisma.despacho.findMany({ where: { ordenId: id, eliminado: false }, orderBy: { fechaEntrega: 'desc' } }),
      fastify.prisma.guiaDespacho.findMany({ where: { ordenId: id, eliminado: false }, orderBy: { fechaGuia: 'desc' } }),
      fastify.prisma.cobranzaHistorico.findMany({ where: { ordenId: id }, orderBy: { fechaFactura: 'desc' } }).catch(ignoreMissingLegacyColumn),
      fastify.prisma.cotizacionLicitacion.findMany({
        where: { ordenId: id },
        select: { id: true, idLicitacion: true, estado: true, referencia: true, ordenCompra: true, rutCliente: true, fecha: true, plazo: true },
        orderBy: { fechaCreacion: 'desc' },
      }),
    ])

    const withCliente = await attachCliente(fastify, o)
    const items = await attachProductos(fastify, o.items)
    const financialState = computeVentaFinancialState(o, { movimientos: pagos, multas })
    const montoDespachoReal = despachos.reduce((sum, d) => sum + Number(d.montoEnvio || 0), 0)
    const preparacion = resumenPreparacion(items, odts)
    const estadoLogistico = deriveEstadoLogistico({ items, preparacion, despachos, guias })

    return attachEstadoFlujo({
      ...withCliente,
      ...financialState,
      items,
      odts: attachEstadoTallerReal(odts),
      pagos,
      multas,
      despachos,
      guias,
      cobranza,
      cotizaciones,
      montoDespachoReal,
      preparacion,
      estadoLogistico,
    })
  })
}
