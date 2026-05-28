import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin') {
  return app.jwt.sign({
    id: 1,
    role,
    nombre: `QA ${role}`,
    permisosExtra: null,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

describe('subcategorias catalogo legacy parity', () => {
  let app
  let token
  const marker = `spr37-${Date.now()}`

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = tokenFor(app)
  })

  afterAll(async () => {
    await app.prisma.producto.deleteMany({ where: { codigoInterno: { contains: marker } } }).catch(() => {})
    await app.prisma.subcategoria.deleteMany({ where: { nombre: { contains: marker } } }).catch(() => {})
    await app.prisma.categoria.deleteMany({ where: { nombre: { contains: marker } } }).catch(() => {})
    await app.close()
  })

  async function createCategoria(nombre) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/categorias',
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre },
    })
    expect(res.statusCode).toBe(201)
    return JSON.parse(res.body)
  }

  async function createSubcategoria(categoriaId, nombre) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/categorias/${categoriaId}/subcategorias`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre },
    })
    expect(res.statusCode).toBe(201)
    return JSON.parse(res.body)
  }

  it('creates, lists, moves and protects subcategories used by products', async () => {
    const origen = await createCategoria(`${marker}-origen`)
    const destino = await createCategoria(`${marker}-destino`)
    const sub = await createSubcategoria(origen.id, `${marker}-sub`)

    await app.prisma.producto.create({
      data: {
        codigoInterno: `${marker}-prod`,
        nombre: 'Producto SPR37',
        categoriaId: origen.id,
        subcategoriaId: sub.id,
        bodega: 'Inventario',
        estadoInventario: 'Inventariado',
      },
    })

    const moved = await app.inject({
      method: 'PUT',
      url: `/api/categorias/subcategorias/${sub.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { categoriaId: destino.id },
    })
    expect(moved.statusCode).toBe(200)

    const product = await app.prisma.producto.findFirst({ where: { codigoInterno: `${marker}-prod` } })
    expect(product).toMatchObject({ categoriaId: destino.id, subcategoriaId: sub.id })

    await app.prisma.producto.create({
      data: {
        codigoInterno: `${marker}-prod-legacy`,
        nombre: 'Producto legacy categoria texto',
        categoria: destino.nombre,
        bodega: 'Inventario',
        estadoInventario: 'Inventariado',
      },
    })

    const filtered = await app.inject({
      method: 'GET',
      url: `/api/productos?categoriaId=${destino.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(filtered.statusCode).toBe(200)
    expect(JSON.parse(filtered.body).items.map(p => p.codigoInterno)).toEqual(
      expect.arrayContaining([`${marker}-prod`, `${marker}-prod-legacy`]),
    )

    const deleteCategoriaUsadaLegacy = await app.inject({
      method: 'DELETE',
      url: `/api/categorias/${destino.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(deleteCategoriaUsadaLegacy.statusCode).toBe(409)

    const list = await app.inject({
      method: 'GET',
      url: '/api/categorias',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(list.statusCode).toBe(200)
    const destinoFromList = JSON.parse(list.body).find(c => c.id === destino.id)
    expect(destinoFromList.subcategorias.map(s => s.id)).toContain(sub.id)

    const deleteUsed = await app.inject({
      method: 'DELETE',
      url: `/api/categorias/subcategorias/${sub.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(deleteUsed.statusCode).toBe(409)
  })

  it('validates category/subcategory consistency on product writes', async () => {
    const categoriaA = await createCategoria(`${marker}-prod-a`)
    const categoriaB = await createCategoria(`${marker}-prod-b`)
    const subA = await createSubcategoria(categoriaA.id, `${marker}-prod-sub-a`)

    const mismatch = await app.inject({
      method: 'POST',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        codigoInterno: `${marker}-mismatch`,
        nombre: 'Producto mismatch',
        categoriaId: categoriaB.id,
        subcategoriaId: subA.id,
      },
    })
    expect(mismatch.statusCode).toBe(400)

    const textOnly = await app.inject({
      method: 'POST',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        codigoInterno: `${marker}-text-only`,
        nombre: 'Producto categoria texto',
        categoria: categoriaA.nombre,
      },
    })
    expect(textOnly.statusCode).toBe(400)

    const ok = await app.inject({
      method: 'POST',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        codigoInterno: `${marker}-ok`,
        nombre: 'Producto OK',
        categoriaId: categoriaA.id,
        subcategoriaId: subA.id,
      },
    })
    expect(ok.statusCode).toBe(201)
    expect(JSON.parse(ok.body).categoria).toBe(categoriaA.nombre)

    const importUnknown = await app.inject({
      method: 'POST',
      url: '/api/productos/importar/nuevo',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        dryRun: true,
        rows: [{
          codigoInterno: `${marker}-import-unknown`,
          nombre: 'Import desconocido',
          categoria: `${marker}-no-existe`,
        }],
      },
    })
    expect(importUnknown.statusCode).toBe(200)
    expect(JSON.parse(importUnknown.body)).toMatchObject({ aplicable: false })
  })

  it('validates category discount and deactivates child subcategories when deleting an unused category', async () => {
    const invalidDesc = await app.inject({
      method: 'POST',
      url: '/api/categorias',
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre: `${marker}-desc-invalido`, porcDesc: 150 },
    })
    expect(invalidDesc.statusCode).toBe(400)

    const categoria = await createCategoria(`${marker}-delete-subcats`)
    const sub = await createSubcategoria(categoria.id, `${marker}-delete-sub`)

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/categorias/${categoria.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(del.statusCode).toBe(204)

    const reloadedSub = await app.prisma.subcategoria.findUnique({ where: { id: sub.id } })
    expect(reloadedSub.activo).toBe(false)
  })

  it('enforces catalog read and admin/config write permissions', async () => {
    const cajero = tokenFor(app, 'cajero')
    const bodeguero = tokenFor(app, 'bodeguero')

    const blockedRead = await app.inject({
      method: 'GET',
      url: '/api/categorias',
      headers: { authorization: `Bearer ${cajero}` },
    })
    expect(blockedRead.statusCode).toBe(403)

    const blockedWrite = await app.inject({
      method: 'POST',
      url: '/api/categorias',
      headers: { authorization: `Bearer ${bodeguero}` },
      payload: { nombre: `${marker}-bloqueada` },
    })
    expect(blockedWrite.statusCode).toBe(403)
  })
})
