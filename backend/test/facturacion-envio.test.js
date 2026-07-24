import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { DOMParser } from '@xmldom/xmldom'
import { SignedXml } from 'xml-crypto'
import { buildDte, buildEnvio } from '../src/facturacion/envio.js'

function fakeCert() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    modulusB64: Buffer.from('mod').toString('base64'),
    exponentB64: Buffer.from('AQAB').toString('base64'),
    certDerB64: Buffer.from('der').toString('base64')
  }
}

const signatureNodes = (xml) => {
  const nodes = []
  const visit = (node) => {
    if (node?.nodeType === 1 && node.localName === 'Signature') nodes.push(node)
    for (let child = node?.firstChild; child; child = child.nextSibling) visit(child)
  }
  visit(new DOMParser().parseFromString(xml).documentElement)
  return nodes
}

describe('facturacion/envio', () => {
  it('buildDte wraps a signed <DTE> around the documento XML', () => {
    const documentoXml = '<Documento ID="F1T33"><A>1</A></Documento>'
    const dte = buildDte(documentoXml, fakeCert())
    expect(dte).toMatch(/^<DTE xmlns="http:\/\/www\.sii\.cl\/SiiDte" xmlns:xsi="http:\/\/www\.w3\.org\/2001\/XMLSchema-instance" version="1\.0">/)
    expect(dte).toContain('<Documento ID="F1T33">')
    expect(dte).not.toMatch(/<Documento[^>]*\sxmlns/)
    expect(dte).toContain('<Signature')
    expect(dte.endsWith('</DTE>')).toBe(true)
  })

  it.each(['Liquidacion', 'Exportaciones'])('buildDte firma el wrapper propio %s', (root) => {
    const dte = buildDte(`<${root} ID="F1T110"><A>1</A></${root}>`, fakeCert())
    expect(dte).toContain(`<${root} ID="F1T110">`)
    expect(dte).not.toMatch(new RegExp(`<${root}[^>]*\\sxmlns`))
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
    expect(xml).toMatch(/<SubTotDTE>\s*<TpoDTE>33<\/TpoDTE>\s*<NroDTE>1<\/NroDTE>\s*<\/SubTotDTE>/)
  })

  it('mantiene validas la firma del DTE y la firma del SetDTE en el sobre final', () => {
    const cert = fakeCert()
    const dteXml = buildDte('<Documento ID="F1T33"><A>1</A></Documento>', cert)
    const { xml } = buildEnvio({
      dtes: [{ tipoDte: 33, dteXml }],
      empresa: { rut: '76354051-0', fchResol: '2014-08-01', nroResol: 0 },
      cert,
      rutEnvia: '8833435-3',
      timestamp: new Date('2026-07-24T18:21:44.000Z')
    })

    const signatures = signatureNodes(xml)
    expect(signatures).toHaveLength(2)
    for (const signature of signatures) {
      const verifier = new SignedXml({
        publicCert: cert.publicKeyPem,
        getCertFromKeyInfo: () => null
      })
      verifier.loadSignature(signature)
      expect(verifier.checkSignature(xml)).toBe(true)
    }
    expect(xml).toContain('<TmstFirmaEnv>2026-07-24T14:21:44</TmstFirmaEnv>')
    expect(xml.split('\n').length).toBeGreaterThan(20)
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
