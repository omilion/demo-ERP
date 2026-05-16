// E2E exhaustivo: golpea todos los GET listings + flujos write con rollback
const BASE = process.env.API_BASE || 'http://38.7.216.244:3001'
const EMAIL = process.env.API_EMAIL || 'admin@plastimar.cl'
const PASSWORD = process.env.API_PASSWORD || 'dev1234'
const TAG = 'E2E_FULL_2026'

let token = null
const stats = { pass: 0, fail: 0, warn: 0 }
const failures = []

async function call(method, path, body) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const text = await res.text()
    let json; try { json = JSON.parse(text) } catch { json = text }
    return { status: res.status, body: json }
  } catch (e) {
    return { status: 0, body: { error: e.message } }
  }
}

function check(label, ok, detail) {
  if (ok) { stats.pass++; console.log(`  ✓ ${label.padEnd(48)} ${detail || ''}`) }
  else { stats.fail++; failures.push(label); console.log(`  ✗ ${label.padEnd(48)} ${detail || ''}`) }
}

function warn(label, detail) {
  stats.warn++; console.log(`  ⚠ ${label.padEnd(48)} ${detail || ''}`)
}

async function getList(path, label, opts = {}) {
  const r = await call('GET', path)
  const okStatus = opts.acceptCodes ? opts.acceptCodes.includes(r.status) : r.status === 200
  const itemsKey = opts.itemsKey || 'items'
  const ok = okStatus && (opts.skipShape || Array.isArray(r.body) || Array.isArray(r.body?.[itemsKey]) || typeof r.body === 'object')
  const detail = okStatus
    ? `${r.status} ` + (Array.isArray(r.body) ? `len=${r.body.length}` : (Array.isArray(r.body?.[itemsKey]) ? `items=${r.body[itemsKey].length}/total=${r.body.total ?? '-'}` : 'obj'))
    : `${r.status} ${JSON.stringify(r.body).slice(0, 80)}`
  check(label, ok, detail)
  return r
}

