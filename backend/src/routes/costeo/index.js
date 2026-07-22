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
      return reply.code(400).send({ error: e.message });
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
