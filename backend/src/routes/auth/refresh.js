import jwt from 'jsonwebtoken'

export default async function refreshRoute(fastify) {
  fastify.post('/refresh', async (request, reply) => {
    const token = request.cookies?.refreshToken
    if (!token) return reply.status(401).send({ error: 'No refresh token' })

    let payload
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET)
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token' })
    }

    const session = await fastify.prisma.session.findUnique({ where: { refreshToken: token } })
    if (!session || session.expiresAt < new Date()) {
      return reply.status(401).send({ error: 'Session expired' })
    }

    const user = await fastify.prisma.user.findUnique({ where: { id: payload.id } })
    if (!user || !user.activo) return reply.status(401).send({ error: 'User not found' })

    const accessToken = fastify.jwt.sign({
      id: user.id,
      role: user.role,
      nombre: user.nombre,
      permisosExtra: user.permisosExtra || null,
    })

    return { accessToken }
  })
}
