function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function isReferencialPago(pago) {
  return normalizeText(pago?.medioPago) === 'referencial'
}

export function activeReferentialDocs(venta) {
  return (venta?.pagos || []).filter(pago => (
    isReferencialPago(pago)
    && pago.documento
    && pago.nDoc
    && normalizeText(pago.estadoDoc) === 'activa'
  ))
}

export function docPaidAmount(venta, doc) {
  return (venta?.pagos || [])
    .filter(pago => (
      !isReferencialPago(pago)
      && pago.tipo === 'Ingreso'
      && pago.documento === doc.documento
      && pago.nDoc === doc.nDoc
      && !pago.eliminado
    ))
    .reduce((sum, pago) => sum + Math.abs(Number(pago.monto || 0)), 0)
}

export function docSaldo(venta, doc) {
  return Math.max(0, Math.abs(Number(doc?.monto || 0)) - docPaidAmount(venta, doc))
}

export function collectibleDocuments(venta) {
  return activeReferentialDocs(venta).filter(doc => docSaldo(venta, doc) > 0)
}
