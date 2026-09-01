import { z } from 'zod'
import { linkCrmToOrder } from '../../domain/crm/service.js'
import { computeTotal, attachCliente } from './helpers.js'
import {
  ESTADO_PAGO_VALUES,
  ESTADO_ENTREGA_VALUES,
  TIPO_VENTA_VALUES,
  normalizeEstadoEntrega,
  normalizeEstadoPago,
  normalizeTipoVenta,
} from './estados-normalize.js'
import { applyVentaStockDeltas, buildStockDeltasFromItems, isVentaDirectaStockTipo } from './stock.js'
import { validateConvenioMarcoOcForWrite } from './convenio-marco.js'
import { canApplyDescuento, requiresDescuentoPermission } from './descuentos-permissions.js'
import { validateDescuentoContraReglas } from './descuentos-guard.js'
import { assertDiscountAuthorizationForDraft } from '../descuentos/rules-engine.js'
import { autoNotifyTaller } from '../pasar-taller/service.js'
import { calculateDeliveryDate, normalizeLicitacionPlazo, normalizeMarketplace, sanitizeCommercialIdentifier } from './operational-rules.js'
import { assertTipoVentaPermitido } from './tipos-permitidos.js'


const ItemSchema = z.object({
  productoId: z.number().int(),
  cantidad: z.number().int().min(1),
  precioUnitario: z.number().min(0),
  // Overrides a nivel de item (p. ej. licitacion): no modifican el producto base.
  nombre: z.string().optional().nullable(),
  descripcion: z.string().optional().nullable(),
  codigoInterno: z.string().optional().nullable(),
})

const Schema = z.object({
  // Se repetia el catalogo a mano y sin normalizar, a diferencia de update.js:
  // crear aceptaba solo la grafia canonica mientras editar toleraba las legacy.
  tipo: z.preprocess(
    value => (value === undefined ? value : normalizeTipoVenta(value) ?? value),
    z.enum(TIPO_VENTA_VALUES),
  ).default('Normal'),
  // Venta Sala admite Consumidor Final/boleta anonima.
  clienteId: z.number().int().positive().optional().nullable(),
  clienteSucursalId: z.number().int().optional().nullable(),
  descuentoPct: z.number().min(0).max(100).default(0),
  descuentoAutorizacionId: z.number().int().positive().optional(),
  abono: z.number().min(0).default(0),
  facturado: z.number().min(0).optional(),
  guias: z.number().int().optional(),
  licitacion: z.string().optional(),
  observaciones: z.string().optional(),
  creadorNombre: z.string().optional(),
  // Misma tolerancia de grafia que en el update: los importadores legacy y los
  // reintentos del formulario pueden traer la forma masculina.
  estadoPago: z.preprocess(v => (v === undefined ? v : normalizeEstadoPago(v) ?? v), z.enum(ESTADO_PAGO_VALUES)).optional(),
  estadoEntrega: z.preprocess(v => (v === undefined ? v : normalizeEstadoEntrega(v) ?? v), z.enum(ESTADO_ENTREGA_VALUES)).optional(),
  items: z.array(ItemSchema).min(1),
  licitacionFecha: z.string().optional().nullable(),
  licitacionPlazo: z.string().optional().nullable(),
  licitacionReferencia: z.string().optional().nullable(),
  licitacionOC: z.string().optional().nullable(),
  enviosParciales: z.boolean().optional().default(false),
  montoDespacho: z.number().min(0).optional().default(0),
  fechaPlazo: z.string().optional().nullable(),
  direccionDespacho: z.string().optional().nullable(),
  contactoDespacho: z.string().optional().nullable(),
  regionDespacho: z.string().optional().nullable(),
  comunaDespacho: z.string().optional().nullable(),
  ciudadDespacho: z.string().optional().nullable(),
  direccionDespachoExtra: z.string().optional().nullable(),
  telefonoContactoDespacho: z.string().optional().nullable(),
  emailContactoDespacho: z.string().email().optional().nullable(),
  plazoEntregaDias: z.number().int().min(0).max(3650).optional().nullable(),
  plazoEntregaTipo: z.enum(['habiles', 'corridos']).optional().nullable(),
  marketplaceCanal: z.string().max(80).optional().nullable(),
  marketplaceReferencia: z.string().max(120).optional().nullable(),
  marketplaceComisionPct: z.number().min(0).max(100).optional().nullable(),
  marketplaceComisionMonto: z.number().min(0).optional().nullable(),
  // Vendedor asignado: solo lo respeta un admin; un vendedor siempre se autoasigna.
  vendedorId: z.number().int().positive().optional().nullable(),
  // Cuando la venta nace desde CRM, este vinculo es explicito: no se infiere
  // desde un folio ni crea una orden vacia al cerrar la oportunidad.
  crmId: z.number().int().positive().optional().nullable(),
})

