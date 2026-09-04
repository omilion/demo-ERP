import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

describe('Pagos Proveedores: correccion y consistencia de calculo de IVA/Neto', () => {
  let app
  const marker = `test-iva-${Date.now()}`
  const createdIds = []

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    if (createdIds.length) {
      await app.prisma.pagoProveedor.deleteMany({ where: { id: { in: createdIds } } }).catch(() => {})
    }
    await app.close()
  })

  it('calcula y normaliza neto e iva correctamente para Factura, factura y variantes con espacios', async () => {
    const proveedor = await app.prisma.proveedor.findFirst({ where: { activo: true }, select: { id: true, codigoProveedor: true } })

    const total = 119000
    const casos = [
      { documento: 'Factura', nDoc: `${marker}-1` },
      { documento: 'factura', nDoc: `${marker}-2` },
      { documento: ' Factura ', nDoc: `${marker}-3` },
      { documento: 'FACTURA', nDoc: `${marker}-4` },
    ]

    for (const caso of casos) {
      // Simular fila legacy con total > 0 que habia quedado sin iva desglosado
      const pago = await app.prisma.pagoProveedor.create({
        data: {
          proveedorId: proveedor?.id,
          codigoProveedor: proveedor?.codigoProveedor,
          documento: caso.documento,
          nDoc: caso.nDoc,
          total,
          neto: total, // como habia quedado antes
          iva: 0,
          saldo: total,
          montoPagado: 0,
          estado: 'Pendiente',
        },
      })
      createdIds.push(pago.id)
    }

    // Ejecutar la logica de reparacion idempotente
    await app.prisma.$executeRawUnsafe(`
      UPDATE "catalogo"."pagos_proveedores"
      SET
        "neto" = round(("total" / 1.19)::numeric, 2),
        "iva"  = round(("total" - ("total" / 1.19))::numeric, 2)
      WHERE "total" > 0
        AND "documento" IS NOT NULL
        AND LOWER(BTRIM("documento")) = 'factura'
        AND (COALESCE("iva", 0) = 0 OR "neto" = round("total"::numeric, 2));
    `)

    // Verificar que todas las variantes fueron reparadas con desglose exacto
    for (const id of createdIds) {
      const stored = await app.prisma.pagoProveedor.findUnique({ where: { id } })
      expect(stored).toBeTruthy()
      expect(Number(stored.neto)).toBe(100000)
      expect(Number(stored.iva)).toBe(19000)
      expect(Number(stored.total)).toBe(119000)
    }
  })

  it('no altera documentos que no son facturas (e.g. Boleta o Recibo)', async () => {
    const pagoBoleta = await app.prisma.pagoProveedor.create({
      data: {
        documento: 'Boleta',
        nDoc: `${marker}-boleta`,
        total: 50000,
        neto: 50000,
        iva: 0,
        saldo: 50000,
        montoPagado: 0,
      },
    })
    createdIds.push(pagoBoleta.id)

    await app.prisma.$executeRawUnsafe(`
      UPDATE "catalogo"."pagos_proveedores"
      SET
        "neto" = round(("total" / 1.19)::numeric, 2),
        "iva"  = round(("total" - ("total" / 1.19))::numeric, 2)
      WHERE "total" > 0
        AND "documento" IS NOT NULL
        AND LOWER(BTRIM("documento")) = 'factura'
        AND (COALESCE("iva", 0) = 0 OR "neto" = round("total"::numeric, 2));
    `)

    const reloaded = await app.prisma.pagoProveedor.findUnique({ where: { id: pagoBoleta.id } })
    expect(Number(reloaded.neto)).toBe(50000)
    expect(Number(reloaded.iva)).toBe(0)
  })
})
