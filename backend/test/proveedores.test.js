import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { createErpAccessTokenPayload } from '../src/plugins/jwt.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin', permisosExtra = null) {
  return app.jwt.sign(createErpAccessTokenPayload({
    id: Math.floor(Math.random() * 1000000) + 1000,
    role,
    nombre: `QA ${role}`,
    permisosExtra,
  }))
}

function rutCheckDigit(body) {
  const digits = String(body)
  let sum = 0
  let factor = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const expected = 11 - (sum % 11)
  return expected === 11 ? '0' : expected === 10 ? 'K' : String(expected)
}

function validRut(seed) {
  const body = String(11000000 + (seed % 70000000))
  return `${body}-${rutCheckDigit(body)}`
}

function dottedRut(rawRut) {
  const [body, dv] = String(rawRut).split('-')
  return `${body.slice(0, -6)}.${body.slice(-6, -3)}.${body.slice(-3)}-${dv}`
}

function proveedorPayload(seed, overrides = {}) {
  return {
    nombre: `Proveedor SPR34 ${seed}`,
    razonSocial: `Razon Social SPR34 ${seed}`,
    rut: validRut(seed),
    giro: 'Insumos plasticos',
    email: `proveedor-spr34-${seed}@example.cl`,
    telefono: `+569${String(seed).slice(-8).padStart(8, '0')}`,
    direccion: `Calle SPR34 ${seed}`,
    region: 'Metropolitana',
    comuna: 'Santiago',
    porcVentaSala: 35,
    porcMarco: 22,
    porcLicitacion: 18,
    ...overrides,
  }
}

