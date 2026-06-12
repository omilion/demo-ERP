// Start the API against a candidate database without editing .env or ecosystem config.
//
// Usage:
//   node scripts/run-candidate-server.mjs plastimar_final_candidate_20260612 3002

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const dbName = process.argv[2]
const port = process.argv[3] || '3002'

if (!dbName || !/^[a-zA-Z0-9_]+$/.test(dbName)) {
  console.error('Usage: node scripts/run-candidate-server.mjs <database_name> [port]')
  process.exit(2)
}
if (!dbName.includes('final_candidate')) {
  console.error(`Refusing candidate preview for database "${dbName}".`)
  process.exit(2)
}

const ecosystem = require('../ecosystem.config.cjs')
const baseEnv = ecosystem?.apps?.[0]?.env || {}
const sourceUrl = process.env.DATABASE_URL || baseEnv.DATABASE_URL

if (!sourceUrl) {
  console.error('DATABASE_URL not found in environment or ecosystem config.')
  process.exit(2)
}

const targetUrl = new URL(sourceUrl)
targetUrl.pathname = `/${dbName}`

Object.assign(process.env, baseEnv, {
  DATABASE_URL: targetUrl.toString(),
  PORT: port,
  NODE_ENV: process.env.NODE_ENV || baseEnv.NODE_ENV || 'production',
})

console.log(`Starting candidate API on port ${port} using database ${dbName}`)

await import('../server.js')
