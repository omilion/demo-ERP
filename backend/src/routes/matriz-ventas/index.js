// Vista consolidada de TODAS las ventas (Orden + CotizacionLicitacion + OrdenCompraOnline)
// Filtros: tipo, fechas, RUT, n° interno, OC, ID licitación, búsqueda libre

export default async function matrizVentasRoutes(fastify) {
  // GET /api/matriz-ventas?tipo=&desde=&hasta=&rut=&nInterno=&oc=&idLicitacion=&search=&page=1
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request) => {
    const { tipo, desde, hasta, rut, nInterno, oc, idLicitacion, guia, odt, estadoPago, estadoEntrega, search, page = '1' } = request.query
    const LIMIT = 100
    const skip = (parseInt(page, 10) - 1) * LIMIT
    const dateDesde = desde ? new Date(desde) : null
    const dateHasta = hasta ? new Date(hasta + 'T23:59:59') : null

    // Si filtran por odt, lookup ordenId
    let ordenIdsByOdt = null
    if (odt) {
      const odts = await fastify.prisma.odt.findMany({
        where: { id: parseInt(odt, 10) },
        select: { ordenId: true },
      })
      ordenIdsByOdt = odts.map(o => o.ordenId).filter(Boolean)
      if (ordenIdsByOdt.length === 0) return { items: [], total: 0, limit: LIMIT, totalMonto: 0 }
    }

    const results = []

    // Tipo: 'venta-sala' | 'venta-web' | 'convenio-marco' | 'licitacion' | undefined (todos)
    // Filtros odt/guia/estadoPago/estadoEntrega solo aplican a ordenes
    const restrictToOrden = !!(odt || guia || estadoPago || estadoEntrega)
    const inOrden = !tipo || ['venta-sala', 'convenio-marco', 'venta-directa'].includes(tipo)
    const inOcOnline = !restrictToOrden && (!tipo || tipo === 'venta-web')
    const inLicitacion = !restrictToOrden && (!tipo || tipo === 'licitacion')

    if (inOrden) {
      const where = { eliminada: false }
      if (tipo === 'venta-sala' || tipo === 'venta-directa') where.tipo = { in: ['Venta sala', 'Venta directa'] }
      if (tipo === 'convenio-marco') where.tipo = 'Convenio Marco'
      if (dateDesde || dateHasta) where.createdAt = {}
      if (dateDesde) where.createdAt.gte = dateDesde
      if (dateHasta) where.createdAt.lte = dateHasta
      if (rut) where.rutCliente = { contains: rut, mode: 'insensitive' }
      if (nInterno) where.nInterno = parseInt(nInterno, 10)
      if (oc) where.licitacion = { contains: oc, mode: 'insensitive' }
      if (guia) where.guias = parseInt(guia, 10)
      if (estadoPago) where.estadoPago = estadoPago
      if (estadoEntrega) where.estadoEntrega = estadoEntrega
      if (ordenIdsByOdt) where.id = { in: ordenIdsByOdt }
      if (search) {
        const isNum = /^\d+$/.test(search.trim())
        where.OR = [
          { creadorNombre: { contains: search, mode: 'insensitive' } },
          { rutCliente: { contains: search, mode: 'insensitive' } },
          { observaciones: { contains: search, mode: 'insensitive' } },
          ...(isNum ? [{ nInterno: parseInt(search, 10) }, { id: parseInt(search, 10) }] : []),
        ]
      }
      const ordenes = await fastify.prisma.orden.findMany({
        where, include: { items: true }, orderBy: { createdAt: 'desc' }, take: LIMIT,
      })
      // Lookup clientes + ODTs + guías + documentos en batch (todo cruzado)
      const ruts = [...new Set(ordenes.map(o => o.rutCliente).filter(Boolean))]
      const ordenIds = ordenes.map(o => o.id)
      const [clientesArr, odtsArr, cotizArr, guiasArr, movsArr] = await Promise.all([
        ruts.length ? fastify.prisma.cliente.findMany({
          where: { rut: { in: ruts } }, select: { rut: true, razonSocial: true, nombre: true },
        }) : [],
        ordenIds.length ? fastify.prisma.odt.findMany({
          where: { ordenId: { in: ordenIds } },
          select: { id: true, ordenId: true, estado: true },
        }) : [],
        ordenIds.length ? fastify.prisma.cotizacionLicitacion.findMany({
          where: { ordenId: { in: ordenIds } }, select: { id: true, idLicitacion: true, ordenId: true },
        }) : [],
        ordenIds.length ? fastify.prisma.guiaDespacho.findMany({
          where: { ordenId: { in: ordenIds } },
          select: { id: true, ordenId: true, nGuia: true, fechaGuia: true },
          orderBy: { fechaGuia: 'desc' },
        }) : [],
        ordenIds.length ? fastify.prisma.movimientoCaja.findMany({
          where: { ordenId: { in: ordenIds }, eliminado: false, tipoDocumento: { not: null } },
          select: { id: true, ordenId: true, tipoDocumento: true, nDoc: true, monto: true, estadoPagoDoc: true },
        }) : [],
      ])
      const clienteMap = Object.fromEntries(clientesArr.map(c => [c.rut, c.razonSocial || c.nombre]))
      const odtMap = {}; for (const o of odtsArr) (odtMap[o.ordenId] ||= []).push({ id: o.id, estado: o.estado })
      const guiasMap = {}; for (const g of guiasArr) (guiasMap[g.ordenId] ||= []).push({ id: g.id, nGuia: g.nGuia, fechaGuia: g.fechaGuia })
      const docsMap = {}; for (const m of movsArr) (docsMap[m.ordenId] ||= []).push({ tipoDocumento: m.tipoDocumento, nDoc: m.nDoc, monto: m.monto, estadoPagoDoc: m.estadoPagoDoc })
      const cotizMap = Object.fromEntries(cotizArr.map(c => [c.ordenId, { id: c.id, idLicitacion: c.idLicitacion }]))
      for (const o of ordenes) {
        const total = (o.items || []).reduce((s, i) => s + (i.cantidad || 0) * (i.precio || 0), 0) * (1 - (o.descuentoPct || 0) / 100)
        const abono = o.abono || 0
        const facturado = o.facturado || 0
        const saldo = Math.max(0, total - abono)
        const odts = odtMap[o.id] || []
        const guias = guiasMap[o.id] || []
        const documentos = docsMap[o.id] || []
        results.push({
          fuente: 'orden', id: o.id, nInterno: o.nInterno, fecha: o.createdAt,
          tipo: o.tipo, cliente: o.rutCliente,
          nombreCliente: clienteMap[o.rutCliente] || null,
          ref: o.licitacion || '',
          total, abono, facturado, saldo,
          estado: o.estado, estadoEntrega: o.estadoEntrega, pago: o.estadoPago,
          creadorNombre: o.creadorNombre || null,
          guiasLegacy: o.guias || null,
          odts, odtCount: odts.length,
          guias, guiasCount: guias.length,
          documentos, documentosCount: documentos.length,
          cotizacion: cotizMap[o.id] || null,
        })
      }
    }

    if (inOcOnline) {
      const where = {}
      if (dateDesde || dateHasta) where.fechaHora = {}
      if (dateDesde) where.fechaHora.gte = dateDesde
      if (dateHasta) where.fechaHora.lte = dateHasta
      if (oc) where.nCompra = { contains: oc, mode: 'insensitive' }
      if (search) {
        const isNum = /^\d+$/.test(search.trim())
        where.OR = [
          { nCompra: { contains: search, mode: 'insensitive' } },
          { emailComprador: { contains: search, mode: 'insensitive' } },
          ...(isNum ? [{ id: parseInt(search, 10) }] : []),
        ]
      }
      const ocs = await fastify.prisma.ordenCompraOnline.findMany({
        where, orderBy: { fechaHora: 'desc' }, take: LIMIT,
      })
      for (const o of ocs) {
        results.push({
          fuente: 'oc-online', id: o.id, nInterno: null, fecha: o.fechaHora,
          tipo: 'Venta Web', cliente: o.emailComprador, ref: o.nCompra || '',
          total: o.total || 0, estado: o.estadoCompra, pago: null,
        })
      }
    }

    if (inLicitacion) {
      const where = {}
      if (dateDesde || dateHasta) where.fecha = {}
      if (dateDesde) where.fecha.gte = dateDesde
      if (dateHasta) where.fecha.lte = dateHasta
      if (rut) where.rutCliente = { contains: rut, mode: 'insensitive' }
      if (idLicitacion) where.idLicitacion = { contains: idLicitacion, mode: 'insensitive' }
      if (oc) where.ordenCompra = { contains: oc, mode: 'insensitive' }
      if (search) {
        const isNum = /^\d+$/.test(search.trim())
        where.OR = [
          { idLicitacion: { contains: search, mode: 'insensitive' } },
          { rutCliente: { contains: search, mode: 'insensitive' } },
          { referencia: { contains: search, mode: 'insensitive' } },
          ...(isNum ? [{ id: parseInt(search, 10) }] : []),
        ]
      }
      const lics = await fastify.prisma.cotizacionLicitacion.findMany({
        where, include: { items: true }, orderBy: { fecha: 'desc' }, take: LIMIT,
      })
      const rutsLic = [...new Set(lics.map(l => l.rutCliente).filter(Boolean))]
      const clientesLic = rutsLic.length ? await fastify.prisma.cliente.findMany({
        where: { rut: { in: rutsLic } }, select: { rut: true, razonSocial: true, nombre: true },
      }) : []
      const clienteMapLic = Object.fromEntries(clientesLic.map(c => [c.rut, c.razonSocial || c.nombre]))
      for (const l of lics) {
        const total = (l.items || []).reduce((s, i) => s + (i.cantAdjudicados || i.cantidad || 0) * (i.precio || 0), 0)
        results.push({
          fuente: 'licitacion', id: l.id, nInterno: null, fecha: l.fecha,
          tipo: 'Licitación', cliente: l.rutCliente,
          nombreCliente: clienteMapLic[l.rutCliente] || null,
          ref: l.idLicitacion || '',
          total, abono: 0, facturado: 0, saldo: total,
          estado: l.estado, estadoEntrega: null, pago: null,
          creadorNombre: l.usuario || null,
          ordenVinculadaId: l.ordenId || null,
        })
      }
    }

    results.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0))
    const total = results.length
    const items = results.slice(skip, skip + LIMIT)
    const totalMonto = results.reduce((s, r) => s + (r.total || 0), 0)
    return { items, total, limit: LIMIT, totalMonto }
  })

  // GET /api/matriz-ventas/totales?desde=&hasta=
  fastify.get('/totales', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request) => {
    const { desde, hasta } = request.query
    const dateDesde = desde ? new Date(desde) : null
    const dateHasta = hasta ? new Date(hasta + 'T23:59:59') : null
    const dateFilter = (field) => {
      const f = {}
      if (dateDesde) f.gte = dateDesde
      if (dateHasta) f.lte = dateHasta
      return Object.keys(f).length ? { [field]: f } : {}
    }
    const [ordenes, ocs, lics] = await Promise.all([
      fastify.prisma.orden.findMany({ where: { eliminada: false, ...dateFilter('createdAt') }, include: { items: true } }),
      fastify.prisma.ordenCompraOnline.findMany({ where: dateFilter('fechaHora') }),
      fastify.prisma.cotizacionLicitacion.findMany({ where: dateFilter('fecha'), include: { items: true } }),
    ])
    const tOrden = ordenes.reduce((s, o) => s + (o.items || []).reduce((a, i) => a + (i.cantidad || 0) * (i.precio || 0), 0) * (1 - (o.descuentoPct || 0) / 100), 0)
    const tOc = ocs.reduce((s, o) => s + (o.total || 0), 0)
    const tLic = lics.reduce((s, l) => s + (l.items || []).reduce((a, i) => a + (i.cantAdjudicados || 0) * (i.precio || 0), 0), 0)
    return {
      ordenes: { count: ordenes.length, total: tOrden },
      ocOnline: { count: ocs.length, total: tOc },
      licitaciones: { count: lics.length, total: tLic },
      gran: tOrden + tOc + tLic,
    }
  })
}
