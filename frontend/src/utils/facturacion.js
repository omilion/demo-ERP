export const TIPOS_DTE = {
  33: 'Factura Electrónica',
  39: 'Boleta Electrónica',
  52: 'Guía de Despacho Electrónica',
  56: 'Nota de Débito Electrónica',
  61: 'Nota de Crédito Electrónica',
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