export default async function createVenta(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    try {
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const {
      items,
      abono,
      estadoPago,
      facturado,
      descuentoAutorizacionId,
      licitacionFecha,
      licitacionPlazo,
      licitacionReferencia,
      licitacionOC,
      enviosParciales,
      montoDespacho,
      fechaPlazo,
      direccionDespacho,
      direccionDespachoExtra,
      contactoDespacho,
      telefonoContactoDespacho,
      emailContactoDespacho,
      plazoEntregaDias,
      plazoEntregaTipo,
      marketplaceCanal,
      marketplaceReferencia,
      marketplaceComisionPct,
      marketplaceComisionMonto,
      regionDespacho,
      comunaDespacho,
      ciudadDespacho,
      vendedorId,
      crmId,
      ...rest
    } = parsed.data
    if (!assertTipoVentaPermitido(reply, request.user, rest.tipo)) return
    const normalizedLicitacionPlazo = normalizeLicitacionPlazo(licitacionPlazo)
    if (normalizedLicitacionPlazo.error) return reply.code(400).send({ error: normalizedLicitacionPlazo.error })
    if (abono > 0 || facturado !== undefined || (estadoPago && estadoPago !== 'No pagada')) {
      return reply.code(400).send({ error: 'Los abonos, facturado y estado de pago se registran desde Cobranza/Caja' })
    }
    if (!descuentoAutorizacionId && requiresDescuentoPermission(rest.descuentoPct) && !canApplyDescuento(request.user)) {
      return reply.code(403).send({ error: 'No tiene permiso para aplicar descuentos' })
    }
    const esVentaSalaAnonima = rest.tipo === 'Venta Sala' && !rest.clienteId
    if (!rest.clienteId && !esVentaSalaAnonima) {
      return reply.code(400).send({ error: 'Selecciona un cliente; solo Venta Sala permite consumidor final anónimo' })
    }
    const cliente = rest.clienteId
      ? await fastify.prisma.cliente.findUnique({ where: { id: rest.clienteId }, select: { id: true, activo: true, rut: true } })
      : null
    if (rest.clienteId && !cliente) return reply.code(404).send({ error: 'Cliente no encontrado' })
    if (cliente && !cliente.activo) return reply.code(409).send({ error: 'Cliente inactivo no puede generar ventas' })
    if (rest.clienteSucursalId && !rest.clienteId) {
      return reply.code(400).send({ error: 'No se puede seleccionar una sucursal sin cliente' })
    }
    if (crmId) {
      const crm = await fastify.prisma.crmRegistro.findUnique({
        where: { id: crmId },
        select: { id: true, esHistorico: true, ordenId: true, vendedorId: true, canalVenta: true },
      })
      if (!crm) return reply.code(404).send({ error: 'Oportunidad CRM no encontrada' })
      if (crm.esHistorico) return reply.code(409).send({ error: 'No se puede crear una venta ERP desde un registro CRM historico' })
      if (crm.ordenId) return reply.code(409).send({ error: 'La oportunidad CRM ya tiene una orden vinculada' })
      if (request.user.role !== 'admin' && crm.vendedorId !== request.user.id) return reply.code(403).send({ error: 'No tienes acceso a esta oportunidad CRM' })
      // Inverso de CANAL_TO_TIPO_ORDEN. Tenia una entrada muerta -CONVENIO_MARCO
      // no es un canal del CRM, ver CRM_CANALES- y le faltaban COMPRA_AGIL y
      // PROSPECCION_DIRECTA, que si lo son: con eso, crear la venta desde una
      // oportunidad de compra agil respondia siempre 400.
      const expectedChannel = {
        'Venta Web': 'WEB',
        'Licitación': 'LICITACION',
        'Compra Ágil': 'COMPRA_AGIL',
        Normal: 'PROSPECCION_DIRECTA',
      }[rest.tipo]
      if (!expectedChannel || crm.canalVenta !== expectedChannel) return reply.code(400).send({ error: 'El tipo de venta no corresponde al canal de la oportunidad CRM' })
    }

    // Resolver vendedor asignado: solo un admin puede asignar a otro vendedor; el
    // resto (vendedor) siempre se autoasigna su propia venta.
    let vendedorAsignado = { id: request.user.id, nombre: request.user.nombre }
    if (request.user.role === 'admin' && vendedorId && vendedorId !== request.user.id) {
      const v = await fastify.prisma.user.findFirst({
        where: { id: vendedorId, activo: true, role: { in: ['vendedor', 'admin'] } },
        select: { id: true, nombre: true },
      })
      if (!v) return reply.code(400).send({ error: 'Vendedor no válido' })
      vendedorAsignado = v
    }
    if (rest.clienteSucursalId) {
      const sucursal = await fastify.prisma.clienteSucursal.findFirst({
        where: { id: rest.clienteSucursalId, clienteId: rest.clienteId, activo: true },
        select: { id: true },
      })
      if (!sucursal) return reply.code(400).send({ error: 'Sucursal no pertenece al cliente' })
    }
    const productoIds = [...new Set(items.map(item => item.productoId))]
    const productos = await fastify.prisma.producto.findMany({
      where: { id: { in: productoIds } },
      select: { id: true, nombre: true, codigoInterno: true, activo: true },
    })
    if (productos.length !== productoIds.length) return reply.code(404).send({ error: 'Producto no encontrado' })
    if (productos.some(producto => !producto.activo)) return reply.code(400).send({ error: 'Producto no existe o esta inactivo' })
    const productosById = Object.fromEntries(productos.map(p => [p.id, p]))
    const itemsData = items.map(item => ({
      productoId: item.productoId,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      // El override de nombre/descripcion/SKU solo afecta a este item de la orden (no al producto base).
      nombre: (item.nombre && item.nombre.trim()) || productosById[item.productoId]?.nombre,
      descripcion: item.descripcion && item.descripcion.trim() ? item.descripcion.trim() : undefined,
      codigoInterno: (item.codigoInterno && item.codigoInterno.trim()) || productosById[item.productoId]?.codigoInterno,
    }))
    const marketplace = normalizeMarketplace({
      tipo: rest.tipo,
      canal: marketplaceCanal,
      referencia: marketplaceReferencia,
      comisionPct: marketplaceComisionPct,
      comisionMonto: marketplaceComisionMonto,
      total: computeTotal(itemsData, rest.descuentoPct),
    })
    if (marketplace.error) return reply.code(400).send({ error: marketplace.error })
    const plazoCalculado = plazoEntregaDias !== null && plazoEntregaDias !== undefined
      ? calculateDeliveryDate({ startDate: licitacionFecha || new Date(), days: plazoEntregaDias, type: plazoEntregaTipo || 'corridos' })
      : null
    const ocLicitacion = licitacionOC ? sanitizeCommercialIdentifier(licitacionOC) : null

    let cotizacionId = null
    const orden = await fastify.prisma.$transaction(async (tx) => {
      const convenioOc = await validateConvenioMarcoOcForWrite(tx, {
        tipo: rest.tipo,
        licitacion: rest.licitacion,
      })
      if (convenioOc.error) {
        const err = new Error(convenioOc.error)
        err.statusCode = convenioOc.statusCode || 400
        throw err
      }
      let descuentoData = {}
      if (descuentoAutorizacionId) {
        const auth = await assertDiscountAuthorizationForDraft(tx, {
          autorizacionId: descuentoAutorizacionId,
          payload: {
            tipo: rest.tipo,
            clienteId: rest.clienteId,
            sucursalId: request.user?.sucursalId ?? null,
            items: itemsData,
          },
          user: request.user,
        })
        if (auth.error) {
          const err = new Error(auth.error)
          err.statusCode = auth.statusCode || 400
          throw err
        }
        descuentoData = auth.descuentoData
      } else {
        const guard = await validateDescuentoContraReglas(tx, {
          tipo: rest.tipo,
          descuentoPct: rest.descuentoPct,
          clienteId: rest.clienteId,
          sucursalId: rest.sucursalId,
          items: itemsData,
        }, request.user)
        if (guard.error) {
          const err = new Error(guard.error)
          err.statusCode = guard.statusCode || 400
          throw err
        }
      }
      const ordenData = convenioOc.applies ? { ...rest, licitacion: convenioOc.licitacion } : rest
      // Asigna el siguiente n_interno de forma segura bajo concurrencia: lock
      // advisory de transaccion (se libera solo al terminar la tx) + MAX()+1.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ventas.orden.n_interno'))`
      const maxNInterno = await tx.orden.aggregate({ _max: { nInterno: true } })
      const nInterno = (maxNInterno._max.nInterno || 0) + 1
      const created = await tx.orden.create({
        data: {
          ...ordenData,
          nInterno,
          ...descuentoData,
          enviosParciales: enviosParciales || false,
          montoDespacho: montoDespacho || 0,
          fechaPlazo: fechaPlazo ? new Date(fechaPlazo) : null,
          ...(plazoCalculado ? { fechaPlazo: plazoCalculado } : {}),
          plazoEntregaDias: plazoEntregaDias ?? null,
          plazoEntregaTipo: plazoEntregaTipo || null,
          direccionDespacho: direccionDespacho || null,
          direccionDespachoExtra: direccionDespachoExtra || null,
          contactoDespacho: contactoDespacho || null,
          telefonoContactoDespacho: telefonoContactoDespacho || null,
          emailContactoDespacho: emailContactoDespacho || null,
          ...marketplace,
          regionDespacho: regionDespacho || null,
          comunaDespacho: comunaDespacho || null,
          ciudadDespacho: ciudadDespacho || null,
          abono: 0,
          estadoPago: 'No pagada',
          userId: vendedorAsignado.id,
          sucursalId: request.user?.sucursalId ?? null,
          creadorNombre: vendedorAsignado.nombre || rest.creadorNombre || request.user.nombre,
          items: { create: itemsData },
        },
        include: { items: true },
      })
      await linkCrmToOrder(tx, created)
      if (crmId) {
        await tx.crmRegistro.update({
          where: { id: crmId },
          data: {
            ordenId: created.id,
            clienteId: rest.clienteId,
            etapaComercial: 'COTIZACION_ENVIADA',
            estado: '0',
            fechaCotizacion: new Date(),
            estadoCambiadoAt: new Date(),
          },
        })
      }

      if (rest.tipo === 'Licitación') {
        const licId = rest.licitacion || 'S/N'
        let cot = await tx.cotizacionLicitacion.findFirst({
          where: { idLicitacion: licId }
        })
        if (cot) {
          cotizacionId = cot.id
          // Actualizar cabecera y reemplazar items con los overrides del formulario.
          await tx.cotizacionLicitacionItem.deleteMany({ where: { cotizacionId: cot.id } })
          await tx.cotizacionLicitacion.update({
            where: { id: cot.id },
            data: {
              ordenId: created.id,
              // No se toca el estado ni se auto-adjudica: las cantidades
              // adjudicadas se confirman despues, item por item, segun lo que
              // el organismo licitante realmente adjudique (LicitacionDetallePage).
              fecha: licitacionFecha ? new Date(licitacionFecha) : undefined,
              plazo: normalizedLicitacionPlazo.value || undefined,
              referencia: licitacionReferencia || undefined,
              ordenCompra: ocLicitacion || undefined,
              fechaPlazo: plazoCalculado || (fechaPlazo ? new Date(fechaPlazo) : undefined),
              plazoEntregaDias: plazoEntregaDias ?? undefined,
              plazoEntregaTipo: plazoEntregaTipo || undefined,
              enviosParciales: enviosParciales || undefined,
              montoDespacho: montoDespacho || undefined,
              items: {
                create: itemsData.map(item => ({
                  codigoInterno: item.codigoInterno,
                  nombre: item.nombre,
                  descripcion: item.descripcion || null,
                  cantidad: item.cantidad,
                  cantAdjudicados: 0,
                  precio: item.precioUnitario,
                }))
              }
            }
          })
        } else {
          const nuevaCot = await tx.cotizacionLicitacion.create({
            data: {
              idLicitacion: licId,
              fecha: licitacionFecha ? new Date(licitacionFecha) : new Date(),
              rutCliente: cliente.rut || '',
              // Pendiente por defecto: se adjudica despues item por item segun
              // lo que confirme el organismo licitante (LicitacionDetallePage).
              estado: 'Pendiente',
              plazo: normalizedLicitacionPlazo.value || '',
              referencia: licitacionReferencia || '',
              ordenCompra: ocLicitacion || '',
              ordenId: created.id,
              sucursalId: created.sucursalId,
              usuario: request.user.nombre || 'Sistema',
              fechaPlazo: plazoCalculado || (fechaPlazo ? new Date(fechaPlazo) : null),
              plazoEntregaDias: plazoEntregaDias ?? null,
              plazoEntregaTipo: plazoEntregaTipo || null,
              enviosParciales: enviosParciales || false,
              montoDespacho: montoDespacho || 0,
              items: {
                create: itemsData.map(item => ({
                  codigoInterno: item.codigoInterno,
                  nombre: item.nombre,
                  descripcion: item.descripcion || null,
                  cantidad: item.cantidad,
                  cantAdjudicados: 0,
                  precio: item.precioUnitario,
                }))
              }
            }
          })
          cotizacionId = nuevaCot.id
        }
      }

      // Automatically notify/create ODT for workshop if there are transitorio items
      await autoNotifyTaller(tx, created.id, request.user, fastify.log)

      const stock = await applyVentaStockDeltas(tx, {
        deltas: isVentaDirectaStockTipo(created.tipo) ? buildStockDeltasFromItems(itemsData, 1) : new Map(),
        ordenId: created.id,
        nInterno: created.nInterno,
        tipo: created.tipo,
        userId: request.user.id,
        user: request.user,
        motivo: `Venta directa ${created.nInterno || created.id}`,
      })
      if (stock.error) {
        const err = new Error(stock.error)
        err.statusCode = stock.status || 400
        throw err
      }
      if (descuentoData.descuentoSolicitudId) {
        await tx.descuentoSolicitud.update({
          where: { id: descuentoData.descuentoSolicitudId },
          data: { estado: 'APLICADA', resueltoAt: new Date(), comentarioResolucion: `Aplicada en venta ${created.nInterno || created.id}` },
        })
      }
      return created
    })
    const withCliente = await attachCliente(fastify, orden)
    return reply.code(201).send({ ...withCliente, cotizacionId, total: computeTotal(orden.items, orden.descuentoPct, [], orden.descuentoMonto) })
    } catch (e) {
      if (e.statusCode) return reply.code(e.statusCode).send({ error: e.message })
      throw e
    }
  })
}
