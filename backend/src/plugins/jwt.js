import fp from 'fastify-plugin'
import fjwt from '@fastify/jwt'

export default fp(async (fastify) => {
  fastify.register(fjwt, {
    secret: process.env.JWT_ACCESS_SECRET,
    sign: { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' },
  })

  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })
})
