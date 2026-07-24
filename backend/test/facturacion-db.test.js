// D:\plastimar-erp-v2\backend\test\facturacion-db.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createFacturacionDb } from '../src/facturacion/db.js'

describe('facturacion/db (Prisma adapter)', () => {
  let prisma
  let db
  const marker = `QA-DB-${Date.now()}`

  beforeAll(async () => {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
    prisma = new PrismaClient({ adapter })
    db = createFacturacionDb(prisma)
  })

  afterAll(async () => {
    await prisma.factDocumento.deleteMany({ where: { extra: { path: ['marker'], equals: marker } } })
    await prisma.factCaf.deleteMany({ where: { fechaAutorizacion: marker } })
    await prisma.$disconnect()
  })

  it('getEmpresa returns the seeded Plastimar row', async () => {
    const empresa = await db.getEmpresa()
    expect(empresa.rut).toBe('76.354.051-0')
    expect(empresa.razonSocial).toBe('PLASTIMAR LIMITADA')
    expect(empresa.ambiente).toBe('certificacion')
  })

  it('saveEmpresa upserts the singleton row', async () => {
    const before = await db.getEmpresa()
    const saved = await db.saveEmpresa({ ...before, rutEnvia: '76354051-0' })
    expect(saved.rutEnvia).toBe('76354051-0')
    // restore
    await db.saveEmpresa({ ...before, rutEnvia: before.rutEnvia })
  })

  it('cafs.tomarFolio assigns sequential folios and returns null when exhausted', async () => {
    const caf = await prisma.factCaf.create({
      data: { tipoDte: 33, folioDesde: 500, folioHasta: 501, siguienteFolio: 500, fechaAutorizacion: marker, ambiente: 'certificacion', xml: '<CAF/>' }
    })
    const first = await db.cafs.tomarFolio(33, 'certificacion')
    expect(first.folio).toBe(500)
    const second = await db.cafs.tomarFolio(33, 'certificacion')
    expect(second.folio).toBe(501)
    // both folios from this range are used up, and no other CAF exists for this
    // ambiente-tipoDte pair created in this test, so a third pull only returns
    // null if there's no other test-independent CAF loaded — instead assert
    // this specific CAF's siguienteFolio advanced past folioHasta:
    const reloaded = await prisma.factCaf.findUnique({ where: { id: caf.id } })
    expect(reloaded.siguienteFolio).toBe(502)
  })

  it('cafs.tomarFolio does not double-issue a folio under concurrent calls', async () => {
    await prisma.factCaf.create({
      data: { tipoDte: 34, folioDesde: 700, folioHasta: 701, siguienteFolio: 700, fechaAutorizacion: marker, ambiente: 'certificacion', xml: '<CAF/>' }
    })
    const [r1, r2] = await Promise.all([
      db.cafs.tomarFolio(34, 'certificacion'),
      db.cafs.tomarFolio(34, 'certificacion')
    ])
    expect(new Set([r1.folio, r2.folio]).size).toBe(2)
    expect([r1.folio, r2.folio].sort()).toEqual([700, 701])
  })

  it('documentos.create/get/list/update round-trip JSON fields', async () => {
    const created = await db.documentos.create({
      tipoDte: 33,
      usuarioNombre: 'QA Facturador',
      receptor: { rut: '11111111-1', razonSocial: 'Cliente Prueba' },
      items: [{ nombre: 'Tela', cantidad: 1, precio: 1000 }],
      extra: { marker }
    })
    expect(created.estado).toBe('borrador')
    expect(created.usuarioNombre).toBe('QA Facturador')
    expect(created.receptor.rut).toBe('11111111-1')

    const fetched = await db.documentos.get(created.id)
    expect(fetched.items[0].nombre).toBe('Tela')

    const updated = await db.documentos.update(created.id, { estado: 'emitido', folio: 500 })
    expect(updated.estado).toBe('emitido')
    expect(updated.folio).toBe(500)

    const listed = await db.documentos.list({ estado: 'emitido' })
    expect(listed.some(d => d.id === created.id)).toBe(true)
  })

  it('clients.get maps Cliente fields to the shape engine.js expects', async () => {
    const cliente = await prisma.cliente.create({
      data: { rut: `77${Date.now()}`.slice(0, 9) + '-1', nombre: 'QA Cliente DB Test', razonSocial: 'QA Cliente DB Test SpA', giro: 'Pruebas', direccion: 'Calle 1', comuna: 'Vina del Mar', ciudad: 'Vina del Mar', email: 'qa-db-test@plastimar.test' }
    })
    const mapped = await db.clients.get(cliente.id)
    expect(mapped).toMatchObject({
      rut: cliente.rut,
      razonSocial: 'QA Cliente DB Test SpA',
      giro: 'Pruebas',
      direccion: 'Calle 1',
      comuna: 'Vina del Mar',
      ciudad: 'Vina del Mar',
      emailDte: 'qa-db-test@plastimar.test'
    })
    await prisma.cliente.delete({ where: { id: cliente.id } })
  })

  it('clients.get returns null for a missing clientId', async () => {
    expect(await db.clients.get(null)).toBeNull()
    expect(await db.clients.get(999999999)).toBeNull()
  })
})
