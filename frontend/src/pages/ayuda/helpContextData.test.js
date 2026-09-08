import { describe, expect, it } from 'vitest'
import { resolveHelpContext, searchHelpArticles } from './helpContextData'

describe('helpContextData contextual resolution', () => {
  it('resolves correct section for ventas routes', () => {
    const ventas = resolveHelpContext('/ventas')
    expect(ventas.sectionKey).toBe('ventas')
    expect(ventas.docId).toBe('DOC-02')

    const nuevaVenta = resolveHelpContext('/ventas/nueva')
    expect(nuevaVenta.sectionKey).toBe('ventas-nueva')
  })

  it('resolves correct section for bodega, picking and packing', () => {
    const picking = resolveHelpContext('/bodega/picking')
    expect(picking.sectionKey).toBe('picking')
    expect(picking.docId).toBe('DOC-03')

    const packing = resolveHelpContext('/bodega/packing')
    expect(packing.sectionKey).toBe('packing')

    const bodega = resolveHelpContext('/bodega')
    expect(bodega.sectionKey).toBe('bodega')
  })

  it('resolves correct section for despachos', () => {
    const desp = resolveHelpContext('/despachos')
    expect(desp.sectionKey).toBe('despachos')
    expect(desp.docId).toBe('DOC-04')
  })

  it('resolves correct section for taller and operario', () => {
    const taller = resolveHelpContext('/taller')
    expect(taller.sectionKey).toBe('taller')
    expect(taller.docId).toBe('DOC-05')

    const operario = resolveHelpContext('/taller-operario')
    expect(operario.sectionKey).toBe('taller-operario')
    expect(operario.docId).toBe('DOC-05B')
  })

  it('resolves correct section for caja and cobranza', () => {
    const caja = resolveHelpContext('/caja')
    expect(caja.sectionKey).toBe('caja')
    expect(caja.docId).toBe('DOC-06')

    const cobranza = resolveHelpContext('/cobranza')
    expect(cobranza.sectionKey).toBe('cobranza')
  })

  it('resolves correct section for facturacion', () => {
    const fact = resolveHelpContext('/facturacion/documentos')
    expect(fact.sectionKey).toBe('facturacion')
    expect(fact.docId).toBe('DOC-07')
  })

  it('resolves default section for dashboard or unknown routes', () => {
    const dash = resolveHelpContext('/dashboard')
    expect(dash.sectionKey).toBe('general')
    expect(dash.docId).toBe('DOC-00')
  })

  it('searches articles by keyword accurately', () => {
    const results = searchHelpArticles('picking', { role: 'admin' })
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(r => r.title.toLowerCase().includes('picking'))).toBe(true)

    const dteResults = searchHelpArticles('facturación', { role: 'admin' })
    expect(dteResults.length).toBeGreaterThan(0)
  })
})
