export default async function logoutRoute(fastify) {
  fastify.post('/logout', async (request, reply) => {
    const token = request.cookies?.refreshToken
    if (token) {
      await fastify.prisma.session.deleteMany({ where: { refreshToken: token } }).catch(() => {})
    }
    reply.clearCookie('refreshToken', { path: '/api/auth' })
    return { ok: true }
  })
}
