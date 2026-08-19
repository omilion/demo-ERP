import { describe, expect, it, vi } from 'vitest'
import { approveCrmFromOrderPayment, businessDaysBetween, ensureOrdenForGanado, semaforoForCrm, transitionCrm, validateTransition } from '../src/domain/crm/service.js'
import { evaluateCrmAutomation } from '../src/jobs/crmAutomation.mjs'

describe('CRM comercial', () => {
  it('calcula límites del semáforo en días hábiles', () => {
    const monday = new Date('2026-08-03T12:00:00-04:00')
    expect(businessDaysBetween(monday, new Date('2026-08-10T12:00:00-04:00'))).toBe(5)
    const leadActivo = { ultimaGestionAt: monday, vendedorId: 7, etapaComercial: 'SEGUIMIENTO' }
    expect(semaforoForCrm(leadActivo, new Date('2026-08-10T12:00:00-04:00'))).toEqual({ semaforo: 'AMARILLO', diasSinGestion: 5 })
    expect(semaforoForCrm(leadActivo, new Date('2026-08-17T12:00:00-04:00'))).toEqual({ semaforo: 'ROJO', diasSinGestion: 10 })
    expect(semaforoForCrm(leadActivo, new Date('2026-08-18T12:00:00-04:00'))).toEqual({ semaforo: 'ROJO', diasSinGestion: 11 })
    expect(semaforoForCrm({ ultimaGestionAt: monday, etapaComercial: 'CERRADO', vendedorId: 7 })).toEqual({ semaforo: null, diasSinGestion: null })
    expect(semaforoForCrm({ ultimaGestionAt: monday, etapaComercial: 'SEGUIMIENTO' })).toEqual({ semaforo: null, diasSinGestion: null })
  })

  it('exige resultado y motivo estructurado al perder', () => {
    const current = { etapaComercial: 'SEGUIMIENTO', estado: '1' }
    expect(() => validateTransition(current, { etapa: 'CERRADO' })).toThrow('resultado GANADO o PERDIDO')
    expect(() => validateTransition(current, { etapa: 'CERRADO', resultadoCierre: 'PERDIDO' })).toThrow('motivo de pérdida')
    expect(validateTransition(current, { etapa: 'CERRADO', resultadoCierre: 'PERDIDO', motivoPerdida: 'PRECIO' }).resultado).toBe('PERDIDO')
    expect(() => validateTransition(current, { etapa: 'CERRADO', resultadoCierre: 'GANADO' })).toThrow('aprobada antes')
  })

  it('limpia el resultado vigente al reabrir y conserva el historial', async () => {
    const current = { id: 7, etapaComercial: 'CERRADO', estado: '3', resultadoCierre: 'GANADO' }
    const tx = {
      crmRegistro: {
        findUnique: vi.fn().mockResolvedValue(current),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...current, ...data })),
      },
      crmEstadoHistorial: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    }
    const prisma = { $transaction: callback => callback(tx) }
    const result = await transitionCrm(prisma, 7, { etapa: 'SEGUIMIENTO', motivo: 'Cliente retoma negociación' }, { id: 1, nombre: 'Admin' }, { isAdmin: true })
    expect(result.resultadoCierre).toBeNull()
    expect(tx.crmEstadoHistorial.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estadoAnterior: 'CERRADO', estadoNuevo: 'SEGUIMIENTO' }) }))
  })

  it('propone mover cotizaciones tras 3 días hábiles y excluye compra ágil en la consulta', async () => {
    const prisma = { crmRegistro: { findMany: vi.fn().mockResolvedValue([{ id: 9, etapaComercial: 'COTIZACION_ENVIADA', ultimaGestionAt: new Date('2026-08-03T12:00:00-04:00') }]) } }
    const actions = await evaluateCrmAutomation(prisma, { now: new Date('2026-08-06T12:00:00-04:00') })
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ crmId: 9, hacia: 'SEGUIMIENTO', diasSinGestion: 3 })
    expect(prisma.crmRegistro.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tipoVenta: { not: 'COMPRA_AGIL' } }) }))
  })

  it('aprueba el CRM ligado a una orden cuando Caja confirma Webpay', async () => {
    const prisma = {
      crmRegistro: {
        findMany: vi.fn().mockResolvedValue([{ id: 4, etapaComercial: 'SEGUIMIENTO' }]),
        update: vi.fn().mockResolvedValue({}),
      },
      crmEstadoHistorial: { create: vi.fn().mockResolvedValue({}) },
    }
    expect(await approveCrmFromOrderPayment(prisma, 22, { medioPago: 'Webpay', referencia: 'WP-100' })).toBe(1)
    expect(prisma.crmRegistro.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ etapaComercial: 'VENTA_APROBADA', confirmacionTipo: 'WEBPAY' }) }))
  })

  it('al ganar, vincula una orden ya existente si el folio coincide (no crea una nueva)', async () => {
    const tx = {
      orden: {
        findFirst: vi.fn().mockResolvedValue({ id: 501, clienteId: 88 }),
        aggregate: vi.fn(),
        create: vi.fn(),
      },
    }
    const crm = { id: 1, ncotizacion: '501', ordenId: null, clienteId: null, canalVenta: 'WEB' }
    const result = await ensureOrdenForGanado(tx, crm, { id: 5, nombre: 'Vendedor' })
    expect(result).toEqual({ ordenId: 501, clienteId: 88 })
    expect(tx.orden.create).not.toHaveBeenCalled()
  })

  it('no crea una orden vacia cuando la oportunidad ganada no tiene una venta vinculada', async () => {
    const tx = {
      orden: {
        findFirst: vi.fn().mockResolvedValue(null),
        aggregate: vi.fn().mockResolvedValue({ _max: { nInterno: 900 } }),
        create: vi.fn().mockResolvedValue({ id: 777, clienteId: null }),
      },
      cliente: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
      $executeRaw: vi.fn(),
    }
    const crm = { id: 2, ncotizacion: null, ordenId: null, clienteId: null, canalVenta: 'SALA', rut: null, vendedorId: 9 }
    await expect(ensureOrdenForGanado(tx, crm, { id: 5 })).rejects.toThrow('sin una orden ERP vinculada')
    expect(tx.orden.create).not.toHaveBeenCalled()
  })

  it('no crea cliente ni orden automatica al ganar sin un flujo de venta real', async () => {
    const tx = {
      orden: {
        findFirst: vi.fn().mockResolvedValue(null),
        aggregate: vi.fn().mockResolvedValue({ _max: { nInterno: null } }),
        create: vi.fn().mockResolvedValue({ id: 1001, clienteId: 55 }),
      },
      cliente: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 55 }),
        findUnique: vi.fn().mockResolvedValue({ rut: '11.111.111-1', email: 'cliente@test.cl' }),
      },
      $executeRaw: vi.fn(),
    }
    const crm = { id: 3, ncotizacion: null, ordenId: null, clienteId: null, canalVenta: 'LICITACION', rut: '11.111.111-1', rsocial: 'Cliente SPA', vendedorId: 9 }
    await expect(ensureOrdenForGanado(tx, crm, { id: 5 })).rejects.toThrow('sin una orden ERP vinculada')
    expect(tx.cliente.create).not.toHaveBeenCalled()
    expect(tx.orden.create).not.toHaveBeenCalled()
  })

  it('bloquea el cierre GANADO si no hay una orden vinculada', async () => {
    const tx = {
      orden: { findFirst: vi.fn().mockResolvedValue(null) },
      cliente: { findFirst: vi.fn() },
    }
    const crm = { id: 4, ncotizacion: null, ordenId: null, clienteId: null, canalVenta: 'WEB', rut: null, nombre: null, rsocial: null, vendedorId: 9 }
    await expect(ensureOrdenForGanado(tx, crm, { id: 5 })).rejects.toThrow('sin una orden ERP vinculada')
    expect(tx.cliente.findFirst).not.toHaveBeenCalled()
  })

  it('no crea orden al reclasificar un registro historico como GANADO', async () => {
    const current = { id: 8, etapaComercial: 'CERRADO', estado: '3', resultadoCierre: 'SIN_CLASIFICAR', esHistorico: true }
    const tx = {
      crmRegistro: {
        findUnique: vi.fn().mockResolvedValue(current),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...current, ...data })),
      },
      crmEstadoHistorial: { create: vi.fn().mockResolvedValue({ id: 1 }) },
      orden: { findFirst: vi.fn(), create: vi.fn() },
    }
    const prisma = { $transaction: callback => callback(tx) }
    const result = await transitionCrm(prisma, 8, { etapa: 'CERRADO', resultadoCierre: 'GANADO', motivo: 'Clasificación histórica revisada' }, { id: 1, nombre: 'Admin' }, { isAdmin: true })
    expect(result.resultadoCierre).toBe('GANADO')
    expect(tx.orden.findFirst).not.toHaveBeenCalled()
    expect(tx.orden.create).not.toHaveBeenCalled()
  })
})
