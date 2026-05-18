const DEFAULT_BASE_URL = 'http://127.0.0.1:3101'

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    baseUrl: process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL,
    email: process.env.SMOKE_EMAIL || 'admin@plastimar.cl',
    password: process.env.SMOKE_PASSWORD || 'dev1234',
    json: false,
  }

  for (const arg of argv) {
    if (arg === '--json') options.json = true
    else if (arg.startsWith('--base-url=')) options.baseUrl = arg.slice('--base-url='.length)
    else if (arg.startsWith('--email=')) options.email = arg.slice('--email='.length)
    else if (arg.startsWith('--password=')) options.password = arg.slice('--password='.length)
  }

  options.baseUrl = options.baseUrl.replace(/\/+$/, '')
  return options
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function request(baseUrl, path, { method = 'GET', token, body, expect = [200] } = {}) {
  const headers = { accept: 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await res.text()
  let data = null
  if (text) {
    try { data = JSON.parse(text) }
    catch { data = text }
  }

  const allowed = Array.isArray(expect) ? expect : [expect]
  if (!allowed.includes(res.status)) {
    throw new Error(`${method} ${path} expected ${allowed.join('/')} got ${res.status}: ${text.slice(0, 500)}`)
  }

  return { status: res.status, data, headers: Object.fromEntries(res.headers.entries()) }
}

function countItems(data) {
  if (Array.isArray(data)) return data.length
  if (Array.isArray(data?.items)) return data.items.length
  return null
}

function firstId(data) {
  if (Array.isArray(data?.items) && data.items[0]?.id != null) return data.items[0].id
  if (Array.isArray(data) && data[0]?.id != null) return data[0].id
  return null
}

async function smoke(options) {
  const checks = []
  const record = (name, result = {}) => checks.push({ name, ok: true, ...result })

  const health = await request(options.baseUrl, '/api/health')
  assert(health.data?.status === 'ok', 'health did not return status ok')
  record('health', { status: health.status })

  const login = await request(options.baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: options.email, password: options.password },
  })
  const token = login.data?.accessToken
  assert(token, 'login did not return accessToken')
  assert(login.data?.user?.role === 'admin', `expected admin role, got ${login.data?.user?.role}`)
  record('auth login admin', { user: login.data.user.email, role: login.data.user.role })

  const soloLectura = await request(options.baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: 'solo_lectura@plastimar.cl', password: options.password },
  })
  assert(soloLectura.data?.accessToken, 'solo_lectura login did not return accessToken')
  await request(options.baseUrl, '/api/productos', { token: soloLectura.data.accessToken })
  await request(options.baseUrl, '/api/productos', {
    method: 'POST',
    token: soloLectura.data.accessToken,
    body: {},
    expect: [403],
  })
  record('rbac solo_lectura read yes write no')

  const endpointChecks = [
    { name: 'dashboard stats', path: '/api/dashboard/stats' },
    { name: 'productos list', path: '/api/productos' },
    { name: 'clientes list', path: '/api/clientes' },
    { name: 'ventas list', path: '/api/ventas' },
    { name: 'odts list', path: '/api/odts' },
    { name: 'cobranza historico', path: '/api/cobranza-historico' },
    { name: 'cobranza ejecutivas', path: '/api/cobranza-historico/ejecutivas' },
    { name: 'despachos list', path: '/api/despachos' },
    { name: 'guias list', path: '/api/despachos/guias/list' },
    { name: 'matriz ventas', path: '/api/matriz-ventas' },
    { name: 'matriz totales', path: '/api/matriz-ventas/totales' },
    { name: 'stock critico', path: '/api/reportes/stock-critico' },
    { name: 'rrhh resumen', path: '/api/rrhh/resumen' },
    { name: 'rrhh trabajadores', path: '/api/rrhh/trabajadores' },
    { name: 'admin integridad resumen', path: '/api/admin/integridad/resumen' },
    { name: 'admin auditoria', path: '/api/admin/auditoria?limit=5' },
  ]

  const responses = {}
  for (const check of endpointChecks) {
    const res = await request(options.baseUrl, check.path, { token })
    responses[check.name] = res.data
    record(check.name, { count: countItems(res.data) })
  }

  const productos = responses['productos list']
  const clientes = responses['clientes list']
  const ventas = responses['ventas list']
  const odts = responses['odts list']

  const productoId = firstId(productos)
  if (productoId) {
    await request(options.baseUrl, `/api/productos/${productoId}`, { token })
    record('producto detail', { id: productoId })
  }

  const clienteId = firstId(clientes)
  if (clienteId) {
    await request(options.baseUrl, `/api/clientes/${clienteId}`, { token })
    record('cliente detail', { id: clienteId })
  }

  const ventaId = firstId(ventas)
  if (ventaId) {
    await request(options.baseUrl, `/api/ventas/${ventaId}`, { token })
    record('venta detail', { id: ventaId })
  }

  const odtId = firstId(odts)
  if (odtId) {
    await request(options.baseUrl, `/api/odts/${odtId}`, { token })
    await request(options.baseUrl, `/api/odts/${odtId}/bitacora`, { token })
    record('odt detail and bitacora', { id: odtId })
  }

  const integridad = responses['admin integridad resumen']
  assert(integridad.orden_items_huerfanos === 6143, `expected orden_items_huerfanos 6143, got ${integridad.orden_items_huerfanos}`)
  assert(integridad.odt_items_huerfanos === 200, `expected odt_items_huerfanos 200, got ${integridad.odt_items_huerfanos}`)
  assert(integridad.productos_stock_negativo === 167, `expected productos_stock_negativo 167, got ${integridad.productos_stock_negativo}`)
  record('post-cleanup integrity counts', {
    ordenItemsHuerfanos: integridad.orden_items_huerfanos,
    odtItemsHuerfanos: integridad.odt_items_huerfanos,
    productosStockNegativo: integridad.productos_stock_negativo,
  })

  return {
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    checks,
    summary: {
      total: checks.length,
      passed: checks.filter((item) => item.ok).length,
    },
  }
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href
if (isDirectRun) {
  const options = parseArgs()
  smoke(options).then((report) => {
    if (options.json) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      console.log(`Staging smoke OK: ${report.summary.passed}/${report.summary.total}`)
      for (const check of report.checks) console.log(`- ${check.name}`)
    }
  }).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

export { parseArgs, smoke }
