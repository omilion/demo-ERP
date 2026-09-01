import {
  getMaterialesHistorialPrecios,
  getTarifas,
  createTarifa,
  disableTarifa,
  getRecetas,
  getRecetaByProductoId,
  upsertReceta,
  disableReceta,
  calcularCosteoProducto,
  aplicarCosteoProducto,
  getSnapshots,
  recalcularMasivo,
} from './service.js';

export default async function costeoRoutes(fastify) {
  const readAuth = [fastify.authenticate, fastify.rbac('costeo', 'read')];
  const writeAuth = [fastify.authenticate, fastify.rbac('costeo', 'write')];

  // ── MATERIAS PRIMAS - HISTORIAL ─────────────────────────────────────
  fastify.get('/materiales/:id/historial-precios', { preHandler: readAuth }, async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (!id) return reply.code(400).send({ error: 'ID de material invalido' });
    const history = await getMaterialesHistorialPrecios(fastify.prisma, id);
    return reply.send(history);
  });

  // Cobertura de la carga de recetas.
  //
  // Las recetas entran por un script que lee el Excel de MK, no por pantalla:
  // es una operacion de una vez cada varios meses y su valor esta en el informe
  // de simulacion, que no cabe en un boton. Pero el RESULTADO si tiene que
  // verse: cuantos productos quedaron con receta y cuales no, para poder
  // completarlos con el editor que ya existe.
  fastify.get('/cobertura', { preHandler: readAuth }, async (request, reply) => {
    const [total, conRecetaRows, sinReceta] = await Promise.all([
      fastify.prisma.producto.count({ where: { codigoInterno: { startsWith: 'MK', mode: 'insensitive' } } }),
      // Solo las recetas de productos MK: contar todas daba porcentajes sobre
      // 100 cuando hay recetas de productos fuera de ese catalogo.
      fastify.prisma.$queryRaw`
        SELECT COUNT(*)::int AS n
          FROM taller.producto_recetas r
          JOIN catalogo.productos p ON p.id = r.producto_id
         WHERE r.activo = true AND p.codigo_interno ILIKE 'MK%'
      `,
      fastify.prisma.$queryRaw`
        SELECT p.id, p.codigo_interno AS "codigoInterno", p.nombre, p.activo
          FROM catalogo.productos p
          LEFT JOIN taller.producto_recetas r ON r.producto_id = p.id
         WHERE p.codigo_interno ILIKE 'MK%' AND r.id IS NULL
         ORDER BY p.activo DESC, p.codigo_interno
         LIMIT 200
      `,
    ])

    // Sin tarifas el motor calcula la mano de obra en cero y el costo queda
    // corto sin avisar, asi que se informa junto a la cobertura.
    const conReceta = Number(conRecetaRows?.[0]?.n || 0)

    const tarifas = await fastify.prisma.tarifaProceso.count({ where: { activo: true } })

    return reply.send({
      productosMk: total,
      conReceta,
      sinReceta: Math.max(0, total - conReceta),
      porcentaje: total > 0 ? Math.round((conReceta / total) * 1000) / 10 : 0,
      tarifasActivas: tarifas,
      pendientes: sinReceta,
    })
  });

  // ── TARIFAS DE MANO DE OBRA ──────────────────────────────────────────
  fastify.get('/tarifas', { preHandler: readAuth }, async (request, reply) => {
    const tallerId = request.query.tallerId ? parseInt(request.query.tallerId, 10) : undefined;
    const historico = request.query.historico === '1' || request.query.historico === 'true';
    const tarifas = await getTarifas(fastify.prisma, { tallerId, historico });
    return reply.send(tarifas);
  });

  fastify.post('/tarifas', { preHandler: writeAuth }, async (request, reply) => {
    try {
      const tarifa = await createTarifa(fastify.prisma, request.body || {});
      return reply.code(201).send(tarifa);
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
  });

  fastify.delete('/tarifas/:id', { preHandler: writeAuth }, async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (!id) return reply.code(400).send({ error: 'ID de tarifa invalido' });
    try {
      const disabled = await disableTarifa(fastify.prisma, id);
      return reply.send(disabled);
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ── RECETAS (BOM) ────────────────────────────────────────────────────
  fastify.get('/recetas', { preHandler: readAuth }, async (request, reply) => {
    const { tallerId, conReceta, search, page, limit } = request.query;
    const result = await getRecetas(fastify.prisma, { tallerId, conReceta, search, page, limit });
    return reply.send(result);
  });

  fastify.get('/recetas/:productoId', { preHandler: readAuth }, async (request, reply) => {
    try {
      const producto = await getRecetaByProductoId(fastify.prisma, request.params.productoId);
      return reply.send(producto);
    } catch (e) {
      return reply.code(404).send({ error: e.message });
    }
  });

  fastify.put('/recetas/:productoId', { preHandler: writeAuth }, async (request, reply) => {
    try {
      const receta = await upsertReceta(fastify.prisma, request.params.productoId, request.body || {});
      return reply.send(receta);
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
  });

  fastify.delete('/recetas/:productoId', { preHandler: writeAuth }, async (request, reply) => {
    try {
      await disableReceta(fastify.prisma, request.params.productoId);
      return reply.code(204).send();
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ── COSTEO, CÁLCULO Y SNAPSHOTS ──────────────────────────────────────
  fastify.post('/recetas/:productoId/calcular', { preHandler: readAuth }, async (request, reply) => {
    try {
      const calculation = await calcularCosteoProducto(fastify.prisma, request.params.productoId);
      return reply.send(calculation);
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
  });

  fastify.post('/recetas/:productoId/aplicar', { preHandler: writeAuth }, async (request, reply) => {
    try {
      const result = await aplicarCosteoProducto(fastify.prisma, request.params.productoId, request.user);
      return reply.send(result);
    } catch (e) {
      return reply.code(e.statusCode || 400).send({ error: e.message });
    }
  });

  fastify.get('/snapshots', { preHandler: readAuth }, async (request, reply) => {
    const productoId = request.query.productoId ? parseInt(request.query.productoId, 10) : undefined;
    const snapshots = await getSnapshots(fastify.prisma, { productoId });
    return reply.send(snapshots);
  });

  fastify.post('/recalcular-masivo', { preHandler: writeAuth }, async (request, reply) => {
    try {
      const result = await recalcularMasivo(fastify.prisma, request.body || {}, request.user);
      return reply.send(result);
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
  });
}
