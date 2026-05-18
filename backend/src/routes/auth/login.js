import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { createErpAccessTokenPayload, createErpRefreshTokenPayload } from '../../plugins/jwt.js'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default async function loginRoute(fastify) {
  fastify.post('/login', async (request, reply) => {
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid input' })

    const { email, password } = parsed.data
    const user = await fastify.prisma.user.findUnique({ where: { email } })
    if (!user || !user.activo) return reply.status(401).send({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return reply.status(401).send({ error: 'Invalid credentials' })

    const accessToken = fastify.jwt.sign(createErpAccessTokenPayload(user))

    const refreshToken = jwt.sign(
      createErpRefreshTokenPayload(user.id, randomUUID()),
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
    )

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await fastify.prisma.session.create({
      data: { userId: user.id, refreshToken, expiresAt },
    })

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      expires: expiresAt,
    })

    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role, nombre: user.nombre },
    }
  })
}
