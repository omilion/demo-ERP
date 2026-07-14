import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, createSign } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import forge from 'node-forge'
import { loadCertificate, signXml, sha1B64, rsaSha1B64 } from '../src/facturacion/firma.js'

describe('facturacion/firma', () => {
  it('loadCertificate throws a clear error when the file does not exist', () => {
    expect(() => loadCertificate('/no/existe/certificado.p12', 'x')).toThrow()
  })

  it('sha1B64 and rsaSha1B64 produce base64 output matching node:crypto directly', () => {
    expect(sha1B64('hola')).toMatch(/^[A-Za-z0-9+/=]+$/)
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const pem = privateKey.export({ type: 'pkcs1', format: 'pem' })
    const expected = createSign('RSA-SHA1').update('hola').sign(pem).toString('base64')
    expect(rsaSha1B64('hola', pem)).toBe(expected)
  })

  it('signXml wraps a <Signature> block around the given RSA key material', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const privateKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' })
    const cert = {
      privateKeyPem,
      modulusB64: Buffer.from('fake-modulus').toString('base64'),
      exponentB64: Buffer.from('AQAB').toString('base64'),
      certDerB64: Buffer.from('fake-cert-der').toString('base64')
    }
    const xml = '<Documento ID="F1T33"><A>1</A></Documento>'
    const signature = signXml(xml, '#F1T33', cert)
    expect(signature).toContain('<Signature')
    expect(signature).toContain('<SignatureValue>')
    expect(signature).toContain('<X509Certificate>')
  })

  it('round-trip: loadCertificate reads back a real forge-generated .p12', () => {
    const keys = forge.pki.rsa.generateKeyPair(1024)
    const cert = forge.pki.createCertificate()
    cert.publicKey = keys.publicKey
    cert.serialNumber = '01'
    cert.validity.notBefore = new Date('2026-01-01')
    cert.validity.notAfter = new Date('2027-01-01')
    const attrs = [{ name: 'commonName', value: 'Test Plastimar' }]
    cert.setSubject(attrs)
    cert.setIssuer(attrs)
    cert.sign(keys.privateKey, forge.md.sha256.create())

    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'clave123')
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes()

    const tmpPath = path.join(os.tmpdir(), `test-cert-${Date.now()}.p12`)
    fs.writeFileSync(tmpPath, Buffer.from(p12Der, 'binary'))
    try {
      const loaded = loadCertificate(tmpPath, 'clave123')
      expect(loaded.privateKeyPem).toContain('PRIVATE KEY')
      expect(loaded.subject).toContain('Test Plastimar')
    } finally {
      fs.unlinkSync(tmpPath)
    }
  })
})
