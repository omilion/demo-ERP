import turnoRoutes from './turno.js'
import movimientosRoutes from './movimientos.js'

export default async function cajaRoutes(fastify) {
  fastify.register(turnoRoutes)
  fastify.register(movimientosRoutes)
}
