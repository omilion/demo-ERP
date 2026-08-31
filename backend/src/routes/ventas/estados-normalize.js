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

// "Compra Ágil" y "Trato Directo" se agregan como tipos propios:
//
//   Compra Ágil ya se ofrecia en el selector de Nueva Venta, pero no estaba en
//   la validacion del backend, de modo que crear una venta con ese tipo
//   respondia 400. Ademas el CRM no mapeaba el canal COMPRA_AGIL a ningun tipo
//   de orden, asi que una oportunidad ganada se guardaba como "Normal" y
//   quedaba contada como venta de mostrador en los reportes.
//
//   Trato Directo no existia ni en codigo ni en datos: esas ventas viven hoy
//   dentro de Convenio Marco, sin forma de separarlas. Agregar el tipo permite
//   separarlas de aqui en adelante; reclasificar las anteriores es una decision
//   de negocio pendiente, porque no hay criterio automatico para distinguirlas.
export const TIPO_VENTA_VALUES = [
  'Normal',
  'Licitación',
  'Compra Ágil',
  'Convenio Marco',
  'Trato Directo',
  'Venta Web',
  'Venta Sala',
  'Marketplace',
]

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

// Ciclo operativo persistido. A diferencia de ESTADO_FLUJO (la fotografía
// financiera que se deriva al leer), este estado sólo cambia por una
// transición validada y queda auditado en ventas.orden_estado_flujo_historial.
export const ESTADO_FLUJO_FORMAL = Object.freeze({
  CREADA: { codigo: 'CREADA', label: 'Creada', terminal: false },
  PREPARACION: { codigo: 'PREPARACION', label: 'Preparación', terminal: false },
  PATIO: { codigo: 'PATIO', label: 'Patio', terminal: false },
  DIDACTICO: { codigo: 'DIDACTICO', label: 'Didáctico', terminal: false },
  REPARTO: { codigo: 'REPARTO', label: 'Reparto', terminal: false },
  ENTREGADA: { codigo: 'ENTREGADA', label: 'Entregada', terminal: false },
  CERRADA: { codigo: 'CERRADA', label: 'Cerrada', terminal: true },
  ANULADA: { codigo: 'ANULADA', label: 'Anulada', terminal: true },
})

export const TRANSICIONES_ESTADO_FLUJO_FORMAL = Object.freeze({
  CREADA: ['PREPARACION', 'ANULADA'],
  PREPARACION: ['PATIO', 'ANULADA'],
  PATIO: ['DIDACTICO', 'ANULADA'],
  DIDACTICO: ['REPARTO', 'ANULADA'],
  REPARTO: ['ENTREGADA', 'ANULADA'],
  ENTREGADA: ['CERRADA', 'ANULADA'],
  CERRADA: [],
  ANULADA: [],
})

export function normalizeEstadoFlujoFormal(value) {
  const key = comparisonKey(value).replace(/\s+/g, '_').toUpperCase()
  return ESTADO_FLUJO_FORMAL[key] || null
}

export function validateEstadoFlujoFormalTransition(previous, next) {
  const from = normalizeEstadoFlujoFormal(previous)?.codigo
  const to = normalizeEstadoFlujoFormal(next)?.codigo
  if (!to) return { error: 'estado de flujo invalido' }
  if (!from) return { error: 'estado actual de flujo invalido' }
  if (from === to) return { error: `La orden ya está en ${ESTADO_FLUJO_FORMAL[to].label}` }
  if (!TRANSICIONES_ESTADO_FLUJO_FORMAL[from]?.includes(to)) {
    return { error: `Transición inválida: ${ESTADO_FLUJO_FORMAL[from].label} → ${ESTADO_FLUJO_FORMAL[to].label}` }
  }
  return { from, to }
}

export function estadoFlujoFormalDesdeTracking(estado) {
  const normalized = comparisonKey(estado)
  return {
    preparado: 'PREPARACION',
    patio: 'PATIO',
    didactico: 'DIDACTICO',
    reparto: 'REPARTO',
    entregado: 'ENTREGADA',
  }[normalized] || null
}

