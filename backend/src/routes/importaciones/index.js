import { sendExport } from '../../utils/export.js'
import { parseDate, parsePagination, parsePositiveInt } from '../operational-utils.js'
import { computePrecioWeb, resolvePorcVentaSala } from '../productos/pricing.js'

const ESTADOS_VALIDOS = new Set(['En tránsito', 'En aduana', 'Recepcionado', 'Cancelado'])
const TIPOS_TRANSPORTE = new Set(['Marítimo', 'Aéreo', 'Terrestre'])

function cleanString(value) {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function parseMoney(val, fallback = 0) {
  const n = Number(val)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export default async function importacionesRoutes(fastify) {
  const { prisma } = fastify

  const readGuard = [fastify.authenticate, fastify.rbac('bodega', 'read')]
  const writeGuard = [fastify.authenticate, fastify.rbac('bodega', 'write')]

  // 1. Resumen de productos en tránsito (lookup rápido para bodega y ventas)
  fastify.get('/resumen-transito', { preHandler: readGuard }, async (request, reply) => {
    try {
      const activeItems = await prisma.importacionItem.findMany({
        where: {
          recibido: false,
          importacion: {
            estado: { in: ['En tránsito', 'En aduana'] },
          },
        },
        include: {
          importacion: {
            select: {
              id: true,
              numeroContenedor: true,
              tipoTransporte: true,
              fechaEta: true,
              estado: true,
              proveedorNombre: true,
            },
          },
          producto: {
            select: {
              id: true,
              codigoInterno: true,
              nombre: true,
              stock: true,
              stockCritico: true,
            },
          },
        },
        orderBy: {
          importacion: {
            fechaEta: 'asc',
          },
        },
      })

      // Agrupación por producto
      const porProducto = {}
      for (const item of activeItems) {
        const prodKey = item.productoId ? `prod_${item.productoId}` : `cod_${item.codigoInterno || item.nombre}`
        if (!porProducto[prodKey]) {
          porProducto[prodKey] = {
            productoId: item.productoId,
            codigoInterno: item.producto?.codigoInterno || item.codigoInterno || '-',
            nombre: item.producto?.nombre || item.nombre || 'Sin nombre',
            stockActual: item.producto?.stock || 0,
            stockCritico: item.producto?.stockCritico || 0,
            totalEnTransito: 0,
            arribos: [],
          }
        }
        const pendiente = Math.max(0, item.cantidadEsperada - item.cantidadRecibida)
        porProducto[prodKey].totalEnTransito += pendiente
        porProducto[prodKey].arribos.push({
          importacionId: item.importacionId,
          numeroContenedor: item.importacion.numeroContenedor,
          tipoTransporte: item.importacion.tipoTransporte,
          proveedor: item.importacion.proveedorNombre,
          fechaEta: item.importacion.fechaEta,
          estado: item.importacion.estado,
          cantidad: pendiente,
        })
      }

      return {
        ok: true,
        items: Object.values(porProducto),
        totalItemsEnTransito: activeItems.length,
      }
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al obtener resumen de tránsito: ' + err.message })
    }
  })

  // 2. Listado de Importaciones con KPIs
  fastify.get('/', { preHandler: readGuard }, async (request, reply) => {
    const { search, estado, tipoTransporte, proveedorId, desde, hasta } = request.query
    const { page, limit, skip } = parsePagination(request.query, { defaultLimit: 20, maxLimit: 100 }) || { page: 1, limit: 20, skip: 0 }

    const where = {}

    if (estado && estado !== 'all') {
      where.estado = estado
    }
    if (tipoTransporte && tipoTransporte !== 'all') {
      where.tipoTransporte = tipoTransporte
    }
    const parsedProvId = parsePositiveInt(proveedorId)
    if (parsedProvId) {
      where.proveedorId = parsedProvId
    }

    const dateDesde = parseDate(desde)
    const dateHasta = parseDate(hasta, true)
    if (dateDesde || dateHasta) {
      where.fechaEta = {}
      if (dateDesde) where.fechaEta.gte = dateDesde
      if (dateHasta) where.fechaEta.lte = dateHasta
    }

    if (search) {
      const term = cleanString(search)
      where.OR = [
        { numeroContenedor: { contains: term, mode: 'insensitive' } },
        { navieraAgencia: { contains: term, mode: 'insensitive' } },
        { proveedorNombre: { contains: term, mode: 'insensitive' } },
        { origen: { contains: term, mode: 'insensitive' } },
        { puertoDestino: { contains: term, mode: 'insensitive' } },
        { documentoAduana: { contains: term, mode: 'insensitive' } },
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
      const [total, items, allActive] = await Promise.all([
        prisma.importacion.count({ where }),
        prisma.importacion.findMany({
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
              select: { id: true, nombre: true, rut: true },
            },
          },
          orderBy: { fechaEta: 'asc' },
          skip,
          take: limit,
        }),
        prisma.importacion.findMany({
          where: { estado: { in: ['En tránsito', 'En aduana'] } },
          include: { items: true },
        }),
      ])

      // KPI Calculations
      const now = new Date()
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const in15Days = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)

      let unidadesEnTransito = 0
      let totalCifTransito = 0
      let proximosArribos7Dias = 0
      let proximosArribos15Dias = 0

      for (const imp of allActive) {
        totalCifTransito += Number(imp.totalCif || 0)
        for (const it of imp.items) {
          if (!it.recibido) {
            unidadesEnTransito += Math.max(0, it.cantidadEsperada - it.cantidadRecibida)
          }
        }
        if (imp.fechaEta) {
          const eta = new Date(imp.fechaEta)
          if (eta >= now && eta <= in7Days) proximosArribos7Dias++
          if (eta >= now && eta <= in15Days) proximosArribos15Dias++
        }
      }

      const totalRecepcionados = await prisma.importacion.count({ where: { estado: 'Recepcionado' } })

      return {
        items,
        total,
        page,
        limit,
        kpis: {
          contenedoresActivos: allActive.length,
          unidadesEnTransito,
          totalCifTransito,
          proximosArribos7Dias,
          proximosArribos15Dias,
          totalRecepcionados,
        },
      }
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al listar importaciones: ' + err.message })
    }
  })

  // 3. Detalle de Importación
  fastify.get('/:id', { preHandler: readGuard }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID inválido' })

    try {
      const item = await prisma.importacion.findUnique({
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
                  ubicacion: true,
                },
              },
            },
          },
          proveedor: true,
        },
      })
      if (!item) return reply.code(404).send({ error: 'Importación no encontrada' })
      return item
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al obtener detalle de importación: ' + err.message })
    }
  })

  // 4. Crear Importación
  fastify.post('/', { preHandler: writeGuard }, async (request, reply) => {
    const {
      numeroContenedor,
      tipoTransporte = 'Marítimo',
      proveedorId,
      proveedorNombre,
      origen,
      puertoDestino,
      navieraAgencia,
      fechaEmbarque,
      fechaEta,
      documentoAduana,
      costoFlete = 0,
      costoSeguro = 0,
      costoAduana = 0,
      observaciones,
      items = [],
    } = request.body || {}

    const numCont = cleanString(numeroContenedor)
    if (!numCont) {
      return reply.code(400).send({ error: 'El número de contenedor o documento de embarque es requerido' })
    }

    const tTransporte = TIPOS_TRANSPORTE.has(tipoTransporte) ? tipoTransporte : 'Marítimo'
    const parsedFlete = parseMoney(costoFlete)
    const parsedSeguro = parseMoney(costoSeguro)
    const parsedAduana = parseMoney(costoAduana)

    if (!Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({ error: 'Debe incluir al menos un producto o ítem en el contenedor' })
    }

    let itemsCostoTotal = 0
    const processedItems = items.map(it => {
      const qty = Math.max(1, Number.parseInt(it.cantidadEsperada, 10) || 1)
      const cost = parseMoney(it.costoUnitario)
      itemsCostoTotal += qty * cost
      return {
        productoId: parsePositiveInt(it.productoId),
        codigoInterno: cleanString(it.codigoInterno) || null,
        nombre: cleanString(it.nombre) || 'Producto sin nombre',
        cantidadEsperada: qty,
        cantidadRecibida: 0,
        costoUnitario: cost,
        recibido: false,
      }
    })

    const totalCif = itemsCostoTotal + parsedFlete + parsedSeguro + parsedAduana

    try {
      const created = await prisma.importacion.create({
        data: {
          numeroContenedor: numCont,
          tipoTransporte: tTransporte,
          proveedorId: parsePositiveInt(proveedorId),
          proveedorNombre: cleanString(proveedorNombre) || null,
          origen: cleanString(origen) || null,
          puertoDestino: cleanString(puertoDestino) || null,
          navieraAgencia: cleanString(navieraAgencia) || null,
          fechaEmbarque: parseDate(fechaEmbarque),
          fechaEta: parseDate(fechaEta),
          estado: 'En tránsito',
          documentoAduana: cleanString(documentoAduana) || null,
          costoFlete: parsedFlete,
          costoSeguro: parsedSeguro,
          costoAduana: parsedAduana,
          totalCif,
          observaciones: cleanString(observaciones) || null,
          usuarioId: request.user?.id || null,
          usuarioNombre: request.user?.nombre || request.user?.email || 'Usuario',
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
      return reply.code(500).send({ error: 'Error al crear importación: ' + err.message })
    }
  })

  // 5. Modificar Importación
  fastify.put('/:id', { preHandler: writeGuard }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID inválido' })

    const existing = await prisma.importacion.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!existing) return reply.code(404).send({ error: 'Importación no encontrada' })
    if (existing.estado === 'Recepcionado') {
      return reply.code(400).send({ error: 'No se puede modificar una importación que ya fue recepcionada en stock' })
    }

    const {
      numeroContenedor,
      tipoTransporte,
      proveedorId,
      proveedorNombre,
      origen,
      puertoDestino,
      navieraAgencia,
      fechaEmbarque,
      fechaEta,
      estado,
      documentoAduana,
      costoFlete,
      costoSeguro,
      costoAduana,
      observaciones,
      items,
    } = request.body || {}

    const data = {}
    if (numeroContenedor !== undefined) data.numeroContenedor = cleanString(numeroContenedor)
    if (tipoTransporte !== undefined && TIPOS_TRANSPORTE.has(tipoTransporte)) data.tipoTransporte = tipoTransporte
    if (proveedorId !== undefined) data.proveedorId = parsePositiveInt(proveedorId)
    if (proveedorNombre !== undefined) data.proveedorNombre = cleanString(proveedorNombre) || null
    if (origen !== undefined) data.origen = cleanString(origen) || null
    if (puertoDestino !== undefined) data.puertoDestino = cleanString(puertoDestino) || null
    if (navieraAgencia !== undefined) data.navieraAgencia = cleanString(navieraAgencia) || null
    if (fechaEmbarque !== undefined) data.fechaEmbarque = parseDate(fechaEmbarque)
    if (fechaEta !== undefined) data.fechaEta = parseDate(fechaEta)
    if (estado !== undefined && ESTADOS_VALIDOS.has(estado) && estado !== 'Recepcionado') data.estado = estado
    if (documentoAduana !== undefined) data.documentoAduana = cleanString(documentoAduana) || null
    if (costoFlete !== undefined) data.costoFlete = parseMoney(costoFlete)
    if (costoSeguro !== undefined) data.costoSeguro = parseMoney(costoSeguro)
    if (costoAduana !== undefined) data.costoAduana = parseMoney(costoAduana)
    if (observaciones !== undefined) data.observaciones = cleanString(observaciones) || null

    try {
      const updated = await prisma.$transaction(async (tx) => {
        if (Array.isArray(items) && items.length > 0) {
          await tx.importacionItem.deleteMany({ where: { importacionId: id } })
          const processedItems = items.map(it => ({
            importacionId: id,
            productoId: parsePositiveInt(it.productoId),
            codigoInterno: cleanString(it.codigoInterno) || null,
            nombre: cleanString(it.nombre) || 'Producto sin nombre',
            cantidadEsperada: Math.max(1, Number.parseInt(it.cantidadEsperada, 10) || 1),
            cantidadRecibida: 0,
            costoUnitario: parseMoney(it.costoUnitario),
            recibido: false,
          }))
          await tx.importacionItem.createMany({ data: processedItems })

          const itemsCostoTotal = processedItems.reduce((acc, it) => acc + (it.cantidadEsperada * it.costoUnitario), 0)
          const flete = data.costoFlete !== undefined ? data.costoFlete : existing.costoFlete
          const seguro = data.costoSeguro !== undefined ? data.costoSeguro : existing.costoSeguro
          const aduana = data.costoAduana !== undefined ? data.costoAduana : existing.costoAduana
          data.totalCif = itemsCostoTotal + flete + seguro + aduana
        }

        return tx.importacion.update({
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
      return reply.code(500).send({ error: 'Error al actualizar importación: ' + err.message })
    }
  })

  // 6. Eliminar Importación
  fastify.delete('/:id', { preHandler: writeGuard }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID inválido' })

    const existing = await prisma.importacion.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Importación no encontrada' })
    if (existing.estado === 'Recepcionado') {
      return reply.code(400).send({ error: 'No se puede eliminar una importación ya inyectada al stock de inventario' })
    }

    try {
      await prisma.importacion.delete({ where: { id } })
      return { ok: true, message: 'Importación eliminada correctamente' }
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al eliminar importación: ' + err.message })
    }
  })

  // 7. SUMAR AL STOCK (Recepción Física del Contenedor en Bodega)
  fastify.post('/:id/sumar-stock', { preHandler: writeGuard }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID inválido' })

    const importacion = await prisma.importacion.findUnique({
      where: { id },
      include: {
        items: true,
        proveedor: true,
      },
    })
    if (!importacion) return reply.code(404).send({ error: 'Importación no encontrada' })
    if (importacion.estado === 'Recepcionado') {
      return reply.code(400).send({ error: 'Este contenedor ya fue recepcionado y sumado al inventario previamente' })
    }

    const { cantidadesRecibidas = {}, bodegaDestino = 'Inventario' } = request.body || {}
    const userId = request.user?.id || 1
    const usuarioNombre = request.user?.nombre || request.user?.email || 'Bodega'

    try {
      const result = await prisma.$transaction(async (tx) => {
        const itemsActualizados = []

        for (const item of importacion.items) {
          // Cantidad a inyectar: la enviada en el body o la esperada
          const qty = cantidadesRecibidas[item.id] !== undefined
            ? Math.max(0, Number.parseInt(cantidadesRecibidas[item.id], 10) || 0)
            : item.cantidadEsperada

          let productoCreado = false
          let producto = null

          if (qty > 0) {
            if (item.productoId) {
              producto = await tx.producto.findUnique({ where: { id: item.productoId } })
            } else if (item.codigoInterno) {
              producto = await tx.producto.findUnique({ where: { codigoInterno: item.codigoInterno } })
            }

            if (!producto) {
              // Ítem de importación sin producto existente en catálogo: se crea
              // automáticamente para no perder la recepción silenciosamente.
              const codigoInterno = item.codigoInterno || `IMP-${importacion.numeroContenedor || importacion.id}-${item.id}`
              producto = await tx.producto.create({
                data: {
                  codigoInterno,
                  nombre: item.nombre || codigoInterno,
                  proveedor: importacion.proveedor?.nombre || null,
                  proveedorId: importacion.proveedorId || null,
                  precioLista: item.costoUnitario || 0,
                  stock: 0,
                },
              })
              productoCreado = true
            }

            if (producto) {
              // 1. Increment stock on Producto
              await tx.producto.update({
                where: { id: producto.id },
                data: {
                  stock: { increment: qty },
                },
              })

              // 2. Record MovimientoBodega
              await tx.movimientoBodega.create({
                data: {
                  productoId: producto.id,
                  tipo: 'INGRESO',
                  cantidad: qty,
                  motivo: `Recepción importación contenedor ${importacion.numeroContenedor} (${importacion.tipoTransporte})`,
                  origenTipo: 'importacion',
                  origenId: importacion.id,
                  userId,
                },
              })

              // 3. Update ProductoProveedor if provider exists
              if (importacion.proveedorId) {
                await tx.productoProveedor.upsert({
                  where: {
                    productoId_proveedorId: {
                      productoId: producto.id,
                      proveedorId: importacion.proveedorId,
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
                    proveedorId: importacion.proveedorId,
                    cantidad: qty,
                    costo: item.costoUnitario || 0,
                    ultimaCompra: new Date(),
                    activo: true,
                  },
                })
              }

              // 4. Precio web del producto recien creado (derivado costo + % proveedor)
              if (productoCreado) {
                const pct = await resolvePorcVentaSala(tx, producto)
                await tx.producto.update({
                  where: { id: producto.id },
                  data: { precioWeb: computePrecioWeb(producto.precioLista, pct) },
                })
              }
            }
          }

          // 5. Update importacion item
          await tx.importacionItem.update({
            where: { id: item.id },
            data: {
              recibido: true,
              cantidadRecibida: qty,
              productoId: producto ? producto.id : item.productoId,
            },
          })

          itemsActualizados.push({
            id: item.id,
            productoId: producto ? producto.id : item.productoId,
            codigoInterno: producto ? producto.codigoInterno : item.codigoInterno,
            nombre: item.nombre,
            cantidadEsperada: item.cantidadEsperada,
            cantidadRecibida: qty,
            productoCreado,
          })
        }

        // 6. Update importacion status to Recepcionado
        const updatedImportacion = await tx.importacion.update({
          where: { id },
          data: {
            estado: 'Recepcionado',
            fechaRecepcion: new Date(),
          },
          include: {
            items: true,
            proveedor: true,
          },
        })

        return {
          importacion: updatedImportacion,
          itemsIngresados: itemsActualizados,
        }
      })

      return reply.send({
        ok: true,
        message: `Contenedor ${importacion.numeroContenedor} inyectado exitosamente al stock de bodega`,
        data: result,
      })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al inyectar importación al stock: ' + err.message })
    }
  })

  // 8. Exportar Importaciones a CSV/Excel
  fastify.get('/export', { preHandler: readGuard }, async (request, reply) => {
    try {
      const items = await prisma.importacion.findMany({
        include: {
          items: true,
          proveedor: true,
        },
        orderBy: { fechaEta: 'asc' },
      })

      const rows = []
      for (const imp of items) {
        for (const it of imp.items) {
          rows.push({
            'N° Contenedor / Tracking': imp.numeroContenedor,
            'Tipo Transporte': imp.tipoTransporte,
            'Estado': imp.estado,
            'Proveedor / Embarcador': imp.proveedorNombre || imp.proveedor?.nombre || '-',
            'Origen': imp.origen || '-',
            'Puerto / Destino': imp.puertoDestino || '-',
            'Naviera / Agencia': imp.navieraAgencia || '-',
            'Fecha ETD (Embarque)': imp.fechaEmbarque ? new Date(imp.fechaEmbarque).toISOString().slice(0, 10) : '-',
            'Fecha ETA (Arribo)': imp.fechaEta ? new Date(imp.fechaEta).toISOString().slice(0, 10) : '-',
            'Fecha Recepción': imp.fechaRecepcion ? new Date(imp.fechaRecepcion).toISOString().slice(0, 10) : '-',
            'Código Producto': it.codigoInterno || '-',
            'Nombre Producto': it.nombre || '-',
            'Cantidad Esperada': it.cantidadEsperada,
            'Cantidad Recibida': it.cantidadRecibida,
            'Costo Unitario (CIF)': it.costoUnitario,
            'Subtotal FOB/CIF': it.cantidadEsperada * it.costoUnitario,
            'Doc Aduana': imp.documentoAduana || '-',
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
        nombre: `importaciones_${new Date().toISOString().slice(0, 10)}`,
        rows,
        columns,
      })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Error al exportar importaciones: ' + err.message })
    }
  })
}
