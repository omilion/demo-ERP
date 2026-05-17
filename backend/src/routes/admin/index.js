export default async function adminRoutes(fastify) {
  const onlyAdmin = async (req, reply) => {
    if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
  }

  fastify.get('/integridad/resumen', { preHandler: [fastify.authenticate, onlyAdmin] }, async () => {
    const p = fastify.prisma
    const [r] = await p.$queryRaw`
      SELECT
        (SELECT COUNT(*) FROM ventas.orden_items oi WHERE oi.producto_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM catalogo.productos p WHERE p.id = oi.producto_id))::int AS orden_items_huerfanos,
        (SELECT COUNT(*) FROM taller.odt_items oi WHERE oi.producto_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM catalogo.productos p WHERE p.id = oi.producto_id))::int AS odt_items_huerfanos,
        (SELECT COUNT(*) FROM catalogo.productos WHERE stock < 0)::int AS productos_stock_negativo,
        (SELECT COUNT(*) FROM catalogo.productos WHERE activo = true AND (precio_lista IS NULL OR precio_lista <= 0))::int AS productos_sin_precio,
        (SELECT COUNT(*) FROM catalogo.productos WHERE nombre ~ '[\u00C3\u00C2\u00E2]')::int AS productos_mojibake,
        (SELECT COUNT(*) FROM taller.odts WHERE descripcion ~ '[\u00C3\u00C2\u00E2]')::int AS odt_mojibake,
        (SELECT COUNT(*) FROM ventas.crm_registros WHERE (telefono IS NULL OR telefono = '') AND (email IS NULL OR email = ''))::int AS crm_sin_contacto,
        (SELECT COUNT(*) FROM catalogo.productos WHERE codigo_barra IN ('0','1','-') OR (codigo_barra IS NOT NULL AND LENGTH(codigo_barra) BETWEEN 1 AND 3))::int AS codigo_barra_basura,
        (SELECT COUNT(*) FROM catalogo.productos WHERE (codigo_barra IS NULL OR codigo_barra = '') AND activo = true)::int AS sin_codigo_barra,
        (SELECT COUNT(*) FROM catalogo.productos WHERE (codigo_interno IS NULL OR codigo_interno = '') AND activo = true)::int AS sin_codigo_interno,
        (SELECT COUNT(*) FROM catalogo.productos WHERE categoria_id IS NULL AND activo = true)::int AS sin_categoria,
        (SELECT COUNT(*) FROM catalogo.productos WHERE proveedor_id IS NULL AND activo = true)::int AS sin_proveedor
    `
    return r
  })

  fastify.get('/integridad/:tipo', { preHandler: [fastify.authenticate, onlyAdmin] }, async (req, reply) => {
    const { tipo } = req.params
    const limit = Math.min(Number(req.query.limit) || 200, 1000)
    const p = fastify.prisma

    switch (tipo) {
      case 'orden-items-huerfanos':
        return p.$queryRaw`
          SELECT oi.id, oi.orden_id, oi.producto_id, oi.nombre, oi.cantidad, oi.precio_unitario, o.created_at
          FROM ventas.orden_items oi LEFT JOIN ventas.ordenes o ON o.id = oi.orden_id
          WHERE oi.producto_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalogo.productos p WHERE p.id = oi.producto_id)
          ORDER BY o.created_at DESC NULLS LAST LIMIT ${limit}
        `
      case 'odt-items-huerfanos':
        return p.$queryRaw`
          SELECT oi.id, oi.odt_id, oi.producto_id, oi.nombre, oi.cantidad
          FROM taller.odt_items oi
          WHERE oi.producto_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalogo.productos p WHERE p.id = oi.producto_id)
          ORDER BY oi.id DESC LIMIT ${limit}
        `
      case 'productos-stock-negativo':
        return p.$queryRaw`
          SELECT id, codigo_interno, nombre, stock, stock_critico, bodega, precio_lista
          FROM catalogo.productos WHERE stock < 0 ORDER BY stock ASC LIMIT ${limit}
        `
      case 'productos-sin-precio':
        return p.$queryRaw`
          SELECT id, codigo_interno, nombre, stock, bodega, categoria, proveedor
          FROM catalogo.productos WHERE activo = true AND (precio_lista IS NULL OR precio_lista <= 0)
          ORDER BY nombre LIMIT ${limit}
        `
      case 'productos-mojibake':
        return p.$queryRaw`
          SELECT id, codigo_interno, nombre, categoria
          FROM catalogo.productos WHERE nombre ~ '[\u00C3\u00C2\u00E2]'
          ORDER BY id LIMIT ${limit}
        `
      case 'odt-mojibake':
        return p.$queryRaw`
          SELECT id, descripcion, cliente_nombre, tipo, estado, created_at
          FROM taller.odts WHERE descripcion ~ '[\u00C3\u00C2\u00E2]'
          ORDER BY created_at DESC LIMIT ${limit}
        `
      case 'crm-sin-contacto':
        return p.$queryRaw`
          SELECT id, nombre_cliente, empresa, estado, prioridad, created_at
          FROM ventas.crm_registros
          WHERE (telefono IS NULL OR telefono = '') AND (email IS NULL OR email = '')
          ORDER BY created_at DESC NULLS LAST LIMIT ${limit}
        `
      case 'codigo-barra-basura':
        return p.$queryRaw`
          SELECT id, codigo_interno, codigo_barra, nombre, stock, bodega
          FROM catalogo.productos
          WHERE codigo_barra IN ('0','1','-') OR (codigo_barra IS NOT NULL AND LENGTH(codigo_barra) BETWEEN 1 AND 3)
          ORDER BY id LIMIT ${limit}
        `
      default:
        return reply.code(404).send({ error: 'Tipo no soportado' })
    }
  })

  fastify.patch('/integridad/orden-item/:id', { preHandler: [fastify.authenticate, onlyAdmin] }, async (req, reply) => {
    const id = Number(req.params.id)
    const productoId = Number(req.body?.producto_id)
    if (!id || !productoId) return reply.code(400).send({ error: 'id y producto_id requeridos' })
    const [prod] = await fastify.prisma.$queryRaw`SELECT id, nombre, precio_lista FROM catalogo.productos WHERE id = ${productoId}`
    if (!prod) return reply.code(404).send({ error: 'Producto no existe' })
    await fastify.prisma.$executeRaw`UPDATE ventas.orden_items SET producto_id = ${productoId}, nombre = ${prod.nombre} WHERE id = ${id}`
    return { ok: true, producto: prod }
  })

  fastify.delete('/integridad/orden-item/:id', { preHandler: [fastify.authenticate, onlyAdmin] }, async (req, reply) => {
    const id = Number(req.params.id)
    if (!id) return reply.code(400).send({ error: 'id requerido' })
    await fastify.prisma.$executeRaw`DELETE FROM ventas.orden_items WHERE id = ${id}`
    return { ok: true }
  })

  fastify.patch('/integridad/odt-item/:id', { preHandler: [fastify.authenticate, onlyAdmin] }, async (req, reply) => {
    const id = Number(req.params.id)
    const productoId = Number(req.body?.producto_id)
    if (!id || !productoId) return reply.code(400).send({ error: 'id y producto_id requeridos' })
    const [prod] = await fastify.prisma.$queryRaw`SELECT id, nombre FROM catalogo.productos WHERE id = ${productoId}`
    if (!prod) return reply.code(404).send({ error: 'Producto no existe' })
    await fastify.prisma.$executeRaw`UPDATE taller.odt_items SET producto_id = ${productoId}, nombre = ${prod.nombre} WHERE id = ${id}`
    return { ok: true, producto: prod }
  })

  fastify.delete('/integridad/odt-item/:id', { preHandler: [fastify.authenticate, onlyAdmin] }, async (req, reply) => {
    const id = Number(req.params.id)
    if (!id) return reply.code(400).send({ error: 'id requerido' })
    await fastify.prisma.$executeRaw`DELETE FROM taller.odt_items WHERE id = ${id}`
    return { ok: true }
  })

  fastify.get('/auditoria', { preHandler: [fastify.authenticate, onlyAdmin] }, async (req) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const offset = Number(req.query.offset) || 0
    const where = []
    const params = []
    if (req.query.userId) { params.push(Number(req.query.userId)); where.push(`user_id = $${params.length}`) }
    if (req.query.entity) { params.push(req.query.entity); where.push(`entity = $${params.length}`) }
    if (req.query.method) { params.push(req.query.method); where.push(`method = $${params.length}`) }
    if (req.query.q) { params.push('%' + req.query.q + '%'); where.push(`(path ILIKE $${params.length} OR user_email ILIKE $${params.length})`) }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const [rows, [{ total }]] = await Promise.all([
      fastify.prisma.$queryRawUnsafe(
        `SELECT id, user_id, user_email, user_nombre, role, method, path, status, entity, entity_id, payload, ip, created_at
         FROM auth.audit_log ${whereSql} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
        ...params
      ),
      fastify.prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS total FROM auth.audit_log ${whereSql}`, ...params),
    ])
    return { items: rows, total, limit, offset }
  })
}
