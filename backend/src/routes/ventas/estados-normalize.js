// Normalizacion de estados y tipo de venta.
//
// El ERP convive con el legacy MySQL, que escribe otra grafia de los mismos
// estados: "Entregado" en vez de "Entregada", "Venta sala" en vez de
// "Venta Sala", "Licitacion" sin tilde. El codigo nativo (recalculateOrdenEntrega
// en despachos) siempre escribio la forma canonica, pero los importadores
// copian el valor crudo del legacy, de modo que ambos vocabularios conviven
// en la misma columna.
//
// La validacion aceptaba solo la forma canonica, asi que al 26-08-2026 el 98%
// de las ordenes de produccion respondia 400 al intentar editarse: el formulario
// lee el estado guardado y lo reenvia tal cual al guardar.
//
// Criterio: tolerante al leer, canonico al escribir. Cualquier grafia conocida
// entra, pero se persiste una sola forma, de modo que la columna converge sola
// a medida que las ordenes se editan.

export const ESTADO_ENTREGA_VALUES = ['Pendiente entrega', 'En despacho', 'Entregada', 'Parcial']

// Los dos estados Webpay describen momentos reales del flujo de pago en linea
// y se conservan tal cual. Definir si deben ser estados de pago propiamente
// tales, vivir en un campo aparte del ciclo Webpay, o colapsar a "No pagada"
// es una decision de negocio pendiente; aplastarlos aqui perderia el matiz.
export const ESTADO_PAGO_VALUES = ['No pagada', 'Pagada', 'Parcial', 'Pendiente Webpay', 'Rechazada Webpay']

export const TIPO_VENTA_VALUES = ['Normal', 'Licitación', 'Convenio Marco', 'Venta Web', 'Venta Sala', 'Marketplace']

// Estado transversal de lectura. No se persiste: se deriva de las tres
// dimensiones que ya son fuente de verdad (vigencia, pago y entrega), evitando
// crear una cuarta columna que pueda quedar desincronizada.
export const ESTADO_FLUJO = Object.freeze({
  ACTIVA: { codigo: 'ACTIVA', label: 'Activa', terminal: false },
  PAGO_WEBPAY_PENDIENTE: { codigo: 'PAGO_WEBPAY_PENDIENTE', label: 'Pago Webpay pendiente', terminal: false },
  PAGO_WEBPAY_RECHAZADO: { codigo: 'PAGO_WEBPAY_RECHAZADO', label: 'Pago Webpay rechazado', terminal: false },
  PAGO_PARCIAL: { codigo: 'PAGO_PARCIAL', label: 'Pago parcial', terminal: false },
  PAGADA_PENDIENTE_ENTREGA: { codigo: 'PAGADA_PENDIENTE_ENTREGA', label: 'Pagada, pendiente de entrega', terminal: false },
  EN_DESPACHO: { codigo: 'EN_DESPACHO', label: 'En despacho', terminal: false },
  ENTREGA_PARCIAL: { codigo: 'ENTREGA_PARCIAL', label: 'Entrega parcial', terminal: false },
  ENTREGADA_PENDIENTE_PAGO: { codigo: 'ENTREGADA_PENDIENTE_PAGO', label: 'Entregada, pendiente de pago', terminal: false },
  CERRADA: { codigo: 'CERRADA', label: 'Cerrada', terminal: true },
  ANULADA: { codigo: 'ANULADA', label: 'Anulada', terminal: true },
})

// Grafias con que un mismo valor aparece hoy en la base, para las consultas que
// filtran por igualdad. Mientras convivan ambos vocabularios, un `where` que
// nombre una sola grafia deja fuera al resto de las ordenes en silencio.
export const GRAFIAS_ENTREGADA = ['Entregada', 'Entregado']
export const GRAFIAS_LICITACION = ['Licitación', 'Licitacion']
export const GRAFIAS_VENTA_SALA = ['Venta Sala', 'Venta sala']

// Compara ignorando mayusculas, acentos y espacios sobrantes, que es
// exactamente en lo que difieren las grafias legacy de las canonicas.
function comparisonKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

// Alias que no se resuelven por acento ni mayusculas: son palabras distintas.
const ESTADO_ENTREGA_ALIASES = {
  [comparisonKey('Entregado')]: 'Entregada',
}

function buildResolver(canonicalValues, aliases = {}) {
  const byKey = new Map(canonicalValues.map(value => [comparisonKey(value), value]))
  return function resolve(value) {
    const key = comparisonKey(value)
    if (!key) return null
    return byKey.get(key) ?? aliases[key] ?? null
  }
}

export const normalizeEstadoEntrega = buildResolver(ESTADO_ENTREGA_VALUES, ESTADO_ENTREGA_ALIASES)
export const normalizeEstadoPago = buildResolver(ESTADO_PAGO_VALUES)
export const normalizeTipoVenta = buildResolver(TIPO_VENTA_VALUES)

export function deriveEstadoFlujo(orden = {}) {
  const estadoBase = comparisonKey(orden.estado)
  if (orden.eliminada || ['anulada', 'anulado', 'eliminada', 'eliminado'].includes(estadoBase)) {
    return ESTADO_FLUJO.ANULADA
  }

  const pago = normalizeEstadoPago(orden.estadoPago) || orden.estadoPago
  const entrega = normalizeEstadoEntrega(orden.estadoEntrega) || orden.estadoEntrega
  if (pago === 'Rechazada Webpay') return ESTADO_FLUJO.PAGO_WEBPAY_RECHAZADO
  if (entrega === 'Entregada' && pago === 'Pagada') return ESTADO_FLUJO.CERRADA
  if (entrega === 'Entregada') return ESTADO_FLUJO.ENTREGADA_PENDIENTE_PAGO
  if (entrega === 'Parcial') return ESTADO_FLUJO.ENTREGA_PARCIAL
  if (entrega === 'En despacho') return ESTADO_FLUJO.EN_DESPACHO
  if (pago === 'Pagada') return ESTADO_FLUJO.PAGADA_PENDIENTE_ENTREGA
  if (pago === 'Parcial') return ESTADO_FLUJO.PAGO_PARCIAL
  if (pago === 'Pendiente Webpay') return ESTADO_FLUJO.PAGO_WEBPAY_PENDIENTE
  return ESTADO_FLUJO.ACTIVA
}

export function attachEstadoFlujo(orden = {}) {
  const estadoEntrega = normalizeEstadoEntrega(orden.estadoEntrega) || orden.estadoEntrega
  const estadoPago = normalizeEstadoPago(orden.estadoPago) || orden.estadoPago
  return { ...orden, estadoEntrega, estadoPago, estadoFlujo: deriveEstadoFlujo({ ...orden, estadoEntrega, estadoPago }) }
}
