import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

// Integracion contra Postgres real (convencion del proyecto: sin mocks de BD).
// Los casos de inmutabilidad del snapshot y de Restrict solo tienen valor
// contra la base: con prisma mockeado pasan siempre y no prueban nada.

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

function tokenFor(app, role = 'admin', permisosExtra = null) {
  return app.jwt.sign({
    id: 999,
    role,
    nombre: `Test ${role}`,
    permisosExtra,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  });
}

describe('costeo rutas (integracion con base real)', () => {
  const marker = `costeo-${Date.now()}`;
  let app;
  let prisma;
  let adminToken;
  let vendedorToken;
  let vendedorReadToken;
  let taller;
  let producto;
  let productoNoMk;
  let material;

  const auth = token => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
    prisma = app.prisma;

    adminToken = tokenFor(app, 'admin');
    vendedorToken = tokenFor(app, 'vendedor');
    vendedorReadToken = tokenFor(app, 'vendedor', { costeo: ['read'] });

    taller = await prisma.taller.create({ data: { nombre: `taller ${marker}` } });
    producto = await prisma.producto.create({
      data: { codigoInterno: `MK-${marker}`, nombre: `Producto ${marker}`, precioLista: 1000 },
    });
    productoNoMk = await prisma.producto.create({
      data: { codigoInterno: `OTRO-${marker}`, nombre: `Producto ${marker}`, precioLista: 1000 },
    });
    material = await prisma.bodegaTaller.create({
      data: { codigoInterno: `MAT-${marker}`, nombre: `Espuma ${marker}`, precio: 5000, tallerId: taller.id },
    });
    await prisma.tarifaProceso.create({
      data: { tallerId: taller.id, proceso: 'confeccion', valorHora: 4200 },
    });
  });

  afterAll(async () => {
    // Orden inverso a las dependencias: las lineas antes que sus materiales
    // (hay onDelete: Restrict y si no el cleanup falla).
    if (producto) {
      const receta = await prisma.productoReceta.findUnique({ where: { productoId: producto.id } });
      if (receta) {
        await prisma.recetaMaterial.deleteMany({ where: { recetaId: receta.id } });
        await prisma.recetaProceso.deleteMany({ where: { recetaId: receta.id } });
        await prisma.productoReceta.delete({ where: { id: receta.id } });
      }
      await prisma.costeoSnapshot.deleteMany({ where: { productoId: producto.id } });
    }
    if (material) {
      await prisma.bodegaTallerPrecioHistorial.deleteMany({ where: { bodegaTallerId: material.id } });
      await prisma.bodegaTaller.delete({ where: { id: material.id } }).catch(() => {});
    }
    if (producto) await prisma.producto.delete({ where: { id: producto.id } }).catch(() => {});
    if (productoNoMk) await prisma.producto.delete({ where: { id: productoNoMk.id } }).catch(() => {});
    if (taller) {
      await prisma.tarifaProceso.deleteMany({ where: { tallerId: taller.id } });
      await prisma.taller.delete({ where: { id: taller.id } }).catch(() => {});
    }
    if (app) await app.close();
  });

  const recetaPayload = () => ({
    tallerId: taller.id,
    margenTransferencia: 35,
    ajusteGlobalPct: 3,
    accesoriosMonto: 1000,
    materiales: [{ bodegaTallerId: material.id, cantidad: 2 }],
    procesos: [{ tallerId: taller.id, proceso: 'confeccion', horas: 3 }],
  });

  it('7. PUT crea la receta y GET la devuelve completa', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/costeo/recetas/${producto.id}`,
      headers: auth(adminToken),
      payload: recetaPayload(),
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({
      method: 'GET',
      url: `/api/costeo/recetas/${producto.id}`,
      headers: auth(adminToken),
    });
    expect(get.statusCode).toBe(200);
    const body = JSON.parse(get.body);
    const receta = body.receta ?? body;
    expect(receta.materiales).toHaveLength(1);
    expect(receta.procesos).toHaveLength(1);
    expect(Number(receta.margenTransferencia)).toBe(35);
  });

  it('8. PUT dos veces reemplaza las lineas en vez de duplicarlas', async () => {
    await app.inject({
      method: 'PUT',
      url: `/api/costeo/recetas/${producto.id}`,
      headers: auth(adminToken),
      payload: recetaPayload(),
    });
    const receta = await prisma.productoReceta.findUnique({ where: { productoId: producto.id } });
    const materiales = await prisma.recetaMaterial.count({ where: { recetaId: receta.id } });
    const procesos = await prisma.recetaProceso.count({ where: { recetaId: receta.id } });
    expect(materiales).toBe(1);
    expect(procesos).toBe(1);
  });

  it('9. material con ambos ids o sin ninguno retorna 400', async () => {
    const ambos = await app.inject({
      method: 'PUT',
      url: `/api/costeo/recetas/${producto.id}`,
      headers: auth(adminToken),
      payload: { ...recetaPayload(), materiales: [{ bodegaTallerId: material.id, telaId: 1, cantidad: 1 }] },
    });
    expect(ambos.statusCode).toBe(400);

    const ninguno = await app.inject({
      method: 'PUT',
      url: `/api/costeo/recetas/${producto.id}`,
      headers: auth(adminToken),
      payload: { ...recetaPayload(), materiales: [{ cantidad: 1 }] },
    });
    expect(ninguno.statusCode).toBe(400);
  });

  it('10. calcular devuelve el desglose y NO persiste', async () => {
    const antes = await prisma.producto.findUnique({ where: { id: producto.id } });
    const snapsAntes = await prisma.costeoSnapshot.count({ where: { productoId: producto.id } });

    const res = await app.inject({
      method: 'POST',
      url: `/api/costeo/recetas/${producto.id}/calcular`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const calc = JSON.parse(res.body);

    // 2 x 5000 + 3 x 4200 + 1000 = 23.600 -> +3% = 24.308 -> +35% = 32.816
    expect(calc.costoFabricacion).toBe(23600);
    expect(calc.costoAjustado).toBe(24308);
    expect(calc.costoTransferencia).toBe(32816);

    const despues = await prisma.producto.findUnique({ where: { id: producto.id } });
    const snapsDespues = await prisma.costeoSnapshot.count({ where: { productoId: producto.id } });
    expect(despues.precioLista).toBe(antes.precioLista);
    expect(snapsDespues).toBe(snapsAntes);
  });

  it('11. aplicar crea el snapshot, guarda el precio anterior y actualiza precio_lista', async () => {
    const antes = await prisma.producto.findUnique({ where: { id: producto.id } });

    const res = await app.inject({
      method: 'POST',
      url: `/api/costeo/recetas/${producto.id}/aplicar`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);

    const despues = await prisma.producto.findUnique({ where: { id: producto.id } });
    expect(despues.precioLista).toBe(32816);

    const snap = await prisma.costeoSnapshot.findFirst({
      where: { productoId: producto.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(snap).toBeTruthy();
    expect(snap.aplicado).toBe(true);
    expect(snap.costoTransferencia).toBe(32816);
    expect(snap.precioListaAnterior).toBe(antes.precioLista);
    expect(snap.detalle).toBeTruthy();
  });

  it('12. el snapshot es inmutable: cambiar el precio del material no lo altera', async () => {
    const snap = await prisma.costeoSnapshot.findFirst({
      where: { productoId: producto.id },
      orderBy: { createdAt: 'desc' },
    });

    await prisma.bodegaTaller.update({ where: { id: material.id }, data: { precio: 99999 } });
    const relectura = await prisma.costeoSnapshot.findUnique({ where: { id: snap.id } });
    expect(relectura.costoTransferencia).toBe(snap.costoTransferencia);
    expect(relectura.costoFabricacion).toBe(snap.costoFabricacion);

    // el calculo nuevo SI refleja el precio nuevo (el snapshot viejo no)
    const res = await app.inject({
      method: 'POST',
      url: `/api/costeo/recetas/${producto.id}/calcular`,
      headers: auth(adminToken),
    });
    expect(JSON.parse(res.body).costoFabricacion).toBeGreaterThan(snap.costoFabricacion);

    await prisma.bodegaTaller.update({ where: { id: material.id }, data: { precio: 5000 } });
  });

  it('13. usa la tarifa vigente mas reciente y no altera snapshots anteriores', async () => {
    const snapPrevio = await prisma.costeoSnapshot.findFirst({
      where: { productoId: producto.id },
      orderBy: { createdAt: 'desc' },
    });

    await prisma.tarifaProceso.create({
      data: { tallerId: taller.id, proceso: 'confeccion', valorHora: 8400, vigenteDesde: new Date(Date.now() + 1000) },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/costeo/recetas/${producto.id}/calcular`,
      headers: auth(adminToken),
    });
    // 2 x 5000 + 3 x 8400 + 1000 = 36.200
    expect(JSON.parse(res.body).costoFabricacion).toBe(36200);

    const relectura = await prisma.costeoSnapshot.findUnique({ where: { id: snapPrevio.id } });
    expect(relectura.costoFabricacion).toBe(snapPrevio.costoFabricacion);
  });

  it('14. no se puede borrar una materia prima usada en una receta', async () => {
    await expect(
      prisma.bodegaTaller.delete({ where: { id: material.id } })
    ).rejects.toThrow();

    const sigue = await prisma.bodegaTaller.findUnique({ where: { id: material.id } });
    expect(sigue).toBeTruthy();
  });

  it('15. cambiar el precio de una materia prima escribe el historial', async () => {
    const antes = await prisma.bodegaTallerPrecioHistorial.count({ where: { bodegaTallerId: material.id } });

    const res = await app.inject({
      method: 'PUT',
      url: `/api/bodega-taller/${material.id}`,
      headers: auth(adminToken),
      payload: { nombre: `Espuma ${marker}`, precio: 6000 },
    });
    expect(res.statusCode).toBe(200);

    const despues = await prisma.bodegaTallerPrecioHistorial.count({ where: { bodegaTallerId: material.id } });
    expect(despues).toBe(antes + 1);

    const fila = await prisma.bodegaTallerPrecioHistorial.findFirst({
      where: { bodegaTallerId: material.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(fila.precioNuevo).toBe(6000);

    await prisma.bodegaTaller.update({ where: { id: material.id }, data: { precio: 5000 } });
  });

  it('16. recalcular-masivo con aplicar:false no modifica nada', async () => {
    const antes = await prisma.producto.findUnique({ where: { id: producto.id } });
    const snapsAntes = await prisma.costeoSnapshot.count({ where: { productoId: producto.id } });

    const res = await app.inject({
      method: 'POST',
      url: '/api/costeo/recalcular-masivo',
      headers: auth(adminToken),
      payload: { productoIds: [producto.id], aplicar: false },
    });
    expect(res.statusCode).toBe(200);

    const despues = await prisma.producto.findUnique({ where: { id: producto.id } });
    const snapsDespues = await prisma.costeoSnapshot.count({ where: { productoId: producto.id } });
    expect(despues.precioLista).toBe(antes.precioLista);
    expect(snapsDespues).toBe(snapsAntes);
  });

  it('17. sin token retorna 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/costeo/tarifas' });
    expect(res.statusCode).toBe(401);
  });

  it('18. vendedor sin permiso extra recibe 403 en read y en write', async () => {
    const read = await app.inject({ method: 'GET', url: '/api/costeo/tarifas', headers: auth(vendedorToken) });
    expect(read.statusCode).toBe(403);

    const write = await app.inject({
      method: 'POST',
      url: '/api/costeo/tarifas',
      headers: auth(vendedorToken),
      payload: { tallerId: taller.id, proceso: 'corte', valorHora: 4000 },
    });
    expect(write.statusCode).toBe(403);
  });

  it('19. admin entra por bypass', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/costeo/tarifas', headers: auth(adminToken) });
    expect(res.statusCode).toBe(200);
  });

  it('20. vendedor con permisosExtra costeo:read lee pero no escribe', async () => {
    const read = await app.inject({ method: 'GET', url: '/api/costeo/tarifas', headers: auth(vendedorReadToken) });
    expect(read.statusCode).toBe(200);

    const write = await app.inject({
      method: 'POST',
      url: '/api/costeo/tarifas',
      headers: auth(vendedorReadToken),
      payload: { tallerId: taller.id, proceso: 'corte', valorHora: 4000 },
    });
    expect(write.statusCode).toBe(403);
  });

  it('21. filtro conReceta=true no rompe (relacion to-one con `is`)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/costeo/recetas?conReceta=true&search=${encodeURIComponent(marker)}`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.some(p => p.id === producto.id)).toBe(true);
  });

  it('22. materialesMonto (importado del Excel) entra al costo', async () => {
    await app.inject({
      method: 'PUT',
      url: `/api/costeo/recetas/${producto.id}`,
      headers: auth(adminToken),
      payload: { ...recetaPayload(), materiales: [], procesos: [], accesoriosMonto: 0, materialesMonto: 10000 },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/costeo/recetas/${producto.id}/calcular`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const calc = JSON.parse(res.body);
    expect(calc.costoFabricacion).toBe(10000);
    expect(calc.costoAjustado).toBe(10300);
    expect(calc.costoTransferencia).toBe(13905);

    // dejar la receta como estaba para los demas casos
    await app.inject({
      method: 'PUT',
      url: `/api/costeo/recetas/${producto.id}`,
      headers: auth(adminToken),
      payload: recetaPayload(),
    });
  });

  it('GET /recetas devuelve solo productos MK y metadata de paginacion', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/costeo/recetas?search=${marker}&page=1&limit=1`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(producto.id);
    expect(body.data[0].codigoInterno.toUpperCase().startsWith('MK')).toBe(true);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(1);
    expect(body.totalPages).toBe(1);
  });
});