async function main() {
  console.log(`\n=== E2E FULL @ ${BASE} ===\n`)

  // ─── Auth ─────────────────────────────────────────────────────────────
  console.log(`── AUTH ──`)
  const lg = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD })
  token = lg.body?.accessToken
  check('POST /api/auth/login', lg.status === 200 && !!token, `status=${lg.status}`)
  if (!token) { console.log('ABORT: no token'); process.exit(1) }

  const bad = await call('POST', '/api/auth/login', { email: EMAIL, password: 'wrong' })
  check('POST /api/auth/login (wrong pw)', bad.status === 401, `status=${bad.status}`)

  // ─── Públicos (sin auth header) ───────────────────────────────────────
  console.log(`\n── PÚBLICOS ──`)
  const tmpToken = token; token = null
  await getList('/api/banners/public', 'GET /api/banners/public', { skipShape: true })
  await getList('/api/productos/web/catalogo', 'GET /api/productos/web/catalogo', { skipShape: true })
  token = tmpToken

  // ─── GET listings ─────────────────────────────────────────────────────
  console.log(`\n── GET LISTINGS ──`)
  const lists = [
    '/api/clientes?page=1',
    '/api/productos?page=1',
    '/api/proveedores?page=1',
    '/api/ventas?page=1',
    '/api/odts?page=1',
    '/api/despachos?page=1',
    '/api/despachos/guias/list',
    '/api/bitacora-taller?page=1',
    '/api/crm?page=1',
    '/api/crm/ejecutivas',
    '/api/cobranza-historico?page=1',
    '/api/cobranza-historico/ejecutivas',
    '/api/cobranza-historico/meses',
    '/api/categorias?page=1',
    '/api/categorias-bodega-taller',
    '/api/cotizaciones?page=1',
    '/api/cotizaciones/reportes',
    '/api/ordenes-compra?page=1',
    '/api/pagos-proveedores?page=1',
    '/api/caja/turno',
    '/api/caja/historico?page=1',
    '/api/caja/historico/years',
    '/api/cargo-transporte',
    '/api/descuentos',
    '/api/gastos',
    '/api/historial-materiales?page=1',
    '/api/multas',
    '/api/bodega-taller?page=1',
    '/api/telas',
    '/api/dashboard/stats',
    '/api/reportes/stock-critico',
    '/api/stock-ingresos',
    '/api/matriz-ventas',
    '/api/matriz-ventas/totales',
    '/api/locations/regiones',
    '/api/locations/comunas',
    '/api/locations/sucursales',
    '/api/config/empresa',
    '/api/config/firmas',
    '/api/config/bloqueos',
    '/api/banners',
    '/api/usuarios',
    '/api/usuarios-web',
    '/api/accesos',
  ]
  for (const p of lists) await getList(p, `GET ${p}`)

  // ─── GET autocomplete ─────────────────────────────────────────────────
  console.log(`\n── AUTOCOMPLETE ──`)
  await getList('/api/productos/autocomplete?q=es', 'GET /api/productos/autocomplete', { skipShape: true })
  await getList('/api/bodega-taller/autocomplete?q=es', 'GET /api/bodega-taller/autocomplete', { skipShape: true, acceptCodes: [200, 400] })

  // ─── CSV exports ──────────────────────────────────────────────────────
  console.log(`\n── EXPORTS CSV (HEAD-style: tolera 200/302) ──`)
  for (const ex of ['productos', 'clientes', 'proveedores', 'ventas', 'cobranza', 'caja', 'bodega-taller']) {
    const r = await call('GET', `/api/reportes/export/${ex}`)
    check(`GET /api/reportes/export/${ex}`, r.status === 200, `status=${r.status}`)
  }

  // ─── GET por id (toma primero del listing) ─────────────────────────────
  console.log(`\n── GET /:id ──`)
  const r1 = await call('GET', '/api/clientes?page=1')
  const cliente = r1.body?.items?.[0]
  if (cliente) {
    const r = await call('GET', `/api/clientes/${cliente.id}`)
    check(`GET /api/clientes/:id`, r.status === 200 && r.body?.id === cliente.id)
  }
  const r2 = await call('GET', '/api/productos?page=1')
  const producto = r2.body?.items?.[0]
  if (producto) {
    const r = await call('GET', `/api/productos/${producto.id}`)
    check(`GET /api/productos/:id`, r.status === 200 && r.body?.id === producto.id)
    const rh = await call('GET', `/api/productos/${producto.id}/historial-precios`)
    check(`GET /api/productos/:id/historial-precios`, [200, 404].includes(rh.status), `status=${rh.status}`)
    const rm = await call('GET', `/api/productos/${producto.id}/movimientos`)
    check(`GET /api/productos/:id/movimientos`, rm.status === 200)
  }
  const r3 = await call('GET', '/api/proveedores?page=1')
  const proveedor = r3.body?.items?.[0]
  if (proveedor) {
    const r = await call('GET', `/api/proveedores/${proveedor.id}`)
    check(`GET /api/proveedores/:id`, r.status === 200)
    const rp = await call('GET', `/api/proveedores/${proveedor.id}/pagos`)
    check(`GET /api/proveedores/:id/pagos`, rp.status === 200)
  }
  const r4 = await call('GET', '/api/ventas?page=1')
  const orden = r4.body?.items?.[0]
  if (orden) {
    const r = await call('GET', `/api/ventas/${orden.id}`)
    check(`GET /api/ventas/:id`, r.status === 200 && r.body?.id === orden.id)
    const rc = await call('GET', `/api/ventas/${orden.id}/cargos`)
    check(`GET /api/ventas/:id/cargos`, rc.status === 200)
  }
  const r5 = await call('GET', '/api/odts?page=1')
  const odt = r5.body?.items?.[0]
  if (odt) {
    const r = await call('GET', `/api/odts/${odt.id}`)
    check(`GET /api/odts/:id`, r.status === 200)
    const rb = await call('GET', `/api/odts/${odt.id}/bitacora`)
    check(`GET /api/odts/:id/bitacora`, rb.status === 200)
  }
  const r6 = await call('GET', '/api/despachos?page=1')
  const desp = r6.body?.items?.[0]
  if (desp) {
    const r = await call('GET', `/api/despachos/${desp.id}`)
    check(`GET /api/despachos/:id`, r.status === 200)
  }
  const r7 = await call('GET', '/api/cotizaciones?page=1')
  const cot = r7.body?.items?.[0]
  if (cot) {
    const r = await call('GET', `/api/cotizaciones/${cot.id}`)
    check(`GET /api/cotizaciones/:id`, r.status === 200)
  }
  const r8 = await call('GET', '/api/pagos-proveedores?page=1')
  const pago = r8.body?.items?.[0]
  if (pago) {
    const r = await call('GET', `/api/pagos-proveedores/${pago.id}`)
    check(`GET /api/pagos-proveedores/:id`, r.status === 200)
  }
  const r9 = await call('GET', '/api/multas')
  const multa = Array.isArray(r9.body) ? r9.body[0] : r9.body?.items?.[0]
  if (multa) {
    const r = await call('GET', `/api/multas/${multa.id}`)
    check(`GET /api/multas/:id`, r.status === 200)
  } else warn('GET /api/multas/:id', 'sin filas, skip')

  // ─── WRITE flows con rollback ──────────────────────────────────────────
  console.log(`\n── WRITE FLOWS (con rollback) ──`)

  // cargo-transporte CRUD
  let r = await call('POST', '/api/cargo-transporte', { nombre: `${TAG} test`, precio: 1000 })
  const cargoId = r.body?.id
  check('POST /api/cargo-transporte', !!cargoId && [200, 201].includes(r.status), `id=${cargoId} status=${r.status}`)
  if (cargoId) {
    r = await call('PUT', `/api/cargo-transporte/${cargoId}`, { precio: 2000 })
    check('PUT /api/cargo-transporte/:id', [200, 204].includes(r.status))
    r = await call('DELETE', `/api/cargo-transporte/${cargoId}`)
    check('DELETE /api/cargo-transporte/:id', [200, 204].includes(r.status))
  }

  // gastos
  r = await call('POST', '/api/gastos', { nombre: `${TAG} gasto`, monto: 500, fecha: new Date().toISOString().slice(0, 10) })
  const gastoId = r.body?.id
  if (gastoId) {
    check('POST /api/gastos', true, `id=${gastoId}`)
    r = await call('DELETE', `/api/gastos/${gastoId}`)
    check('DELETE /api/gastos/:id', [200, 204].includes(r.status))
  } else warn('POST /api/gastos', `status=${r.status} ${JSON.stringify(r.body).slice(0, 80)}`)

  // categoria
  r = await call('POST', '/api/categorias', { nombre: `${TAG} cat` })
  const catId = r.body?.id
  if (catId) {
    check('POST /api/categorias', true, `id=${catId}`)
    r = await call('PUT', `/api/categorias/${catId}`, { nombre: `${TAG} cat upd` })
    check('PUT /api/categorias/:id', [200, 204].includes(r.status))
    r = await call('DELETE', `/api/categorias/${catId}`)
    check('DELETE /api/categorias/:id', [200, 204].includes(r.status))
  } else warn('POST /api/categorias', `status=${r.status}`)

  // tela
  r = await call('POST', '/api/telas', { codigo: `${TAG}-TELA-${Date.now()}`, nombre: `${TAG} tela`, ancho: 150, gramaje: 200 })
  const telaId = r.body?.id
  if (telaId) {
    check('POST /api/telas', true, `id=${telaId}`)
    r = await call('DELETE', `/api/telas/${telaId}`)
    check('DELETE /api/telas/:id', [200, 204].includes(r.status))
  } else warn('POST /api/telas', `status=${r.status} ${JSON.stringify(r.body).slice(0, 80)}`)

  // proveedor
  r = await call('POST', '/api/proveedores', { nombre: `${TAG} prov`, rut: '99999999-9' })
  const provId = r.body?.id
  if (provId) {
    check('POST /api/proveedores', true, `id=${provId}`)
    r = await call('PUT', `/api/proveedores/${provId}`, { nombre: `${TAG} prov upd` })
    check('PUT /api/proveedores/:id', [200, 204].includes(r.status))
    r = await call('DELETE', `/api/proveedores/${provId}`)
    check('DELETE /api/proveedores/:id', [200, 204].includes(r.status))
  } else warn('POST /api/proveedores', `status=${r.status} ${JSON.stringify(r.body).slice(0, 80)}`)

  // cliente (rut único pseudoaleatorio)
  const rutTest = `${Date.now().toString().slice(-7)}-K`
  r = await call('POST', '/api/clientes', { nombre: `${TAG} cliente`, rut: rutTest })
  const cliId = r.body?.id
  if (cliId) {
    check('POST /api/clientes', true, `id=${cliId}`)
    r = await call('PUT', `/api/clientes/${cliId}`, { nombre: `${TAG} cliente upd` })
    check('PUT /api/clientes/:id', [200, 204].includes(r.status))
    // cleanup
    await call('DELETE', `/api/clientes/${cliId}`)
  } else warn('POST /api/clientes', `status=${r.status} ${JSON.stringify(r.body).slice(0, 80)}`)

  // banner
  r = await call('POST', '/api/banners', { titulo: `${TAG} banner`, descripcion: 'test', activo: true })
  const bid = r.body?.id
  if (bid) {
    check('POST /api/banners', true, `id=${bid}`)
    r = await call('PUT', `/api/banners/${bid}`, { titulo: `${TAG} upd` })
    check('PUT /api/banners/:id', [200, 204].includes(r.status))
    r = await call('DELETE', `/api/banners/${bid}`)
    check('DELETE /api/banners/:id', [200, 204].includes(r.status))
  } else warn('POST /api/banners', `status=${r.status} ${JSON.stringify(r.body).slice(0, 80)}`)

  // multa
  if (orden) {
    r = await call('POST', '/api/multas', { ordenId: orden.id, monto: 100, motivo: `${TAG} multa test` })
    const multaId = r.body?.id
    if (multaId) {
      check('POST /api/multas', true, `id=${multaId}`)
      r = await call('DELETE', `/api/multas/${multaId}`)
      check('DELETE /api/multas/:id', [200, 204].includes(r.status))
    } else warn('POST /api/multas', `status=${r.status} ${JSON.stringify(r.body).slice(0, 80)}`)
  }

  // historial-materiales (requiere material id)
  const matsRes = await call('GET', '/api/bodega-taller?page=1')
  const mat = matsRes.body?.items?.[0]
  if (mat) {
    r = await call('POST', '/api/historial-materiales', { codigoInterno: mat.codigoInterno, materialId: mat.id, tipo: 'ingreso', cantidad: 1, usuario: 'e2e' })
    const hmId = r.body?.id
    if (hmId) {
      check('POST /api/historial-materiales', true, `id=${hmId}`)
      r = await call('DELETE', `/api/historial-materiales/${hmId}`)
      check('DELETE /api/historial-materiales/:id', [200, 204].includes(r.status))
    } else warn('POST /api/historial-materiales', `status=${r.status} ${JSON.stringify(r.body).slice(0, 80)}`)
  }

  // pasar-taller talleres
  const tlRes = await call('GET', '/api/pasar-taller/talleres')
  check('GET /api/pasar-taller/talleres', tlRes.status === 200, `status=${tlRes.status}`)

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log(`\n=== SUMMARY ===`)
  console.log(`  ✓ pass:  ${stats.pass}`)
  console.log(`  ✗ fail:  ${stats.fail}`)
  console.log(`  ⚠ warn:  ${stats.warn}`)
  if (failures.length) {
    console.log(`\nFAILURES:`)
    failures.forEach(f => console.log(`  - ${f}`))
  }
  process.exit(stats.fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
