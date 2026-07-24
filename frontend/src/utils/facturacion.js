export const TIPOS_DTE = {
  33: 'Factura Electrónica',
  39: 'Boleta Electrónica',
  43: 'Liquidación Factura Electrónica',
  46: 'Factura de Compra Electrónica',
  52: 'Guía de Despacho Electrónica',
  56: 'Nota de Débito Electrónica',
  61: 'Nota de Crédito Electrónica',
  110: 'Factura de Exportación Electrónica',
  111: 'Nota de Crédito de Exportación Electrónica',
  112: 'Nota de Débito de Exportación Electrónica',
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

// Transportistas historicos de Plastimar (mismo listado del sistema legacy,
// formularios venta_directa/venta_web/licitacion_venta odts/index.php).
export const TRANSPORTISTAS = [
  'Pullman Cargo', 'Starken', 'Correos de Chile', 'Chilexpress', 'Bluexpress',
  'Varmontt', 'Transporte JT', 'Transporte Espinoza', 'Don Carlos', 'Don Héctor',
  'Flota propia', 'Por Confirmar',
]

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

// Tipos que corresponden a un DTE propio ya emitido en el sistema: se eligen
// de una lista (folio/fecha reales), no se tipean a mano. El resto (OC,
// contrato, resolucion, etc.) son documentos externos sin registro local.
export const REFERENCIA_TIPOS_INTERNOS = ['33', '52', '56', '61']

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
  contacto: cliente.contacto || '',
  email: cliente.email || '',
  nacionalidad: cliente.nacionalidad || '',
  direccion: cliente.direccion || '',
  comuna: cliente.comuna || '',
  ciudad: cliente.ciudad || '',
})

// cantidadPorItemId (opcional): { [ordenItemId]: cantidad } para declarar en
// el DTE solo lo que va en ESTE envio (packing de una guia especifica) en vez
// de la cantidad total del item en la venta. Items sin cantidad > 0 se omiten.
export const mapVentaItems = (venta = {}, cantidadPorItemId = null) => (venta.items || [])
  .map(item => ({
    item,
    cantidad: cantidadPorItemId ? Number(cantidadPorItemId[item.id] || 0) : Number(item.cantidad || 0),
  }))
  .filter(({ cantidad }) => cantidad > 0)
  .map(({ item, cantidad }) => ({
    nombre: item.nombre || item.producto?.nombre || `Producto #${item.productoId || item.id}`,
    descripcion: item.descripcion || null,
    cantidad,
    unidad: null,
    // precioUnitario en la venta es el precio de venta CON IVA incluido (precio
    // sala/marco, ver defaultPrecioUnitario en VentasFormPage). El motor DTE
    // espera precio neto y le suma el 19% el solo: dividir aca evita el doble IVA.
    // Items exentos (venta manual sin OrdenItem detras) no llevan IVA: se pasan tal cual.
    precio: item.exento ? Number(item.precioUnitario || 0) : Math.round(Number(item.precioUnitario || 0) / 1.19),
    exento: Boolean(item.exento),
  }))

// El editor standalone recibe precios con IVA incluido, igual que el formulario
// de ventas. El motor DTE espera el precio neto, excepto en líneas exentas.
export const mapManualDteItems = (items = []) => items
  .filter(item => item.nombre?.trim() && Number(item.cantidad) > 0)
  .map(item => ({
    nombre: item.nombre.trim(),
    descripcion: item.descripcion || null,
    cantidad: Number(item.cantidad),
    unidad: null,
    precio: item.exento ? Number(item.precioUnitario) : Math.round(Number(item.precioUnitario) / 1.19),
    exento: Boolean(item.exento),
  }))

// Los items DTE llegan con precio neto (salvo los exentos, que se mantienen
// tal cual). Este cálculo se comparte entre la vista previa y la pantalla
// manual para que el total que se muestra antes de emitir sea el mismo.
export const computeDteTotales = (items = []) => {
  const { neto, exento } = items.reduce((acc, item) => {
    const monto = Number(item.cantidad || 0) * Number(item.precio ?? item.precioUnitario ?? 0)
    if (item.exento) acc.exento += monto
    else acc.neto += monto
    return acc
  }, { neto: 0, exento: 0 })
  const iva = Math.round(neto * 0.19)
  return { neto, exento, iva, total: neto + exento + iva }
}

export const buildLiquidacionInput = ({ detalles, comisiones, totales, rutMandante }) => ({
  items: [], detalles, comisiones, totales,
  extra: rutMandante ? { rutMandante } : {},
})

export const buildExportacionInput = ({ tipoDte, items, fechaVencimiento, tipoDespacho, moneda, otraMoneda, transporte, referencias }) => ({
  items: items.map(item => ({ ...item, exento: true })),
  referencias,
  extra: {
    ...(fechaVencimiento ? { fechaVencimiento } : {}),
    ...(tipoDespacho ? { tipoDespacho: Number(tipoDespacho) } : {}),
    ...(moneda ? { moneda } : {}),
    ...(otraMoneda ? { otraMoneda } : {}),
    ...(transporte ? { transporte } : {}),
  },
  tipoDte,
})

export const buildIngresoMercaderiaPrefill = (recibido) => {
  const documento = ({ 33: 'Factura', 39: 'Boleta', 61: 'Nota' })[Number(recibido.tipoDte)]
  if (!documento) return null
  const details = (recibido.items || []).map(item => {
    const cantidad = Number(item.cantidad || 1)
    const monto = Number(item.monto ?? cantidad * Number(item.precio || 0))
    return {
      codigoInterno: '', destino: 'producto', nombre: item.nombre || '', unidadMedida: item.unidad || '',
      cantidad: String(cantidad), precio: String(cantidad ? Math.round(monto / cantidad) : monto),
    }
  })
  return {
    documentoRecibidoId: recibido.id, documento, nDoc: String(recibido.folio || ''), fechaDoc: recibido.fechaEmision || '',
    proveedorRut: recibido.rutEmisor || '', proveedorNombre: recibido.razonSocialEmisor || '',
    totalReferencia: Number(recibido.totales?.total || 0), details,
  }
}
