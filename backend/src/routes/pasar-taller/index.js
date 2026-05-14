// Pasar producto a taller: crea OdtItem y adjudica a un Taller (espumas/confecciones/madera/etc)

export default async function pasarTallerRoutes(fastify) {
  // GET /api/pasar-taller/transitorios?userId= (productos pendientes de enviar)
  // Para simplificar, se almacena temporalmente como OdtItem con odtId=null hasta confirmar.
  // Aquí: lista directa desde body en flow stateless.

  // POST /api/pasar-taller/enviar  body: { odtId, items: [{codigoInterno, nombre, cantidad, descripcion, tallerId, prioridad, obs}] }
  fastify.post('/enviar', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const { odtId, items } = request.body || {}
    if (!odtId || !Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({ error: 'odtId e items requeridos' })
    }
    const odtIdInt = parseInt(odtId, 10)
    const odt = await fastify.prisma.odt.findUnique({ where: { id: odtIdInt } })
    if (!odt) return reply.code(404).send({ error: 'ODT no encontrada' })

    const created = []
    for (const it of items) {
      const odtItem = await fastify.prisma.odtItem.create({
        data: {
          odtId: odtIdInt,
          codigoInterno: it.codigoInterno || null,
          nombre: it.nombre || null,
          descripcion: it.descripcion || null,
          cantidad: parseFloat(it.cantidad) || 1,
          precio: parseFloat(it.precio) || 0,
          obs: it.obs || null,
          prioridad: it.prioridad || 'normal',
        },
      })
      if (it.tallerId) {
        await fastify.prisma.odtItemTaller.create({
          data: {
            itemId: odtItem.id,
            tallerId: parseInt(it.tallerId, 10),
            estado: 'Pendiente',
          },
        })
      }
      created.push(odtItem)
    }
    return { ok: true, created }
  })

  // GET /api/pasar-taller/talleres
  fastify.get('/talleres', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async () => fastify.prisma.taller.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }))

  // POST /api/pasar-taller/talleres  (admin)
  fastify.post('/talleres', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user?.role !== 'admin') return reply.code(403).send({ error: 'Solo admin' })
    const { nombre } = request.body || {}
    if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
    try { return await fastify.prisma.taller.create({ data: { nombre } }) }
    catch (e) { if (e.code === 'P2002') return reply.code(409).send({ error: 'ya existe' }); throw e }
  })
}
