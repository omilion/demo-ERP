import turnoRoutes from './turno.js'
import movimientosRoutes from './movimientos.js'
import historicoRoutes from './historico.js'

export default async function cajaRoutes(fastify) {
  fastify.register(turnoRoutes)
  fastify.register(movimientosRoutes)
  fastify.register(historicoRoutes)
}
