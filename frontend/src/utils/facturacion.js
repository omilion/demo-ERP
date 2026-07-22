export const TIPOS_DTE = {
  33: 'Factura Electrónica',
  39: 'Boleta Electrónica',
  52: 'Guía de Despacho Electrónica',
  56: 'Nota de Débito Electrónica',
  61: 'Nota de Crédito Electrónica',
}

// Codigos del SII para la guia de despacho (DTE 52). Deben coincidir con
// IND_TRASLADO / TIPO_DESPACHO de backend/src/facturacion/documento.js.
export const IND_TRASLADO = {
  1: 'Operación constituye venta',
  2: 'Ventas por efectuar',
  3: 'Consignaciones',
  4: 'Entrega gratuita',
  5: 'Traslados internos',
  6: 'Otros traslados no venta',
  7: 'Guía de devolución',
  8: 'Traslado para exportación',
  9: 'Venta para exportación',
}

export const TIPO_DESPACHO = {
  1: 'Despacho por cuenta del receptor',
  2: 'Despacho por cuenta del emisor a instalaciones del cliente',
  3: 'Despacho por cuenta del emisor a otras instalaciones',
}

// Catalogo TpoDocRef del SII para el bloque <Referencia>: tipos de DTE mas
// los codigos no-DTE mas usados (orden de compra del cliente, etc.).
export const REFERENCIA_TIPOS = {
  33: 'Factura Electrónica',
  52: 'Guía de Despacho Electrónica',
  56: 'Nota de Débito Electrónica',
  61: 'Nota de Crédito Electrónica',
  801: 'Nota de Pedido',
  802: 'Contrato',
  803: 'Resolución',
  805: 'Orden de Compra',
  806: 'Otro',
}

export function isValidRut(value) {
  const rut = String(value || '').replace(/[^0-9kK]/g, '').toUpperCase()
  if (rut.length < 2) return false
  const body = rut.slice(0, -1)
  const verifier = rut.slice(-1)
  if (!/^[0-9]+$/.test(body)) return false
  let sum = 0
  let factor = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const expected = 11 - (sum % 11)
  return String(expected === 11 ? '0' : expected === 10 ? 'K' : expected) === verifier
}

export const buildReceptor = (cliente = {}) => ({
  rut: cliente.rut || '',
  razonSocial: cliente.razonSocial || cliente.nombre || '',
  giro: cliente.giro || '',
  direccion: cliente.direccion || '',
  comuna: cliente.comuna || '',
  ciudad: cliente.ciudad || '',
})

export const mapVentaItems = (venta = {}) => (venta.items || []).map(item => ({
  nombre: item.nombre || item.producto?.nombre || `Producto #${item.productoId || item.id}`,
  descripcion: item.descripcion || null,
  cantidad: Number(item.cantidad || 0),
  unidad: null,
  // precioUnitario is net. precioConIva would apply IVA twice in the DTE engine.
  precio: Number(item.precioUnitario || 0),
}))
