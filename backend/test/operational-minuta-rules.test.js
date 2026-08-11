import { describe, expect, it } from 'vitest'
import { calculateDeliveryDate, isValidContactEmail, MARKETPLACE_CANALES, normalizeLicitacionPlazo, normalizeMarketplace, sanitizeCommercialIdentifier } from '../src/routes/ventas/operational-rules.js'
import { computeFinancialAdjustments, resolveEstadoPago } from '../src/routes/ventas/financial.js'
import { plazoDiasFromLicitacion, sanitizeOrdenCompra, sanitizePlazoDias } from '../../frontend/src/utils/licitacionFields.js'

describe('reglas operativas de la minuta', () => {
  it('sanitiza OC e identificadores comerciales', () => {
    expect(sanitizeCommercialIdentifier(' oc 123 / á-45 !! ')).toBe('OC123A-45')
    expect(sanitizeCommercialIdentifier('OC–123')).toBe('OC-123')
    expect(sanitizeOrdenCompra(' oc 123 / á–45 !! ')).toBe('OC123A-45')
  })

  it('limita el plazo de licitacion a dias enteros incrementales', () => {
    expect(sanitizePlazoDias('30')).toBe('30')
    expect(sanitizePlazoDias('30 dias')).toBe('')
    expect(sanitizePlazoDias('-5')).toBe('')
    expect(sanitizePlazoDias('9999')).toBe('3650')
    expect(plazoDiasFromLicitacion({ plazo: '45 días' })).toBe('45')
    expect(normalizeLicitacionPlazo('30')).toEqual({ value: '30' })
    expect(normalizeLicitacionPlazo('30 días').error).toMatch(/número entero/)
  })

  it('calcula plazos corridos y habiles', () => {
    const friday = new Date('2026-08-07T10:00:00')
    expect(calculateDeliveryDate({ startDate: friday, days: 3, type: 'corridos' }).toISOString().slice(0, 10)).toBe('2026-08-10')
    expect(calculateDeliveryDate({ startDate: friday, days: 1, type: 'habiles' }).toISOString().slice(0, 10)).toBe('2026-08-10')
  })

  it('exige correo valido para despacho', () => {
    expect(isValidContactEmail('contacto@cliente.cl')).toBe(true)
    expect(isValidContactEmail('sin-arroba')).toBe(false)
  })

  it('calcula y valida comision marketplace', () => {
    expect(MARKETPLACE_CANALES).toEqual(['París', 'Mercado Libre', 'Falabella'])
    expect(normalizeMarketplace({ tipo: 'Marketplace', canal: 'Mercado Libre', comisionPct: 12, total: 100_000 })).toEqual({ marketplaceCanal: 'Mercado Libre', marketplaceComisionPct: 12, marketplaceComisionMonto: 12_000 })
    expect(normalizeMarketplace({ tipo: 'Marketplace', canal: 'Paris', total: 100_000 }).marketplaceCanal).toBe('París')
    expect(normalizeMarketplace({ tipo: 'Marketplace', canal: '', total: 100_000 }).error).toMatch(/canal Marketplace válido/)
    expect(normalizeMarketplace({ tipo: 'Marketplace', canal: 'Otro', total: 100_000 }).error).toMatch(/París, Mercado Libre, Falabella/)
  })

  it('incluye NC interna activa en el saldo sin considerar anuladas', () => {
    const ajustes = computeFinancialAdjustments({ notasInternas: [{ monto: 1000, estado: 'activa' }, { monto: 5000, estado: 'anulada' }] })
    expect(ajustes).toBe(1000)
    expect(resolveEstadoPago({ total: 5000, ajustesFinancieros: ajustes })).toBe('Parcial')
  })
})
