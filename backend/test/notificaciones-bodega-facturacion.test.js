// Los disparadores que le faltaban a bodega y a facturación.
//
// En ambos casos el dato ya existía y nadie avisaba: `stockCritico` alimentaba
// sólo un correo por cron, y "entregado sin facturar" era un filtro del listado
// al que había que ir a buscar. Es plata entregada sin cobrar.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function hasUsableDatabaseUrl() {
  try {
    const url = new URL(process.env.DATABASE_URL || '')
    return Boolean(url.hostname && url.username && url.password)
  } catch { return false }
}
const describeDb = hasUsableDatabaseUrl() ? describe : describe.skip

describeDb('avisos de bodega y facturacion', () => {
  let app
  let userId
  const marca = `AVIS-${Date.now()}`
  const creado = {}

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    const u = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })
    userId = u.id

    // Producto bajo el critico por RESERVA, no por falta de stock fisico: es el
    // caso que el aviso anterior no veia.
    const producto = await app.prisma.producto.create({
      data: {
        codigoInterno: `${marca}-P`, nombre: `${marca} Producto`, activo: true,
        stock: 10, stockReservado: 8, stockDanado: 0, stockCritico: 5,
      },
    })
    creado.productoId = producto.id
  })

  afterAll(async () => {
    await app.prisma.producto.deleteMany({ where: { id: creado.productoId } }).catch(() => {})
    await app.close()
  })

  const avisos = async (role, extra = null) => {
    const token = app.jwt.sign({
      id: userId, role, nombre: 'Test', permisosExtra: extra,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
    const res = await app.inject({ method: 'GET', url: '/api/notificaciones', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const cuerpo = res.json()
    return Array.isArray(cuerpo) ? cuerpo : (cuerpo.items || [])
  }

  describe('stock critico', () => {
    // Lo importante: mide el DISPONIBLE. Con 10 fisicos y 8 reservados quedan 2
    // vendibles contra un critico de 5. Mirando solo el stock fisico, este
    // producto parece sano y el aviso llegaria tarde.
    it('avisa por disponible, no por stock fisico', async () => {
      const propio = (await avisos('bodeguero'))
        .find(n => n.tipo === 'stock_critico' && String(n.titulo).includes(marca))
      expect(propio).toBeTruthy()
      expect(propio.detalle).toContain('disponible 2')
      expect(propio.detalle).toContain('crítico 5')
    })

    it('no le llega al taller, que tiene bodega solo de lectura', async () => {
      for (const rol of ['taller', 'taller_operario']) {
        const ajenos = (await avisos(rol)).filter(n => n.tipo === 'stock_critico')
        expect(ajenos, rol).toHaveLength(0)
      }
    })
  })

  describe('entregado sin facturar', () => {
    it('le llega a quien emite documentos', async () => {
      const lista = await avisos('bodeguero', { 'facturacion.emitir': ['read', 'write'] })
      expect(lista.some(n => n.tipo === 'venta_sin_facturar')).toBe(true)
    })

    it('no le llega a quien no factura', async () => {
      for (const rol of ['taller_operario', 'bodeguero']) {
        const ajenos = (await avisos(rol)).filter(n => n.tipo === 'venta_sin_facturar')
        expect(ajenos, rol).toHaveLength(0)
      }
    })
  })
})
