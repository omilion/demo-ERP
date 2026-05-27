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

describe('subcategorias bodega taller legacy parity', () => {
  let app
  let token
  const marker = `spr36-${Date.now()}`

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = tokenFor(app)
  })

  afterAll(async () => {
    await app.prisma.bodegaTaller.deleteMany({ where: { codigoInterno: { contains: marker } } }).catch(() => {})
    await app.prisma.subcategoriaBodegaTaller.deleteMany({ where: { nombre: { contains: marker } } }).catch(() => {})
    await app.prisma.categoriaBodegaTaller.deleteMany({ where: { nombre: { contains: marker } } }).catch(() => {})
    await app.close()
  })

  async function createCategoria(nombre) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/categorias-bodega-taller',
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre },
    })
    expect(res.statusCode).toBe(201)
    return JSON.parse(res.body)
  }

  async function createSubcategoria(categoriaId, nombre) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/categorias-bodega-taller/${categoriaId}/subcategorias`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre },
    })
    expect(res.statusCode).toBe(201)
    return JSON.parse(res.body)
  }

  it('creates, lists, moves and soft deletes subcategories with category relation', async () => {
    const origen = await createCategoria(`${marker}-origen`)
    const destino = await createCategoria(`${marker}-destino`)
    const sub = await createSubcategoria(origen.id, `${marker}-sub`)

    const listOrigen = await app.inject({
      method: 'GET',
      url: `/api/categorias-bodega-taller/${origen.id}/subcategorias`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(listOrigen.statusCode).toBe(200)
    expect(JSON.parse(listOrigen.body).map(s => s.nombre)).toContain(`${marker}-sub`)

    const moved = await app.inject({
      method: 'PUT',
      url: `/api/categorias-bodega-taller/subcategorias/${sub.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre: `${marker}-sub-renombrada`, categoriaId: destino.id },
    })
    expect(moved.statusCode).toBe(200)
    expect(JSON.parse(moved.body)).toMatchObject({
      id: sub.id,
      nombre: `${marker}-sub-renombrada`,
      categoriaId: destino.id,
    })

    const all = await app.inject({
      method: 'GET',
      url: '/api/categorias-bodega-taller',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(all.statusCode).toBe(200)
    const destinoFromList = JSON.parse(all.body).find(c => c.id === destino.id)
    expect(destinoFromList.subcategorias.map(s => s.id)).toContain(sub.id)

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/categorias-bodega-taller/subcategorias/${sub.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(del.statusCode).toBe(204)

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/api/categorias-bodega-taller/${destino.id}/subcategorias`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(JSON.parse(afterDelete.body).map(s => s.id)).not.toContain(sub.id)
  })

  it('validates category, required name and duplicates inside the same category', async () => {
    const categoria = await createCategoria(`${marker}-validaciones`)
    await createSubcategoria(categoria.id, `${marker}-dup`)

    const missingName = await app.inject({
      method: 'POST',
      url: `/api/categorias-bodega-taller/${categoria.id}/subcategorias`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre: '   ' },
    })
    expect(missingName.statusCode).toBe(400)

    const badCategory = await app.inject({
      method: 'POST',
      url: '/api/categorias-bodega-taller/999999999/subcategorias',
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre: `${marker}-sin-categoria` },
    })
    expect(badCategory.statusCode).toBe(404)

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/categorias-bodega-taller/${categoria.id}/subcategorias`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre: `${marker}-DUP` },
    })
    expect(duplicate.statusCode).toBe(409)
  })

  it('validates material category/subcategory consistency in bodega taller writes', async () => {
    const categoriaA = await createCategoria(`${marker}-material-a`)
    const categoriaB = await createCategoria(`${marker}-material-b`)
    const subA = await createSubcategoria(categoriaA.id, `${marker}-material-sub-a`)

    const missingCategory = await app.inject({
      method: 'POST',
      url: '/api/bodega-taller',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        codigoInterno: `${marker}-mat-sin-cat`,
        nombre: 'Material sin categoria',
        subcategoriaId: subA.id,
      },
    })
    expect(missingCategory.statusCode).toBe(400)

    const mismatch = await app.inject({
      method: 'POST',
      url: '/api/bodega-taller',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        codigoInterno: `${marker}-mat-mismatch`,
        nombre: 'Material mismatch',
        categoriaId: categoriaB.id,
        subcategoriaId: subA.id,
      },
    })
    expect(mismatch.statusCode).toBe(400)

    const created = await app.inject({
      method: 'POST',
      url: '/api/bodega-taller',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        codigoInterno: `${marker}-mat-ok`,
        nombre: 'Material OK',
        categoriaId: categoriaA.id,
        subcategoriaId: subA.id,
        stock: '2.5',
        stockCritico: '1.25',
        precio: '3500',
      },
    })
    expect(created.statusCode).toBe(201)
    const body = JSON.parse(created.body)
    expect(body).toMatchObject({
      codigoInterno: `${marker}-mat-ok`,
      categoriaId: categoriaA.id,
      subcategoriaId: subA.id,
      stock: 2.5,
      stockCritico: 1.25,
      precio: 3500,
    })

    const invalidMove = await app.inject({
      method: 'PUT',
      url: `/api/bodega-taller/${body.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { categoriaId: categoriaB.id },
    })
    expect(invalidMove.statusCode).toBe(400)

    const moveSubcategory = await app.inject({
      method: 'PUT',
      url: `/api/categorias-bodega-taller/subcategorias/${subA.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { categoriaId: categoriaB.id },
    })
    expect(moveSubcategory.statusCode).toBe(200)

    const materialAfterMove = await app.inject({
      method: 'GET',
      url: `/api/bodega-taller/${body.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(materialAfterMove.statusCode).toBe(200)
    expect(JSON.parse(materialAfterMove.body)).toMatchObject({
      categoriaId: categoriaB.id,
      subcategoriaId: subA.id,
    })

    const deleteUsedSub = await app.inject({
      method: 'DELETE',
      url: `/api/categorias-bodega-taller/subcategorias/${subA.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(deleteUsedSub.statusCode).toBe(409)
  })

  it('enforces read and write permissions', async () => {
    const cajero = tokenFor(app, 'cajero')
    const soloLectura = tokenFor(app, 'solo_lectura')
    const taller = tokenFor(app, 'taller')

    const blockedRead = await app.inject({
      method: 'GET',
      url: '/api/categorias-bodega-taller',
      headers: { authorization: `Bearer ${cajero}` },
    })
    expect(blockedRead.statusCode).toBe(403)

    const allowedRead = await app.inject({
      method: 'GET',
      url: '/api/categorias-bodega-taller',
      headers: { authorization: `Bearer ${soloLectura}` },
    })
    expect(allowedRead.statusCode).toBe(200)

    const blockedWrite = await app.inject({
      method: 'POST',
      url: '/api/categorias-bodega-taller',
      headers: { authorization: `Bearer ${soloLectura}` },
      payload: { nombre: `${marker}-bloqueada` },
    })
    expect(blockedWrite.statusCode).toBe(403)

    const blockedTallerWrite = await app.inject({
      method: 'POST',
      url: '/api/categorias-bodega-taller',
      headers: { authorization: `Bearer ${taller}` },
      payload: { nombre: `${marker}-bloqueada-taller` },
    })
    expect(blockedTallerWrite.statusCode).toBe(403)
  })
})
