// G10: importador masivo de productos (precios + stock)
// Acepta JSON array; el cliente parsea Excel/CSV antes de enviar.
export default async function importarRoute(fastify) {
  // POST /api/productos/importar/precios { rows: [{ codigo, precioLista, precioOferta? }] }
  fastify.post('/importar/precios', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const rows = Array.isArray(request.body?.rows) ? request.body.rows : null
    if (!rows) return reply.code(400).send({ error: 'rows requerido' })
    let actualizados = 0, errores = []
    for (const r of rows) {
      const codigo = String(r.codigo || '').trim()
      if (!codigo) { errores.push({ row: r, error: 'sin codigo' }); continue }
      const data = {}
      if (r.precioLista != null && r.precioLista !== '') data.precioLista = parseFloat(r.precioLista)
      if (r.precioOferta != null && r.precioOferta !== '') data.precioOferta = parseFloat(r.precioOferta)
      if (r.precioWeb != null && r.precioWeb !== '') data.precioWeb = parseFloat(r.precioWeb)
      if (!Object.keys(data).length) { errores.push({ codigo, error: 'sin precios' }); continue }
      try {
        const res = await fastify.prisma.producto.updateMany({ where: { codigo }, data })
        if (res.count > 0) actualizados++
        else errores.push({ codigo, error: 'no encontrado' })
      } catch (e) {
        errores.push({ codigo, error: e.message })
      }
    }
    return { actualizados, total: rows.length, errores }
  })

  // POST /api/productos/importar/stock { rows: [{ codigo, stock, stockCritico? }] }
  fastify.post('/importar/stock', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const rows = Array.isArray(request.body?.rows) ? request.body.rows : null
    if (!rows) return reply.code(400).send({ error: 'rows requerido' })
    let actualizados = 0, errores = []
    for (const r of rows) {
      const codigo = String(r.codigo || '').trim()
      if (!codigo) { errores.push({ row: r, error: 'sin codigo' }); continue }
      const data = {}
      if (r.stock != null && r.stock !== '') data.stock = parseFloat(r.stock)
      if (r.stockCritico != null && r.stockCritico !== '') data.stockCritico = parseFloat(r.stockCritico)
      if (!Object.keys(data).length) { errores.push({ codigo, error: 'sin stock' }); continue }
      try {
        const res = await fastify.prisma.producto.updateMany({ where: { codigo }, data })
        if (res.count > 0) actualizados++
        else errores.push({ codigo, error: 'no encontrado' })
      } catch (e) {
        errores.push({ codigo, error: e.message })
      }
    }
    return { actualizados, total: rows.length, errores }
  })

  // POST /api/productos/importar/nuevo { rows: [...] } - crea productos si no existen
  fastify.post('/importar/nuevo', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const rows = Array.isArray(request.body?.rows) ? request.body.rows : null
    if (!rows) return reply.code(400).send({ error: 'rows requerido' })
    let creados = 0, ignorados = 0, errores = []
    for (const r of rows) {
      const codigo = String(r.codigo || '').trim()
      const nombre = String(r.nombre || '').trim()
      if (!codigo || !nombre) { errores.push({ row: r, error: 'codigo y nombre requeridos' }); continue }
      try {
        const exists = await fastify.prisma.producto.findFirst({ where: { codigo } })
        if (exists) { ignorados++; continue }
        await fastify.prisma.producto.create({
          data: {
            codigo, nombre,
            unidadMedida: r.unidadMedida || null,
            precioLista: r.precioLista != null ? parseFloat(r.precioLista) : 0,
            stock: r.stock != null ? parseFloat(r.stock) : 0,
            stockCritico: r.stockCritico != null ? parseFloat(r.stockCritico) : 0,
            bodegaId: r.bodegaId != null ? parseInt(r.bodegaId, 10) : null,
            codigoBarra: r.codigoBarra || null,
            descripcion: r.descripcion || null,
            activo: true,
          },
        })
        creados++
      } catch (e) {
        errores.push({ codigo, error: e.message })
      }
    }
    return { creados, ignorados, total: rows.length, errores }
  })
}
