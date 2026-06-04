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

describe('reportes comisiones vendedores', () => {
  let app
  let adminToken
  let vendedorToken
  let vendedor
  let cliente
  const created = {
    reglas: [],
    ordenes: [],
    movimientosCaja: [],
    users: [],
  }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    adminToken = tokenFor(app, 'admin')
    vendedorToken = tokenFor(app, 'vendedor')

    const marker = Date.now()
    vendedor = await app.prisma.user.create({
      data: {
        email: `comisiones-reporte-${marker}@example.com`,
        passwordHash: 'test',
        role: 'vendedor',
        nombre: `Vendedor Reporte ${marker}`,
        activo: true,
      },
    })
    created.users.push(vendedor.id)
    cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
  })

  afterAll(async () => {
    await app.prisma.movimientoCaja.deleteMany({ where: { id: { in: created.movimientosCaja } } }).catch(() => {})
    await app.prisma.comisionReglaTramo.deleteMany({ where: { reglaId: { in: created.reglas } } }).catch(() => {})
    await app.prisma.comisionRegla.deleteMany({ where: { id: { in: created.reglas } } }).catch(() => {})
    await app.prisma.ordenCargo.deleteMany({ where: { ordenId: { in: created.ordenes } } }).catch(() => {})
    await app.prisma.ordenItem.deleteMany({ where: { ordenId: { in: created.ordenes } } }).catch(() => {})
    await app.prisma.orden.deleteMany({ where: { id: { in: created.ordenes } } }).catch(() => {})
    await app.prisma.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => {})
    await app.close()
  })

  async function createRule(data) {
    const rule = await app.prisma.comisionRegla.create({ data })
    created.reglas.push(rule.id)
    return rule
  }

  async function createOrden({ tipo, cantidad = 1, precioUnitario = 1000, createdAt = new Date('2026-06-10T12:00:00Z') } = {}) {
    const orden = await app.prisma.orden.create({
      data: {
        nInterno: 950000 + created.ordenes.length + Math.floor(Math.random() * 1000),
        tipo,
        clienteId: cliente.id,
        userId: vendedor.id,
        creadorNombre: vendedor.nombre,
        rutCliente: `COM-${Date.now()}`,
        sucursalId: 1,
        createdAt,
        items: {
          create: [{ productoId: 1, cantidad, precioUnitario }],
        },
      },
      include: { items: true },
    })
    created.ordenes.push(orden.id)
    return orden
  }

  async function createPago(ordenId, data = {}) {
    const pago = await app.prisma.movimientoCaja.create({
      data: {
        ordenId,
        tipo: 'Ingreso',
        monto: 1000,
        medioPago: 'Efectivo',
        sucursalId: 1,
        fecha: new Date('2026-06-12T12:00:00Z'),
        ...data,
      },
    })
    created.movimientosCaja.push(pago.id)
    return pago
  }

  it('bloquea el reporte para vendedores', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reportes/comisiones',
      headers: { authorization: `Bearer ${vendedorToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('calcula comision por regla especifica vendedor + tipo sobre total vendido', async () => {
    await createRule({
      nombre: 'Reporte global fallback',
      modalidad: 'FIJA',
      base: 'VENDIDO',
      porcentaje: 1,
      prioridad: 1000,
      vigenteDesde: new Date('2026-01-01T00:00:00Z'),
    })
    const rule = await createRule({
      nombre: 'Reporte vendedor venta sala',
      tipoVenta: 'Venta sala',
      vendedorId: vendedor.id,
      modalidad: 'FIJA',
      base: 'VENDIDO',
      porcentaje: 3,
      prioridad: 100000,
      vigenteDesde: new Date('2026-01-01T00:00:00Z'),
    })
    const orden = await createOrden({ tipo: 'Venta sala', cantidad: 2, precioUnitario: 1000 })
    await createPago(orden.id, { monto: 1000 })
    await createPago(orden.id, { monto: 500, medioPago: 'Referencial' })

    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/comisiones?desde=2026-06-01&hasta=2026-06-30&tipoVenta=venta-sala&vendedorId=${vendedor.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0]).toMatchObject({
      ordenId: orden.id,
      tipoVenta: 'Venta sala',
      vendedorId: vendedor.id,
      totalVendido: 2000,
      totalCobrado: 1000,
      baseRegla: 'VENDIDO',
      baseComision: 2000,
      comisionEstimada: 60,
      reglaId: rule.id,
      reglaScope: 'vendedor_tipo',
    })
    expect(body.totales.totalComision).toBe(60)
  })

  it('usa pagos reales de caja para base COBRADO y excluye referenciales, eliminados y fuera de fecha', async () => {
    await createRule({
      nombre: 'Reporte vendedor web cobrado',
      tipoVenta: 'Venta Web',
      vendedorId: vendedor.id,
      modalidad: 'FIJA',
      base: 'COBRADO',
      porcentaje: 5,
      prioridad: 100001,
      vigenteDesde: new Date('2026-01-01T00:00:00Z'),
    })
    const orden = await createOrden({ tipo: 'Venta Web', cantidad: 4, precioUnitario: 1000 })
    await createPago(orden.id, { monto: 1200, fecha: new Date('2026-06-15T12:00:00Z') })
    await createPago(orden.id, { monto: 800, fecha: new Date('2026-07-01T12:00:00Z') })
    await createPago(orden.id, { monto: 700, medioPago: 'Referencial', fecha: new Date('2026-06-16T12:00:00Z') })
    await createPago(orden.id, { monto: 300, eliminado: true, fecha: new Date('2026-06-17T12:00:00Z') })
    await createPago(orden.id, { tipo: 'Egreso', monto: 200, fecha: new Date('2026-06-18T12:00:00Z') })

    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/comisiones?desde=2026-06-01&hasta=2026-06-30&cobroDesde=2026-06-01&cobroHasta=2026-06-30&tipoVenta=venta-web&vendedorId=${vendedor.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].totalVendido).toBe(4000)
    expect(body.rows[0].totalCobrado).toBe(1200)
    expect(body.rows[0].baseRegla).toBe('COBRADO')
    expect(body.rows[0].baseComision).toBe(1200)
    expect(body.rows[0].comisionEstimada).toBe(60)
  })

  it('aplica escala por monto y exporta CSV trazable', async () => {
    await createRule({
      nombre: 'Reporte vendedor escala convenio',
      tipoVenta: 'Convenio Marco',
      vendedorId: vendedor.id,
      modalidad: 'ESCALA_MONTO',
      base: 'VENDIDO',
      prioridad: 100002,
      vigenteDesde: new Date('2026-01-01T00:00:00Z'),
      tramos: {
        create: [
          { montoDesde: 0, montoHasta: 1000, porcentaje: 1 },
          { montoDesde: 1000, porcentaje: 2 },
        ],
      },
    })
    const orden = await createOrden({ tipo: 'Convenio Marco', cantidad: 3, precioUnitario: 500 })

    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/comisiones?desde=2026-06-01&hasta=2026-06-30&tipoVenta=convenio-marco&vendedorId=${vendedor.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].ordenId).toBe(orden.id)
    expect(body.rows[0].porcentajeAplicado).toBe(2)
    expect(body.rows[0].comisionEstimada).toBe(30)

    const exportRes = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/comisiones?desde=2026-06-01&hasta=2026-06-30&tipoVenta=convenio-marco&vendedorId=${vendedor.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(exportRes.statusCode).toBe(200)
    expect(exportRes.headers['content-type']).toContain('text/csv')
    expect(exportRes.body).toContain('Comision estimada')
    expect(exportRes.body).toContain('Reporte vendedor escala convenio')
    expect(exportRes.body).toContain(String(orden.nInterno))
  })
})
