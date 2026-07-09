// Conversaciones persistentes del asistente IA. Cada usuario ve solo las suyas.
// El historial se reabre desde la pantalla dedicada del RAG (sidebar).

function tituloDesde(texto) {
  const t = String(texto || '').trim().replace(/\s+/g, ' ')
  if (!t) return 'Nueva conversación'
  return t.length > 60 ? t.slice(0, 57) + '…' : t
}

export default async function aiConversacionesRoute(fastify) {
  // Lista de conversaciones del usuario (para el sidebar).
  fastify.get('/conversaciones', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const rows = await fastify.prisma.aiConversacion.findMany({
      where: { userId: request.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, titulo: true, createdAt: true, updatedAt: true },
    })
    return { items: rows }
  })

  // Mensajes de una conversación (al abrirla desde el sidebar).
  fastify.get('/conversaciones/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const conv = await fastify.prisma.aiConversacion.findFirst({
      where: { id, userId: request.user.id },
      include: { mensajes: { orderBy: { createdAt: 'asc' } } },
    })
    if (!conv) return reply.code(404).send({ error: 'Conversación no encontrada' })
    return conv
  })

  // Crear conversación (opcionalmente con el primer mensaje del usuario).
  fastify.post('/conversaciones', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { titulo, primerMensaje } = request.body || {}
    const conv = await fastify.prisma.aiConversacion.create({
      data: {
        userId: request.user.id,
        titulo: tituloDesde(titulo || primerMensaje),
      },
    })
    return conv
  })

  // Agregar un turno (mensaje user + respuesta assistant) a una conversación.
  // Lo llama el frontend al terminar cada intercambio del chat.
  fastify.post('/conversaciones/:id/mensajes', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const conv = await fastify.prisma.aiConversacion.findFirst({
      where: { id, userId: request.user.id },
      select: { id: true, titulo: true },
    })
    if (!conv) return reply.code(404).send({ error: 'Conversación no encontrada' })

    const mensajes = Array.isArray(request.body?.mensajes) ? request.body.mensajes : []
    const data = mensajes
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({
        conversacionId: id,
        role: m.role,
        content: m.content,
        documents: Array.isArray(m.documents) && m.documents.length ? m.documents : undefined,
      }))
    if (!data.length) return reply.code(400).send({ error: 'Sin mensajes válidos' })

    await fastify.prisma.$transaction([
      fastify.prisma.aiMensaje.createMany({ data }),
      // touch updatedAt para reordenar en el sidebar
      fastify.prisma.aiConversacion.update({ where: { id }, data: { updatedAt: new Date() } }),
    ])
    return { ok: true }
  })

  // Renombrar.
  fastify.put('/conversaciones/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const titulo = tituloDesde(request.body?.titulo)
    const r = await fastify.prisma.aiConversacion.updateMany({
      where: { id, userId: request.user.id },
      data: { titulo },
    })
    if (!r.count) return reply.code(404).send({ error: 'Conversación no encontrada' })
    return { ok: true, titulo }
  })

  // Eliminar (cascade borra los mensajes).
  fastify.delete('/conversaciones/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const r = await fastify.prisma.aiConversacion.deleteMany({
      where: { id, userId: request.user.id },
    })
    if (!r.count) return reply.code(404).send({ error: 'Conversación no encontrada' })
    return { ok: true }
  })
}
