// Costo ponderado multi-proveedor (S1).
//
// Un producto puede comprarse a varios proveedores con costos distintos.
// El stock total es la suma de las cantidades por proveedor y el costo
// ponderado pondera cada costo por su cantidad:
//
//   costoPonderado = Σ(costo_i × cantidad_i) / Σ(cantidad_i)
//
// El precio de venta NO depende del proveedor; el ponderado solo alimenta
// el costo (precioLista) que usa el motor de precios existente.

function toCantidad(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function toCosto(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// rows: [{ costo, cantidad }]. Devuelve stock total y costo ponderado redondeado.
export function computeCosteoPonderado(rows = []) {
  let stockTotal = 0
  let acum = 0
  for (const row of rows) {
    const cantidad = toCantidad(row?.cantidad)
    if (!cantidad) continue
    stockTotal += cantidad
    acum += toCosto(row?.costo) * cantidad
  }
  const costoPonderado = stockTotal > 0 ? Math.round(acum / stockTotal) : 0
  return { stockTotal, costoPonderado }
}
