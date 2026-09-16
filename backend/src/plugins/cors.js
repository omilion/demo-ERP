import fp from 'fastify-plugin'
import cors from '@fastify/cors'

export default fp(async (fastify) => {
  fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow server-to-server, localhost, vercel.app domains, or configured FRONTEND_URL
      if (!origin) return cb(null, true)
      if (
        origin.includes('localhost') ||
        origin.endsWith('.vercel.app') ||
        (process.env.FRONTEND_URL && origin.startsWith(process.env.FRONTEND_URL))
      ) {
        return cb(null, true)
      }
      // Demo environment fallback: reflect origin
      return cb(null, true)
    },
    credentials: true,
  })
})
