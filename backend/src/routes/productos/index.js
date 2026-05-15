import listRoute from './list.js'
import createRoute from './create.js'
import getRoute from './get.js'
import updateRoute from './update.js'
import deleteRoute from './delete.js'
import historialRoute from './historial.js'
import publicWebRoute from './publicWeb.js'
import autocompleteRoute from './autocomplete.js'
import importarRoute from './importar.js'

export default async function productosRoutes(fastify) {
  fastify.register(listRoute)
  fastify.register(createRoute)
  fastify.register(getRoute)
  fastify.register(updateRoute)
  fastify.register(deleteRoute)
  fastify.register(historialRoute)
  fastify.register(publicWebRoute)
  fastify.register(autocompleteRoute)
  fastify.register(importarRoute)
}
