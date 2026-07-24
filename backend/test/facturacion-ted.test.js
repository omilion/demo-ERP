import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { buildTed } from '../src/facturacion/ted.js'
import { buildDte } from '../src/facturacion/envio.js'

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

  it('buildDte conserva byte a byte el DD ya firmado por FRMT', () => {
    const { privateKey: cafPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const ted = buildTed({
      rutEmisor: '76354051-0',
      tipoDte: 33,
      folio: 61,
      fechaEmision: '2026-07-24',
      rutReceptor: '5555555-9',
      razonReceptor: 'CLIENTE PRUEBA CARATULA SII',
      montoTotal: 1190,
      primerItem: 'PRUEBA CARATULA Y FIRMA SII'
    }, {
      cafXml: '<CAF version="1.0"><DA><RE>76354051-0</RE><TD>33</TD><RNG><D>61</D><H>61</H></RNG></DA></CAF>',
      privateKeyPem: cafPrivateKey.export({ type: 'pkcs1', format: 'pem' })
    }, new Date('2026-07-24T19:12:51.000Z'))

    const { privateKey: dtePrivateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const cert = {
      privateKeyPem: dtePrivateKey.export({ type: 'pkcs1', format: 'pem' }),
      modulusB64: Buffer.from('mod').toString('base64'),
      exponentB64: Buffer.from('AQAB').toString('base64'),
      certDerB64: Buffer.from('der').toString('base64')
    }
    const originalDd = ted.match(/<DD>[\s\S]*?<\/DD>/)[0]
    const dte = buildDte(`<Documento ID="F61T33"><Encabezado></Encabezado>${ted}<TmstFirma>2026-07-24T15:12:51</TmstFirma></Documento>`, cert)
    const embeddedDd = dte.match(/<DD>[\s\S]*?<\/DD>/)[0]
    expect(embeddedDd).toBe(originalDd)
  })
})
