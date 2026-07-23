import { describe, expect, it } from 'vitest'
import { createPublicKey, generateKeyPairSync } from 'node:crypto'
import { buildLibroCompraVenta } from '../src/facturacion/libros.js'

const empresa = {
  rut: '76354051-0',
  razonSocial: 'PLASTIMAR LIMITADA',
  fchResol: '2026-07-01',
  nroResol: 0,
}

const b64 = (value) => Buffer.from(value, 'base64url').toString('base64')

function fakeCert() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' })
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }),
    modulusB64: b64(jwk.n),
    exponentB64: b64(jwk.e),
    certDerB64: 'AA=='
  }
}

describe('facturacion/libros', () => {
  it('resume el IVA real de ventas en vez de declararlo siempre en cero', () => {
    const xml = buildLibroCompraVenta({
      empresa,
      cert: fakeCert(),
      rutEnvia: '8833435-3',
      periodo: '2026-07',
      tipoOperacion: 'VENTA',
      folioNotificacion: '4964719',
      detalles: [{
        tpoDoc: 33,
        folio: 1,
        fecha: '2026-07-23',
        rut: '11111111-1',
        razonSocial: 'CLIENTE PRUEBA',
        neto: 10000,
        iva: 1900,
        total: 11900
      }]
    })

    expect(xml).toContain('<TotMntNeto>10000</TotMntNeto>')
    expect(xml).toContain('<TotMntIVA>1900</TotMntIVA>')
    expect(xml).toContain('<TotMntTotal>11900</TotMntTotal>')
    expect(xml).toContain('<Signature')
  })
})
