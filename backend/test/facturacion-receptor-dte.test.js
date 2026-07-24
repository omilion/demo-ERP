import { describe, expect, it } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { buildDocumento } from '../src/facturacion/documento.js'
import { decodeBase64Url } from '../src/facturacion/gmailReceptor.js'
import { decodeDteXml, parseRecibidoDte } from '../src/facturacion/receptorDte.js'

const empresa = { rut: '76354051-0', razonSocial: 'PLASTIMAR LIMITADA', giro: 'TEXTILES', direccion: '5 Oriente 134', comuna: 'Viña del Mar', ciudad: 'Viña del Mar', acteco: '1394' }
const caf = () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
  return { cafXml: '<CAF version="1.0"><DA><RE>76354051-0</RE></DA></CAF>', privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }) }
}
const receptor = { rut: '11111111-1', razonSocial: 'RECEPTOR DE PRUEBA', giro: 'Comercio', direccion: 'Av. Prueba 1', comuna: 'Santiago' }

describe('facturacion/receptor DTE', () => {
  it('parsea un Documento emitido por el motor, con emisor, receptor, detalle, totales y TED', () => {
    const emitted = buildDocumento({ empresa, receptor, doc: { tipoDte: 33, folio: 99, fechaEmision: '2026-07-23', items: [{ nombre: 'Tela', cantidad: 2, precio: 5000 }] }, caf: caf(), timestamp: new Date('2026-07-23T10:00:00') })
    const parsed = parseRecibidoDte(emitted.documentoXml)
    expect(parsed).toMatchObject({ wrapper: 'Documento', tipoDte: 33, folio: 99, emisor: { rut: empresa.rut }, receptor: { razonSocial: receptor.razonSocial }, totales: { total: 11900 } })
    expect(parsed.items).toEqual([expect.objectContaining({ nombre: 'Tela', cantidad: 2, monto: 10000 })])
    expect(parsed.tedXml).toContain('<TED')
  })

  it('parsea una Liquidación emitida por el motor sin convertir sus detalles en productos', () => {
    const emitted = buildDocumento({ empresa, receptor, doc: { tipoDte: 43, folio: 32, fechaEmision: '2026-07-23', detalles: [{ tpoDocLiq: 33, nombre: 'Venta consignada', monto: 10000 }], totales: { neto: 10000, iva: 1900, tasaIva: 19, total: 11900 } }, caf: caf(), timestamp: new Date('2026-07-23T10:00:00') })
    const parsed = parseRecibidoDte(emitted.documentoXml)
    expect(parsed.wrapper).toBe('Liquidacion')
    expect(parsed.items).toEqual([])
    expect(parsed.detalles).toEqual([expect.objectContaining({ tpoDocLiq: '33', nombre: 'Venta consignada', monto: 10000 })])
  })

  it('parsea una Exportación emitida por el motor con sus ítems exentos', () => {
    const emitted = buildDocumento({ empresa, receptor: { ...receptor, rut: '55555555-5', nacionalidad: '840' }, doc: { tipoDte: 110, folio: 14, fechaEmision: '2026-07-23', items: [{ nombre: 'Exportación', cantidad: 1, precio: 250 }], extra: { fechaVencimiento: '2026-08-23', moneda: 'DOLAR USA' } }, caf: caf(), timestamp: new Date('2026-07-23T10:00:00') })
    const parsed = parseRecibidoDte(emitted.documentoXml)
    expect(parsed).toMatchObject({ wrapper: 'Exportaciones', tipoDte: 110, folio: 14, totales: { exento: 250, total: 250 } })
    expect(parsed.items).toEqual([expect.objectContaining({ nombre: 'Exportación', exento: true })])
  })

  it('decodifica el base64url que entrega Gmail para adjuntos', () => {
    expect(decodeBase64Url('RG9jdW1lbnRvIMOh')).toEqual(Buffer.from('Documento á'))
  })

  it('respeta la codificación ISO-8859-1 declarada por el XML recibido', () => {
    const xml = Buffer.concat([Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><DTE><Documento><Encabezado>', 'ascii'), Buffer.from('<Emisor><RznSoc>Razón</RznSoc></Emisor>', 'latin1'), Buffer.from('</Encabezado></Documento></DTE>', 'ascii')])
    expect(decodeDteXml(xml)).toContain('Razón')
  })
})
