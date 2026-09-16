function cleanText(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

export async function syncDteReferencialToCaja(prisma, dte, user = null) {
  if (!dte || !dte.ordenId || !dte.folio) return null
  const tipoDte = Number(dte.tipoDte)
  // Solo DTEs de venta tributaria que generan cuentas por cobrar
  if (![33, 34, 39, 41].includes(tipoDte)) return null

  const folioStr = String(dte.folio)
  const existing = await prisma.movimientoCaja.findFirst({
    where: {
      ordenId: dte.ordenId,
      nDoc: folioStr,
      eliminado: false,
      medioPago: { equals: 'Referencial', mode: 'insensitive' },
    },
  })
  if (existing) return existing

  const orden = await prisma.orden.findUnique({
    where: { id: dte.ordenId },
    select: { id: true, nInterno: true, sucursalId: true },
  })
  if (!orden) return null

  const documentoLabels = {
    33: 'Factura Electronica',
    34: 'Factura Exenta',
    39: 'Boleta Electronica',
    41: 'Boleta Exenta',
  }
  const docLabel = documentoLabels[tipoDte] || `DTE ${tipoDte}`
  const total = Number(dte.totales?.total || 0)
  const usuario = user?.nombre || user?.username || dte.usuarioNombre || 'Sistema'
  const fecha = dte.fechaEmision ? new Date(dte.fechaEmision) : new Date()

  return prisma.movimientoCaja.create({
    data: {
      tipo: 'Ingreso',
      monto: Math.abs(total),
      medioPago: 'Referencial',
      referencia: `DTE ${tipoDte} Folio ${folioStr} - Venta ${orden.nInterno ? `N interno ${orden.nInterno}` : `#${orden.id}`}`,
      ordenId: dte.ordenId,
      sucursalId: orden.sucursalId || null,
      documento: docLabel,
      nDoc: folioStr,
      tipoDocumento: docLabel,
      estadoDoc: 'Activa',
      estadoPagoDoc: 'No pagada',
      origenTipo: 'orden',
      origenId: dte.ordenId,
      usuario,
      fecha,
    },
  })
}
