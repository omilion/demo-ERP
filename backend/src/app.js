import 'dotenv/config'
import Fastify from 'fastify'
import corsPlugin from './plugins/cors.js'
import cookiePlugin from './plugins/cookie.js'
import jwtPlugin from './plugins/jwt.js'
import prismaPlugin from './plugins/prisma.js'
import authRoutes from './routes/auth/index.js'
import productosRoutes from './routes/productos/index.js'
import clientesRoutes from './routes/clientes/index.js'
import ventasRoutes from './routes/ventas/index.js'
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
  app.register(productosRoutes, { prefix: '/api/productos' })
  app.register(clientesRoutes, { prefix: '/api/clientes' })
  app.register(ventasRoutes, { prefix: '/api/ventas' })

  app.get('/api/health', async () => ({ status: 'ok' }))

  return app
}

const __filename = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
if (process.argv[1].replace(/\\/g, '/') === __filename.replace(/\\/g, '/')) {
  const app = buildApp()
  try {
    await app.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}
