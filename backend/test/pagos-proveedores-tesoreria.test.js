import { describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import pagosProveedoresRoutes, { calculatePagoFinancials } from '../src/routes/pagos-proveedores/index.js'
import { can } from '../src/middleware/rbac.js'

function replyStub() {
  return {
    statusCode: 200,
    body: undefined,
    code(statusCode) {
      this.statusCode = statusCode
      return this
    },
    send(body) {
      this.body = body
      return body
    },
  }
}

async function buildApp(prisma) {
  const routes = { get: {}, post: {}, put: {}, delete: {} }
  const fastify = {
    authenticate: async () => {},
    rbac: (module, permission) => async (request, reply) => {
      const allowed = can(request.user?.role, module, permission, request.user?.permisosExtra)
      if (!allowed) {
        reply.code(403).send({ error: 'Forbidden' })
        throw new Error('Forbidden')
      }
    },
    prisma,
    get: (path, opts, handler) => { routes.get[path] = handler || opts },
    post: (path, opts, handler) => { routes.post[path] = handler || opts },
    put: (path, opts, handler) => { routes.put[path] = handler || opts },
    delete: (path, opts, handler) => { routes.delete[path] = handler || opts },
    log: { error: () => {} },
  }
  await pagosProveedoresRoutes(fastify)
  return routes
}

describe('Pilar 2 — calculatePagoFinancials con precisión Decimal y Notas de Crédito', () => {
  it('calcula saldo y estado Pendiente para factura nueva', () => {
    const res = calculatePagoFinancials({
      total: 100000,
      nc: false,
      ncMonto: null,
      montoPagado: 0,
      estado: 'Pendiente',
    })
    expect(res.totalDec.toFixed(2)).toBe('100000.00')
    expect(res.efectivoPagar.toFixed(2)).toBe('100000.00')
    expect(res.montoPagadoDec.toFixed(2)).toBe('0.00')
    expect(res.saldoDec.toFixed(2)).toBe('100000.00')
    expect(res.estado).toBe('Pendiente')
  })

  it('calcula saldo y estado Abonado ante pago parcial', () => {
    const res = calculatePagoFinancials({
      total: 100000,
      nc: false,
      montoPagado: 0,
      estado: 'Pendiente',
    }, { montoPagadoOverride: 35000 })

    expect(res.montoPagadoDec.toFixed(2)).toBe('35000.00')
    expect(res.saldoDec.toFixed(2)).toBe('65000.00')
    expect(res.estado).toBe('Abonado')
  })

  it('calcula saldo 0 y estado Pagado cuando se completa el pago', () => {
    const res = calculatePagoFinancials({
      total: 100000,
      nc: false,
      montoPagado: 35000,
      estado: 'Abonado',
    }, { montoPagadoOverride: 100000 })

    expect(res.montoPagadoDec.toFixed(2)).toBe('100000.00')
    expect(res.saldoDec.toFixed(2)).toBe('0.00')
    expect(res.estado).toBe('Pagado')
  })

  it('Ajuste 3: Factura con Nota de Crédito reduce el saldo y llega a Pagado con saldo 0', () => {
    // Factura $100.000 con NC de $20.000 -> Exigible $80.000
    const res = calculatePagoFinancials({
      total: 100000,
      nc: true,
      ncMonto: 20000,
      montoPagado: 0,
      estado: 'Pendiente',
    })
    expect(res.totalDec.toFixed(2)).toBe('100000.00')
    expect(res.ncDec.toFixed(2)).toBe('20000.00')
    expect(res.efectivoPagar.toFixed(2)).toBe('80000.00')
    expect(res.saldoDec.toFixed(2)).toBe('80000.00')

    // Si se pagan los $80.000, debe llegar a saldo 0 y estado Pagado
    const resPagado = calculatePagoFinancials({
      total: 100000,
      nc: true,
      ncMonto: 20000,
      montoPagado: 0,
      estado: 'Pendiente',
    }, { montoPagadoOverride: 80000 })

    expect(resPagado.saldoDec.toFixed(2)).toBe('0.00')
    expect(resPagado.estado).toBe('Pagado')
  })

  it('Ajuste 3: Nota de crédito por el 100% deja el documento como Pagado de inmediato', () => {
    const res = calculatePagoFinancials({
      total: 50000,
      nc: true,
      ncMonto: 50000,
      montoPagado: 0,
      estado: 'Pendiente',
    })
    expect(res.efectivoPagar.toFixed(2)).toBe('0.00')
    expect(res.saldoDec.toFixed(2)).toBe('0.00')
    expect(res.estado).toBe('Pagado')
  })
})

describe('Pilar 1 & Pilar 2 — Endpoints de Abonos, Caja e Idempotencia', () => {
  it('registra abono parcial de Banco: actualiza saldo a Abonado y no exige turno de caja', async () => {
    const pagoMock = {
      id: 10,
      total: 100000,
      nc: false,
      ncMonto: null,
      montoPagado: new Prisma.Decimal('0.00'),
      saldo: new Prisma.Decimal('100000.00'),
      estado: 'Pendiente',
      eliminado: false,
      sucursalId: null,
    }

    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      pagoProveedor: {
        findUnique: vi.fn().mockResolvedValue(pagoMock),
        update: vi.fn().mockImplementation(({ data }) => ({ ...pagoMock, ...data })),
      },
      abonoPagoProveedor: {
        create: vi.fn().mockImplementation(({ data }) => ({ id: 1, ...data })),
      },
    }

    const prisma = {
      $transaction: vi.fn(async (cb) => cb(tx)),
    }

    const routes = await buildApp(prisma)
    const reply = replyStub()

    await routes.post['/:id/abonos']({
      user: { role: 'admin', nombre: 'Admin User' },
      params: { id: '10' },
      body: {
        monto: 30000,
        origenFondos: 'Banco',
        bancoOrigen: 'BancoEstado',
        numeroOperacion: 'TRX-123456',
        medioPago: 'Transferencia',
      },
    }, reply)

    expect(reply.statusCode).toBe(201)
    expect(reply.body.ok).toBe(true)
    expect(reply.body.pago.estado).toBe('Abonado')
    expect(reply.body.pago.saldo.toFixed(2)).toBe('70000.00')
    expect(reply.body.pago.montoPagado.toFixed(2)).toBe('30000.00')
    expect(tx.abonoPagoProveedor.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        monto: new Prisma.Decimal('30000.00'),
        origenFondos: 'Banco',
        numeroOperacion: 'TRX-123456',
        movimientoCajaId: null,
      }),
    }))
  })

  it('falla con 400 si origenFondos es Caja y no hay turno abierto', async () => {
    const pagoMock = {
      id: 10,
      total: 100000,
      saldo: new Prisma.Decimal('100000.00'),
      estado: 'Pendiente',
      eliminado: false,
      sucursalId: null,
    }

    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      pagoProveedor: {
        findUnique: vi.fn().mockResolvedValue(pagoMock),
      },
      turno: {
        findFirst: vi.fn().mockResolvedValue(null), // Sin turno abierto
      },
    }

    const prisma = {
      $transaction: vi.fn(async (cb) => cb(tx)),
    }

    const routes = await buildApp(prisma)
    const reply = replyStub()

    await routes.post['/:id/abonos']({
      user: { role: 'cajero', nombre: 'Juan Cajero' },
      params: { id: '10' },
      body: {
        monto: 10000,
        origenFondos: 'Caja',
        medioPago: 'Efectivo',
      },
    }, reply)

    expect(reply.statusCode).toBe(400)
    expect(reply.body.error).toContain('No hay turno de caja abierto')
  })

  it('crea MovimientoCaja de Egreso cuando origenFondos es Caja y hay turno abierto', async () => {
    const pagoMock = {
      id: 10,
      documento: 'Factura',
      nDoc: 'FAC-99',
      total: 50000,
      saldo: new Prisma.Decimal('50000.00'),
      montoPagado: new Prisma.Decimal('0.00'),
      estado: 'Pendiente',
      eliminado: false,
      sucursalId: 1,
    }

    const turnoMock = {
      id: 55,
      caja: { sucursalId: 1 },
      estado: 'abierto',
    }

    const movCajaMock = {
      id: 888,
      tipo: 'Egreso',
      monto: 50000,
      turnoId: 55,
    }

    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      pagoProveedor: {
        findUnique: vi.fn().mockResolvedValue(pagoMock),
        update: vi.fn().mockImplementation(({ data }) => ({ ...pagoMock, ...data })),
      },
      turno: {
        findFirst: vi.fn().mockResolvedValue(turnoMock),
      },
      movimientoCaja: {
        create: vi.fn().mockResolvedValue(movCajaMock),
      },
      abonoPagoProveedor: {
        create: vi.fn().mockImplementation(({ data }) => ({ id: 1, ...data })),
      },
    }

    const prisma = {
      $transaction: vi.fn(async (cb) => cb(tx)),
    }

    const routes = await buildApp(prisma)
    const reply = replyStub()

    await routes.post['/:id/abonos']({
      user: { role: 'cajero', nombre: 'Juan Cajero', sucursalId: 1 },
      params: { id: '10' },
      body: {
        monto: 50000,
        origenFondos: 'Caja',
        medioPago: 'Efectivo',
      },
    }, reply)

    expect(reply.statusCode).toBe(201)
    expect(reply.body.ok).toBe(true)
    expect(reply.body.pago.estado).toBe('Pagado')
    expect(reply.body.pago.saldo.toFixed(2)).toBe('0.00')
    expect(tx.movimientoCaja.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tipo: 'Egreso',
        monto: 50000,
        turnoId: 55,
        origenTipo: 'pago_proveedor',
        origenId: 10,
      }),
    }))
  })

  it('rechaza sobrepago con código 400', async () => {
    const pagoMock = {
      id: 10,
      total: 50000,
      saldo: new Prisma.Decimal('30000.00'),
      montoPagado: new Prisma.Decimal('20000.00'),
      estado: 'Abonado',
      eliminado: false,
    }

    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      pagoProveedor: {
        findUnique: vi.fn().mockResolvedValue(pagoMock),
      },
    }

    const prisma = {
      $transaction: vi.fn(async (cb) => cb(tx)),
    }

    const routes = await buildApp(prisma)
    const reply = replyStub()

    await routes.post['/:id/abonos']({
      user: { role: 'cajero', nombre: 'Juan Cajero' },
      params: { id: '10' },
      body: {
        monto: 40000, // Excede saldo de 30.000
        origenFondos: 'Banco',
      },
    }, reply)

    expect(reply.statusCode).toBe(400)
    expect(reply.body.error).toContain('excede el saldo pendiente')
  })

  it('Ajuste 4: Idempotencia estricta — doble POST cuando el documento ya está pagado es rechazado', async () => {
    // Si una petición concurrente o reintento llega cuando el saldo ya es 0
    const pagoMock = {
      id: 10,
      total: 50000,
      saldo: new Prisma.Decimal('0.00'),
      montoPagado: new Prisma.Decimal('50000.00'),
      estado: 'Pagado',
      eliminado: false,
    }

    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      pagoProveedor: {
        findUnique: vi.fn().mockResolvedValue(pagoMock),
      },
    }

    const prisma = {
      $transaction: vi.fn(async (cb) => cb(tx)),
    }

    const routes = await buildApp(prisma)
    const reply = replyStub()

    await routes.post['/:id/abonos']({
      user: { role: 'admin', nombre: 'Admin' },
      params: { id: '10' },
      body: {
        monto: 50000,
        origenFondos: 'Banco',
      },
    }, reply)

    expect(reply.statusCode).toBe(400)
    expect(reply.body.error).toContain('ya fue pagado en su totalidad')
  })

  it('anulación de abono revierte MovimientoCaja y restaura el saldo en PagoProveedor', async () => {
    const pagoMock = {
      id: 10,
      total: 100000,
      nc: false,
      ncMonto: null,
      montoPagado: new Prisma.Decimal('100000.00'),
      saldo: new Prisma.Decimal('0.00'),
      estado: 'Pagado',
      eliminado: false,
    }

    const abonoMock = {
      id: 3,
      pagoId: 10,
      monto: new Prisma.Decimal('60000.00'),
      movimientoCajaId: 777,
      anulado: false,
    }

    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      pagoProveedor: {
        findUnique: vi.fn().mockResolvedValue(pagoMock),
        update: vi.fn().mockImplementation(({ data }) => ({ ...pagoMock, ...data })),
      },
      abonoPagoProveedor: {
        findFirst: vi.fn().mockResolvedValue(abonoMock),
        update: vi.fn().mockImplementation(({ data }) => ({ ...abonoMock, ...data })),
      },
      movimientoCaja: {
        update: vi.fn().mockResolvedValue({ id: 777, eliminado: true }),
      },
    }

    const prisma = {
      $transaction: vi.fn(async (cb) => cb(tx)),
    }

    const routes = await buildApp(prisma)
    const reply = replyStub()

    await routes.post['/:id/abonos/:abonoId/anular']({
      user: { role: 'admin', nombre: 'Admin User' },
      params: { id: '10', abonoId: '3' },
      body: { motivo: 'Error en comprobante' },
    }, reply)

    expect(reply.statusCode).toBe(200)
    expect(reply.body.ok).toBe(true)
    // El movimiento de caja fue marcado como anulado (sin borrar la fila)
    expect(tx.movimientoCaja.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 777 },
      data: expect.objectContaining({
        eliminado: true,
        estadoDoc: 'Nula',
      }),
    }))
    // El abono fue marcado como anulado
    expect(reply.body.abono.anulado).toBe(true)
    // El saldo fue restaurado
    expect(reply.body.pago.saldo.toFixed(2)).toBe('60000.00')
    expect(reply.body.pago.montoPagado.toFixed(2)).toBe('40000.00')
    expect(reply.body.pago.estado).toBe('Abonado')
  })
})

