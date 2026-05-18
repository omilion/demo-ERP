// G10: importador masivo de productos (precios + stock)
// Acepta JSON array; el cliente parsea Excel/CSV antes de enviar.

function hasValue(value) {
  return value !== undefined && value !== null && value !== ''
}

function readCodigo(row) {
  return String(row.codigoInterno ?? row.codigo ?? '').trim()
}

function parseNumber(value) {
  if (!hasValue(value)) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function parseIntNumber(value) {
  const n = parseNumber(value)
  return n === undefined ? undefined : Math.trunc(n)
}

export default async function importarRoute(fastify) {
  // POST /api/productos/importar/precios { rows: [{ codigo|codigoInterno, precioLista, precioMarco?, precioWeb? }] }
  fastify.post('/importar/precios', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const rows = Array.isArray(request.body?.rows) ? request.body.rows : null
    if (!rows) return reply.code(400).send({ error: 'rows requerido' })
    let actualizados = 0, errores = []
    for (const r of rows) {
      const codigo = readCodigo(r)
      if (!codigo) { errores.push({ row: r, error: 'sin codigo' }); continue }
      const data = {}
      const precioLista = parseNumber(r.precioLista)
      const precioMarco = parseNumber(r.precioMarco)
      const precioWeb = parseNumber(r.precioWeb)
      const precioOferta = parseNumber(r.precioOferta)
      const porcDesc = parseNumber(r.porcDesc)
      if (precioLista !== undefined) data.precioLista = precioLista
      if (precioMarco !== undefined) data.precioMarco = precioMarco
      if (precioWeb !== undefined) data.precioWeb = precioWeb
      else if (precioOferta !== undefined) data.precioWeb = precioOferta
      if (porcDesc !== undefined) data.porcDesc = porcDesc
      if (!Object.keys(data).length) { errores.push({ codigo, error: 'sin precios validos' }); continue }
      try {
        const res = await fastify.prisma.producto.updateMany({ where: { codigoInterno: codigo }, data })
        if (res.count > 0) actualizados++
        else errores.push({ codigo, error: 'no encontrado' })
      } catch (e) {
        errores.push({ codigo, error: e.message })
      }
    }
    return { actualizados, total: rows.length, errores }
  })

  // POST /api/productos/importar/stock { rows: [{ codigo|codigoInterno, stock, stockCritico? }] }
  fastify.post('/importar/stock', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const rows = Array.isArray(request.body?.rows) ? request.body.rows : null
    if (!rows) return reply.code(400).send({ error: 'rows requerido' })
    let actualizados = 0, errores = []
    for (const r of rows) {
      const codigo = readCodigo(r)
      if (!codigo) { errores.push({ row: r, error: 'sin codigo' }); continue }
      const data = {}
      const stock = parseIntNumber(r.stock)
      const stockCritico = parseIntNumber(r.stockCritico)
      if (stock !== undefined) data.stock = stock
      if (stockCritico !== undefined) data.stockCritico = stockCritico
      if (!Object.keys(data).length) { errores.push({ codigo, error: 'sin stock valido' }); continue }
      try {
        const res = await fastify.prisma.producto.updateMany({ where: { codigoInterno: codigo }, data })
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
      const codigo = readCodigo(r)
      const nombre = String(r.nombre || '').trim()
      if (!codigo || !nombre) { errores.push({ row: r, error: 'codigo y nombre requeridos' }); continue }
      try {
        const exists = await fastify.prisma.producto.findUnique({ where: { codigoInterno: codigo } })
        if (exists) { ignorados++; continue }
        await fastify.prisma.producto.create({
          data: {
            codigoInterno: codigo,
            nombre,
            unidadMedida: r.unidadMedida || null,
            precioLista: parseNumber(r.precioLista) ?? 0,
            precioMarco: parseNumber(r.precioMarco) ?? 0,
            precioWeb: parseNumber(r.precioWeb) ?? null,
            porcDesc: parseNumber(r.porcDesc) ?? 0,
            stock: parseIntNumber(r.stock) ?? 0,
            stockCritico: parseIntNumber(r.stockCritico) ?? 0,
            bodega: String(r.bodega || 'Inventario').trim() || 'Inventario',
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
