// E2E perf: mide latencia de listings grandes
const BASE = process.env.API_BASE || 'http://38.7.216.244:3001'
const EMAIL = process.env.API_EMAIL || 'admin@plastimar.cl'
const PASSWORD = process.env.API_PASSWORD || 'dev1234'

let token = null

async function call(method, path, body) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const t0 = Date.now()
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  const ms = Date.now() - t0
  let json; try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json, ms, bytes: text.length }
}

async function measure(label, path, opts = {}) {
  const r = await call('GET', path)
  const count = Array.isArray(r.body) ? r.body.length
    : Array.isArray(r.body?.items) ? r.body.items.length
    : typeof r.body === 'object' ? Object.keys(r.body || {}).length : 0
  const total = r.body?.total ?? '-'
  const flag = r.ms > (opts.slow || 1500) ? '🐢' : r.ms > (opts.warn || 500) ? '⚠ ' : '✓ '
  const kb = (r.bytes / 1024).toFixed(1)
  console.log(`  ${flag} ${label.padEnd(48)} ${String(r.ms).padStart(5)}ms  ${String(count).padStart(4)} items / total=${total}  (${kb}KB)`)
  return r
}

async function main() {
  console.log(`\n=== E2E PERF @ ${BASE} ===\n`)
  const lg = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD })
  token = lg.body?.accessToken
  if (!token) { console.error('No token'); process.exit(1) }

  console.log(`── LISTINGS PAGE 1 (paginated, 100/pg) ──`)
  await measure('GET /api/productos?page=1', '/api/productos?page=1')
  await measure('GET /api/clientes?page=1', '/api/clientes?page=1')
  await measure('GET /api/ventas?page=1', '/api/ventas?page=1')
  await measure('GET /api/ordenes-compra?page=1', '/api/ordenes-compra?page=1')
  await measure('GET /api/cobranza-historico?page=1', '/api/cobranza-historico?page=1')
  await measure('GET /api/cotizaciones?page=1', '/api/cotizaciones?page=1')
  await measure('GET /api/proveedores?page=1', '/api/proveedores?page=1')
  await measure('GET /api/odts?page=1', '/api/odts?page=1')
  await measure('GET /api/despachos?page=1', '/api/despachos?page=1')
  await measure('GET /api/bitacora-taller?page=1', '/api/bitacora-taller?page=1')
  await measure('GET /api/crm?page=1', '/api/crm?page=1')

  console.log(`\n── BÚSQUEDA / FILTROS ──`)
  await measure('productos search="caja"', '/api/productos?search=caja&page=1')
  await measure('clientes search="ltda"', '/api/clientes?search=ltda&page=1')
  await measure('ventas search=numérica', '/api/ventas?search=1000&page=1')
  await measure('autocomplete productos', '/api/productos/autocomplete?q=caja')

  console.log(`\n── PÁGINAS PROFUNDAS ──`)
  await measure('productos page=50', '/api/productos?page=50', { slow: 2000 })
  await measure('ventas page=100', '/api/ventas?page=100', { slow: 2000 })
  await measure('clientes page=100', '/api/clientes?page=100', { slow: 2000 })
  await measure('ordenes-compra page=200', '/api/ordenes-compra?page=200', { slow: 2000 })

  console.log(`\n── ENDPOINTS PESADOS ──`)
  await measure('dashboard /api/dashboard/stats', '/api/dashboard/stats', { slow: 3000 })
  await measure('reportes/stock-critico', '/api/reportes/stock-critico', { slow: 3000 })
  await measure('matriz-ventas', '/api/matriz-ventas?page=1', { slow: 3000 })
  await measure('cotizaciones/reportes', '/api/cotizaciones/reportes', { slow: 3000 })

  console.log(`\n── EXPORTS CSV ──`)
  await measure('export productos CSV', '/api/reportes/export/productos', { slow: 5000 })
  await measure('export clientes CSV', '/api/reportes/export/clientes', { slow: 5000 })
  await measure('export ventas CSV', '/api/reportes/export/ventas', { slow: 5000 })

  console.log(`\nLeyenda: ✓ <500ms  ⚠ 500-${1500}ms  🐢 >slow`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
