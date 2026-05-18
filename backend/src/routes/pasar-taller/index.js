// Pasar producto a taller: crea OdtItem y adjudica a un Taller (espumas/confecciones/madera/etc)

function cleanText(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function buildObs(item) {
  const descripcion = cleanText(item.descripcion)
  const obs = cleanText(item.obs)
  if (descripcion && obs && descripcion !== obs) return `${descripcion}\n${obs}`
  return obs || descripcion
}

async function resolveProducto(prisma, item) {
  const productoId = parsePositiveInt(item.productoId ?? item.producto_id)
  if (productoId) {
    return prisma.producto.findUnique({ where: { id: productoId } })
  }

  const codigoInterno = cleanText(item.codigoInterno ?? item.codigo_interno)
  if (!codigoInterno) return null
  return prisma.producto.findUnique({ where: { codigoInterno } })
}

export default async function pasarTallerRoutes(fastify) {
  // GET /api/pasar-taller/transitorios?userId= (productos pendientes de enviar)
  // Para simplificar, se almacena temporalmente como OdtItem con odtId=null hasta confirmar.
  // Aquí: lista directa desde body en flow stateless.

  // POST /api/pasar-taller/enviar  body: { odtId, items: [{productoId|codigoInterno, cantidad, tallerId, descripcion, obs}] }
  fastify.post('/enviar', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const { odtId, items } = request.body || {}
    if (!odtId || !Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({ error: 'odtId e items requeridos' })
    }
    const odtIdInt = parsePositiveInt(odtId)
    if (!odtIdInt) return reply.code(400).send({ error: 'odtId invalido' })

    const odt = await fastify.prisma.odt.findUnique({ where: { id: odtIdInt } })
    if (!odt) return reply.code(404).send({ error: 'ODT no encontrada' })

    const prepared = []
    for (const [index, it] of items.entries()) {
      if (!it || typeof it !== 'object') {
        return reply.code(400).send({ error: `items[${index}] debe ser un objeto` })
      }

      const producto = await resolveProducto(fastify.prisma, it)
      if (!producto) {
        return reply.code(400).send({ error: `items[${index}].productoId o codigoInterno debe referenciar un producto existente` })
      }

      const cantidad = parsePositiveInt(it.cantidad) || 1
      const tallerId = it.tallerId ? parsePositiveInt(it.tallerId) : null
      if (it.tallerId && !tallerId) {
        return reply.code(400).send({ error: `items[${index}].tallerId invalido` })
      }

      if (tallerId) {
        const taller = await fastify.prisma.taller.findFirst({ where: { id: tallerId, activo: true } })
        if (!taller) return reply.code(400).send({ error: `items[${index}].tallerId no existe o esta inactivo` })
      }

      prepared.push({
        item: {
          odtId: odtIdInt,
          productoId: producto.id,
          codigoInterno: producto.codigoInterno || cleanText(it.codigoInterno),
          nombre: producto.nombre || cleanText(it.nombre),
          cantidad,
          obs: buildObs(it),
          usuario: request.user?.nombre || request.user?.email || null,
        },
        tallerId,
      })
    }

    const created = await fastify.prisma.$transaction(async (tx) => {
      const out = []
      for (const entry of prepared) {
        const odtItem = await tx.odtItem.create({ data: entry.item })
        if (entry.tallerId) {
          await tx.odtItemTaller.create({
            data: {
              odtItemId: odtItem.id,
              tallerId: entry.tallerId,
              usuario: request.user?.nombre || request.user?.email || null,
            },
          })
        }
        out.push(odtItem)
      }
      return out
    })

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
