import 'dotenv/config'
import Fastify from 'fastify'
import corsPlugin from './plugins/cors.js'
import cookiePlugin from './plugins/cookie.js'
import jwtPlugin from './plugins/jwt.js'
import prismaPlugin from './plugins/prisma.js'
import authRoutes from './routes/auth/index.js'
import { decorateRbac } from './middleware/rbac.js'

export function buildApp(opts = {}) {
  const app = Fastify({ logger: opts.logger ?? true })

  // Decorate synchronously so decorators are available before app.ready()
  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })
  decorateRbac(app)

  app.register(corsPlugin)
  app.register(cookiePlugin)
  app.register(jwtPlugin)
  app.register(prismaPlugin)
  app.register(authRoutes, { prefix: '/api/auth' })

  app.get('/api/health', async () => ({ status: 'ok' }))

  return app
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const app = buildApp()
  try {
    await app.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}
