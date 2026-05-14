import listRoute from './list.js'
import createRoute from './create.js'
import getRoute from './get.js'
import updateRoute from './update.js'
import bitacoraRoute from './bitacora.js'

export default async function odtsRoutes(fastify) {
  fastify.register(listRoute)
  fastify.register(createRoute)
  fastify.register(getRoute)
  fastify.register(updateRoute)
  fastify.register(bitacoraRoute)
}
