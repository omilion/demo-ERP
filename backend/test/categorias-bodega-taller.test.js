import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin', extra = {}) {
  return app.jwt.sign({
    id: 1,
    role,
    nombre: `QA ${role}`,
    permisosExtra: null,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
    ...extra,
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
    await app.prisma.proveedor.deleteMany({ where: { rut: { contains: marker } } }).catch(() => {})
    await app.prisma.sucursal.deleteMany({ where: { nombre: { contains: marker } } }).catch(() => {})
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

  it('soft deletes child subcategories when deleting an unused category', async () => {
    const categoria = await createCategoria(`${marker}-delete-cat`)
    const sub = await createSubcategoria(categoria.id, `${marker}-delete-sub`)
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/categorias-bodega-taller/${categoria.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(del.statusCode).toBe(204)
    const reloaded = await app.prisma.subcategoriaBodegaTaller.findUnique({ where: { id: sub.id } })
    expect(reloaded.activo).toBe(false)
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

  it('filters, exports and scopes bodega taller with legacy columns and traceable stock adjustments', async () => {
    const categoria = await createCategoria(`${marker}-filtros-cat`)
    const sub = await createSubcategoria(categoria.id, `${marker}-filtros-sub`)
    const sucursalBase = 970000 + Math.floor(Date.now() % 10000)
    const sucA = await app.prisma.sucursal.upsert({
      where: { id: sucursalBase },
      update: { nombre: `${marker}-Sucursal A`, activo: true },
      create: { id: sucursalBase, nombre: `${marker}-Sucursal A` },
    })
    const sucB = await app.prisma.sucursal.upsert({
      where: { id: sucursalBase + 1 },
      update: { nombre: `${marker}-Sucursal B`, activo: true },
      create: { id: sucursalBase + 1, nombre: `${marker}-Sucursal B` },
    })
    const proveedorA = await app.prisma.proveedor.create({ data: { nombre: `${marker} Proveedor A`, rut: `${marker}-pa` } })
    const proveedorB = await app.prisma.proveedor.create({ data: { nombre: `${marker} Proveedor B`, rut: `${marker}-pb` } })

    const createA = await app.inject({
      method: 'POST',
      url: '/api/bodega-taller',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        codigoInterno: `${marker}-mat-a`,
        codigoBarra: `${marker}-bar-a`,
        nombre: `${marker} Material A`,
        categoriaId: categoria.id,
        subcategoriaId: sub.id,
        proveedorId: proveedorA.id,
        sucursalId: sucA.id,
        unidadMedida: 'Mts',
        stock: 1,
        stockCritico: 3,
      },
    })
    expect(createA.statusCode).toBe(201)
    const materialA = JSON.parse(createA.body)

    const createB = await app.inject({
      method: 'POST',
      url: '/api/bodega-taller',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        codigoInterno: `${marker}-mat-b`,
        codigoBarra: `${marker}-bar-b`,
        nombre: `${marker} Material B`,
        proveedorId: proveedorB.id,
        sucursalId: sucB.id,
        stock: 10,
        stockCritico: 1,
      },
    })
    expect(createB.statusCode).toBe(201)

    const filtered = await app.inject({
      method: 'GET',
      url: `/api/bodega-taller?stockCritico=true&sucursalId=${sucA.id}&proveedor=${encodeURIComponent(`${marker} Proveedor A`)}&codigoBarra=${marker}-bar-a`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(filtered.statusCode).toBe(200)
    const filteredBody = JSON.parse(filtered.body)
    expect(filteredBody.total).toBe(1)
    expect(filteredBody.items[0]).toMatchObject({
      codigoInterno: `${marker}-mat-a`,
      categoriaNombre: `${marker}-filtros-cat`,
      subcategoriaNombre: `${marker}-filtros-sub`,
      proveedorNombre: `${marker} Proveedor A`,
      sucursalNombre: `${marker}-Sucursal A`,
    })

    const scoped = await app.inject({
      method: 'GET',
      url: `/api/bodega-taller?search=${marker}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'taller', { sucursalId: sucA.id })}` },
    })
    expect(scoped.statusCode).toBe(200)
    const scopedCodes = JSON.parse(scoped.body).items.map(i => i.codigoInterno)
    expect(scopedCodes).toContain(`${marker}-mat-a`)
    expect(scopedCodes).not.toContain(`${marker}-mat-b`)

    const autocomplete = await app.inject({
      method: 'GET',
      url: `/api/bodega-taller/autocomplete?q=${marker}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'taller', { sucursalId: sucA.id })}` },
    })
    expect(autocomplete.statusCode).toBe(200)
    const autocompleteCodes = JSON.parse(autocomplete.body).map(i => i.codigoInterno)
    expect(autocompleteCodes).toContain(`${marker}-mat-a`)
    expect(autocompleteCodes).not.toContain(`${marker}-mat-b`)

    const exportRes = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/bodega-taller?search=${marker}&sucursalId=${sucA.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(exportRes.statusCode).toBe(200)
    expect(exportRes.headers['content-type']).toContain('text/csv')
    expect(exportRes.body).toContain('Cod Barra')
    expect(exportRes.body).toContain(`${marker} Proveedor A`)
    expect(exportRes.body).not.toContain(`${marker} Proveedor B`)

    const duplicateBar = await app.inject({
      method: 'POST',
      url: '/api/bodega-taller',
      headers: { authorization: `Bearer ${token}` },
      payload: { codigoInterno: `${marker}-mat-c`, codigoBarra: `${marker}-bar-a`, nombre: 'Duplicado barra' },
    })
    expect(duplicateBar.statusCode).toBe(409)

    const updateStock = await app.inject({
      method: 'PUT',
      url: `/api/bodega-taller/${materialA.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { stock: 6 },
    })
    expect(updateStock.statusCode).toBe(200)
    const movement = await app.prisma.bodegaTallerMovimiento.findFirst({
      where: { bodegaTallerId: materialA.id, origenTipo: 'ajuste_manual' },
    })
    expect(movement).toMatchObject({ tipo: 'ajuste', cantidad: 5 })
  })
})
