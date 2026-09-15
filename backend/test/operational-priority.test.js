import { describe, expect, it } from 'vitest'
import { summarizeOperationalAttention, summarizeOperationalPriority } from '../src/routes/operational-priority.js'

describe('señales de prioridad operativa', () => {
  it('elige la prioridad más alta entre ODT abiertas e ignora las terminales', () => {
    const result = summarizeOperationalPriority([
      { id: 10, estado: 'Terminada', prioridad: 'urgente', eliminado: false },
      { id: 11, estado: 'En proceso', prioridad: 'Alta', eliminado: false },
      { id: 12, estado: 'Pendiente', prioridad: 'normal', eliminado: false },
    ])

    expect(result).toMatchObject({ value: 'alta', rank: 1, odtId: 11 })
  })

  it('consolida multa de venta, multa de despacho y prioridad en una sola señal', () => {
    const result = summarizeOperationalAttention({
      multas: [{ monto: -125000 }],
      despachos: [{ tieneMulta: true }],
      odts: [{ id: 21, estado: 'Pendiente', prioridad: 'urgente', eliminado: false }],
    })

    expect(result).toMatchObject({
      tieneMulta: true,
      multaCount: 1,
      multaDespachoCount: 1,
      multaTotal: 125000,
      prioridadOperativa: 'urgente',
      prioridadOperativaRank: 0,
      requiereAtencion: true,
    })
  })
})
