const ESTADOS_DTE_TRAZABLES = new Set(['emitido', 'enviado', 'aceptado'])

function isTrazable(documento) {
  return ESTADOS_DTE_TRAZABLES.has(String(documento?.estado || '').toLowerCase())
}

export function buildTrazabilidadOrden({ orden, guias = [], documentos = [] }) {
  const guiasActivas = guias.filter(guia => !guia.eliminado)
  const documentosActivos = documentos.filter(isTrazable)
  const documentosVenta = documentosActivos.filter(documento => [33, 39].includes(Number(documento.tipoDte)))
  const requiereGuia = String(orden?.tipo || '').toLowerCase() !== 'venta sala'
  const excepciones = []

  if (!orden?.nInterno) {
    excepciones.push({ codigo: 'SIN_INTERNO', detalle: 'La venta no tiene N° interno.' })
  }
  if (requiereGuia && !guiasActivas.length) {
    excepciones.push({ codigo: 'SIN_GUIA', detalle: 'La venta requiere despacho pero no tiene guía.' })
  }
  for (const guia of guiasActivas) {
    const dteGuia = documentosActivos.find(documento =>
      Number(documento.tipoDte) === 52 && Number(documento.guiaDespachoId) === Number(guia.id)
    )
    if (!dteGuia) {
      excepciones.push({ codigo: 'GUIA_SIN_DTE', guiaId: guia.id, nGuia: guia.nGuia, detalle: `La guía ${guia.nGuia} no tiene DTE 52 emitido.` })
    }
  }
  if (!documentosVenta.length) {
    excepciones.push({ codigo: 'SIN_DTE_VENTA', detalle: 'La venta no tiene factura o boleta vigente.' })
  }

  return {
    orden: {
      id: orden.id,
      nInterno: orden.nInterno || null,
      tipo: orden.tipo,
      estado: orden.estado,
      estadoPago: orden.estadoPago,
      estadoEntrega: orden.estadoEntrega,
    },
    guias: guiasActivas.map(guia => ({
      id: guia.id,
      nGuia: guia.nGuia,
      fechaGuia: guia.fechaGuia,
      dte: documentosActivos.find(documento => Number(documento.tipoDte) === 52 && Number(documento.guiaDespachoId) === Number(guia.id)) || null,
    })),
    documentosVenta,
    excepciones,
    completa: excepciones.length === 0,
  }
}

async function loadForOrders(prisma, ordenes) {
  const ordenIds = ordenes.map(orden => orden.id)
  if (!ordenIds.length) return []
  const guias = await prisma.guiaDespacho.findMany({
    where: { ordenId: { in: ordenIds }, eliminado: false },
    orderBy: { fechaGuia: 'asc' },
  })
  const guiaIds = guias.map(guia => guia.id)
  const documentos = await prisma.factDocumento.findMany({
    where: {
      OR: [
        { ordenId: { in: ordenIds } },
        ...(guiaIds.length ? [{ guiaDespachoId: { in: guiaIds } }] : []),
      ],
    },
    select: {
      id: true,
      ordenId: true,
      guiaDespachoId: true,
      tipoDte: true,
      folio: true,
      fechaEmision: true,
      estado: true,
      estadoDetalle: true,
    },
    orderBy: { createdAt: 'asc' },
  })
  const guiasByOrden = Object.groupBy(guias, guia => guia.ordenId)
  return ordenes.map(orden => {
    const orderGuides = guiasByOrden[orden.id] || []
    const orderGuideIds = new Set(orderGuides.map(guia => guia.id))
    const orderDocuments = documentos.filter(documento =>
      Number(documento.ordenId) === Number(orden.id) || orderGuideIds.has(documento.guiaDespachoId)
    )
    return buildTrazabilidadOrden({ orden, guias: orderGuides, documentos: orderDocuments })
  })
}

export async function getTrazabilidadOrden(prisma, ordenId) {
  const orden = await prisma.orden.findUnique({
    where: { id: Number(ordenId) },
    select: { id: true, nInterno: true, tipo: true, estado: true, estadoPago: true, estadoEntrega: true },
  })
  if (!orden) return null
  return (await loadForOrders(prisma, [orden]))[0]
}

export async function listTrazabilidadExcepciones(prisma, { limit = 200 } = {}) {
  const ordenes = await prisma.orden.findMany({
    where: { eliminada: false },
    select: { id: true, nInterno: true, tipo: true, estado: true, estadoPago: true, estadoEntrega: true },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(Number(limit) || 200, 1), 500),
  })
  const recorridos = await loadForOrders(prisma, ordenes)
  const items = recorridos.filter(item => !item.completa)
  const porCodigo = {}
  for (const item of items) {
    for (const excepcion of item.excepciones) porCodigo[excepcion.codigo] = (porCodigo[excepcion.codigo] || 0) + 1
  }
  return { items, total: items.length, revisadas: recorridos.length, porCodigo }
}
