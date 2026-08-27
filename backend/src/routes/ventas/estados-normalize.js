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
