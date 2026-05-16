// E2E UI smoke: valida que páginas críticas tienen assets + APIs que necesitan responden
const FRONT = process.env.FRONT_BASE || 'https://vps.plastimar.cl'
const API = process.env.API_BASE || 'http://38.7.216.244:3001'
const EMAIL = process.env.API_EMAIL || 'admin@plastimar.cl'
const PASSWORD = process.env.API_PASSWORD || 'dev1234'

let token = null
const stats = { pass: 0, fail: 0 }
const failures = []

async function call(method, path, body, base = API) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token && base === API) headers.Authorization = `Bearer ${token}`
  const t0 = Date.now()
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  const ms = Date.now() - t0
  let json; try { json = JSON.parse(text) } catch { json = null }
  return { status: res.status, body: json, text, ms }
}

function check(label, ok, detail) {
  if (ok) { stats.pass++; console.log(`  ✓ ${label.padEnd(56)} ${detail || ''}`) }
  else { stats.fail++; failures.push(label); console.log(`  ✗ ${label.padEnd(56)} ${detail || ''}`) }
}

async function main() {
  console.log(`\n=== UI SMOKE @ ${FRONT} / ${API} ===\n`)

  // ── Frontend bundle ──
  console.log(`── BUNDLE ──`)
  const idx = await call('GET', '/', null, FRONT)
  check('GET / (200 + html)', idx.status === 200 && idx.text.includes('<div id="root"'), `status=${idx.status} bytes=${idx.text.length}`)

  // Extract JS bundle paths
  const scripts = [...idx.text.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(m => m[1])
  const styles = [...idx.text.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(m => m[1])
  check('index.html refs JS bundle', scripts.length > 0, `n=${scripts.length}`)
  check('index.html refs CSS', styles.length > 0, `n=${styles.length}`)

  for (const s of scripts.slice(0, 3)) {
    const r = await call('GET', s, null, FRONT)
    check(`GET ${s}`, r.status === 200 && r.text.length > 100, `${r.status} ${r.text.length}b`)
  }
  for (const s of styles.slice(0, 2)) {
    const r = await call('GET', s, null, FRONT)
    check(`GET ${s}`, r.status === 200 && r.text.length > 50, `${r.status} ${r.text.length}b`)
  }

  // ── Login ──
  console.log(`\n── LOGIN ──`)
  const lg = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD })
  token = lg.body?.accessToken
  check('login', lg.status === 200 && !!token, `status=${lg.status}`)
  if (!token) return finish()

  // ── Páginas críticas: ejercitar las APIs que la página dispara en mount ──
  const pages = {
    'Dashboard': [
      '/api/dashboard/stats',
      '/api/reportes/stock-critico',
    ],
    'Ventas': [
      '/api/ventas?page=1',
      '/api/clientes?page=1',
      '/api/productos?page=1',
    ],
    'Clientes': [
      '/api/clientes?page=1',
    ],
    'Productos': [
      '/api/productos?page=1',
      '/api/categorias',
      '/api/proveedores?page=1',
    ],
    'CRM': [
      '/api/crm?page=1',
      '/api/crm/ejecutivas',
    ],
    'Caja': [
      '/api/caja/turno',
      '/api/caja/historico',
    ],
    'Cobranza': [
      '/api/cobranza-historico?page=1',
      '/api/cobranza-historico/ejecutivas',
    ],
    'Cotizaciones': [
      '/api/cotizaciones?page=1',
      '/api/cotizaciones/reportes',
    ],
    'ODT / Taller': [
      '/api/odts?page=1',
      '/api/bitacora-taller?page=1',
      '/api/bodega-taller?page=1',
    ],
    'Despachos': [
      '/api/despachos?page=1',
      '/api/despachos/guias/list',
    ],
    'Órdenes Compra': [
      '/api/ordenes-compra?page=1',
    ],
    'Pagos Proveedores': [
      '/api/pagos-proveedores?page=1',
    ],
    'Matriz Ventas': [
      '/api/matriz-ventas?page=1',
    ],
    'Config (admin)': [
      '/api/usuarios',
      '/api/banners',
      '/api/locations/regiones',
      '/api/locations/sucursales',
    ],
  }

  let totalMs = 0
  for (const [page, endpoints] of Object.entries(pages)) {
    console.log(`\n── PÁGINA: ${page} ──`)
    let pageMs = 0
    for (const ep of endpoints) {
      const r = await call('GET', ep)
      pageMs += r.ms
      const ok = r.status >= 200 && r.status < 400
      check(`${ep}`, ok, `${r.status} ${r.ms}ms`)
    }
    totalMs += pageMs
    console.log(`  ⏱  total página: ${pageMs}ms`)
  }
  console.log(`\n⏱  Total APIs ejercitadas: ${totalMs}ms`)

  finish()
}

function finish() {
  console.log(`\n=== RESULT: ${stats.pass} pass / ${stats.fail} fail ===`)
  if (failures.length) {
    console.log('Failures:')
    for (const f of failures) console.log(`  - ${f}`)
  }
  process.exit(stats.fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
