import { describe, expect, it, vi } from 'vitest'
import { approveCrmFromOrderPayment, businessDaysBetween, semaforoForCrm, transitionCrm, validateTransition } from '../src/domain/crm/service.js'
import { evaluateCrmAutomation } from '../src/jobs/crmAutomation.mjs'

describe('CRM comercial', () => {
  it('calcula límites del semáforo en días hábiles', () => {
    const monday = new Date('2026-08-03T12:00:00-04:00')
    expect(businessDaysBetween(monday, new Date('2026-08-10T12:00:00-04:00'))).toBe(5)
    expect(semaforoForCrm({ ultimaGestionAt: monday }, new Date('2026-08-10T12:00:00-04:00'))).toEqual({ semaforo: 'AMARILLO', diasSinGestion: 5 })
    expect(semaforoForCrm({ ultimaGestionAt: monday }, new Date('2026-08-17T12:00:00-04:00'))).toEqual({ semaforo: 'ROJO', diasSinGestion: 10 })
    expect(semaforoForCrm({ ultimaGestionAt: monday }, new Date('2026-08-18T12:00:00-04:00'))).toEqual({ semaforo: 'VENCIDO', diasSinGestion: 11 })
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
})
