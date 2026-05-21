// E2E edge cases: anular/activar, despacho parcial, turno+cierre, adjudicar licitación
const BASE = process.env.API_BASE || 'http://38.7.216.244:3001'
const EMAIL = process.env.API_EMAIL || 'admin@plastimar.cl'
const PASSWORD = process.env.API_PASSWORD || 'dev1234'
const TAG = `EDGE_${Date.now()}`

let token = null
const stats = { pass: 0, fail: 0 }
const failures = []

async function call(method, path, body) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json }
}

function check(label, ok, detail) {
  if (ok) { stats.pass++; console.log(`  ✓ ${label.padEnd(56)} ${detail || ''}`) }
  else { stats.fail++; failures.push(label); console.log(`  ✗ ${label.padEnd(56)} ${detail || ''}`) }
}

async function main() {
  console.log(`\n=== E2E EDGE CASES @ ${BASE} ===\n`)

  const lg = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD })
  token = lg.body?.accessToken
  check('login', lg.status === 200 && !!token, `status=${lg.status}`)
  if (!token) process.exit(1)

  const rutCli = `${Date.now().toString().slice(-7)}-K`
  const codProd = `${TAG}_P`

  // Setup: cliente + producto
  const cli = await call('POST', '/api/clientes', {
    rut: rutCli, razonSocial: `Cliente ${TAG}`, nombre: `Cliente ${TAG}`,
  })
  check('setup cliente', cli.status === 201, `id=${cli.body?.id}`)
  const clienteId = cli.body?.id

  const prod = await call('POST', '/api/productos', {
    codigoInterno: codProd, nombre: `Prod ${TAG}`,
    unidadMedida: 'unidad', precioLista: 1000, stock: 100, stockCritico: 5,
  })
  check('setup producto', prod.status === 201, `id=${prod.body?.id}`)
  const productoId = prod.body?.id

  if (!clienteId || !productoId) {
    console.log('ABORT: setup failed')
    return finish()
  }

  // ─── EDGE 1: Anular y Reactivar venta ─────────────────────────────────
  console.log(`\n── EDGE 1: ANULAR / REACTIVAR ──`)
  const v1 = await call('POST', '/api/ventas', {
    tipo: 'Normal', clienteId, descuentoPct: 0,
    items: [{ productoId, cantidad: 2, precioUnitario: 1000 }],
  })
  check('crear venta', v1.status === 201, `id=${v1.body?.id} estado=${v1.body?.estado}`)
  const ventaId = v1.body?.id

  if (ventaId) {
    const anul = await call('POST', `/api/ventas/${ventaId}/anular`)
    check('anular venta', anul.status === 200 && anul.body?.estado === 'Nula' && anul.body?.eliminada === true,
      `estado=${anul.body?.estado} eliminada=${anul.body?.eliminada}`)

    const gNul = await call('GET', `/api/ventas/${ventaId}`)
    check('GET venta anulada accesible', gNul.status === 200, `status=${gNul.status} estado=${gNul.body?.estado}`)

    const act = await call('POST', `/api/ventas/${ventaId}/activar`)
    check('reactivar venta', act.status === 200 && act.body?.estado === 'Activa' && act.body?.eliminada === false,
      `estado=${act.body?.estado} eliminada=${act.body?.eliminada}`)
  }

  // ─── EDGE 2: Despacho parcial → completo ──────────────────────────────
  console.log(`\n── EDGE 2: ENTREGA PARCIAL / TOTAL ──`)
  const v2 = await call('POST', '/api/ventas', {
    tipo: 'Normal', clienteId,
    items: [{ productoId, cantidad: 10, precioUnitario: 500 }],
  })
  check('crear venta multi-cant', v2.status === 201, `id=${v2.body?.id}`)
  const venta2Id = v2.body?.id
  const item1Id = v2.body?.items?.[0]?.id

  if (item1Id) {
    const p1 = await call('PUT', `/api/ventas/items/${item1Id}/entregados`, { nEntregados: 4 })
    check('entrega parcial nEntregados=4', p1.status === 200 && p1.body?.nEntregados === 4, `n=${p1.body?.nEntregados}`)

    const g1 = await call('GET', `/api/ventas/${venta2Id}`)
    check('estadoEntrega = Parcial', g1.body?.estadoEntrega === 'Parcial', `estado=${g1.body?.estadoEntrega}`)

    const p2 = await call('PUT', `/api/ventas/items/${item1Id}/entregados`, { nEntregados: 10 })
    check('entrega completa nEntregados=10', p2.status === 200 && p2.body?.nEntregados === 10, `n=${p2.body?.nEntregados}`)

    const g2 = await call('GET', `/api/ventas/${venta2Id}`)
    check('estadoEntrega = Entregada', g2.body?.estadoEntrega === 'Entregada', `estado=${g2.body?.estadoEntrega}`)

    // cap a cantidad
    const p3 = await call('PUT', `/api/ventas/items/${item1Id}/entregados`, { nEntregados: 999 })
    check('cap nEntregados <= cantidad', p3.status === 200 && p3.body?.nEntregados === 10, `n=${p3.body?.nEntregados}`)

    // valor inválido
    const p4 = await call('PUT', `/api/ventas/items/${item1Id}/entregados`, { nEntregados: -5 })
    check('rechaza nEntregados negativo', p4.status === 400, `status=${p4.status}`)
  }

  // ─── EDGE 3: Turno abrir/mov/cerrar/snapshot ──────────────────────────
  console.log(`\n── EDGE 3: TURNO Y CIERRE ──`)
  // Ver si hay turno abierto, cerrarlo primero
  const t0 = await call('GET', '/api/caja/turno')
  if (t0.body && t0.body.id && t0.body.estado === 'abierto') {
    const cerrar = await call('POST', `/api/caja/turno/${t0.body.id}/cerrar`, { obs: 'auto cleanup edge test' })
    check('cleanup turno previo', cerrar.status === 200, `id=${t0.body.id}`)
  }

  const ta = await call('POST', '/api/caja/turno', { cajaId: 1 })
  check('abrir turno', ta.status === 201, `id=${ta.body?.id} status=${ta.status}`)
  const turnoId = ta.body?.id

  if (turnoId) {
    const dup = await call('POST', '/api/caja/turno', { cajaId: 1 })
    check('rechaza segundo turno abierto', dup.status === 409, `status=${dup.status}`)

    const m1 = await call('POST', `/api/caja/turno/${turnoId}/movimientos`, {
      tipo: 'Ingreso', monto: 50000, medioPago: 'Efectivo', referencia: `${TAG}-m1`,
    })
    check('mov ingreso efectivo', m1.status === 201, `monto=${m1.body?.monto}`)

    const m2 = await call('POST', `/api/caja/turno/${turnoId}/movimientos`, {
      tipo: 'Ingreso', monto: 30000, medioPago: 'Débito', referencia: `${TAG}-m2`,
    })
    check('mov ingreso débito', m2.status === 201, `monto=${m2.body?.monto}`)

    let gastos = await call('GET', '/api/gastos')
    let gastoTipo = Array.isArray(gastos.body) ? gastos.body.find(g => g.activo !== false) : null
    if (!gastoTipo) {
      const nuevoGasto = await call('POST', '/api/gastos', { nombre: `${TAG}-gasto-caja`, activo: true })
      gastoTipo = nuevoGasto.body
      check('crear tipo gasto para egreso', nuevoGasto.status === 200 || nuevoGasto.status === 201, `id=${gastoTipo?.id}`)
    }
    const m3 = await call('POST', `/api/caja/turno/${turnoId}/movimientos`, {
      tipo: 'Egreso', monto: 5000, medioPago: 'Efectivo', referencia: `${TAG}-m3`, gastoTipoId: gastoTipo?.id,
    })
    check('mov egreso efectivo (negativo)', m3.status === 201 && m3.body?.monto === -5000, `monto=${m3.body?.monto}`)

    const cz = await call('POST', `/api/caja/turno/${turnoId}/cerrar`, { obs: `cierre ${TAG}` })
    check('cerrar turno', cz.status === 200 && cz.body?.estado === 'cerrado', `estado=${cz.body?.estado}`)

    const ci = await call('GET', `/api/caja/turno/${turnoId}/cierre`)
    const expEfectivo = 50000 - 5000
    check('snapshot efectivo correcto', ci.body?.efectivo === expEfectivo, `efectivo=${ci.body?.efectivo} esperado=${expEfectivo}`)
    check('snapshot débito correcto', ci.body?.debito === 30000, `debito=${ci.body?.debito}`)
    check('snapshot total = efectivo+debito', ci.body?.total === (expEfectivo + 30000), `total=${ci.body?.total}`)

    // No permitir mov en turno cerrado
    const mClosed = await call('POST', `/api/caja/turno/${turnoId}/movimientos`, {
      tipo: 'Ingreso', monto: 100, medioPago: 'Efectivo',
    })
    check('rechaza mov en turno cerrado', mClosed.status === 400, `status=${mClosed.status}`)
  }

  // ─── EDGE 4: Cotización licitación → adjudicar → crear-venta ──────────
  console.log(`\n── EDGE 4: ADJUDICAR LICITACIÓN ──`)
  const idLic = `LIC-${TAG}`
  const cot = await call('POST', '/api/cotizaciones', {
    idLicitacion: idLic,
    rutCliente: rutCli,
    estado: 'Pendiente',
    obs: 'Edge test',
    items: [
      { codigoInterno: codProd, nombre: `Prod ${TAG}`, cantidad: 5, cantAdjudicados: 3, precio: 1200 },
    ],
  })
  check('crear cotización + items', cot.status === 201, `id=${cot.body?.id}`)
  const cotId = cot.body?.id

  if (cotId) {
    const cv = await call('POST', `/api/cotizaciones/${cotId}/crear-venta`)
    check('crear-venta desde licitación', cv.status === 201, `orden=${cv.body?.orden?.id}`)
    const ordenLicId = cv.body?.orden?.id
    check('orden tipo Licitación', cv.body?.orden?.tipo === 'Licitación', `tipo=${cv.body?.orden?.tipo}`)
    check('orden hereda rutCliente', cv.body?.orden?.rutCliente === rutCli, `rut=${cv.body?.orden?.rutCliente}`)
    const itemsCv = cv.body?.orden?.items || []
    check('item cant = cantAdjudicados', itemsCv[0]?.cantidad === 3, `cant=${itemsCv[0]?.cantidad}`)

    // Sin items adjudicados → 400
    const cotEmpty = await call('POST', '/api/cotizaciones', {
      idLicitacion: `${idLic}-EMPTY`, rutCliente: rutCli,
      items: [{ codigoInterno: codProd, nombre: `Prod ${TAG}`, cantidad: 5, cantAdjudicados: 0, precio: 1000 }],
    })
    if (cotEmpty.body?.id) {
      const cvEmpty = await call('POST', `/api/cotizaciones/${cotEmpty.body.id}/crear-venta`)
      check('rechaza crear-venta sin adjudicados', cvEmpty.status === 400, `status=${cvEmpty.status}`)
      await call('DELETE', `/api/cotizaciones/${cotEmpty.body.id}`)
    }

    // Cleanup orden creada
    if (ordenLicId) await call('DELETE', `/api/ventas/${ordenLicId}`)
    await call('DELETE', `/api/cotizaciones/${cotId}`)
  }

  // ─── CLEANUP ──────────────────────────────────────────────────────────
  console.log(`\n── CLEANUP ──`)
  if (ventaId) {
    const d = await call('DELETE', `/api/ventas/${ventaId}`)
    check('delete venta1', [200, 204].includes(d.status), `status=${d.status}`)
  }
  if (venta2Id) {
    const d = await call('DELETE', `/api/ventas/${venta2Id}`)
    check('delete venta2', [200, 204].includes(d.status), `status=${d.status}`)
  }
  await call('DELETE', `/api/productos/${productoId}`)
  await call('DELETE', `/api/clientes/${clienteId}`)

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
