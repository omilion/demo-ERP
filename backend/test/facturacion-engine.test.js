// D:\plastimar-erp-v2\backend\test\facturacion-engine.test.js
import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateKeyPairSync } from 'node:crypto'
import forge from 'node-forge'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createFacturacionDb } from '../src/facturacion/db.js'
import { createFacturacionEngine } from '../src/facturacion/engine.js'

// DV real (modulo 11) para generar un RUT de prueba unico y valido — un DV
// fijo inventado (p.ej. '-2') no pasa isValidRut() salvo por coincidencia.
function testRutDv(body) {
  let sum = 0
  let factor = 2
  for (const digit of String(body).split('').reverse()) {
    sum += Number(digit) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const rest = 11 - (sum % 11)
  if (rest === 11) return '0'
  if (rest === 10) return 'K'
  return String(rest)
}

// Certificado RSA generado en memoria SOLO para ejercitar el codigo de firma en
// el test. No es el certificado real de Plastimar y nunca se persiste como tal.
function writeThrowawayTestCert(dataDir, password) {
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date('2026-01-01')
  cert.validity.notAfter = new Date('2027-01-01')
  const attrs = [{ name: 'commonName', value: 'QA Test Cert' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password)
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes()
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'certificado.p12'), Buffer.from(p12Der, 'binary'))
}

describe('facturacion/engine', () => {
  let prisma, db, dataDir, empresaOriginal
  const ambienteQa = `qa-engine-${process.pid}-${Date.now()}`

  beforeAll(async () => {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
    prisma = new PrismaClient({ adapter })
    db = createFacturacionDb(prisma)
    empresaOriginal = await db.getEmpresa()
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'facturacion-engine-test-'))
  })

  afterAll(async () => {
    await db.saveEmpresa(empresaOriginal)
    fs.rmSync(dataDir, { recursive: true, force: true })
    await prisma.$disconnect()
  })

  it('emitir() throws a clear error when no certificate is loaded', async () => {
    // Asegura que la empresa ya tenga los datos obligatorios (incluido
    // fchResol) para que emitir() llegue hasta la validacion de certificado.
    const empresaPrevia = await db.getEmpresa()
    await db.saveEmpresa({ ...empresaPrevia, fchResol: empresaPrevia.fchResol || '2026-07-01', acteco: empresaPrevia.acteco || '999999' })
    const engine = createFacturacionEngine({ db, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'no-cert-')) })
    const doc = await db.documentos.create({
      tipoDte: 33,
      receptor: { rut: '11111111-1', razonSocial: 'Cliente Prueba' },
      items: [{ nombre: 'Tela', cantidad: 1, precio: 1000 }]
    })
    await expect(engine.emitir(doc.id)).rejects.toThrow(/No hay certificado digital cargado/)
  })

  describe('with a throwaway test certificate and CAF loaded', () => {
    let engine, cafRecord

    beforeEach(async () => {
      writeThrowawayTestCert(dataDir, 'clave123')
      const empresa = await db.getEmpresa()
      await db.saveEmpresa({ ...empresa, ambiente: ambienteQa, certPass: 'clave123', fchResol: '2099-07-01', acteco: empresa.acteco || '999999' })
      engine = createFacturacionEngine({ db, dataDir })
      // El CAF trae su propia llave RSA (RSASK) con la que buildTed() firma el
      // TED — debe ser una PEM real (generada aqui) o crypto.createSign()
      // revienta al intentar firmar; una clave inventada NO sirve.
      const { privateKey: cafPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
      const cafPrivateKeyPem = cafPrivateKey.export({ type: 'pkcs1', format: 'pem' })
      cafRecord = await prisma.factCaf.create({
        data: {
          tipoDte: 33, folioDesde: 900, folioHasta: 999, siguienteFolio: 900,
          fechaAutorizacion: '2099-07-01', ambiente: ambienteQa,
          xml: `<AUTORIZACION><CAF version="1.0"><DA><RE>76354051-0</RE><RS>PLASTIMAR LIMITADA</RS><TD>33</TD><RNG><D>900</D><H>999</H></RNG><FA>2099-07-01</FA><IDK>100</IDK></DA></CAF><RSASK>${cafPrivateKeyPem}</RSASK></AUTORIZACION>`
        }
      })
    })

    it('emitir() assigns a folio, builds signed XML and marks the document emitido', async () => {
      const doc = await db.documentos.create({
        tipoDte: 33,
        receptor: {
          rut: '11111111-1', razonSocial: 'Cliente Prueba SpA', giro: 'Comercio',
          direccion: 'Av. Prueba 123', comuna: 'Santiago',
        },
        items: [{ nombre: 'Tela acabada', cantidad: 10, precio: 5000, unidad: 'MT' }]
      })
      const emitido = await engine.emitir(doc.id)
      expect(emitido.estado).toBe('emitido')
      expect(emitido.folio).toBe(900)
      expect(emitido.xml).toContain('<DTE xmlns="http://www.sii.cl/SiiDte"')
      expect(emitido.totales.total).toBe(59500)
    })

    it('emitir() resolves receptor from an existing Cliente when clientId is given', async () => {
      const testRutBody = `88${Date.now()}`.slice(0, 9)
      const cliente = await prisma.cliente.create({
        data: { rut: `${testRutBody}-${testRutDv(testRutBody)}`, nombre: 'QA Cliente Engine', razonSocial: 'QA Cliente Engine SpA', giro: 'Textiles', direccion: 'Ruta 68 km 10', comuna: 'Vina del Mar', ciudad: 'Vina del Mar' }
      })
      const doc = await db.documentos.create({
        tipoDte: 33,
        clienteId: cliente.id,
        items: [{ nombre: 'Tela acabada', cantidad: 1, precio: 1000 }]
      })
      const emitido = await engine.emitir(doc.id)
      expect(emitido.receptor.razonSocial).toBe('QA Cliente Engine SpA')
      expect(emitido.receptor.rut).toBe(cliente.rut)
      await prisma.cliente.delete({ where: { id: cliente.id } })
    })

    it('emitir() throws when there are no folios left for the tipoDte/ambiente', async () => {
      const doc = await db.documentos.create({
        tipoDte: 34, // Factura exenta: sin CAF cargado en este ambiente QA aislado
        receptor: {
          rut: '11111111-1', razonSocial: 'Cliente Prueba', giro: 'Comercio',
          direccion: 'Av. Prueba 123', comuna: 'Santiago',
        },
        items: [{ nombre: 'Ajuste', cantidad: 1, precio: 1000 }]
      })
      await expect(engine.emitir(doc.id)).rejects.toThrow(/No hay folios disponibles/)
    })

    afterEach(async () => {
      await prisma.factCaf.delete({ where: { id: cafRecord.id } }).catch(() => {})
    })
  })
})
