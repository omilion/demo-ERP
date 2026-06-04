import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin') {
  return app.jwt.sign({
    id: 1,
    role,
    nombre: `Test ${role}`,
    permisosExtra: null,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

describe('admin comisiones reglas', () => {
  let app
  let adminToken
  let vendedorToken
  let vendedor
  const createdReglas = []

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    adminToken = tokenFor(app, 'admin')
    vendedorToken = tokenFor(app, 'vendedor')

    const marker = Date.now()
    vendedor = await app.prisma.user.create({
      data: {
        email: `comisiones-${marker}@example.com`,
        passwordHash: 'test',
        role: 'vendedor',
        nombre: `Vendedor Comisiones ${marker}`,
        activo: true,
      },
    })
  })

  afterAll(async () => {
    if (createdReglas.length) {
      await app.prisma.comisionReglaTramo.deleteMany({ where: { reglaId: { in: createdReglas } } })
      await app.prisma.comisionRegla.deleteMany({ where: { id: { in: createdReglas } } })
    }
    if (vendedor?.id) await app.prisma.user.delete({ where: { id: vendedor.id } }).catch(() => {})
    await app.close()
  })

  it('rechaza administracion de reglas para usuarios no admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/comisiones/reglas',
      headers: { authorization: `Bearer ${vendedorToken}` },
      payload: {
        nombre: 'Comision vendedor',
        tipoVenta: 'Normal',
        modalidad: 'FIJA',
        base: 'VENDIDO',
        porcentaje: 3,
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('expone metadata con todos los tipos exactos sin agrupar', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/comisiones/meta',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).tiposVenta).toEqual([
      'Todos',
      'Venta sala',
      'Venta directa',
      'Normal',
      'Venta Web',
      'Convenio Marco',
      'Licitaci\u00f3n',
    ])
  })

  it('crea, lista y desactiva regla global fija para Todos', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/admin/comisiones/reglas',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        nombre: 'Comision global fallback',
        tipoVenta: 'Todos',
        modalidad: 'FIJA',
        base: 'VENDIDO',
        porcentaje: 2.5,
        prioridad: 200,
        vigenteDesde: '2026-06-01',
        vigenteHasta: '2026-12-31',
      },
    })
    expect(create.statusCode).toBe(201)
    const regla = JSON.parse(create.body)
    createdReglas.push(regla.id)
    expect(regla.vendedorId).toBeNull()
    expect(regla.tipoVenta).toBeNull()
    expect(regla.tipoVentaLabel).toBe('Todos')
    expect(regla.modalidad).toBe('FIJA')
    expect(regla.base).toBe('VENDIDO')
    expect(regla.porcentaje).toBe(2.5)

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/comisiones/reglas?tipoVenta=Todos&vendedorId=',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(list.statusCode).toBe(200)
    expect(JSON.parse(list.body).some(item => item.id === regla.id)).toBe(true)

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/admin/comisiones/reglas/${regla.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(del.statusCode).toBe(204)

    const get = await app.inject({
      method: 'GET',
      url: `/api/admin/comisiones/reglas/${regla.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(get.statusCode).toBe(200)
    expect(JSON.parse(get.body).activo).toBe(false)
  })

  it('acepta cada tipo exacto de venta configurado por el admin', async () => {
    const tipos = ['Venta sala', 'Venta directa', 'Normal', 'Venta Web', 'Convenio Marco', 'Licitaci\u00f3n']

    for (const tipoVenta of tipos) {
      const create = await app.inject({
        method: 'POST',
        url: '/api/admin/comisiones/reglas',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          nombre: `Comision ${tipoVenta}`,
          tipoVenta,
          modalidad: 'FIJA',
          base: 'VENDIDO',
          porcentaje: 1,
        },
      })
      expect(create.statusCode).toBe(201)
      const regla = JSON.parse(create.body)
      createdReglas.push(regla.id)
      expect(regla.tipoVenta).toBe(tipoVenta)
    }
  })

  it('crea y actualiza regla por vendedor con escala por monto', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/admin/comisiones/reglas',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        nombre: 'Comision vendedor escala',
        tipoVenta: 'Venta Sala',
        vendedorId: vendedor.id,
        modalidad: 'ESCALA_MONTO',
        base: 'COBRADO',
        prioridad: 500,
        tramos: [
          { montoDesde: 0, montoHasta: 1000000, porcentaje: 1 },
          { montoDesde: 1000000, porcentaje: 1.8 },
        ],
      },
    })
    expect(create.statusCode).toBe(201)
    const regla = JSON.parse(create.body)
    createdReglas.push(regla.id)
    expect(regla.tipoVenta).toBe('Venta sala')
    expect(regla.vendedorId).toBe(vendedor.id)
    expect(regla.vendedorNombre).toBe(vendedor.nombre)
    expect(regla.base).toBe('COBRADO')
    expect(regla.tramos).toHaveLength(2)
    expect(regla.tramos[1].montoHasta).toBeNull()

    const update = await app.inject({
      method: 'PUT',
      url: `/api/admin/comisiones/reglas/${regla.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        prioridad: 700,
        tramos: [
          { montoDesde: 0, montoHasta: 500000, porcentaje: 1.2 },
          { montoDesde: 500000, montoHasta: 1500000, porcentaje: 1.6 },
          { montoDesde: 1500000, porcentaje: 2 },
        ],
      },
    })
    expect(update.statusCode).toBe(200)
    const updated = JSON.parse(update.body)
    expect(updated.prioridad).toBe(700)
    expect(updated.tramos.map(tramo => tramo.porcentaje)).toEqual([1.2, 1.6, 2])
  })

  it('valida tipos agrupados, vendedor activo y tramos sin traslape', async () => {
    const invalidType = await app.inject({
      method: 'POST',
      url: '/api/admin/comisiones/reglas',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        nombre: 'Tipo agrupado invalido',
        tipoVenta: 'Venta',
        modalidad: 'FIJA',
        base: 'VENDIDO',
        porcentaje: 3,
      },
    })
    expect(invalidType.statusCode).toBe(400)
    expect(JSON.parse(invalidType.body).error).toMatch(/tipoVenta/)

    const invalidSeller = await app.inject({
      method: 'POST',
      url: '/api/admin/comisiones/reglas',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        nombre: 'Vendedor inexistente',
        tipoVenta: 'Venta Web',
        vendedorId: 99999999,
        modalidad: 'FIJA',
        base: 'VENDIDO',
        porcentaje: 3,
      },
    })
    expect(invalidSeller.statusCode).toBe(400)
    expect(JSON.parse(invalidSeller.body).error).toMatch(/vendedorId/)

    const overlap = await app.inject({
      method: 'POST',
      url: '/api/admin/comisiones/reglas',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        nombre: 'Tramos traslapados',
        tipoVenta: 'Venta Web',
        modalidad: 'ESCALA_MONTO',
        base: 'VENDIDO',
        tramos: [
          { montoDesde: 0, montoHasta: 1000, porcentaje: 1 },
          { montoDesde: 900, porcentaje: 2 },
        ],
      },
    })
    expect(overlap.statusCode).toBe(400)
    expect(JSON.parse(overlap.body).error).toMatch(/traslaparse/)
  })
})
