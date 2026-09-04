import { describe, expect, it } from 'vitest'
import { HELP_DOCUMENTS, helpDocumentsForUser } from './helpDocuments'

const idsFor = user => helpDocumentsForUser(user).map(document => document.id)

describe('documentación de ayuda por rol', () => {
  it('muestra toda la batería al administrador', () => {
    expect(idsFor({ role: 'admin' })).toEqual(HELP_DOCUMENTS.map(document => document.id))
  })

  it('muestra Ventas más las guías transversales al vendedor', () => {
    expect(idsFor({ role: 'vendedor' })).toEqual(['DOC-00', 'DOC-02', 'DOC-09'])
  })

  it('muestra Bodega y Despacho al bodeguero', () => {
    expect(idsFor({ role: 'bodeguero' })).toEqual(['DOC-00', 'DOC-03', 'DOC-04', 'DOC-09'])
  })

  it('prioriza la ficha rápida para el operario', () => {
    expect(idsFor({ role: 'taller_operario' })).toEqual(['DOC-00', 'DOC-05B', 'DOC-09'])
  })

  it('respeta permisos extra de Facturación', () => {
    expect(idsFor({ role: 'rrhh', permisosExtra: { facturacion: ['read'] } })).toContain('DOC-07')
  })
})