// Grafias con que un mismo valor aparece hoy en la base, para las consultas que
// filtran por igualdad. Mientras convivan ambos vocabularios, un `where` que
// nombre una sola grafia deja fuera al resto de las ordenes en silencio.
export const GRAFIAS_ENTREGADA = ['Entregada', 'Entregado']

// "LicitaciÃ³n" es mojibake: UTF-8 leido como latin1 en alguna importacion.
//
// Al 28-08-2026 no hay ninguna orden con este valor; el reporte de comisiones ya
// lo contemplaba, seguramente por un caso visto antes de alguna limpieza. Se
// conserva por precaucion -en un IN, una grafia que no existe no cuesta nada,
// mientras que omitirla pierde filas en silencio- y para que todas las
// pantallas coincidan con lo que comisiones ya hacia.
//
// El mojibake si esta vivo en otras columnas: ventas.orden_compra_online tiene
// 2.635 filas con tipo_cotizacion = "Mercado PÃºblico", que es justamente el
// canal de Compra Agil.
export const LICITACION_MOJIBAKE = 'LicitaciÃ³n'
export const GRAFIAS_LICITACION = ['Licitación', 'Licitacion', LICITACION_MOJIBAKE]
export const GRAFIAS_VENTA_SALA = ['Venta Sala', 'Venta sala']
export const GRAFIAS_VENTA_DIRECTA = ['Venta directa', 'Venta Directa']
export const GRAFIAS_CONVENIO_MARCO = ['Convenio Marco', 'Convenio marco']

// Agrupacion de negocio, no de grafia: la venta que se atiende en mostrador.
//
// Cinco modulos la definian por su cuenta con conjuntos distintos, de modo que
// el mismo filtro entregaba totales distintos segun la pantalla:
//
//   despachos/matriz     sala + directa                  (sin "Normal")
//   matriz-ventas:51     sala + directa + Normal
//   matriz-ventas:706    sala + directa + Normal + Convenio Marco
//   reportes             sala + directa + Normal
//   reportes/comisiones  sala                            (sin directa ni Normal)
//
// "Normal" NO va aca: Plastimar confirmo que es la venta simple, un tipo propio,
// no una forma de escribir la venta de mostrador. Son 60 ordenes, todas sin
// pagar y de los ultimos tres meses, coherente con ser el resultado de una
// cotizacion simple y no de una venta de meson.
//
// Se filtra por su propio tipo: grafiasDeTipoVenta('normal') lo resuelve.
export const TIPOS_VENTA_MOSTRADOR = [...GRAFIAS_VENTA_SALA, ...GRAFIAS_VENTA_DIRECTA]

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

// Los filtros de las pantallas viajan como slug: "convenio-marco",
// "trato-directo". Varios modulos los pasaban crudos al `where`, que entonces
// no coincidia con ninguna fila y devolvia vacio sin avisar. Resolver contra el
// catalogo hace que un tipo nuevo tenga filtro que funciona desde el dia uno.
const TIPO_VENTA_POR_SLUG = new Map(
  TIPO_VENTA_VALUES.map(tipo => [comparisonKey(tipo).replace(/[\s-]+/g, '-'), tipo]),
)

export function tipoVentaFromSlug(slug) {
  const key = comparisonKey(slug).replace(/[\s-]+/g, '-')
  if (!key) return null
  return TIPO_VENTA_POR_SLUG.get(key) ?? null
}

// Grafias conocidas de un tipo, para los `where` que filtran por igualdad.
// Devuelve siempre un arreglo, de modo que quien lo use no tenga que decidir
// entre `equals` y `in` segun el tipo.
const GRAFIAS_POR_TIPO = new Map([
  ['Licitación', GRAFIAS_LICITACION],
  ['Convenio Marco', GRAFIAS_CONVENIO_MARCO],
  ['Venta Sala', GRAFIAS_VENTA_SALA],
])

export function grafiasDeTipoVenta(tipo) {
  const canonico = normalizeTipoVenta(tipo) ?? tipoVentaFromSlug(tipo)
  if (!canonico) return []
  return [...(GRAFIAS_POR_TIPO.get(canonico) ?? [canonico])]
}
