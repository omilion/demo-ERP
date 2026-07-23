import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { buildDte, buildEnvio } from '../src/facturacion/envio.js'

function fakeCert() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }),
    modulusB64: Buffer.from('mod').toString('base64'),
    exponentB64: Buffer.from('AQAB').toString('base64'),
    certDerB64: Buffer.from('der').toString('base64')
  }
}

describe('facturacion/envio', () => {
  it('buildDte wraps a signed <DTE> around the documento XML', () => {
    const documentoXml = '<Documento ID="F1T33"><A>1</A></Documento>'
    const dte = buildDte(documentoXml, fakeCert())
    expect(dte).toMatch(/^<DTE xmlns="http:\/\/www\.sii\.cl\/SiiDte" version="1\.0">/)
    expect(dte).toContain('<Documento xmlns="http://www.sii.cl/SiiDte" ID="F1T33">')
    expect(dte).toContain('<Signature')
    expect(dte.endsWith('</DTE>')).toBe(true)
  })

  it.each(['Liquidacion', 'Exportaciones'])('buildDte firma el wrapper propio %s', (root) => {
    const dte = buildDte(`<${root} ID="F1T110"><A>1</A></${root}>`, fakeCert())
    expect(dte).toContain(`<${root} xmlns="http://www.sii.cl/SiiDte" ID="F1T110">`)
    expect(dte).toContain('<Signature')
  })

  it('buildEnvio wraps one factura DTE in a signed EnvioDTE with Caratula', () => {
    const documentoXml = '<Documento ID="F1T33"><A>1</A></Documento>'
    const cert = fakeCert()
    const dteXml = buildDte(documentoXml, cert)
    const { xml, esBoleta } = buildEnvio({
      dtes: [{ tipoDte: 33, dteXml }],
      empresa: { rut: '76354051-0', fchResol: '2026-07-01', nroResol: 0 },
      cert,
      rutEnvia: '76354051-0'
    })
    expect(esBoleta).toBe(false)
    expect(xml).toContain('<EnvioDTE xmlns="http://www.sii.cl/SiiDte"')
    expect(xml).toContain('<RutEmisor>76354051-0</RutEmisor>')
    expect(xml).toContain('<SubTotDTE><TpoDTE>33</TpoDTE><NroDTE>1</NroDTE></SubTotDTE>')
  })

  it('buildEnvio limpia los puntos de empresa.rut en RutEmisor', () => {
    const documentoXml = '<Documento ID="F1T33"><A>1</A></Documento>'
    const cert = fakeCert()
    const dteXml = buildDte(documentoXml, cert)
    const { xml } = buildEnvio({
      dtes: [{ tipoDte: 33, dteXml }],
      empresa: { rut: '76.354.051-0', fchResol: '2026-07-01', nroResol: 0 },
      cert,
      rutEnvia: '76354051-0'
    })
    expect(xml).toContain('<RutEmisor>76354051-0</RutEmisor>')
    expect(xml).not.toContain('76.354.051-0')
  })

  it('buildEnvio rejects mixing boletas with other DTE types', () => {
    const cert = fakeCert()
    expect(() => buildEnvio({
      dtes: [{ tipoDte: 33, dteXml: '<DTE/>' }, { tipoDte: 39, dteXml: '<DTE/>' }],
      empresa: { rut: '76354051-0', fchResol: '2026-07-01' },
      cert,
      rutEnvia: '76354051-0'
    })).toThrow(/sobre separado/)
  })
})
