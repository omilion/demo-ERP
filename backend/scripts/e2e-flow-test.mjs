// E2E smoke: login → orden → ODT → bitácora → despacho → caja
// Crea data marcada SMOKE_E2E_2026 y al final imprime IDs para limpiar.
const BASE = process.env.API_BASE || 'http://localhost:3001'
const EMAIL = process.env.API_EMAIL || 'admin@plastimar.cl'
const PASSWORD = process.env.API_PASSWORD || 'dev1234'
const TAG = 'SMOKE_E2E_2026'

let token = null
const ids = {}

async function call(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json }
}

function step(name, ok, detail) {
  const tag = ok ? '✓' : '✗'
  console.log(`${tag} ${name.padEnd(40)} ${detail || ''}`)
  if (!ok) process.exit(1)
}

async function main() {
  console.log(`\n=== E2E smoke @ ${BASE} ===\n`)

  // 1. Login
  let r = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD })
  token = r.body?.accessToken
  step('login admin', r.status === 200 && !!token, `status=${r.status}`)

  // 2. Pick first cliente + producto
  r = await call('GET', '/api/clientes?page=1')
  const cliente = r.body?.items?.[0]
  step('GET /api/clientes', r.status === 200 && !!cliente, `cliente_id=${cliente?.id} nombre=${cliente?.nombre?.slice(0, 30)}`)

  r = await call('GET', '/api/productos?page=1')
  const producto = r.body?.items?.[0]
  step('GET /api/productos', r.status === 200 && !!producto, `producto_id=${producto?.id}`)

  // 3. Crear orden
  r = await call('POST', '/api/ventas', {
    tipo: 'Normal',
    clienteId: cliente.id,
    observaciones: `${TAG} test orden`,
    items: [{ productoId: producto.id, cantidad: 1, precioUnitario: 1000 }],
  })
  const orden = r.body
  ids.orden = orden?.id
  step('POST /api/ventas (crear orden)', r.status === 201 && !!orden?.id, `orden_id=${orden?.id} total=${orden?.total}`)

  // 4. GET orden creada
  r = await call('GET', `/api/ventas/${orden.id}`)
  step('GET /api/ventas/:id', r.status === 200, `items=${r.body?.items?.length}`)

  // 5. Crear ODT linked
  r = await call('POST', '/api/odts', {
    tipo: 'Espumas',
    clienteNombre: cliente.nombre,
    descripcion: `${TAG} test odt`,
    ordenId: orden.id,
    estado: 'Pendiente',
  })
  const odt = r.body
  ids.odt = odt?.id
  step('POST /api/odts', r.status === 201 && !!odt?.id, `odt_id=${odt?.id}`)

  // 6. GET ODT verifica orden incluida
  r = await call('GET', `/api/odts/${odt.id}`)
  step('GET /api/odts/:id (con orden)', r.status === 200 && r.body?.orden?.id === orden.id, `orden_anidada=${r.body?.orden?.id}`)

  // 7. Crear bitácora-taller
  r = await call('POST', '/api/bitacora-taller', {
    odtId: odt.id,
    texto: `${TAG} avance taller`,
    usuarioReporta: 'smoke-test',
  })
  const bita = r.body
  ids.bita = bita?.id
  step('POST /api/bitacora-taller', r.status === 200 && !!bita?.id, `bita_id=${bita?.id}`)

  // 8. List bitácora con filtro odtId
  r = await call('GET', `/api/bitacora-taller?odtId=${odt.id}`)
  step('GET /api/bitacora-taller?odtId', r.status === 200 && r.body?.items?.length >= 1, `count=${r.body?.items?.length}`)

  // 9. Crear despacho
  r = await call('POST', '/api/despachos', {
    ordenId: orden.id,
    tipoDespacho: 'Retiro Local',
    contacto: `${TAG} contacto`,
    fechaEntrega: new Date().toISOString().slice(0, 10),
  })
  const desp = r.body
  ids.despacho = desp?.id
  step('POST /api/despachos', !!desp?.id, `desp_id=${desp?.id}`)

  // 10. Caja: asegurar turno abierto
  r = await call('GET', '/api/caja/turno')
  let turno = r.body
  if (!turno) {
    r = await call('POST', '/api/caja/turno', { cajaId: 1 })
    turno = r.body
    ids.turnoAbiertoPorTest = turno?.id
    step('POST /api/caja/turno (abrir)', r.status === 201 && !!turno?.id, `turno_id=${turno?.id}`)
  } else {
    step('GET /api/caja/turno (existente)', true, `turno_id=${turno.id}`)
  }

  // 11. Movimiento caja vinculado a orden
  r = await call('POST', `/api/caja/turno/${turno.id}/movimientos`, {
    tipo: 'Ingreso',
    monto: 1000,
    medioPago: 'Efectivo',
    ordenId: orden.id,
    referencia: `${TAG} pago`,
  })
  const mov = r.body
  ids.mov = mov?.id
  step('POST /api/caja/.../movimientos', r.status === 201 && !!mov?.id, `mov_id=${mov?.id}`)

  // 12. Verify orden listada con datos
  r = await call('GET', `/api/ventas?search=${TAG}`)
  step('GET /api/ventas?search', r.status === 200, `found=${r.body?.items?.length}`)

  // 13. Dashboard stats responden
  r = await call('GET', '/api/dashboard/stats')
  step('GET /api/dashboard/stats', r.status === 200, `keys=${Object.keys(r.body || {}).slice(0, 5).join(',')}`)

  console.log(`\n=== TODO OK ===`)
  console.log(`IDs para cleanup:`)
  console.log(JSON.stringify(ids, null, 2))
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
