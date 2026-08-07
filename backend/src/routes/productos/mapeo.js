// Cruce de codigos al ingresar una factura de proveedor: el codigo que trae
// la guia/factura del proveedor casi nunca es nuestro codigo_interno. Se
// intenta resolver por (1) mapeo ya guardado (ProductoProveedor.codigoProveedor)
// y, si no hay, por (2) coincidencia directa con codigo_interno (algunos
// proveedores si usan el mismo SKU). La coincidencia por nombre se resuelve
// en el frontend reusando /productos/autocomplete, no se duplica aca.
export default async function mapeoProveedorRoutes(fastify) {
  fastify.get('/mapeo-proveedor', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request, reply) => {
    const proveedorId = Number.parseInt(request.query.proveedorId, 10)
    const codigo = String(request.query.codigo || '').trim()
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) return reply.code(400).send({ error: 'proveedorId requerido' })
    if (!codigo) return reply.code(400).send({ error: 'codigo requerido' })

    const mapeo = await fastify.prisma.productoProveedor.findFirst({
      where: { proveedorId, codigoProveedor: { equals: codigo, mode: 'insensitive' }, activo: true },
      select: {
        producto: { select: { id: true, codigoInterno: true, nombre: true, unidadMedida: true, precioLista: true, stock: true } },
      },
    })
    if (mapeo?.producto) return { match: mapeo.producto, matchType: 'mapeo' }

    const porSku = await fastify.prisma.producto.findFirst({
      where: { codigoInterno: { equals: codigo, mode: 'insensitive' }, activo: true },
      select: { id: true, codigoInterno: true, nombre: true, unidadMedida: true, precioLista: true, stock: true },
    })
    if (porSku) return { match: porSku, matchType: 'sku' }

    return { match: null, matchType: null }
  })
}
