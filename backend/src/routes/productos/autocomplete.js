// G7: autocomplete productos para búsqueda rápida AJAX
export default async function autocompleteRoute(fastify) {
  fastify.get('/autocomplete', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'read')],
  }, async (request) => {
    const q = (request.query.q || '').trim()
    if (q.length < 2) return []
    const items = await fastify.prisma.producto.findMany({
      where: {
        activo: true,
        OR: [
          { codigoInterno: { contains: q, mode: 'insensitive' }},
          { nombre: { contains: q, mode: 'insensitive' } },
          { codigoBarra: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, codigoInterno: true, nombre: true, unidadMedida: true,
        stock: true, precioLista: true, bodega: true,
      },
      orderBy: { nombre: 'asc' },
      take: 20,
    })
    const canReadCosto = can(request.user?.role, 'bodega', 'read', request.user?.permisosExtra)
    return items.map(item => sanitizeProductoCosto(item, canReadCosto))
  })
}
import { can } from '../../middleware/rbac.js'
import { sanitizeProductoCosto } from './helpers.js'
