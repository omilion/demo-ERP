// Espejo reducido de backend/src/routes/ventas/estados-normalize.js.
//
// La base trae ordenes con la grafia del legacy ("Entregado", "Venta sala").
// Los <Select> del formulario solo listan las formas canonicas, asi que sin
// normalizar al cargar el control queda sin opcion seleccionada y muestra la
// primera de la lista. El riesgo no es visual: si el usuario guarda cualquier
// otro campo, se persiste el estado que el control muestra, cambiando la
// entrega de la venta sin que nadie lo haya pedido.
//
// La fuente de verdad es el backend, que normaliza igual al escribir. Aca solo
// se replica lo necesario para que el control refleje el dato guardado.

export const ESTADO_ENTREGA_OPCIONES = ['Pendiente entrega', 'En despacho', 'Entregada', 'Parcial']

export const TIPO_VENTA_OPCIONES = ['Normal', 'Licitación', 'Convenio Marco', 'Venta Web', 'Venta Sala', 'Marketplace']

function comparisonKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

const ESTADO_ENTREGA_ALIASES = { [comparisonKey('Entregado')]: 'Entregada' }

function buildResolver(opciones, aliases = {}) {
  const byKey = new Map(opciones.map(value => [comparisonKey(value), value]))
  return function resolve(value) {
    const key = comparisonKey(value)
    if (!key) return null
    return byKey.get(key) ?? aliases[key] ?? null
  }
}

export const normalizeEstadoEntrega = buildResolver(ESTADO_ENTREGA_OPCIONES, ESTADO_ENTREGA_ALIASES)
export const normalizeTipoVenta = buildResolver(TIPO_VENTA_OPCIONES)