describe('SPR-34 proveedores legacy parity', () => {
  let app
  const marker = Date.now()
  const created = []
  const createdPagos = []

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.prisma.pagoProveedor.deleteMany({ where: { id: { in: createdPagos } } }).catch(() => {})
    await app.prisma.proveedor.deleteMany({ where: { id: { in: created } } }).catch(() => {})
    await app.close()
  })

  it('filters by legacy name, rut and codigoProveedor fields', async () => {
    const proveedor = await app.prisma.proveedor.create({
      data: {
        ...proveedorPayload(marker + 1, {
          nombre: `Proveedor Nombre Legacy ${marker}`,
          razonSocial: `Proveedor Razon ${marker}`,
          codigoProveedor: 91000000 + (marker % 100000),
        }),
        activo: true,
      },
    })
    created.push(proveedor.id)
    const token = tokenFor(app, 'admin')

    for (const query of [
      `nombre=${encodeURIComponent('Nombre Legacy')}`,
      `rut=${encodeURIComponent(proveedor.rut.slice(0, 6))}`,
      `codigoProveedor=${proveedor.codigoProveedor}`,
      `search=${proveedor.codigoProveedor}`,
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/proveedores?${query}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).items.map(p => p.id)).toContain(proveedor.id)
    }
  })

  it('exports proveedores with the legacy operational columns and current filter', async () => {
    const proveedor = await app.prisma.proveedor.create({
      data: {
        ...proveedorPayload(marker + 2, {
          nombre: `Proveedor Export Legacy ${marker}`,
          codigoProveedor: 92000000 + (marker % 100000),
          porcVentaSala: 41,
          porcMarco: 23,
          porcLicitacion: 19,
        }),
        activo: true,
      },
    })
    created.push(proveedor.id)
    const token = tokenFor(app, 'admin')

    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/proveedores?codigoProveedor=${proveedor.codigoProveedor}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Cod proveedor')
    expect(res.body).toContain('Nombre')
    expect(res.body).toContain('RUT')
    expect(res.body).toContain('Giro')
    expect(res.body).toContain('Region')
    expect(res.body).toContain('Comuna')
    expect(res.body).toContain('Porcentaje Venta Sala')
    expect(res.body).toContain('Porcentaje Convenio Marco')
    expect(res.body).toContain('Porcentaje Licitaci\u00f3n')
    expect(res.body).toContain(String(proveedor.codigoProveedor))
    expect(res.body).toContain(proveedor.nombre)
  })

  it('creates with automatic codigoProveedor and blocks duplicate legacy identifiers', async () => {
    const token = tokenFor(app, 'bodeguero')
    const base = marker + 3
    const create = await app.inject({
      method: 'POST',
      url: '/api/proveedores',
      headers: { authorization: `Bearer ${token}` },
      payload: proveedorPayload(base, { codigoProveedor: '' }),
    })
    expect(create.statusCode).toBe(201)
    const createdProveedor = JSON.parse(create.body)
    created.push(createdProveedor.id)
    expect(createdProveedor.codigoProveedor).toBeGreaterThan(0)
    expect(createdProveedor.rut).toContain('-')

    const duplicateName = await app.inject({
      method: 'POST',
      url: '/api/proveedores',
      headers: { authorization: `Bearer ${token}` },
      payload: proveedorPayload(base + 1000, { nombre: createdProveedor.nombre }),
    })
    expect(duplicateName.statusCode).toBe(409)

    const duplicateRut = await app.inject({
      method: 'POST',
      url: '/api/proveedores',
      headers: { authorization: `Bearer ${token}` },
      payload: proveedorPayload(base + 2000, { rut: createdProveedor.rut }),
    })
    expect(duplicateRut.statusCode).toBe(409)

    const duplicateCodigo = await app.inject({
      method: 'POST',
      url: '/api/proveedores',
      headers: { authorization: `Bearer ${token}` },
      payload: proveedorPayload(base + 3000, { codigoProveedor: createdProveedor.codigoProveedor }),
    })
    expect(duplicateCodigo.statusCode).toBe(409)
  })

  it('blocks duplicate RUT even when legacy data is stored without dots', async () => {
    const rawRut = validRut(marker + 3050)
    const existing = await app.prisma.proveedor.create({
      data: {
        ...proveedorPayload(marker + 3050, {
          nombre: `Proveedor Rut Legacy Crudo ${marker}`,
          rut: rawRut,
          codigoProveedor: 90500000 + (marker % 100000),
        }),
        activo: true,
      },
    })
    created.push(existing.id)
    const token = tokenFor(app, 'bodeguero')
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/proveedores',
      headers: { authorization: `Bearer ${token}` },
      payload: proveedorPayload(marker + 3051, { rut: dottedRut(rawRut) }),
    })
    expect(duplicate.statusCode).toBe(409)
    expect(JSON.parse(duplicate.body).error).toMatch(/rut/)
  })

  it('serializes automatic codigoProveedor assignment under concurrent creates', async () => {
    const token = tokenFor(app, 'bodeguero')
    const [first, second] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/proveedores',
        headers: { authorization: `Bearer ${token}` },
        payload: proveedorPayload(marker + 3100, { codigoProveedor: '' }),
      }),
      app.inject({
        method: 'POST',
        url: '/api/proveedores',
        headers: { authorization: `Bearer ${token}` },
        payload: proveedorPayload(marker + 3200, { codigoProveedor: '' }),
      }),
    ])
    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(201)
    const createdFirst = JSON.parse(first.body)
    const createdSecond = JSON.parse(second.body)
    created.push(createdFirst.id, createdSecond.id)
    expect(createdFirst.codigoProveedor).toBeGreaterThan(0)
    expect(createdSecond.codigoProveedor).toBeGreaterThan(0)
    expect(createdFirst.codigoProveedor).not.toBe(createdSecond.codigoProveedor)
  })

  it('keeps provider margins behind proveedores/bodega permissions', async () => {
    const proveedor = await app.prisma.proveedor.create({
      data: {
        ...proveedorPayload(marker + 4, {
          nombre: `Proveedor Margen Privado ${marker}`,
          codigoProveedor: 93000000 + (marker % 100000),
        }),
        activo: true,
      },
    })
    created.push(proveedor.id)
    const vendedor = tokenFor(app, 'vendedor')

    const list = await app.inject({
      method: 'GET',
      url: `/api/proveedores?search=${encodeURIComponent(proveedor.nombre)}`,
      headers: { authorization: `Bearer ${vendedor}` },
    })
    expect(list.statusCode).toBe(200)
    const row = JSON.parse(list.body).items.find(p => p.id === proveedor.id)
    expect(row).toBeTruthy()
    expect(row).not.toHaveProperty('porcVentaSala')
    expect(row).not.toHaveProperty('porcMarco')
    expect(row).not.toHaveProperty('porcLicitacion')

    const detail = await app.inject({
      method: 'GET',
      url: `/api/proveedores/${proveedor.id}`,
      headers: { authorization: `Bearer ${vendedor}` },
    })
    expect(detail.statusCode).toBe(403)
  })

  it('protects write/delete with proveedores permission and does not allow activo bypass', async () => {
    const proveedor = await app.prisma.proveedor.create({
      data: {
        ...proveedorPayload(marker + 5, {
          nombre: `Proveedor Activo Guard ${marker}`,
          codigoProveedor: 94000000 + (marker % 100000),
        }),
        activo: true,
      },
    })
    created.push(proveedor.id)
    const catalogOnly = tokenFor(app, 'vendedor', { catalogo: ['write'] })
    const bodeguero = tokenFor(app, 'bodeguero')

    const forbidden = await app.inject({
      method: 'PUT',
      url: `/api/proveedores/${proveedor.id}`,
      headers: { authorization: `Bearer ${catalogOnly}` },
      payload: { nombre: 'No debe pasar' },
    })
    expect(forbidden.statusCode).toBe(403)

    const update = await app.inject({
      method: 'PUT',
      url: `/api/proveedores/${proveedor.id}`,
      headers: { authorization: `Bearer ${bodeguero}` },
      payload: { activo: false, nombre: `Proveedor Activo Guard ${marker} OK` },
    })
    expect(update.statusCode).toBe(200)
    expect(JSON.parse(update.body).activo).toBe(true)

    const clearRequired = await app.inject({
      method: 'PUT',
      url: `/api/proveedores/${proveedor.id}`,
      headers: { authorization: `Bearer ${bodeguero}` },
      payload: { razonSocial: '' },
    })
    expect(clearRequired.statusCode).toBe(400)

    const clearCode = await app.inject({
      method: 'PUT',
      url: `/api/proveedores/${proveedor.id}`,
      headers: { authorization: `Bearer ${bodeguero}` },
      payload: { codigoProveedor: '' },
    })
    expect(clearCode.statusCode).toBe(400)

    const forbiddenDelete = await app.inject({
      method: 'DELETE',
      url: `/api/proveedores/${proveedor.id}`,
      headers: { authorization: `Bearer ${bodeguero}` },
    })
    expect(forbiddenDelete.statusCode).toBe(403)

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/proveedores/${proveedor.id}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` },
    })
    expect(del.statusCode).toBe(204)

    const reactivate = await app.inject({
      method: 'PUT',
      url: `/api/proveedores/${proveedor.id}`,
      headers: { authorization: `Bearer ${bodeguero}` },
      payload: { activo: true, nombre: 'Reactivado por bypass' },
    })
    expect(reactivate.statusCode).toBe(404)
    const stored = await app.prisma.proveedor.findUnique({ where: { id: proveedor.id } })
    expect(stored.activo).toBe(false)
  })

  it('rejects provider payments for inactive or unknown providers', async () => {
    const proveedor = await app.prisma.proveedor.create({
      data: {
        ...proveedorPayload(marker + 6, {
          nombre: `Proveedor Pago Inactivo ${marker}`,
          codigoProveedor: 95000000 + (marker % 100000),
        }),
        activo: false,
      },
    })
    created.push(proveedor.id)
    const pago = await app.prisma.pagoProveedor.create({
      data: { proveedorId: proveedor.id, documento: 'Factura', nDoc: `INACT-PAGO-${marker}`, estado: 'Pendiente', total: 1000 },
    })
    createdPagos.push(pago.id)
    const token = tokenFor(app, 'bodeguero')
    const admin = tokenFor(app, 'admin')

    const byProveedorRoute = await app.inject({
      method: 'POST',
      url: `/api/proveedores/${proveedor.id}/pagos`,
      headers: { authorization: `Bearer ${token}` },
      payload: { documento: 'Factura', nDoc: `INACT-${marker}`, fechaDoc: '2026-05-27', total: 1000 },
    })
    expect(byProveedorRoute.statusCode).toBe(404)

    const byMainRoute = await app.inject({
      method: 'POST',
      url: '/api/pagos-proveedores',
      headers: { authorization: `Bearer ${token}` },
      payload: { proveedorId: proveedor.id, documento: 'Factura', nDoc: `INACT-MAIN-${marker}`, total: 1000 },
    })
    expect(byMainRoute.statusCode).toBe(404)

    const byUnknownCode = await app.inject({
      method: 'POST',
      url: '/api/pagos-proveedores',
      headers: { authorization: `Bearer ${token}` },
      payload: { codigoProveedor: 999999901, documento: 'Factura', nDoc: `UNKNOWN-${marker}`, total: 1000 },
    })
    expect(byUnknownCode.statusCode).toBe(404)

    const nestedList = await app.inject({
      method: 'GET',
      url: `/api/proveedores/${proveedor.id}/pagos`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(nestedList.statusCode).toBe(404)

    const nestedUpdate = await app.inject({
      method: 'PUT',
      url: `/api/proveedores/${proveedor.id}/pagos/${pago.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { estado: 'Pagado' },
    })
    expect(nestedUpdate.statusCode).toBe(404)

    const nestedDelete = await app.inject({
      method: 'DELETE',
      url: `/api/proveedores/${proveedor.id}/pagos/${pago.id}`,
      headers: { authorization: `Bearer ${admin}` },
    })
    expect(nestedDelete.statusCode).toBe(404)
  })

  it('stores codigoProveedor on nested provider payments and blocks duplicates from main route', async () => {
    const proveedor = await app.prisma.proveedor.create({
      data: {
        ...proveedorPayload(marker + 6500, {
          nombre: `Proveedor Pago Codigo ${marker}`,
          codigoProveedor: 96500000 + (marker % 100000),
        }),
        activo: true,
      },
    })
    created.push(proveedor.id)
    const token = tokenFor(app, 'bodeguero')
    const nDoc = `FICHA-DUP-${marker}`

    const nested = await app.inject({
      method: 'POST',
      url: `/api/proveedores/${proveedor.id}/pagos`,
      headers: { authorization: `Bearer ${token}` },
      payload: { documento: 'Factura', nDoc, fechaDoc: '2026-05-27', total: 1000 },
    })
    expect(nested.statusCode).toBe(201)
    const pago = JSON.parse(nested.body)
    createdPagos.push(pago.id)
    expect(pago.proveedorId).toBe(proveedor.id)
    expect(pago.codigoProveedor).toBe(proveedor.codigoProveedor)

    const duplicateByCode = await app.inject({
      method: 'POST',
      url: '/api/pagos-proveedores',
      headers: { authorization: `Bearer ${token}` },
      payload: { codigoProveedor: proveedor.codigoProveedor, documento: 'Factura', nDoc, total: 1000 },
    })
    expect(duplicateByCode.statusCode).toBe(409)
  })

  it('blocks main payment duplicate by codigoProveedor with case-insensitive documento', async () => {
    const proveedor = await app.prisma.proveedor.create({
      data: {
        ...proveedorPayload(marker + 6550, {
          nombre: `Proveedor Pago Documento Case ${marker}`,
          codigoProveedor: 96550000 + (marker % 100000),
        }),
        activo: true,
      },
    })
    created.push(proveedor.id)
    const nDoc = `doc-case-${marker}`
    const legacyPago = await app.prisma.pagoProveedor.create({
      data: {
        codigoProveedor: proveedor.codigoProveedor,
        documento: 'factura',
        nDoc,
        estado: 'Pendiente',
        total: 1000,
      },
    })
    createdPagos.push(legacyPago.id)
    const token = tokenFor(app, 'bodeguero')

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/pagos-proveedores',
      headers: { authorization: `Bearer ${token}` },
      payload: { codigoProveedor: proveedor.codigoProveedor, documento: 'Factura', nDoc: nDoc.toUpperCase(), total: 1000 },
    })
    expect(duplicate.statusCode).toBe(409)
  })

  it('blocks nested payment update against legacy code-only duplicates', async () => {
    const proveedor = await app.prisma.proveedor.create({
      data: {
        ...proveedorPayload(marker + 6600, {
          nombre: `Proveedor Pago Legacy Code ${marker}`,
          codigoProveedor: 96600000 + (marker % 100000),
        }),
        activo: true,
      },
    })
    created.push(proveedor.id)
    const nDoc = `leg-code-dup-${marker}`
    const legacyPago = await app.prisma.pagoProveedor.create({
      data: {
        codigoProveedor: proveedor.codigoProveedor,
        documento: 'Factura',
        nDoc,
        estado: 'Pendiente',
        total: 1000,
      },
    })
    const fichaPago = await app.prisma.pagoProveedor.create({
      data: {
        proveedorId: proveedor.id,
        documento: 'Factura',
        nDoc: `ORIGINAL-${marker}`,
        estado: 'Pendiente',
        total: 1000,
      },
    })
    createdPagos.push(legacyPago.id, fichaPago.id)
    const token = tokenFor(app, 'bodeguero')

    const duplicate = await app.inject({
      method: 'PUT',
      url: `/api/proveedores/${proveedor.id}/pagos/${fichaPago.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { documento: 'factura', nDoc: nDoc.toUpperCase() },
    })
    expect(duplicate.statusCode).toBe(409)
    const stored = await app.prisma.pagoProveedor.findUnique({ where: { id: fichaPago.id } })
    expect(stored.nDoc).toBe(`ORIGINAL-${marker}`)
  })

  it('shows and normalizes legacy code-only payments in provider ficha', async () => {
    const proveedor = await app.prisma.proveedor.create({
      data: {
        ...proveedorPayload(marker + 6700, {
          nombre: `Proveedor Ficha Legacy Pago ${marker}`,
          codigoProveedor: 96700000 + (marker % 100000),
        }),
        activo: true,
      },
    })
    created.push(proveedor.id)
    const pago = await app.prisma.pagoProveedor.create({
      data: {
        codigoProveedor: proveedor.codigoProveedor,
        documento: 'Boleta',
        nDoc: `LEG-FICHA-${marker}`,
        estado: 'Pendiente',
        total: 2000,
      },
    })
    createdPagos.push(pago.id)
    const token = tokenFor(app, 'bodeguero')

    const detail = await app.inject({
      method: 'GET',
      url: `/api/proveedores/${proveedor.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(detail.statusCode).toBe(200)
    const detailIds = JSON.parse(detail.body).pagos.map(p => p.id)
    expect(detailIds).toContain(pago.id)

    const list = await app.inject({
      method: 'GET',
      url: `/api/proveedores/${proveedor.id}/pagos`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(list.statusCode).toBe(200)
    const listIds = JSON.parse(list.body).map(p => p.id)
    expect(listIds).toContain(pago.id)

    const update = await app.inject({
      method: 'PUT',
      url: `/api/proveedores/${proveedor.id}/pagos/${pago.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { estado: 'Pagado' },
    })
    expect(update.statusCode).toBe(200)
    const updated = JSON.parse(update.body)
    expect(updated.proveedorId).toBe(proveedor.id)
    expect(updated.codigoProveedor).toBe(proveedor.codigoProveedor)
  })

  it('does not use legacy code-only fallback when codigoProveedor is ambiguous', async () => {
    const codigoProveedor = 96800000 + (marker % 100000)
    const proveedor = await app.prisma.proveedor.create({
      data: {
        ...proveedorPayload(marker + 6800, {
          nombre: `Proveedor Ficha Codigo Ambiguo A ${marker}`,
          codigoProveedor,
        }),
        activo: true,
      },
    })
    const otroProveedor = await app.prisma.proveedor.create({
      data: {
        ...proveedorPayload(marker + 6801, {
          nombre: `Proveedor Ficha Codigo Ambiguo B ${marker}`,
          codigoProveedor,
        }),
        activo: true,
      },
    })
    created.push(proveedor.id, otroProveedor.id)
    const pagoCodeOnly = await app.prisma.pagoProveedor.create({
      data: {
        codigoProveedor,
        documento: 'Boleta',
        nDoc: `AMB-CODE-${marker}`,
        estado: 'Pendiente',
        total: 3000,
      },
    })
    const pagoOtroProveedor = await app.prisma.pagoProveedor.create({
      data: {
        proveedorId: otroProveedor.id,
        codigoProveedor,
        documento: 'Boleta',
        nDoc: `OTHER-FICHA-${marker}`,
        estado: 'Pendiente',
        total: 3000,
      },
    })
    createdPagos.push(pagoCodeOnly.id, pagoOtroProveedor.id)
    const token = tokenFor(app, 'bodeguero')

    const detail = await app.inject({
      method: 'GET',
      url: `/api/proveedores/${proveedor.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(detail.statusCode).toBe(200)
    const detailIds = JSON.parse(detail.body).pagos.map(p => p.id)
    expect(detailIds).not.toContain(pagoCodeOnly.id)
    expect(detailIds).not.toContain(pagoOtroProveedor.id)

    const wrongProviderUpdate = await app.inject({
      method: 'PUT',
      url: `/api/proveedores/${proveedor.id}/pagos/${pagoCodeOnly.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { estado: 'Pagado' },
    })
    expect(wrongProviderUpdate.statusCode).toBe(404)
  })

  it('blocks nested payment update from bypassing formal anulacion flow', async () => {
    const proveedor = await app.prisma.proveedor.create({
      data: {
        ...proveedorPayload(marker + 7, {
          nombre: `Proveedor Pago Stock ${marker}`,
          codigoProveedor: 96000000 + (marker % 100000),
        }),
        activo: true,
      },
    })
    created.push(proveedor.id)
    const pago = await app.prisma.pagoProveedor.create({
      data: {
        proveedorId: proveedor.id,
        documento: 'Factura',
        nDoc: `STOCK-ANULAR-${marker}`,
        estado: 'Pendiente',
        total: 1000,
        stockAplicadoAt: new Date(),
      },
    })
    createdPagos.push(pago.id)
    const token = tokenFor(app, 'bodeguero')

    const res = await app.inject({
      method: 'PUT',
      url: `/api/proveedores/${proveedor.id}/pagos/${pago.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { estado: 'Anulado' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error).toMatch(/Anular/)
    const stored = await app.prisma.pagoProveedor.findUnique({ where: { id: pago.id } })
    expect(stored.estado).toBe('Pendiente')
  })

  it('lists productos of a proveedor with search and pagination', async () => {
    const token = tokenFor(app, 'admin')
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/proveedores',
      headers: { authorization: `Bearer ${token}` },
      payload: proveedorPayload(9100 + (marker % 1000)),
    })
    expect(createRes.statusCode).toBe(201)
    const proveedor = JSON.parse(createRes.body)
    created.push(proveedor.id)

    const productos = []
    for (const [i, nombre] of [['A', `Cubo Didactico PROD-${marker}`], ['B', `Alfombra Sensorial PROD-${marker}`]]) {
      const producto = await app.prisma.producto.create({
        data: {
          codigoInterno: `QA-PROV-${marker}-${i}`,
          nombre,
          proveedorId: proveedor.id,
          proveedor: proveedor.nombre,
          precioLista: 1000,
          activo: true,
        },
      })
      productos.push(producto.id)
    }
    // producto inactivo no debe aparecer
    const inactivo = await app.prisma.producto.create({
      data: { codigoInterno: `QA-PROV-${marker}-OFF`, nombre: `Inactivo PROD-${marker}`, proveedorId: proveedor.id, activo: false },
    })
    productos.push(inactivo.id)

    try {
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/proveedores/${proveedor.id}/productos`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(listRes.statusCode).toBe(200)
      const body = JSON.parse(listRes.body)
      expect(body.total).toBe(2)
      expect(body.items).toHaveLength(2)
      expect(body.items.map(p => p.codigoInterno).sort()).toEqual([`QA-PROV-${marker}-A`, `QA-PROV-${marker}-B`])

      const searchRes = await app.inject({
        method: 'GET',
        url: `/api/proveedores/${proveedor.id}/productos?search=alfombra`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(searchRes.statusCode).toBe(200)
      const searchBody = JSON.parse(searchRes.body)
      expect(searchBody.total).toBe(1)
      expect(searchBody.items[0].nombre).toContain('Alfombra')

      const notFoundRes = await app.inject({
        method: 'GET',
        url: '/api/proveedores/99999999/productos',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(notFoundRes.statusCode).toBe(404)
    } finally {
      await app.prisma.producto.deleteMany({ where: { id: { in: productos } } }).catch(() => {})
    }
  })
})
