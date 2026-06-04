import crypto from 'node:crypto'

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/(?:\u00c3|\u00e3)(?:\u0192)?(?:\u00c2|\u00e2)?\u00a1/g, 'a')
    .replace(/(?:\u00c3|\u00e3)(?:\u0192)?(?:\u00c2|\u00e2)?\u00a9/g, 'e')
    .replace(/(?:\u00c3|\u00e3)(?:\u0192)?(?:\u00c2|\u00e2)?\u00ad/g, 'i')
    .replace(/(?:\u00c3|\u00e3)(?:\u0192)?(?:\u00c2|\u00e2)?\u00b3/g, 'o')
    .replace(/(?:\u00c3|\u00e3)(?:\u0192)?(?:\u00c2|\u00e2)?\u00ba/g, 'u')
    .replace(/(?:\u00c3|\u00e3)(?:\u0192)?(?:\u00c2|\u00e2)?\u00b1/g, 'n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function asArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return value.split(',').map(v => v.trim()).filter(Boolean)
    }
  }
  return []
}

function asIdSet(value) {
  return new Set(asArray(value).map(v => Number(v)).filter(v => Number.isInteger(v) && v > 0))
}

function asTextSet(value) {
  return new Set(asArray(value).map(normalizeText).filter(Boolean))
}

function includesText(set, value) {
  const text = normalizeText(value)
  return text && set.has(text)
}

