import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { buildTed } from '../src/facturacion/ted.js'

describe('facturacion/ted', () => {
  it('builds a <TED> block with DD fields and a base64 FRMT signature', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const privateKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' })
    const caf = { cafXml: '<CAF version="1.0"><DA><RE>76354051-0</RE></DA></CAF>', privateKeyPem }

    const ted = buildTed({
      rutEmisor: '76354051-0',
      tipoDte: 33,
      folio: 1,
      fechaEmision: '2026-07-14',
      rutReceptor: '11111111-1',
      razonReceptor: 'Cliente Prueba',
      montoTotal: 11900,
      primerItem: 'Producto textil'
    }, caf, new Date('2026-07-14T10:00:00'))

    expect(ted).toMatch(/^<TED version="1.0">/)
    expect(ted).toContain('<RE>76354051-0</RE>')
    expect(ted).toContain('<TD>33</TD>')
    expect(ted).toContain('<F>1</F>')
    expect(ted).toContain('<MNT>11900</MNT>')
    expect(ted).toMatch(/<FRMT algoritmo="SHA1withRSA">[A-Za-z0-9+/=]+<\/FRMT>/)
    expect(ted.endsWith('</TED>')).toBe(true)
  })
})
