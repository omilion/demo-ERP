import { describe, expect, it } from 'vitest'
import { buildLegacyLicitacionCrmData, isLicitacionInCartera, mapLegacyLicitacionStatus } from '../src/domain/crm/legacyLicitacionImport.js'

describe('importación CRM de licitaciones', () => {
  it('clasifica Pendiente, Adjudicada y No Adjudicada sin perder el vínculo fuente', () => {
    expect(mapLegacyLicitacionStatus('Pendiente')).toMatchObject({ etapaComercial: 'COTIZACION_ENVIADA', estado: '0' })
    expect(mapLegacyLicitacionStatus('Adjudicada')).toMatchObject({ etapaComercial: 'CERRADO', resultadoCierre: 'GANADO' })
    expect(mapLegacyLicitacionStatus('No Adjudicada')).toMatchObject({ etapaComercial: 'CERRADO', resultadoCierre: 'PERDIDO' })
  })

  it('solo incorpora cartera entre el corte 2025 y hoy', () => {
    expect(isLicitacionInCartera({ fecha: new Date('2024-12-31') }, new Date('2026-08-19'))).toBe(false)
    expect(isLicitacionInCartera({ fecha: new Date('2025-01-01') }, new Date('2026-08-19'))).toBe(true)
    expect(isLicitacionInCartera({ fecha: new Date('2027-01-01') }, new Date('2026-08-19'))).toBe(false)
  })

  it('conserva responsable, RUT, orden y relación uno a uno con la ficha original', () => {
    const row = buildLegacyLicitacionCrmData({ id: 42, idLicitacion: 'LIC-2026-42', fecha: new Date('2026-05-10'), estado: 'Adjudicada', usuario: 'Anny', rutCliente: '76.123.456-7', ordenCompra: 'OC-900', ordenId: 901, obs: 'Oferta adjudicada' }, { id: 88, nombre: 'Municipalidad', razonSocial: 'Municipalidad SPA', email: 'contacto@test.cl', telefono: '999999999' })
    expect(row).toMatchObject({
      cotizacionLicitacionId: 42, ncotizacion: 'LIC-2026-42', canalVenta: 'LICITACION', tipoVenta: 'LICITACION', origenDato: 'LICITACION_LEGACY', ejecutiva: 'Anny', rut: '76.123.456-7', clienteId: 88, ordenId: 901, resultadoCierre: 'GANADO', confirmacionReferencia: 'OC-900',
    })
  })
})
