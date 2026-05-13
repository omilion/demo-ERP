import listRoute from './list.js'
import createRoute from './create.js'
import getRoute from './get.js'
import updateRoute from './update.js'

export default async function clientesRoutes(fastify) {
  fastify.register(listRoute)
  fastify.register(createRoute)
  fastify.register(getRoute)
  fastify.register(updateRoute)
}