function numberOr(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function ruleCondition(rule, key) {
  return rule?.[key] ?? rule?.condiciones?.[key]
}

function ruleEffect(rule, key) {
  return rule?.[key] ?? rule?.efecto?.[key]
}

function toDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function cleanItem(item = {}) {
  return {
    productoId: item.productoId ?? item.producto_id ?? null,
    codigoInterno: item.codigoInterno ?? item.codigo_interno ?? null,
    nombre: item.nombre ?? null,
    cantidad: numberOr(item.cantidad, 0),
    precioUnitario: numberOr(item.precioUnitario ?? item.precio_unitario ?? item.precio, 0),
  }
}

export function buildDiscountDraft(payload = {}, user = null) {
  const items = (payload.items || []).map(cleanItem).filter(item => item.cantidad > 0 && item.precioUnitario >= 0)
  return {
    tipo: payload.tipo || payload.tipoVenta || payload.tipo_venta || 'Normal',
    clienteId: payload.clienteId ?? payload.cliente_id ?? null,
    clienteSegmento: payload.clienteSegmento ?? payload.cliente_segmento ?? null,
    sucursalId: payload.sucursalId ?? payload.sucursal_id ?? user?.sucursalId ?? null,
    cargosTotal: numberOr(payload.cargosTotal ?? payload.cargos_total, 0),
    descuentoPct: payload.descuentoPct ?? payload.descuento_pct ?? null,
    items,
  }
}

export function buildDraftHash(draft = {}) {
  const canonical = {
    tipo: normalizeText(draft.tipo),
    clienteId: draft.clienteId ? Number(draft.clienteId) : null,
    clienteSegmento: normalizeText(draft.clienteSegmento),
    sucursalId: draft.sucursalId ? Number(draft.sucursalId) : null,
    cargosTotal: numberOr(draft.cargosTotal, 0),
    items: (draft.items || []).map(item => ({
      productoId: item.productoId ? Number(item.productoId) : null,
      codigoInterno: normalizeText(item.codigoInterno),
      cantidad: numberOr(item.cantidad, 0),
      precioUnitario: numberOr(item.precioUnitario, 0),
    })),
  }
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

async function hydrateDraftProducts(prisma, draft) {
  const ids = [...new Set((draft.items || []).map(item => Number(item.productoId)).filter(Boolean))]
  const codigos = [...new Set((draft.items || []).map(item => item.codigoInterno).filter(Boolean))]
  const where = []
  if (ids.length) where.push({ id: { in: ids } })
  if (codigos.length) where.push({ codigoInterno: { in: codigos } })
  const productos = where.length
    ? await prisma.producto.findMany({
        where: { OR: where },
        select: {
          id: true,
          codigoInterno: true,
          nombre: true,
          categoria: true,
          proveedor: true,
          categoriaId: true,
          subcategoriaId: true,
          proveedorId: true,
        },
      })
    : []
  const byId = new Map(productos.map(p => [Number(p.id), p]))
  const byCodigo = new Map(productos.map(p => [String(p.codigoInterno || '').toLowerCase(), p]))
  return (draft.items || []).map(item => {
    const producto = item.productoId
      ? byId.get(Number(item.productoId))
      : byCodigo.get(String(item.codigoInterno || '').toLowerCase())
    return { ...item, producto: producto || null }
  })
}

function ruleMatchesContext(rule, draft, now = new Date()) {
  const tipos = asTextSet(ruleCondition(rule, 'tiposVenta'))
  if (tipos.size && !includesText(tipos, draft.tipo)) return false

  const sucursalId = ruleCondition(rule, 'sucursalId')
  const clienteId = ruleCondition(rule, 'clienteId')
  const clienteSegmento = ruleCondition(rule, 'clienteSegmento')
  if (sucursalId && Number(sucursalId) !== Number(draft.sucursalId || 0)) return false
  if (clienteId && Number(clienteId) !== Number(draft.clienteId || 0)) return false
  if (clienteSegmento && normalizeText(clienteSegmento) !== normalizeText(draft.clienteSegmento)) return false

  const desde = toDate(rule.vigenciaDesde ?? rule.vigenteDesde)
  const hasta = toDate(rule.vigenciaHasta ?? rule.vigenteHasta)
  if (desde && now < desde) return false
  if (hasta && now > hasta) return false

  return true
}

function ruleHasProductScope(rule) {
  return Boolean(
    asIdSet(ruleCondition(rule, 'productoIds')).size ||
    asIdSet(ruleCondition(rule, 'categoriaIds')).size ||
    asIdSet(ruleCondition(rule, 'subcategoriaIds')).size ||
    asIdSet(ruleCondition(rule, 'proveedorIds')).size ||
    asTextSet(ruleCondition(rule, 'categoriaNombres')).size ||
    asTextSet(ruleCondition(rule, 'proveedorNombres')).size
  )
}

function itemMatchesRule(rule, item) {
  const producto = item.producto
  if (!ruleHasProductScope(rule)) return true
  if (!producto) return false

  const productoIds = asIdSet(ruleCondition(rule, 'productoIds'))
  if (productoIds.size && productoIds.has(Number(producto.id))) return true

  const categoriaIds = asIdSet(ruleCondition(rule, 'categoriaIds'))
  if (categoriaIds.size && categoriaIds.has(Number(producto.categoriaId))) return true

  const subcategoriaIds = asIdSet(ruleCondition(rule, 'subcategoriaIds'))
  if (subcategoriaIds.size && subcategoriaIds.has(Number(producto.subcategoriaId))) return true

  const proveedorIds = asIdSet(ruleCondition(rule, 'proveedorIds'))
  if (proveedorIds.size && proveedorIds.has(Number(producto.proveedorId))) return true

  const categoriaNombres = asTextSet(ruleCondition(rule, 'categoriaNombres'))
  if (categoriaNombres.size && includesText(categoriaNombres, producto.categoria)) return true

  const proveedorNombres = asTextSet(ruleCondition(rule, 'proveedorNombres'))
  if (proveedorNombres.size && includesText(proveedorNombres, producto.proveedor)) return true

  return false
}

function statusFor(rule, porcentaje) {
  const sugerido = numberOr(ruleEffect(rule, 'porcentajeSugerido') ?? ruleEffect(rule, 'porcentaje'), 0)
  const auto = numberOr(ruleEffect(rule, 'porcentajeAutoaprobado'), sugerido)
  const max = numberOr(rule.porcentajeMaximo ?? rule.porcentajeMax ?? ruleEffect(rule, 'porcentajeMaximo'), Math.max(sugerido, auto))
  const pct = numberOr(porcentaje, sugerido)

  if (pct <= 0) return { estado: 'RECHAZADA', motivo: 'Porcentaje requerido' }
  if (pct > max) return { estado: 'RECHAZADA', motivo: 'Supera porcentaje maximo de la regla' }
  if (rule.requiereAprobacion && pct > auto) return { estado: 'PENDIENTE', motivo: 'Requiere aprobacion' }
  return { estado: 'AUTORIZADA', motivo: 'Regla autorizada' }
}

export async function evaluateDiscountRules(prisma, payload = {}, user = null, options = {}) {
  const draft = buildDiscountDraft(payload, user)
  if (!draft.clienteSegmento && draft.clienteId) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: Number(draft.clienteId) },
      select: { segmento: true },
    }).catch(() => null)
    draft.clienteSegmento = cliente?.segmento || null
  }
  const requestedPct = payload.descuentoPct ?? payload.porcentaje ?? null
  const totalItems = draft.items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0)
  const totalAntes = totalItems + numberOr(draft.cargosTotal, 0)
  const draftHash = buildDraftHash(draft)

  if (!draft.items.length) {
    return { draft, draftHash, totalAntes, reglas: [], selected: null }
  }

  const now = options.now || new Date()
  const [rules, hydratedItems] = await Promise.all([
    prisma.descuentoRegla.findMany({
      where: { activo: true },
      orderBy: [{ prioridad: 'desc' }, { id: 'asc' }],
    }),
    hydrateDraftProducts(prisma, draft),
  ])

  const reglas = []
  for (const rule of rules) {
    if (!ruleMatchesContext(rule, draft, now)) continue

    const eligibleItems = hydratedItems.filter(item => itemMatchesRule(rule, item))
    const baseElegible = eligibleItems.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0)
    if (baseElegible <= 0) continue
    if (baseElegible < numberOr(ruleCondition(rule, 'montoMinimo'), 0)) continue

    const porcentaje = requestedPct == null
      ? numberOr(ruleEffect(rule, 'porcentajeSugerido') ?? ruleEffect(rule, 'porcentaje'), 0)
      : numberOr(requestedPct, 0)
    let status = statusFor(rule, porcentaje)
    const montoCalculado = Math.round(baseElegible * porcentaje / 100)
    const montoMax = numberOr(rule.montoMax ?? ruleEffect(rule, 'montoMax'), 0)
    if (status.estado !== 'RECHAZADA' && montoMax > 0 && montoCalculado > montoMax) {
      status = { estado: 'RECHAZADA', motivo: 'Supera monto maximo de la regla' }
    }
    const montoDescuento = status.estado === 'RECHAZADA' ? 0 : montoCalculado
    const totalDespues = Math.max(0, totalAntes - montoDescuento)
    reglas.push({
      reglaId: rule.id,
      nombre: rule.nombre,
      prioridad: rule.prioridad,
      porcentaje,
      porcentajeSugerido: numberOr(ruleEffect(rule, 'porcentajeSugerido') ?? ruleEffect(rule, 'porcentaje'), 0),
      porcentajeAutoaprobado: numberOr(ruleEffect(rule, 'porcentajeAutoaprobado'), 0),
      porcentajeMaximo: numberOr(rule.porcentajeMaximo ?? rule.porcentajeMax ?? ruleEffect(rule, 'porcentajeMaximo'), 0),
      requiereAprobacion: Boolean(rule.requiereAprobacion),
      estado: status.estado,
      motivo: status.motivo,
      baseElegible,
      montoDescuento,
      totalAntes,
      totalDespues,
      itemsElegibles: eligibleItems.map(item => ({
        productoId: item.producto?.id || item.productoId || null,
        codigoInterno: item.producto?.codigoInterno || item.codigoInterno || null,
        nombre: item.producto?.nombre || item.nombre || null,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal: item.cantidad * item.precioUnitario,
      })),
    })
  }

  const selected = payload.reglaId
    ? reglas.find(r => Number(r.reglaId) === Number(payload.reglaId)) || null
    : reglas[0] || null

  return { draft: { ...draft, items: hydratedItems }, draftHash, totalAntes, reglas, selected }
}

