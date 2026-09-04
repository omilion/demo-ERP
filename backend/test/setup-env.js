process.env.NODE_ENV ||= 'test'
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

// Las suites de integración crean y eliminan registros. Nunca deben heredar
// DATABASE_URL desde backend/.env (plastimar_dev) ni desde una terminal remota.
// En GitHub Actions la base efímera se llama plastimar_ci y llega mediante
// DATABASE_URL; localmente se usa siempre plastimar_test en el Docker de QA.
const localTestUrl = 'postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public'
const testUrl = process.env.DATABASE_TEST_URL || (process.env.CI ? process.env.DATABASE_URL : localTestUrl)
const testDatabase = new URL(testUrl).pathname.replace(/^\//, '')
if (!['plastimar_test', 'plastimar_ci'].includes(testDatabase)) {
  throw new Error(`La base de pruebas debe ser plastimar_test o plastimar_ci, no ${testDatabase || 'una base sin nombre'}`)
}
process.env.DATABASE_URL = testUrl
