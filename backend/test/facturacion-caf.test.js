import { describe, it, expect } from 'vitest'
import { parseCaf } from '../src/facturacion/caf.js'

const SAMPLE_CAF = `<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>76354051-0</RE>
      <RS>PLASTIMAR LIMITADA</RS>
      <TD>33</TD>
      <RNG><D>1</D><H>10</H></RNG>
      <FA>2026-07-01</FA>
      <RSAPK><M>xxx</M><E>Aw==</E></RSAPK>
      <IDK>100</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">firmaFalsaBase64==</FRMA>
  </CAF>
  <RSASK>-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAKfakekeyfortestingonly==
-----END RSA PRIVATE KEY-----</RSASK>
  <RSAPUBK>-----BEGIN PUBLIC KEY-----
fake
-----END PUBLIC KEY-----</RSAPUBK>
</AUTORIZACION>`

describe('facturacion/caf', () => {
  it('parses a CAF XML into its fields', () => {
    const caf = parseCaf(SAMPLE_CAF)
    expect(caf.tipoDte).toBe(33)
    expect(caf.folioDesde).toBe(1)
    expect(caf.folioHasta).toBe(10)
    expect(caf.rutEmisor).toBe('76354051-0')
    expect(caf.razonSocial).toBe('PLASTIMAR LIMITADA')
    expect(caf.privateKeyPem).toContain('PRIVATE KEY')
    expect(caf.cafXml).toContain('<CAF version="1.0">')
  })

  it('throws on a CAF missing the <CAF> element', () => {
    expect(() => parseCaf('<AUTORIZACION></AUTORIZACION>')).toThrow(/falta el elemento <CAF>/)
  })

  it('throws on a CAF missing the private key', () => {
    const noKey = SAMPLE_CAF.replace(/<RSASK>[\s\S]*?<\/RSASK>/, '')
    expect(() => parseCaf(noKey)).toThrow(/falta la llave privada/)
  })
})
