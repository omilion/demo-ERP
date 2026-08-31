import { sendExport } from '../../utils/export.js'
import { parseDate, parsePagination, parsePositiveInt } from '../operational-utils.js'
import { calcularSugerenciasOC } from './sugerencias.js'

const ESTADOS_VALIDOS = new Set([
  'Borrador',
  'Pendiente Aprobación',
  'Aprobada por Gerencia',
  'Rechazada',
  'Enviada a Proveedor',
  'Recepcionada Parcial',
  'Completada',
  'Cancelada',
])

// Estados que solo se alcanzan vía los endpoints de flujo dedicados
// (/aprobar, /rechazar, /enviar, /recepcionar), nunca por PUT directo,
// para no saltarse el sello de aprobador/fecha ni el movimiento de stock real.
const ESTADOS_EDITABLES_DIRECTO = new Set(['Borrador', 'Pendiente Aprobación', 'Cancelada'])

function cleanString(value) {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function parseMoney(val, fallback = 0) {
  const n = Number(val)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

async function generarNumeroOC(prisma) {
  const year = new Date().getFullYear()
  const prefix = `OCP-${year}-`

  const last = await prisma.ordenCompraProveedor.findFirst({
    where: {
      numeroOc: { startsWith: prefix },
    },
    orderBy: { id: 'desc' },
    select: { numeroOc: true },
  })

  let nextSeq = 1
  if (last?.numeroOc) {
    const parts = last.numeroOc.split('-')
    const lastSeq = Number.parseInt(parts[parts.length - 1], 10)
    if (Number.isInteger(lastSeq) && lastSeq > 0) {
      nextSeq = lastSeq + 1
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

export default async function ordenesCompraProveedoresRoutes(fastify) {
  const { prisma } = fastify

  const readGuard = [fastify.authenticate, fastify.rbac('bodega', 'read')]
  const writeGuard = [fastify.authenticate, fastify.rbac('bodega', 'write')]
  // Aprobar/rechazar es una decisión gerencial: solo admin la tiene hoy
  // (ningún rol de PERMISSIONS tiene 'delete' sobre 'bodega' salvo el '*' de admin).
  const gerenciaGuard = [fastify.authenticate, fastify.rbac('bodega', 'delete')]

  // 1. Motor de Sugerencias de OC basado en ventas diarias vs stock
  fastify.get('/sugerencias', { preHandler: readGuard }, async (request, reply) => {
    try {
      const result = await calcularSugerenciasOC(prisma, request.query)
      return result
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al calcular sugerencias de compra: ' + err.message })
    }
  })

  // 2. Listado de Órdenes de Compra a Proveedores
  fastify.get('/', { preHandler: readGuard }, async (request, reply) => {
    const { search, estado, proveedorId, desde, hasta } = request.query
    const { page, limit, skip } = parsePagination(request.query, { defaultLimit: 20, maxLimit: 100 }) || { page: 1, limit: 20, skip: 0 }

    const where = {}

    if (estado && estado !== 'all') {
      where.estado = estado
    }
    const provId = parsePositiveInt(proveedorId)
    if (provId) {
      where.proveedorId = provId
    }

    const dateDesde = parseDate(desde)
    const dateHasta = parseDate(hasta, true)
    if (dateDesde || dateHasta) {
      where.fechaEmision = {}
      if (dateDesde) where.fechaEmision.gte = dateDesde
      if (dateHasta) where.fechaEmision.lte = dateHasta
    }

    if (search) {
      const term = cleanString(search)
      where.OR = [
        { numeroOc: { contains: term, mode: 'insensitive' } },
        { proveedorNombre: { contains: term, mode: 'insensitive' } },
        { proveedorRut: { contains: term, mode: 'insensitive' } },
        { creadorNombre: { contains: term, mode: 'insensitive' } },
        { aprobadorNombre: { contains: term, mode: 'insensitive' } },
        { observaciones: { contains: term, mode: 'insensitive' } },
        {
          items: {
            some: {
              OR: [
                { codigoInterno: { contains: term, mode: 'insensitive' } },
                { nombre: { contains: term, mode: 'insensitive' } },
              ],
            },
          },
        },
      ]
    }

    try {
      const [total, items, kpiSummary] = await Promise.all([
        prisma.ordenCompraProveedor.count({ where }),
        prisma.ordenCompraProveedor.findMany({
          where,
          include: {
            items: {
              include: {
                producto: {
                  select: { id: true, codigoInterno: true, nombre: true, stock: true },
                },
              },
            },
            proveedor: {
              select: { id: true, nombre: true, rut: true, email: true, telefono: true },
            },
          },
          orderBy: { fechaEmision: 'desc' },
          skip,
          take: limit,
        }),
        prisma.ordenCompraProveedor.groupBy({
          by: ['estado'],
          _count: { id: true },
          _sum: { total: true },
        }),
      ])

      const kpis = {
        totalBorradores: 0,
        totalPendientes: 0,
        totalAprobadas: 0,
        totalEnviadas: 0,
        totalCompletadas: 0,
        montoTotalAprobado: 0,
      }

      for (const k of kpiSummary) {
        if (k.estado === 'Borrador') kpis.totalBorradores += k._count.id
        if (k.estado === 'Pendiente Aprobación') kpis.totalPendientes += k._count.id
        if (k.estado === 'Aprobada por Gerencia') {
          kpis.totalAprobadas += k._count.id
          kpis.montoTotalAprobado += Number(k._sum.total || 0)
        }
        if (k.estado === 'Enviada a Proveedor') {
          kpis.totalEnviadas += k._count.id
          kpis.montoTotalAprobado += Number(k._sum.total || 0)
        }
        if (k.estado === 'Completada') {
          kpis.totalCompletadas += k._count.id
        }
      }

      return {
        items,
        total,
        page,
        limit,
        kpis,
      }
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al listar órdenes de compra: ' + err.message })
    }
  })

  // 3. Detalle de Orden de Compra
  fastify.get('/:id', { preHandler: readGuard }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID inválido' })

    try {
      const oc = await prisma.ordenCompraProveedor.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              producto: {
                select: {
                  id: true,
                  codigoInterno: true,
                  nombre: true,
                  stock: true,
                  stockCritico: true,
                  unidadMedida: true,
                },
              },
            },
          },
          proveedor: true,
        },
      })
      if (!oc) return reply.code(404).send({ error: 'Orden de compra no encontrada' })
      return oc
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al obtener orden de compra: ' + err.message })
    }
  })

  // 4. Crear Orden de Compra (desde sugerencia o manual)
  fastify.post('/', { preHandler: writeGuard }, async (request, reply) => {
    const {
      proveedorId,
      proveedorNombre,
      proveedorRut,
      proveedorEmail,
      proveedorContacto,
      fechaRequerida,
      fechaRangoVentasDesde,
      fechaRangoVentasHasta,
      estado = 'Borrador',
      moneda = 'CLP',
      condicionPago,
      observaciones,
      items = [],
    } = request.body || {}

    const provId = parsePositiveInt(proveedorId)
    if (!provId) {
      return reply.code(400).send({ error: 'Debe seleccionar un proveedor válido' })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({ error: 'Debe incluir al menos un producto en la orden de compra' })
    }

    const prov = await prisma.proveedor.findUnique({ where: { id: provId } })
    if (!prov) return reply.code(404).send({ error: 'Proveedor no encontrado' })

    const numeroOc = await generarNumeroOC(prisma)

    let subtotalNeto = 0
    const processedItems = items.map(it => {
      const qty = Math.max(1, Number.parseInt(it.cantidadPedida, 10) || 1)
      const cost = parseMoney(it.costoUnitario)
      const lineSubtotal = qty * cost
      subtotalNeto += lineSubtotal

      return {
        productoId: parsePositiveInt(it.productoId),
        codigoInterno: cleanString(it.codigoInterno) || null,
        nombre: cleanString(it.nombre) || 'Producto',
        cantidadPedida: qty,
        cantidadRecepcionada: 0,
        costoUnitario: cost,
        subtotal: lineSubtotal,
        ventasPeriodo: Number.parseInt(it.ventasPeriodo, 10) || 0,
        stockActual: Number.parseInt(it.stockActual, 10) || 0,
        stockCritico: Number.parseInt(it.stockCritico, 10) || 0,
        enTransito: Number.parseInt(it.enTransito, 10) || 0,
      }
    })

    const iva = Math.round(subtotalNeto * 0.19)
    const total = subtotalNeto + iva

    const estadoInicial = ESTADOS_VALIDOS.has(estado) ? estado : 'Borrador'

    try {
      const created = await prisma.ordenCompraProveedor.create({
        data: {
          numeroOc,
          proveedorId: provId,
          proveedorNombre: cleanString(proveedorNombre) || prov.nombre,
          proveedorRut: cleanString(proveedorRut) || prov.rut,
          proveedorEmail: cleanString(proveedorEmail) || prov.email,
          proveedorContacto: cleanString(proveedorContacto) || null,
          fechaEmision: new Date(),
          fechaRequerida: parseDate(fechaRequerida),
          fechaRangoVentasDesde: parseDate(fechaRangoVentasDesde),
          fechaRangoVentasHasta: parseDate(fechaRangoVentasHasta),
          estado: estadoInicial,
          subtotalNeto,
          iva,
          total,
          moneda: moneda === 'USD' ? 'USD' : 'CLP',
          condicionPago: cleanString(condicionPago) || prov.pagoFactura || null,
          observaciones: cleanString(observaciones) || null,
          creadorId: request.user?.id || null,
          creadorNombre: request.user?.nombre || request.user?.email || 'Usuario',
          items: {
            create: processedItems,
          },
        },
        include: {
          items: true,
          proveedor: true,
        },
      })

      return reply.code(201).send(created)
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al crear orden de compra: ' + err.message })
    }
  })

  // 5. Actualizar Orden de Compra
  fastify.put('/:id', { preHandler: writeGuard }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID inválido' })

    const existing = await prisma.ordenCompraProveedor.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!existing) return reply.code(404).send({ error: 'Orden de compra no encontrada' })

    if (['Completada', 'Cancelada'].includes(existing.estado)) {
      return reply.code(400).send({ error: `No se puede modificar una orden en estado ${existing.estado}` })
    }

    const {
      proveedorEmail,
      proveedorContacto,
      fechaRequerida,
      condicionPago,
      observaciones,
      items,
      estado,
    } = request.body || {}

    const data = {}
    if (proveedorEmail !== undefined) data.proveedorEmail = cleanString(proveedorEmail) || null
    if (proveedorContacto !== undefined) data.proveedorContacto = cleanString(proveedorContacto) || null
    if (fechaRequerida !== undefined) data.fechaRequerida = parseDate(fechaRequerida)
    if (condicionPago !== undefined) data.condicionPago = cleanString(condicionPago) || null
    if (observaciones !== undefined) data.observaciones = cleanString(observaciones) || null
    if (estado !== undefined && ESTADOS_EDITABLES_DIRECTO.has(estado)) data.estado = estado

    try {
      const updated = await prisma.$transaction(async (tx) => {
        if (Array.isArray(items) && items.length > 0) {
          await tx.ordenCompraProveedorItem.deleteMany({ where: { ordenCompraProveedorId: id } })
          let subtotalNeto = 0
          const processedItems = items.map(it => {
            const qty = Math.max(1, Number.parseInt(it.cantidadPedida, 10) || 1)
            const cost = parseMoney(it.costoUnitario)
            const lineSubtotal = qty * cost
            subtotalNeto += lineSubtotal
            return {
              ordenCompraProveedorId: id,
              productoId: parsePositiveInt(it.productoId),
              codigoInterno: cleanString(it.codigoInterno) || null,
              nombre: cleanString(it.nombre) || 'Producto',
              cantidadPedida: qty,
              cantidadRecepcionada: Number.parseInt(it.cantidadRecepcionada, 10) || 0,
              costoUnitario: cost,
              subtotal: lineSubtotal,
              ventasPeriodo: Number.parseInt(it.ventasPeriodo, 10) || 0,
              stockActual: Number.parseInt(it.stockActual, 10) || 0,
              stockCritico: Number.parseInt(it.stockCritico, 10) || 0,
              enTransito: Number.parseInt(it.enTransito, 10) || 0,
            }
          })
          await tx.ordenCompraProveedorItem.createMany({ data: processedItems })

          data.subtotalNeto = subtotalNeto
          data.iva = Math.round(subtotalNeto * 0.19)
          data.total = subtotalNeto + data.iva
        }

        return tx.ordenCompraProveedor.update({
          where: { id },
          data,
          include: {
            items: true,
            proveedor: true,
          },
        })
      })

      return updated
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al actualizar orden de compra: ' + err.message })
    }
  })

  // 6. APROBACIÓN POR GERENCIA
  fastify.post('/:id/aprobar', { preHandler: gerenciaGuard }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID inválido' })

    const oc = await prisma.ordenCompraProveedor.findUnique({ where: { id } })
    if (!oc) return reply.code(404).send({ error: 'Orden de compra no encontrada' })

    if (oc.estado === 'Aprobada por Gerencia' || oc.estado === 'Enviada a Proveedor') {
      return reply.code(400).send({ error: 'La orden de compra ya se encuentra aprobada' })
    }

    try {
      const updated = await prisma.ordenCompraProveedor.update({
        where: { id },
        data: {
          estado: 'Aprobada por Gerencia',
          aprobadorId: request.user?.id || null,
          aprobadorNombre: request.user?.nombre || request.user?.email || 'Gerencia',
          fechaAprobacion: new Date(),
        },
        include: {
          items: true,
          proveedor: true,
        },
      })

      return {
        ok: true,
        message: `Orden de compra ${oc.numeroOc} aprobada exitosamente por Gerencia`,
        data: updated,
      }
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al aprobar orden de compra: ' + err.message })
    }
  })

  // 7. RECHAZO POR GERENCIA
  fastify.post('/:id/rechazar', { preHandler: gerenciaGuard }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID inválido' })

    const { motivoRechazo } = request.body || {}

    try {
      const updated = await prisma.ordenCompraProveedor.update({
        where: { id },
        data: {
          estado: 'Rechazada',
          motivoRechazo: cleanString(motivoRechazo) || 'Rechazada por Gerencia',
          aprobadorId: request.user?.id || null,
          aprobadorNombre: request.user?.nombre || request.user?.email || 'Gerencia',
        },
        include: {
          items: true,
          proveedor: true,
        },
      })

      return {
        ok: true,
        message: `Orden de compra ${updated.numeroOc} rechazada`,
        data: updated,
      }
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al rechazar orden de compra: ' + err.message })
    }
  })

  // 8. ENVIAR A PROVEEDOR
  fastify.post('/:id/enviar', { preHandler: writeGuard }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID inválido' })

    try {
      const updated = await prisma.ordenCompraProveedor.update({
        where: { id },
        data: {
          estado: 'Enviada a Proveedor',
        },
        include: {
          items: true,
          proveedor: true,
        },
      })

      return {
        ok: true,
        message: `Orden de compra ${updated.numeroOc} marcada como enviada al proveedor`,
        data: updated,
      }
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al enviar orden de compra: ' + err.message })
    }
  })

  // 9. RECEPCIONAR EN BODEGA
  fastify.post('/:id/recepcionar', { preHandler: writeGuard }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID inválido' })

    const oc = await prisma.ordenCompraProveedor.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!oc) return reply.code(404).send({ error: 'Orden de compra no encontrada' })

    const { cantidadesRecibidas = {} } = request.body || {}
    const userId = request.user?.id || 1

    try {
      const result = await prisma.$transaction(async (tx) => {
        let allCompleted = true

        for (const item of oc.items) {
          const qty = cantidadesRecibidas[item.id] !== undefined
            ? Math.max(0, Number.parseInt(cantidadesRecibidas[item.id], 10) || 0)
            : Math.max(0, item.cantidadPedida - item.cantidadRecepcionada)

          const nuevaTotalRecepcionada = item.cantidadRecepcionada + qty
          if (nuevaTotalRecepcionada < item.cantidadPedida) {
            allCompleted = false
          }

          if (qty > 0) {
            let producto = null
            if (item.productoId) {
              producto = await tx.producto.findUnique({ where: { id: item.productoId } })
            } else if (item.codigoInterno) {
              producto = await tx.producto.findUnique({ where: { codigoInterno: item.codigoInterno } })
            }

            if (producto) {
              await tx.producto.update({
                where: { id: producto.id },
                data: { stock: { increment: qty } },
              })

              await tx.movimientoBodega.create({
                data: {
                  productoId: producto.id,
                  tipo: 'INGRESO',
                  cantidad: qty,
                  motivo: `Recepción Orden de Compra ${oc.numeroOc}`,
                  origenTipo: 'orden_compra_proveedor',
                  origenId: oc.id,
                  userId,
                },
              })

              if (oc.proveedorId) {
                await tx.productoProveedor.upsert({
                  where: {
                    productoId_proveedorId: {
                      productoId: producto.id,
                      proveedorId: oc.proveedorId,
                    },
                  },
                  update: {
                    cantidad: { increment: qty },
                    costo: item.costoUnitario > 0 ? item.costoUnitario : undefined,
                    ultimaCompra: new Date(),
                    activo: true,
                  },
                  create: {
                    productoId: producto.id,
                    proveedorId: oc.proveedorId,
                    cantidad: qty,
                    costo: item.costoUnitario || 0,
                    ultimaCompra: new Date(),
                    activo: true,
                  },
                })
              }
            }
          }

          await tx.ordenCompraProveedorItem.update({
            where: { id: item.id },
            data: {
              cantidadRecepcionada: nuevaTotalRecepcionada,
            },
          })
        }

        const nextEstado = allCompleted ? 'Completada' : 'Recepcionada Parcial'
        const updated = await tx.ordenCompraProveedor.update({
          where: { id },
          data: { estado: nextEstado },
          include: { items: true, proveedor: true },
        })

        return updated
      })

      return {
        ok: true,
        message: `Recepción de orden ${oc.numeroOc} registrada exitosamente en bodega`,
        data: result,
      }
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al recepcionar orden de compra: ' + err.message })
    }
  })

  // 10. Exportar a CSV/Excel
  fastify.get('/export', { preHandler: readGuard }, async (request, reply) => {
    try {
      const items = await prisma.ordenCompraProveedor.findMany({
        include: {
          items: true,
          proveedor: true,
        },
        orderBy: { fechaEmision: 'desc' },
      })

      const rows = []
      for (const oc of items) {
        for (const it of oc.items) {
          rows.push({
            'N° OC Proveedor': oc.numeroOc,
            'Estado': oc.estado,
            'Proveedor': oc.proveedorNombre || oc.proveedor?.nombre || '-',
            'RUT Proveedor': oc.proveedorRut || oc.proveedor?.rut || '-',
            'Fecha Emisión': oc.fechaEmision ? new Date(oc.fechaEmision).toISOString().slice(0, 10) : '-',
            'Fecha Requerida': oc.fechaRequerida ? new Date(oc.fechaRequerida).toISOString().slice(0, 10) : '-',
            'Aprobada Por': oc.aprobadorNombre || '-',
            'Fecha Aprobación': oc.fechaAprobacion ? new Date(oc.fechaAprobacion).toISOString().slice(0, 10) : '-',
            'Código Producto': it.codigoInterno || '-',
            'Nombre Producto': it.nombre || '-',
            'Cantidad Pedida': it.cantidadPedida,
            'Cantidad Recepcionada': it.cantidadRecepcionada,
            'Costo Unitario Net': it.costoUnitario,
            'Subtotal Neto': it.subtotal,
            'Total OC (c/IVA)': oc.total,
            'Observaciones': oc.observaciones || '-',
          })
        }
      }

      // Las filas traen la etiqueta como clave, asi que las columnas salen de
      // la primera. Antes se llamaba rowsToCsv(rows) sin columnas -que devuelve
      // cadena vacia- y sendCsv con los argumentos invertidos: el archivo salia
      // vacio y con el contenido por nombre.
      const columns = Object.keys(rows[0] || {}).map(key => ({ key, label: key }))
      return sendExport(reply, {
        archivo: request.query?.archivo,
        nombre: `ordenes_compra_proveedores_${new Date().toISOString().slice(0, 10)}`,
        rows,
        columns,
      })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al exportar órdenes de compra: ' + err.message })
    }
  })
}
