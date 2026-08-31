function key(value) {
  return String(value || '').trim()
}

export async function codigoBarrasObligatorio(prisma) {
  const empresa = await prisma.empresaConfig.findFirst({
    select: { escaneoCodigoBarrasObligatorio: true },
  })
  return empresa?.escaneoCodigoBarrasObligatorio === true
}

// Los lectores USB escriben en este campo como teclado. La comparación no
// acepta el código interno: debe coincidir con el barcode del producto.
export function validateBarcodeScans(lines = [], scans = {}) {
  for (const line of lines) {
    if (Number(line.cantidad || 0) <= 0) continue
    const expected = key(line.codigoBarra)
    const scanned = key(scans?.[line.itemId ?? line.id])
    const label = line.nombre || `ítem ${line.itemId ?? line.id}`
    if (!expected) return { error: `${label} no tiene código de barras cargado` }
    if (!scanned) return { error: `Debe escanear el código de barras de ${label}` }
    if (scanned !== expected) return { error: `Código escaneado no corresponde a ${label}` }
  }
  return null
}
