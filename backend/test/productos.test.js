import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

function testCode(prefix = 'TEST') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

describe('GET /api/productos', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app)
  })

  afterAll(() => app.close())

  it('returns paginated result with estado computed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('items')
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('limit')
    expect(body).toHaveProperty('page')
    expect(body).toHaveProperty('pages')
    expect(Array.isArray(body.items)).toBe(true)
    if (body.items.length > 0) {
      expect(body.items[0]).toHaveProperty('estado')
      expect(['Normal', 'Crítico', 'Sin stock']).toContain(body.items[0].estado)
    }
  })

  it('rejects unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/productos' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects forbidden role', async () => {
    const cajaToken = await loginAs(app, 'cajero')
    const res = await app.inject({
      method: 'GET',
      url: '/api/productos',
      headers: { authorization: `Bearer ${cajaToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('protects product autocomplete with catalogo read permission', async () => {
    const allowed = await app.inject({
      method: 'GET',
      url: '/api/productos/autocomplete?q=te',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(allowed.statusCode).toBe(200)

    const cajaToken = await loginAs(app, 'cajero')
    const denied = await app.inject({
      method: 'GET',
      url: '/api/productos/autocomplete?q=te',
      headers: { authorization: `Bearer ${cajaToken}` },
    })
    expect(denied.statusCode).toBe(403)
  })

  it('rejects invalid page parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/productos?page=0',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('page invalido')
  })

  it('returns legacy consulta precios fields and dedicated search filters', async () => {
    const codigoInterno = testCode('TEST-CONSULTA')
    const codigoBarra = testCode('BAR')
    const idMarco = testCode('MARCO')
    const categoria = await app.prisma.categoria.create({
      data: { nombre: testCode('Categoria Consulta'), porcDesc: 10 },
    })
    const subcategoria = await app.prisma.subcategoria.create({
      data: { nombre: testCode('Subcategoria Consulta'), categoriaId: categoria.id },
    })
    const proveedor = await app.prisma.proveedor.create({
      data: {
        nombre: testCode('Proveedor Consulta'),
        rut: testCode('RUT-CONSULTA'),
        codigoProveedor: Math.floor(Math.random() * 1000000) + 1000,
        porcVentaSala: 20,
        porcLicitacion: 30,
      },
    })
    const producto = await app.prisma.producto.create({
      data: {
        codigoInterno,
        codigoBarra,
        idMarco,
        nombre: 'Producto Colch\u00f3n Consulta SPR13',
        bodega: 'Inventario',
        categoriaId: categoria.id,
        subcategoriaId: subcategoria.id,
        proveedorId: proveedor.id,
        precioLista: 1000,
        precioMarco: 1500,
        porcDesc: 5,
        stock: 7,
      },
    })
    const productoLegacyProveedor = await app.prisma.producto.create({
      data: {
        codigoInterno: testCode('TEST-CONSULTA-LEGACY-PROV'),
        nombre: 'Producto proveedor legacy',
        bodega: 'Inventario',
        proveedor: String(proveedor.codigoProveedor),
        precioLista: 500,
        stock: 1,
      },
    })

    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/productos?codigoBarra=${encodeURIComponent(codigoBarra)}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.items).toHaveLength(1)
      expect(body.items[0].id).toBe(producto.id)
      expect(body.items[0].consultaPrecios).toMatchObject({
        categoriaNombre: categoria.nombre,
        subcategoriaNombre: subcategoria.nombre,
        proveedorNombre: proveedor.nombre,
        porcDescCategoria: 10,
        porcDescProducto: 5,
        precioNormalSalaVentaIva: 1428,
        precioConDescuento: 1214,
        precioConvMarco: 1500,
        precioLicitacion: 1300,
      })

      const byCategoria = await app.inject({
        method: 'GET',
        url: `/api/productos?categoriaId=${categoria.id}&subcategoriaId=${subcategoria.id}&idMarco=${encodeURIComponent(idMarco)}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(byCategoria.statusCode).toBe(200)
      expect(JSON.parse(byCategoria.body).items.map(p => p.id)).toContain(producto.id)

      const byProveedorLegacy = await app.inject({
        method: 'GET',
        url: `/api/productos?proveedorId=${proveedor.id}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(byProveedorLegacy.statusCode).toBe(200)
      expect(JSON.parse(byProveedorLegacy.body).items.map(p => p.id)).toEqual(expect.arrayContaining([
        producto.id,
        productoLegacyProveedor.id,
      ]))

      const byNombreSinTilde = await app.inject({
        method: 'GET',
        url: '/api/productos?nombre=colchon',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(byNombreSinTilde.statusCode).toBe(200)
      expect(JSON.parse(byNombreSinTilde.body).items.map(p => p.id)).toContain(producto.id)

      const vendedorToken = await loginAs(app, 'vendedor')
      const vendedorRes = await app.inject({
        method: 'GET',
        url: `/api/productos?codigoBarra=${encodeURIComponent(codigoBarra)}`,
        headers: { authorization: `Bearer ${vendedorToken}` },
      })
      expect(vendedorRes.statusCode).toBe(200)
      const vendedorProducto = JSON.parse(vendedorRes.body).items[0]
      expect(vendedorProducto).not.toHaveProperty('precioLista')
      expect(vendedorProducto.consultaPrecios.precioNormalSalaVentaIva).toBe(1428)
    } finally {
      await app.prisma.producto.deleteMany({ where: { id: { in: [producto.id, productoLegacyProveedor.id] } } })
      await app.prisma.subcategoria.deleteMany({ where: { id: subcategoria.id } })
      await app.prisma.categoria.deleteMany({ where: { id: categoria.id } })
      await app.prisma.proveedor.deleteMany({ where: { id: proveedor.id } })
    }
  })
})

describe('POST /api/productos', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app, 'bodeguero')
  })

  afterAll(async () => {
    await app.prisma.producto.deleteMany({ where: { codigoInterno: { startsWith: 'TEST-' } } })
    await app.close()
  })

  it('creates producto and returns it with estado', async () => {
    const codigoInterno = testCode()
    const res = await app.inject({
      method: 'POST',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        codigoInterno,
        nombre: 'Producto Test Plan',
        bodega: 'Inventario',
        stock: 5,
        stockCritico: 10,
        precioLista: 9900,
        porcDesc: 5,
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.codigoInterno).toBe(codigoInterno)
    expect(body.estado).toBe('Crítico')
    expect(body.porcDesc).toBe(5)
  })

  it('requires bodega write when create payload touches stock or price fields', async () => {
    const catalogoOnlyToken = app.jwt.sign({
      id: 999999,
      role: 'vendedor',
      nombre: 'Catalogo extra',
      permisosExtra: { catalogo: ['write'] },
      scope: 'erp',
      aud: 'plastimar:erp',
      tokenType: 'access',
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/productos',
      headers: { authorization: `Bearer ${catalogoOnlyToken}` },
      payload: {
        codigoInterno: testCode('TEST-CATONLY'),
        nombre: 'Producto Catalogo Sin Bodega',
        precioLista: 1000,
      },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /api/productos/:id', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app)
  })

  afterAll(() => app.close())

  it('returns producto by id', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
    })
    const { items: productos } = JSON.parse(listRes.body)
    const id = productos[0].id
    const res = await app.inject({
      method: 'GET',
      url: `/api/productos/${id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).id).toBe(id)
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/productos/999999',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /api/productos/:id/historial-precios', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app)
  })

  afterAll(() => app.close())

  it('returns historial array', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
    })
    const { items: productos } = JSON.parse(listRes.body)
    const id = productos[0].id
    const res = await app.inject({
      method: 'GET',
      url: `/api/productos/${id}/historial-precios`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(JSON.parse(res.body))).toBe(true)
  })

  it('protects price history with bodega read permission', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
    })
    const { items: productos } = JSON.parse(listRes.body)
    const vendedorToken = await loginAs(app, 'vendedor')
    const res = await app.inject({
      method: 'GET',
      url: `/api/productos/${productos[0].id}/historial-precios`,
      headers: { authorization: `Bearer ${vendedorToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('does not allow client-created price history entries', async () => {
    const producto = await app.prisma.producto.create({
      data: {
        codigoInterno: testCode('TEST-HIST-POST'),
        nombre: 'Producto Historial Post',
        bodega: 'Inventario',
        stock: 1,
        precioLista: 1000,
      },
    })

    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/productos/${producto.id}/historial-precios`,
        headers: { authorization: `Bearer ${token}` },
        payload: { precioAnterior: 1000, precioNuevo: 9999, usuarioNombre: 'cliente' },
      })
      expect(res.statusCode).toBe(404)
      const history = await app.prisma.precioHistorial.findMany({ where: { productoId: producto.id } })
      expect(history).toHaveLength(0)
    } finally {
      await app.prisma.producto.deleteMany({ where: { id: producto.id } })
    }
  })
})