describe('Pilar 5 — Matriz RBAC con caja.pagos_proveedores', () => {
  it('cajero tiene permiso de lectura y de escritura para registrar pagos', () => {
    expect(can('cajero', 'caja.pagos_proveedores', 'read')).toBe(true)
    expect(can('cajero', 'caja.pagos_proveedores', 'write')).toBe(true)
    // Cajero no debe poder crear órdenes ni borrar
    expect(can('cajero', 'caja.pagos_proveedores', 'delete')).toBe(false)
  })

  it('bodeguero tiene permiso de lectura pero NO de pago ni anulación', () => {
    expect(can('bodeguero', 'caja.pagos_proveedores', 'read')).toBe(true)
    expect(can('bodeguero', 'caja.pagos_proveedores', 'write')).toBe(false)
    expect(can('bodeguero', 'caja.pagos_proveedores', 'delete')).toBe(false)
  })

  it('admin tiene permisos completos', () => {
    expect(can('admin', 'caja.pagos_proveedores', 'read')).toBe(true)
    expect(can('admin', 'caja.pagos_proveedores', 'write')).toBe(true)
    expect(can('admin', 'caja.pagos_proveedores', 'delete')).toBe(true)
  })

  it('vendedor no tiene acceso a pagos a proveedores', () => {
    expect(can('vendedor', 'caja.pagos_proveedores', 'read')).toBe(false)
    expect(can('vendedor', 'caja.pagos_proveedores', 'write')).toBe(false)
  })
})
