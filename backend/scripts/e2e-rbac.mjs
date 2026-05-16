// E2E RBAC: crea user por rol, valida accept/deny en endpoints representativos
const BASE = process.env.API_BASE || 'http://38.7.216.244:3001'
const ADMIN_EMAIL = process.env.API_EMAIL || 'admin@plastimar.cl'
const ADMIN_PASSWORD = process.env.API_PASSWORD || 'dev1234'
const TAG = `RBAC_${Date.now()}`

const stats = { pass: 0, fail: 0 }
const failures = []

async function callRaw(method, path, body, tok) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (tok) headers.Authorization = `Bearer ${tok}`
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json }
}

function check(label, ok, detail) {
  if (ok) { stats.pass++; console.log(`  ✓ ${label.padEnd(62)} ${detail || ''}`) }
  else { stats.fail++; failures.push(label); console.log(`  ✗ ${label.padEnd(62)} ${detail || ''}`) }
}

// Matriz esperada: rol → endpoints permitidos / denegados (status esperado 200/201/204 = ok, 403 = forbidden)
const MATRIX = {
  vendedor: {
    allow: [
      ['GET', '/api/ventas?page=1'],
      ['GET', '/api/clientes?page=1'],
      ['GET', '/api/productos?page=1'],
      ['GET', '/api/cotizaciones?page=1'],
    ],
    deny: [
      ['POST', '/api/caja/turno', { cajaId: 1 }],
      ['GET', '/api/caja/historico'],
      ['POST', '/api/productos', { codigoInterno: TAG, nombre: TAG, unidadMedida: 'u', precioLista: 100 }],
    ],
  },
  bodeguero: {
    allow: [
      ['GET', '/api/productos?page=1'],
      ['GET', '/api/despachos?page=1'],
      ['GET', '/api/clientes?page=1'],
    ],
    deny: [
      ['POST', '/api/ventas', { tipo: 'Normal', items: [{ productoId: 1, cantidad: 1, precioUnitario: 1 }] }],
      ['GET', '/api/caja/historico'],
    ],
  },
  cajero: {
    allow: [
      ['GET', '/api/caja/historico'],
      ['GET', '/api/cobranza-historico?page=1'],
      ['GET', '/api/clientes?page=1'],
      ['GET', '/api/ventas?page=1'],
    ],
    deny: [
      ['POST', '/api/productos', { codigoInterno: TAG, nombre: TAG, unidadMedida: 'u', precioLista: 100 }],
      ['POST', '/api/ventas', { tipo: 'Normal', items: [{ productoId: 1, cantidad: 1, precioUnitario: 1 }] }],
    ],
  },
  taller: {
    allow: [
      ['GET', '/api/bodega-taller?page=1'],
      ['GET', '/api/bitacora-taller?page=1'],
      ['GET', '/api/productos?page=1'],
    ],
    deny: [
      ['POST', '/api/ventas', { tipo: 'Normal', items: [{ productoId: 1, cantidad: 1, precioUnitario: 1 }] }],
      ['GET', '/api/caja/historico'],
    ],
  },
  solo_lectura: {
    allow: [
      ['GET', '/api/ventas?page=1'],
      ['GET', '/api/productos?page=1'],
      ['GET', '/api/clientes?page=1'],
      ['GET', '/api/caja/historico'],
    ],
    deny: [
      ['POST', '/api/clientes', { rut: '1-9', razonSocial: 'X' }],
      ['POST', '/api/productos', { codigoInterno: TAG, nombre: TAG, unidadMedida: 'u', precioLista: 100 }],
      ['POST', '/api/ventas', { tipo: 'Normal', items: [{ productoId: 1, cantidad: 1, precioUnitario: 1 }] }],
    ],
  },
}

async function main() {
  console.log(`\n=== E2E RBAC @ ${BASE} ===\n`)

  // Login admin
  const lg = await callRaw('POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  const adminTok = lg.body?.accessToken
  check('admin login', lg.status === 200 && !!adminTok, `status=${lg.status}`)
  if (!adminTok) return finish()

  // Crear usuario por rol + login
  const usersCreated = []
  const tokens = {}

  for (const role of Object.keys(MATRIX)) {
    const email = `${role}_${TAG}@plastimar.cl`.toLowerCase()
    const password = 'Test1234'
    const cr = await callRaw('POST', '/api/usuarios', {
      email, password, role, nombre: `${role} ${TAG}`,
    }, adminTok)
    if (cr.status !== 201) {
      check(`crear user ${role}`, false, `status=${cr.status} body=${JSON.stringify(cr.body).slice(0, 80)}`)
      continue
    }
    check(`crear user ${role}`, true, `id=${cr.body.id}`)
    usersCreated.push({ id: cr.body.id, role, email })

    const li = await callRaw('POST', '/api/auth/login', { email, password })
    if (li.status === 200 && li.body?.accessToken) {
      tokens[role] = li.body.accessToken
      check(`login ${role}`, true, `ok`)
    } else {
      check(`login ${role}`, false, `status=${li.status}`)
    }
  }

  // Validar matriz
  for (const role of Object.keys(MATRIX)) {
    const tok = tokens[role]
    if (!tok) continue
    console.log(`\n── ROL: ${role.toUpperCase()} ──`)
    for (const [m, p, body] of MATRIX[role].allow) {
      const r = await callRaw(m, p, body, tok)
      const ok = r.status !== 403 && r.status !== 401
      check(`ALLOW ${m} ${p}`, ok, `status=${r.status}`)
    }
    for (const [m, p, body] of MATRIX[role].deny) {
      const r = await callRaw(m, p, body, tok)
      const ok = r.status === 403
      check(`DENY  ${m} ${p}`, ok, `status=${r.status} ${ok ? '' : JSON.stringify(r.body).slice(0, 60)}`)
    }
  }

  // Cleanup users (admin sets activo=false; no hard delete endpoint)
  console.log(`\n── CLEANUP ──`)
  for (const u of usersCreated) {
    const d = await callRaw('PUT', `/api/usuarios/${u.id}`, { activo: false }, adminTok)
    check(`deactivar ${u.role}`, d.status === 200, `id=${u.id}`)
  }

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
