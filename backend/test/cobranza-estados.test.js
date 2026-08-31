import { describe, expect, it } from 'vitest'
import { normalizeEstadoCobranza } from '../src/routes/cobranza/estados.js'
import { buildCobranzaHistoricoFilters } from '../src/routes/cobranza/index.js'

describe('estados de cobranza histórica', () => {
  it('converge las grafías conocidas a un catálogo canónico', () => {
    expect(normalizeEstadoCobranza(' caNCELADA ')).toBe('CANCELADA')
    expect(normalizeEstadoCobranza('nula')).toBe('NULA')
    expect(normalizeEstadoCobranza('PENDIENTE')).toBe('PENDIENTE')
  })

  it('no inventa estado para datos que requieren decisión', () => {
    expect(normalizeEstadoCobranza('Rechazada')).toBeNull()
    expect(normalizeEstadoCobranza('')).toBeNull()
  })

  it('filtra siempre por el valor persistido canónico', () => {
    expect(buildCobranzaHistoricoFilters({ estado: 'cancelada' }).filters.estado).toBe('CANCELADA')
    expect(buildCobranzaHistoricoFilters({ estado: 'Rechazada' }).error).toBeTruthy()
  })
})