describe('Bodega product safeguards', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app, 'bodeguero')
  })

  afterAll(async () => {
    await app.prisma.movimientoBodega.deleteMany({
      where: { origenTipo: { in: ['importacion_stock'] } },
    })
    await app.prisma.precioHistorial.deleteMany({
      where: { productoId: { in: (await app.prisma.producto.findMany({
        where: { codigoInterno: { startsWith: 'TEST-' } },
        select: { id: true },
      })).map(p => p.id) } },
    })
    await app.prisma.producto.deleteMany({ where: { codigoInterno: { startsWith: 'TEST-' } } })
    await app.close()
  })

  it('rejects direct stock edits through product update', async () => {
    const producto = await app.prisma.producto.create({
      data: {
        codigoInterno: testCode(),
        nombre: 'Producto Stock Directo',
        bodega: 'Inventario',
        stock: 3,
        stockCritico: 2,
        precioLista: 1000,
      },
    })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/productos/${producto.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { stock: 9 },
    })

    expect(res.statusCode).toBe(400)
    const reloaded = await app.prisma.producto.findUnique({ where: { id: producto.id } })
    expect(reloaded.stock).toBe(3)
  })

  it('does not allow soft delete or reactivation through generic update', async () => {
    const producto = await app.prisma.producto.create({
      data: {
        codigoInterno: testCode(),
        nombre: 'Producto Activo Protegido',
        bodega: 'Inventario',
        stock: 1,
        precioLista: 1000,
      },
    })

    const softDelete = await app.inject({
      method: 'PUT',
      url: `/api/productos/${producto.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { activo: false },
    })
    expect(softDelete.statusCode).toBe(400)
    expect((await app.prisma.producto.findUnique({ where: { id: producto.id } })).activo).toBe(true)

    await app.prisma.producto.update({ where: { id: producto.id }, data: { activo: false } })
    const reactivate = await app.inject({
      method: 'PUT',
      url: `/api/productos/${producto.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre: 'No debe reactivar' },
    })
    expect(reactivate.statusCode).toBe(404)
  })

  it('sanitizes price cost from update response without bodega read', async () => {
    const producto = await app.prisma.producto.create({
      data: {
        codigoInterno: testCode(),
        nombre: 'Producto Update Sanitizado',
        bodega: 'Inventario',
        stock: 1,
        precioLista: 7777,
      },
    })
    const catalogoOnlyToken = app.jwt.sign({
      id: 999998,
      role: 'vendedor',
      nombre: 'Catalogo write',
      permisosExtra: { catalogo: ['write'] },
      scope: 'erp',
      aud: 'plastimar:erp',
      tokenType: 'access',
    })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/productos/${producto.id}`,
      headers: { authorization: `Bearer ${catalogoOnlyToken}` },
      payload: { nombre: 'Producto Update Sanitizado 2' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).not.toHaveProperty('precioLista')
  })

  it('writes price history in backend when price changes', async () => {
    const producto = await app.prisma.producto.create({
      data: {
        codigoInterno: testCode(),
        nombre: 'Producto Historial Precio',
        bodega: 'Inventario',
        stock: 1,
        stockCritico: 1,
        precioLista: 1000,
      },
    })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/productos/${producto.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { precioLista: 1500 },
    })

    expect(res.statusCode).toBe(200)
    const history = await app.prisma.precioHistorial.findMany({ where: { productoId: producto.id } })
    expect(history).toHaveLength(1)
    expect(history[0].precioAnterior).toBe(1000)
    expect(history[0].precioNuevo).toBe(1500)
  })

  it('imports stock only after prevalidation and creates movement traceability', async () => {
    const codigoInterno = testCode()
    const producto = await app.prisma.producto.create({
      data: {
        codigoInterno,
        nombre: 'Producto Import Stock',
        bodega: 'Inventario',
        stock: 2,
        stockCritico: 1,
        precioLista: 1000,
      },
    })

    const dryRun = await app.inject({
      method: 'POST',
      url: '/api/productos/importar/stock',
      headers: { authorization: `Bearer ${token}` },
      payload: { rows: [{ codigo: codigoInterno, stock: 8, stockCritico: 3 }], dryRun: true },
    })
    expect(dryRun.statusCode).toBe(200)
    expect(JSON.parse(dryRun.body).aplicable).toBe(true)

    const withoutConfirm = await app.inject({
      method: 'POST',
      url: '/api/productos/importar/stock',
      headers: { authorization: `Bearer ${token}` },
      payload: { rows: [{ codigo: codigoInterno, stock: 8 }] },
    })
    expect(withoutConfirm.statusCode).toBe(400)

    const applied = await app.inject({
      method: 'POST',
      url: '/api/productos/importar/stock',
      headers: { authorization: `Bearer ${token}` },
      payload: { rows: [{ codigo: codigoInterno, stock: 8, stockCritico: 3 }], confirm: true, motivo: 'test import stock' },
    })
    expect(applied.statusCode).toBe(200)

    const updated = await app.prisma.producto.findUnique({ where: { id: producto.id } })
    expect(updated.stock).toBe(8)
    expect(updated.stockCritico).toBe(3)
    const movement = await app.prisma.movimientoBodega.findFirst({
      where: { productoId: producto.id, origenTipo: 'importacion_stock' },
    })
    expect(movement.cantidad).toBe(6)
  })

  it('rejects invalid mass import values during dry-run', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/productos/importar/stock',
      headers: { authorization: `Bearer ${token}` },
      payload: { rows: [{ codigo: 'NO-EXISTE', stock: -1 }], dryRun: true },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.aplicable).toBe(false)
    expect(body.errores.length).toBeGreaterThan(0)
  })
})

describe('GET /api/productos/web/catalogo', () => {
  let app, producto

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    producto = await app.prisma.producto.create({
      data: {
        codigoInterno: testCode('TEST-WEB-COSTO'),
        nombre: 'Producto Web sin costo publico',
        bodega: 'Inventario',
        visibleWeb: true,
        precioLista: 9999,
        precioWeb: 15000,
        stock: 3,
      },
    })
  })

  afterAll(async () => {
    await app.prisma.producto.deleteMany({ where: { id: producto.id } })
    await app.close()
  })

  it('does not expose precioLista on public catalog list or detail', async () => {
    const list = await app.inject({
      method: 'GET',
      url: `/api/productos/web/catalogo?search=${encodeURIComponent(producto.nombre)}`,
    })
    expect(list.statusCode).toBe(200)
    const publicItem = JSON.parse(list.body).items.find(item => item.id === producto.id)
    expect(publicItem).toBeTruthy()
    expect(publicItem).not.toHaveProperty('precioLista')
    expect(publicItem.precio).toBe(15000)

    const detail = await app.inject({
      method: 'GET',
      url: `/api/productos/web/catalogo/${producto.id}`,
    })
    expect(detail.statusCode).toBe(200)
    const publicDetail = JSON.parse(detail.body)
    expect(publicDetail).not.toHaveProperty('precioLista')
    expect(publicDetail.precio).toBe(15000)
  })
})

describe('GET /api/reportes/export/productos', () => {
  let app, token, codigoInterno, codigoInternoLegacyProveedor, categoria, subcategoria, proveedor

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app, 'admin')
    codigoInterno = testCode('TEST-EXPORT')
    categoria = await app.prisma.categoria.create({
      data: { nombre: testCode('Categoria Export') },
    })
    subcategoria = await app.prisma.subcategoria.create({
      data: { nombre: testCode('Subcategoria Export'), categoriaId: categoria.id },
    })
    proveedor = await app.prisma.proveedor.create({
      data: {
        nombre: testCode('Proveedor Export'),
        rut: testCode('RUT-EXPORT'),
        codigoProveedor: Math.floor(Math.random() * 1000000) + 2000000,
        porcVentaSala: 20,
        porcLicitacion: 30,
      },
    })
    await app.prisma.producto.create({
      data: {
        codigoInterno,
        nombre: 'Producto Export Bodega',
        bodega: 'Inventario',
        stock: 4,
        stockCritico: 4,
        precioLista: 1000,
        precioMarco: 1300,
        visibleWeb: true,
        codigoBarra: 'BAR-EXPORT',
        idMarco: 'CM-EXPORT',
        categoriaId: categoria.id,
        subcategoriaId: subcategoria.id,
        proveedorId: proveedor.id,
        estadoInventario: 'Inventariado',
      },
    })
    codigoInternoLegacyProveedor = testCode('TEST-EXPORT-LEGACY-PROV')
    await app.prisma.producto.create({
      data: {
        codigoInterno: codigoInternoLegacyProveedor,
        nombre: 'Producto Export Proveedor Legacy',
        bodega: 'Inventario',
        stock: 2,
        stockCritico: 1,
        precioLista: 1000,
        proveedor: String(proveedor.codigoProveedor),
      },
    })
  })

  afterAll(async () => {
    await app.prisma.producto.deleteMany({ where: { codigoInterno: { in: [codigoInterno, codigoInternoLegacyProveedor] } } })
    await app.prisma.subcategoria.deleteMany({ where: { id: subcategoria.id } })
    await app.prisma.categoria.deleteMany({ where: { id: categoria.id } })
    await app.prisma.proveedor.deleteMany({ where: { id: proveedor.id } })
    await app.close()
  })

  it('exports legacy bodega columns and honors active filters', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/productos?visibleWeb=true&search=${codigoInterno}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.body).toContain('Cod Interno')
    expect(res.body).toContain('Mostrar Web')
    expect(res.body).toContain('Precio Costo')
    expect(res.body).toContain('Precio venta + IVA')
    expect(res.body).toContain('Precio Conv. Marco')
    expect(res.body).toContain('PrecioLicitacion')
    expect(res.body).toContain(codigoInterno)
    expect(res.body).toContain('CM-EXPORT')
    expect(res.body).toContain(categoria.nombre)
    expect(res.body).toContain(subcategoria.nombre)
    expect(res.body).toContain(proveedor.nombre)
    expect(res.body).toContain('1428')
    expect(res.body).toContain('1300')
  })

  it('exports products linked only by legacy proveedor code when filtering by proveedorId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/productos?proveedorId=${proveedor.id}&search=${codigoInternoLegacyProveedor}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(codigoInternoLegacyProveedor)
    expect(res.body).toContain(proveedor.nombre)
  })

  it('rejects invalid export filters before querying Prisma', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reportes/export/productos?subcategoriaId=abc',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('subcategoriaId invalido')
  })
})
