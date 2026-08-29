import { parseDate, parsePositiveInt } from '../operational-utils.js'

export async function calcularSugerenciasOC(prisma, params = {}) {
  const {
    proveedorId,
    desde,
    hasta,
    diasProyeccion,
    factorSeguridad = 1.0,
    soloCriticos = false,
    search,
  } = params

  const provId = parsePositiveInt(proveedorId)
  const dateDesde = parseDate(desde) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const dateHasta = parseDate(hasta, true) || new Date()

  const diffMs = Math.max(0, dateHasta.getTime() - dateDesde.getTime())
  const diasRango = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1)
  const diasProy = parsePositiveInt(diasProyeccion) || diasRango
  const factor = Math.max(0.1, Number(factorSeguridad) || 1.0)

  // 1. Obtener productos vinculados al proveedor
  const prodProvWhere = {
    activo: true,
  }
  if (provId) {
    prodProvWhere.proveedorId = provId
  }

  // Buscar relaciones ProductoProveedor
  const rels = await prisma.productoProveedor.findMany({
    where: prodProvWhere,
    include: {
      producto: {
        select: {
          id: true,
          codigoInterno: true,
          codigoBarra: true,
          nombre: true,
          stock: true,
          stockReservado: true,
          stockDanado: true,
          stockCritico: true,
          unidadMedida: true,
          precioLista: true,
          ubicacion: true,
          categoria: true,
          activo: true,
        },
      },
      proveedor: {
        select: {
          id: true,
          nombre: true,
          rut: true,
          email: true,
        },
      },
    },
  })

  // También buscar productos que tengan proveedorId asignado directamente en Producto
  const directProds = provId ? await prisma.producto.findMany({
    where: {
      proveedorId: provId,
      activo: true,
      id: { notIn: rels.map(r => r.productoId) },
    },
  }) : []

  // Unificar catálogo de productos a analizar
  const productosMap = new Map()

  for (const rel of rels) {
    if (!rel.producto || !rel.producto.activo) continue
    productosMap.set(rel.productoId, {
      productoId: rel.producto.id,
      codigoInterno: rel.producto.codigoInterno,
      codigoBarra: rel.producto.codigoBarra,
      codigoProveedor: rel.codigoProveedor || null,
      nombre: rel.producto.nombre,
      stockFisico: Number(rel.producto.stock || 0),
      stockReservado: Number(rel.producto.stockReservado || 0),
      stockDanado: Number(rel.producto.stockDanado || 0),
      stockActual: Math.max(0, Number(rel.producto.stock || 0) - Number(rel.producto.stockReservado || 0) - Number(rel.producto.stockDanado || 0)),
      stockCritico: Number(rel.producto.stockCritico || 0),
      unidadMedida: rel.producto.unidadMedida || 'UND',
      costoUnitario: Number(rel.costo || rel.producto.precioLista || 0),
      proveedorId: rel.proveedorId,
      proveedorNombre: rel.proveedor?.nombre || 'Proveedor',
      proveedorRut: rel.proveedor?.rut || null,
      categoria: rel.producto.categoria,
    })
  }

  for (const p of directProds) {
    if (productosMap.has(p.id)) continue
    productosMap.set(p.id, {
      productoId: p.id,
      codigoInterno: p.codigoInterno,
      codigoBarra: p.codigoBarra,
      codigoProveedor: null,
      nombre: p.nombre,
      stockFisico: Number(p.stock || 0),
      stockReservado: Number(p.stockReservado || 0),
      stockDanado: Number(p.stockDanado || 0),
      stockActual: Math.max(0, Number(p.stock || 0) - Number(p.stockReservado || 0) - Number(p.stockDanado || 0)),
      stockCritico: Number(p.stockCritico || 0),
      unidadMedida: p.unidadMedida || 'UND',
      costoUnitario: Number(p.precioLista || 0),
      proveedorId: provId,
      proveedorNombre: 'Proveedor',
      proveedorRut: null,
      categoria: p.categoria,
    })
  }

  const productoIds = Array.from(productosMap.keys())
  if (productoIds.length === 0) {
    return {
      items: [],
      kpis: {
        totalProductos: 0,
        productosConSugerencia: 0,
        totalUnidadesSugeridas: 0,
        montoTotalEstimadoNeto: 0,
        diasRango,
        diasProyeccion: diasProy,
      },
    }
  }

  // 2. Consultar Ventas reales en el rango de fechas
  const ventasItems = await prisma.ordenItem.groupBy({
    by: ['productoId'],
    where: {
      productoId: { in: productoIds },
      eliminado: false,
      orden: {
        eliminada: false,
        estado: { notIn: ['Cancelada', 'Anulada'] },
        createdAt: {
          gte: dateDesde,
          lte: dateHasta,
        },
      },
    },
    _sum: {
      cantidad: true,
    },
  })

  const ventasMap = new Map()
  for (const vi of ventasItems) {
    if (vi.productoId) {
      ventasMap.set(vi.productoId, vi._sum.cantidad || 0)
    }
  }

  // 3. Consultar Stock en Tránsito de Importaciones activas
  const importacionItems = await prisma.importacionItem.findMany({
    where: {
      productoId: { in: productoIds },
      recibido: false,
      importacion: {
        estado: { in: ['En tránsito', 'En aduana'] },
      },
    },
    select: {
      productoId: true,
      cantidadEsperada: true,
      cantidadRecibida: true,
    },
  })

  const enTransitoMap = new Map()
  for (const it of importacionItems) {
    if (it.productoId) {
      const current = enTransitoMap.get(it.productoId) || 0
      const pending = Math.max(0, it.cantidadEsperada - it.cantidadRecibida)
      enTransitoMap.set(it.productoId, current + pending)
    }
  }

  // 4. Consultar OCs pendientes a proveedores
  const ocPendientes = await prisma.ordenCompraProveedorItem.findMany({
    where: {
      productoId: { in: productoIds },
      ordenCompraProveedor: {
        estado: { in: ['Aprobada por Gerencia', 'Enviada a Proveedor', 'Recepcionada Parcial'] },
      },
    },
    select: {
      productoId: true,
      cantidadPedida: true,
      cantidadRecepcionada: true,
    },
  })

  for (const oc of ocPendientes) {
    if (oc.productoId) {
      const current = enTransitoMap.get(oc.productoId) || 0
      const pending = Math.max(0, oc.cantidadPedida - oc.cantidadRecepcionada)
      enTransitoMap.set(oc.productoId, current + pending)
    }
  }

  // 5. Calcular sugerencias por producto
  const results = []
  let totalUnidadesSugeridas = 0
  let montoTotalEstimadoNeto = 0
  let productosConSugerencia = 0

  const searchTerm = search ? String(search).trim().toLowerCase() : ''

  for (const [prodId, prod] of productosMap.entries()) {
    if (searchTerm) {
      const matchCod = (prod.codigoInterno || '').toLowerCase().includes(searchTerm)
      const matchNom = (prod.nombre || '').toLowerCase().includes(searchTerm)
      const matchProv = (prod.codigoProveedor || '').toLowerCase().includes(searchTerm)
      if (!matchCod && !matchNom && !matchProv) continue
    }

    const ventasPeriodo = ventasMap.get(prodId) || 0
    const promedioVentaDiaria = Number((ventasPeriodo / diasRango).toFixed(2))
    const consumoEsperado = Math.ceil(promedioVentaDiaria * diasProy * factor)
    const enTransito = enTransitoMap.get(prodId) || 0
    const stockActual = prod.stockActual
    const stockCritico = prod.stockCritico

    // Fórmula de reposición: (consumo esperado + colchón stock crítico) - (stock actual + mercadería en camino)
    const necesidad = (consumoEsperado + stockCritico) - (stockActual + enTransito)
    const cantidadSugerida = Math.max(0, necesidad)
    const subtotal = cantidadSugerida * prod.costoUnitario

    // Estado del producto para sugerencia
    let estadoStock = 'Normal'
    if (stockActual <= 0) estadoStock = 'Quiebre (Sin stock)'
    else if (stockActual <= stockCritico) estadoStock = 'Crítico'
    else if (cantidadSugerida > 0) estadoStock = 'Requiere Reposición'

    if (soloCriticos && cantidadSugerida <= 0 && stockActual > stockCritico) {
      continue
    }

    if (cantidadSugerida > 0) {
      productosConSugerencia++
      totalUnidadesSugeridas += cantidadSugerida
      montoTotalEstimadoNeto += subtotal
    }

    results.push({
      productoId: prod.productoId,
      codigoInterno: prod.codigoInterno,
      codigoBarra: prod.codigoBarra,
      codigoProveedor: prod.codigoProveedor,
      nombre: prod.nombre,
      categoria: prod.categoria,
      unidadMedida: prod.unidadMedida,
      proveedorId: prod.proveedorId,
      proveedorNombre: prod.proveedorNombre,
      proveedorRut: prod.proveedorRut,
      costoUnitario: prod.costoUnitario,
      ventasPeriodo,
      promedioVentaDiaria,
      consumoEsperado,
      stockActual,
      stockFisico: prod.stockFisico,
      stockReservado: prod.stockReservado,
      stockDanado: prod.stockDanado,
      stockCritico,
      enTransito,
      cantidadSugerida,
      cantidadPedir: cantidadSugerida, // Default editable por el usuario
      subtotal,
      estadoStock,
      seleccionado: cantidadSugerida > 0,
    })
  }

  // Ordenar primero los que más requieren reposición (quiebres y mayor sugerido)
  results.sort((a, b) => b.cantidadSugerida - a.cantidadSugerida || a.stockActual - b.stockActual)

  return {
    items: results,
    kpis: {
      totalProductos: results.length,
      productosConSugerencia,
      totalUnidadesSugeridas,
      montoTotalEstimadoNeto,
      diasRango,
      diasProyeccion: diasProy,
      factorSeguridad: factor,
      rangoDesde: dateDesde.toISOString().slice(0, 10),
      rangoHasta: dateHasta.toISOString().slice(0, 10),
    },
  }
}
