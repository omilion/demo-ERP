import { describe, expect, it, vi } from 'vitest'
import { createFacturacionDb } from '../src/facturacion/db.js'

describe('facturacion/auditor', () => {
  it('persiste la foto del nombre del emisor junto al documento', async () => {
    const create = vi.fn(({ data }) => Promise.resolve(data))
    const db = createFacturacionDb({ factDocumento: { create } })

    const documento = await db.documentos.create({
      tipoDte: 33,
      usuarioNombre: 'Ana Facturadora',
      receptor: { rut: '11111111-1', razonSocial: 'Cliente QA' },
      items: [{ nombre: 'Producto', cantidad: 1, precio: 1000 }],
    })

    expect(create).toHaveBeenCalledOnce()
    expect(documento.usuarioNombre).toBe('Ana Facturadora')
  })

  it('persiste el vinculo de una Guia DTE con la venta y la guia logistica', async () => {
    const create = vi.fn(({ data }) => Promise.resolve(data))
    const db = createFacturacionDb({ factDocumento: { create } })

    const documento = await db.documentos.create({
      tipoDte: 52,
      ordenId: 731,
      guiaDespachoId: 94,
      receptor: { rut: '11111111-1', razonSocial: 'Cliente QA' },
      items: [{ nombre: 'Producto', cantidad: 1, precio: 1000 }],
    })

    expect(documento).toMatchObject({ tipoDte: 52, ordenId: 731, guiaDespachoId: 94 })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ordenId: 731, guiaDespachoId: 94 }),
    }))
  })
})
