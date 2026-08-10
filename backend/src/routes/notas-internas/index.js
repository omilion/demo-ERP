import { z } from 'zod'
import { can } from '../../middleware/rbac.js'
import { computeVentaFinancialStateFromDb, syncOrdenFinancialState } from '../ventas/financial.js'

const NotaCreate = z.object({
  ordenId: z.coerce.number().int().positive(),
  motivo: z.string().trim().min(5).max(500),
  monto: z.coerce.number().positive().optional().nullable(),
  items: z.array(z.object({
    ordenItemId: z.coerce.number().int().positive(),
    cantidad: z.coerce.number().int().positive(),
  })).min(1),
})

const NotaAnular = z.object({
  motivo: z.string().trim().min(5).max(500),
})

function userLabel(user) {
  return user?.nombre || user?.name || user?.email || `Usuario ${user?.id || ''}`.trim()
}

function canRead(user) {
  return can(user?.role, 'ventas', 'read', user?.permisosExtra) || can(user?.role, 'facturacion', 'read', user?.permisosExtra)
}

function canWrite(user) {
  return can(user?.role, 'ventas', 'write', user?.permisosExtra) || can(user?.role, 'facturacion', 'write', user?.permisosExtra)
}

function authorize(check) {
  return async (request, reply) => {
    if (!check(request.user)) return reply.code(403).send({ error: 'Forbidden' })
  }
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

async function lockOrden(tx, ordenId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nota-interna-orden:${ordenId}`})::bigint)`
}

export default async function notasInternasRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, authorize(canRead)],
  }, async (request, reply) => {
    const ordenId = Number(request.query?.ordenId)
    if (!Number.isInteger(ordenId) || ordenId <= 0) return reply.code(400).send({ error: 'ordenId invalido' })
    return fastify.prisma.notaCreditoInterna.findMany({
      where: { ordenId },
      include: { items: { include: { producto: { select: { id: true, codigoInterno: true, nombre: true } } } } },
      orderBy: { createdAt: 'desc' },
    })
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, authorize(canWrite)],
  }, async (request, reply) => {
    const parsed = NotaCreate.safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const b = parsed.data

    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        await lockOrden(tx, b.ordenId)
        const orden = await tx.orden.findUnique({
          where: { id: b.ordenId },
          include: {
            items: { where: { eliminado: false } },
            cargos: true,
            notasCreditoInternas: { where: { estado: 'activa' }, include: { items: true } },
          },
        })
        if (!orden || orden.eliminada || normalize(orden.estado) !== 'activa') {
          return { status: 409, error: 'La venta no esta activa' }
        }

        const dteEmitido = await tx.factDocumento.findFirst({
          where: {
            ordenId: b.ordenId,
            tipoDte: { in: [33, 39] },
            estado: { notIn: ['borrador', 'rechazado', 'error', 'anulado'] },
          },
          select: { id: true, tipoDte: true, folio: true },
        })
        if (dteEmitido) {
          return { status: 409, error: 'La venta ya tiene DTE emitido: corresponde emitir nota de credito SII' }
        }

        const itemMap = new Map(orden.items.map(item => [item.id, item]))
        const devueltoPorItem = new Map()
        for (const nota of orden.notasCreditoInternas) {
          for (const item of nota.items) {
            devueltoPorItem.set(item.ordenItemId, (devueltoPorItem.get(item.ordenItemId) || 0) + item.cantidad)
          }
        }

        const ids = new Set()
        const lines = []
        for (const requested of b.items) {
          if (ids.has(requested.ordenItemId)) return { status: 400, error: 'No repitas productos en la nota interna' }
          ids.add(requested.ordenItemId)
          const item = itemMap.get(requested.ordenItemId)
          if (!item) return { status: 400, error: 'Item no pertenece a la venta' }
          const disponible = Number(item.cantidad) - Number(devueltoPorItem.get(item.id) || 0)
          if (requested.cantidad > disponible) {
            return { status: 409, error: `Cantidad a devolver supera lo disponible para ${item.nombre || item.codigoInterno || item.id}` }
          }
          lines.push({
            ordenItemId: item.id,
            productoId: item.productoId,
            cantidad: requested.cantidad,
            precioUnitario: Number(item.precioUnitario || 0),
            monto: requested.cantidad * Number(item.precioUnitario || 0),
          })
        }

        const currentFinancial = await computeVentaFinancialStateFromDb(tx, orden)
        const montoCalculado = lines.reduce((sum, line) => sum + line.monto, 0)
        const monto = b.monto == null ? montoCalculado : Number(b.monto)
        if (!Number.isFinite(monto) || monto <= 0) return { status: 400, error: 'Monto invalido' }
        if (monto > currentFinancial.saldo + 0.001) {
          return { status: 409, error: 'La nota interna no puede superar el saldo pendiente de la venta' }
        }

        const productos = await tx.producto.findMany({
          where: { id: { in: [...new Set(lines.map(line => line.productoId))] } },
          select: { id: true, estadoInventario: true },
        })
        const productoMap = new Map(productos.map(producto => [producto.id, producto]))
        const nota = await tx.notaCreditoInterna.create({
          data: {
            ordenId: b.ordenId,
            monto,
            motivo: b.motivo,
            usuarioId: Number(request.user?.id) || null,
            usuarioNombre: userLabel(request.user),
          },
        })

        for (const line of lines) {
          const inventariado = normalize(productoMap.get(line.productoId)?.estadoInventario) === 'inventariado'
          await tx.notaCreditoInternaItem.create({ data: { ...line, notaId: nota.id, stockReintegrado: inventariado } })
          if (inventariado) {
            await tx.producto.update({ where: { id: line.productoId }, data: { stock: { increment: line.cantidad } } })
            await tx.movimientoBodega.create({
              data: {
                productoId: line.productoId,
                tipo: 'ingreso',
                cantidad: line.cantidad,
                motivo: `Devolucion NC interna #${nota.id}`,
                userId: Number(request.user?.id) || 1,
                ordenId: b.ordenId,
                origenTipo: 'nota_credito_interna',
                origenId: nota.id,
              },
            })
          }
        }
        const financiero = await syncOrdenFinancialState(tx, b.ordenId, { userMod: userLabel(request.user), fecha: new Date() })
        return { notaId: nota.id, financiero }
      })
      if (result?.error) return reply.code(result.status || 400).send({ error: result.error })
      const nota = await fastify.prisma.notaCreditoInterna.findUnique({
        where: { id: result.notaId },
        include: { items: { include: { producto: { select: { id: true, codigoInterno: true, nombre: true } } } } },
      })
      return reply.code(201).send({ nota, financiero: result.financiero, sii: false })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ error: 'No se pudo crear la nota de credito interna' })
    }
  })

  fastify.post('/:id/anular', {
    preHandler: [fastify.authenticate, authorize(canWrite)],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const parsed = NotaAnular.safeParse(request.body || {})
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID invalido' })
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })

    const result = await fastify.prisma.$transaction(async (tx) => {
      const existing = await tx.notaCreditoInterna.findUnique({ where: { id }, include: { items: true } })
      if (!existing) return { status: 404, error: 'Nota interna no encontrada' }
      await lockOrden(tx, existing.ordenId)
      if (existing.estado !== 'activa') return { status: 409, error: 'La nota interna ya esta anulada' }

      const stockLines = existing.items.filter(line => line.stockReintegrado)
      const productos = await tx.producto.findMany({
        where: { id: { in: [...new Set(stockLines.map(line => line.productoId))] } },
        select: { id: true, stock: true },
      })
      const stockMap = new Map(productos.map(producto => [producto.id, Number(producto.stock || 0)]))
      const required = new Map()
      for (const item of stockLines) required.set(item.productoId, (required.get(item.productoId) || 0) + item.cantidad)
      if ([...required].some(([productoId, cantidad]) => Number(stockMap.get(productoId) || 0) < cantidad)) {
        return { status: 409, error: 'No hay stock suficiente para reversar la devolucion' }
      }

      for (const item of stockLines) {
        const updated = await tx.producto.updateMany({
          where: { id: item.productoId, stock: { gte: item.cantidad } },
          data: { stock: { decrement: item.cantidad } },
        })
        if (updated.count !== 1) return { status: 409, error: 'No hay stock suficiente para reversar la devolucion' }
        await tx.movimientoBodega.create({
          data: {
            productoId: item.productoId,
            tipo: 'egreso',
            cantidad: item.cantidad,
            motivo: `Anulacion NC interna #${existing.id}`,
            userId: Number(request.user?.id) || 1,
            ordenId: existing.ordenId,
            origenTipo: 'anulacion_nota_credito_interna',
            origenId: existing.id,
          },
        })
      }
      const nota = await tx.notaCreditoInterna.update({
        where: { id },
        data: {
          estado: 'anulada',
          anuladaAt: new Date(),
          anuladaPor: userLabel(request.user),
          motivoAnulacion: parsed.data.motivo,
        },
      })
      const financiero = await syncOrdenFinancialState(tx, existing.ordenId, { userMod: userLabel(request.user), fecha: new Date() })
      return { nota, financiero }
    })
    if (result?.error) return reply.code(result.status || 400).send({ error: result.error })
    return result
  })
}
