import { buildApp } from './src/app.js'

const app = buildApp({ logger: true })
try {
  await app.listen({
    port: Number(process.env.PORT) || 3001,
    host: process.env.HOST || '0.0.0.0',
  })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
