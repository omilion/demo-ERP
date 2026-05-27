import { can } from '../../middleware/rbac.js'
import { computeEstado, normalizeProductoFotos, sanitizeProductoCosto } from './helpers.js'

export default async function getProducto(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const p = await fastify.prisma.producto.findFirst({
      where: { id, activo: true },
      include: { subcategoria: true },
    })
    if (!p) return reply.code(404).send({ error: 'Producto no encontrado' })
    const canReadCosto = can(request.user?.role, 'bodega', 'read', request.user?.permisosExtra)
    return sanitizeProductoCosto(normalizeProductoFotos({ ...p, estado: computeEstado(p) }), canReadCosto)
  })
}
