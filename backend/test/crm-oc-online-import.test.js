import { describe, expect, it } from 'vitest'
import {
  buildLegacyOcCrmData,
  legacySellerName,
  mapLegacyOcStatus,
  normalizeLegacySellerCode,
} from '../src/domain/crm/legacyOcImport.js'
import { semaforoForCrm } from '../src/domain/crm/service.js'

const baseOc = {
  id: 90,
  nCompra: 'OC-2025-90',
  fechaHora: new Date('2025-02-01T12:00:00Z'),
  fechaCotizacion: null,
  emailComprador: 'comprador@example.com',
  codigoVendedor: '1092',
  estadoCompra: 'Cotizada',
  obsCliente: 'Observación histórica',
}

describe('importación CRM desde OC Online legacy', () => {
  it('maps confirmed commercial outcomes', () => {
    expect(mapLegacyOcStatus('Aceptada')).toEqual({ etapaComercial: 'CERRADO', estado: '3', resultadoCierre: 'GANADO' })
    expect(mapLegacyOcStatus('No aceptada')).toEqual({ etapaComercial: 'CERRADO', estado: '3', resultadoCierre: 'PERDIDO' })
    expect(mapLegacyOcStatus('Cotizada')).toEqual({ etapaComercial: 'COTIZACION_ENVIADA', estado: '0', resultadoCierre: null })
    expect(mapLegacyOcStatus('Recepcionada')).toEqual({ etapaComercial: 'PENDIENTE_CLASIFICACION', estado: '0', resultadoCierre: null })
  })

  it('preserves seller provenance and keeps rows from 2025 onward in the active portfolio', () => {
    const data = buildLegacyOcCrmData(baseOc)
    expect(data).toMatchObject({
      ncotizacion: 'OC-2025-90',
      ordenCompraOnlineId: 90,
      origenDato: 'OC_ONLINE_LEGACY',
      codigoVendedorLegacy: '1092',
      ejecutiva: 'Cinthia Palacios',
      esHistorico: false,
      canalVenta: 'WEB',
      etapaComercial: 'COTIZACION_ENVIADA',
    })
  })

  it('marks records before the agreed 2025 cutoff as historical', () => {
    const data = buildLegacyOcCrmData({ ...baseOc, fechaHora: new Date('2024-12-31T23:59:59Z') })
    expect(data.esHistorico).toBe(true)
  })

  it('does not overwrite a newer non-decisive CRM stage', () => {
    const data = buildLegacyOcCrmData(baseOc, {
      id: 5,
      ncotizacion: baseOc.nCompra,
      etapaComercial: 'SEGUIMIENTO',
      estado: '1',
      ejecutiva: 'Ejecutiva corregida',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    })
    expect(data.etapaComercial).toBe('SEGUIMIENTO')
    expect(data.ejecutiva).toBe('Ejecutiva corregida')
  })

  it('overrides the outcome when the legacy OC is accepted', () => {
    const data = buildLegacyOcCrmData({ ...baseOc, estadoCompra: 'Aceptada' }, {
      id: 5,
      ncotizacion: baseOc.nCompra,
      etapaComercial: 'SEGUIMIENTO',
      estado: '1',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    })
    expect(data).toMatchObject({ etapaComercial: 'CERRADO', estado: '3', resultadoCierre: 'GANADO', confirmacionTipo: 'OTRO' })
  })

  it('normalizes known and empty seller codes', () => {
    expect(legacySellerName('1211')).toBe('Ana Milena Cruz')
    expect(normalizeLegacySellerCode('0')).toBeNull()
    expect(normalizeLegacySellerCode('  ')).toBeNull()
  })

  it('does not create overdue alerts for historical rows', () => {
    expect(semaforoForCrm({ esHistorico: true, fecha: new Date('2025-01-01') })).toEqual({ semaforo: null, diasSinGestion: null })
  })
})
