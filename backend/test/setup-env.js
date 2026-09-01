process.env.NODE_ENV ||= 'test'
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

// Las suites de integración crean y eliminan registros. Nunca deben heredar
// DATABASE_URL desde backend/.env (plastimar_dev) ni desde una terminal remota.
const testUrl = process.env.DATABASE_TEST_URL || 'postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public'
const testDatabase = new URL(testUrl).pathname.replace(/^\//, '')
if (testDatabase !== 'plastimar_test') {
  throw new Error(`DATABASE_TEST_URL debe apuntar a plastimar_test, no a ${testDatabase || 'una base sin nombre'}`)
}
process.env.DATABASE_URL = testUrl
