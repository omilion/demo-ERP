import loginRoute from './login.js'
import refreshRoute from './refresh.js'
import logoutRoute from './logout.js'

export default async function authRoutes(fastify) {
  fastify.register(loginRoute)
  fastify.register(refreshRoute)
  fastify.register(logoutRoute)
}
