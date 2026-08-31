const ROLES = ['admin', 'coordinador_comercial', 'vendedor', 'bodeguero', 'taller', 'rrhh', 'cajero']
const SEVERIDADES = ['baja', 'media', 'alta', 'critica']

function adminOnly(request, reply) {
  if (request.user?.role !== 'admin') return reply.code(403).send({ error: 'Solo Gerencia puede configurar excepciones' })
}

function normalizarRegla(body = {}) {
  const codigo = String(body.codigo || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  const nombre = String(body.nombre || '').trim()
  const horasEscalamiento = Number(body.horasEscalamiento)
  if (!codigo || !nombre) return { error: 'codigo y nombre requeridos' }
  if (!SEVERIDADES.includes(body.severidad || 'alta')) return { error: 'severidad invalida' }
  if (!Number.isInteger(horasEscalamiento) || horasEscalamiento < 1 || horasEscalamiento > 720) return { error: 'horasEscalamiento debe estar entre 1 y 720' }
  if (!ROLES.includes(body.rolResponsable) || !ROLES.includes(body.rolEscalamiento)) return { error: 'rol responsable o escalamiento invalido' }
  return { data: {
    codigo, nombre, descripcion: String(body.descripcion || '').trim() || null,
    estadoDestino: String(body.estadoDestino || '').trim() || null,
    severidad: body.severidad || 'alta', horasEscalamiento,
    rolResponsable: body.rolResponsable, rolEscalamiento: body.rolEscalamiento,
    activo: body.activo !== false,
  } }
}

export default async function excepcionesRoutes(fastify) {
  const auth = [fastify.authenticate, adminOnly]
  fastify.get('/reglas', { preHandler: auth }, async () => fastify.prisma.excepcionRegla.findMany({ orderBy: { codigo: 'asc' } }))
  fastify.post('/reglas', { preHandler: auth }, async (request, reply) => {
    const parsed = normalizarRegla(request.body)
    if (parsed.error) return reply.code(400).send({ error: parsed.error })
    try { return reply.code(201).send(await fastify.prisma.excepcionRegla.create({ data: parsed.data })) }
    catch (error) { if (error.code === 'P2002') return reply.code(409).send({ error: 'El código ya existe' }); throw error }
  })
  fastify.put('/reglas/:id', { preHandler: auth }, async (request, reply) => {
    const id = Number(request.params.id); if (!Number.isInteger(id)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = normalizarRegla(request.body); if (parsed.error) return reply.code(400).send({ error: parsed.error })
    try { return await fastify.prisma.excepcionRegla.update({ where: { id }, data: parsed.data }) }
    catch (error) { if (error.code === 'P2025') return reply.code(404).send({ error: 'Regla no encontrada' }); throw error }
  })
  fastify.get('/alertas', { preHandler: auth }, async () => {
    const now = new Date()
    await fastify.prisma.excepcionAlerta.updateMany({ where: { estado: 'ABIERTA', venceAt: { lte: now } }, data: { estado: 'ESCALADA', escaladaAt: now } })
    return fastify.prisma.excepcionAlerta.findMany({ include: { regla: true, orden: { select: { id: true, nInterno: true, estadoFlujoFormal: true } } }, orderBy: [{ estado: 'asc' }, { venceAt: 'asc' }], take: 200 })
  })
  fastify.post('/alertas/:id/resolver', { preHandler: auth }, async (request, reply) => {
    const id = Number(request.params.id); const evidencia = String(request.body?.evidencia || '').trim()
    if (!Number.isInteger(id) || !evidencia) return reply.code(400).send({ error: 'ID y evidencia requeridos' })
    try { return await fastify.prisma.excepcionAlerta.update({ where: { id }, data: { estado: 'RESUELTA', evidencia, resueltaAt: new Date(), resueltaPorId: request.user.id } }) }
    catch (error) { if (error.code === 'P2025') return reply.code(404).send({ error: 'Alerta no encontrada' }); throw error }
  })
}