export function buildDiscountSnapshot(evaluation, selected) {
  if (!selected) return null
  return {
    version: 1,
    reglaId: selected.reglaId,
    reglaNombre: selected.nombre,
    porcentaje: selected.porcentaje,
    estado: selected.estado,
    baseElegible: selected.baseElegible,
    montoDescuento: selected.montoDescuento,
    totalAntes: selected.totalAntes,
    totalDespues: selected.totalDespues,
    draftHash: evaluation.draftHash,
    itemsElegibles: selected.itemsElegibles,
    createdAt: new Date().toISOString(),
  }
}

export async function assertDiscountAuthorizationForDraft(prisma, { autorizacionId, payload, user, requireAvailable = true } = {}) {
  if (!autorizacionId) return { descuentoData: {}, solicitud: null }
  const solicitud = await prisma.descuentoSolicitud.findUnique({ where: { id: Number(autorizacionId) } })
  if (!solicitud) return { error: 'Autorizacion de descuento no encontrada', statusCode: 404 }
  const canUseApplied = !requireAvailable && solicitud.estado === 'APLICADA'
  if (solicitud.estado !== 'AUTORIZADA' && !canUseApplied) return { error: 'Autorizacion de descuento no esta aprobada', statusCode: 409 }
  if (requireAvailable && solicitud.estado === 'APLICADA') {
    return { error: 'Autorizacion de descuento ya fue aplicada', statusCode: 409 }
  }

  const storedHash = solicitud.resultadoSnapshot?.draftHash || solicitud.contextoSnapshot?.draftHash
  const porcentaje = solicitud.descuentoPctAprobado ?? solicitud.descuentoPctSolicitado
  const evaluation = await evaluateDiscountRules(prisma, {
    ...payload,
    reglaId: solicitud.reglaId,
    descuentoPct: porcentaje,
  }, user)
  if (evaluation.draftHash !== storedHash) {
    return { error: 'La venta cambio despues de autorizar el descuento; reevalue la regla', statusCode: 409 }
  }
  const selected = evaluation.selected
  if (!selected || selected.estado === 'RECHAZADA') {
    return { error: 'La regla de descuento ya no autoriza este borrador', statusCode: 409 }
  }
  const authorizedSelected = solicitud.estado === 'AUTORIZADA' || solicitud.estado === 'APLICADA'
    ? { ...selected, estado: 'AUTORIZADA', motivo: selected.estado === 'PENDIENTE' ? 'Aprobada por admin' : selected.motivo }
    : selected
  const snapshot = buildDiscountSnapshot(evaluation, authorizedSelected)
  return {
    solicitud,
    descuentoData: {
      descuentoSolicitudId: solicitud.id,
      descuentoMonto: authorizedSelected.montoDescuento,
      descuentoSnapshot: snapshot,
      descuentoPct: authorizedSelected.porcentaje,
    },
  }
}
