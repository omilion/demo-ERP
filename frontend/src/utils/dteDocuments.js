import api from '../api/client'

export async function downloadDteXml(documento) {
  const response = await api.get(`/facturacion/documentos/${documento.id}/xml`, { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = `DTE-${documento.folio || documento.id}.xml`
  link.click()
  URL.revokeObjectURL(url)
}

export async function openDteHtml(documento) {
  const popup = window.open('', '_blank')
  if (!popup) throw new Error('Habilita popups para ver el documento.')
  try {
    const response = await api.get(`/facturacion/documentos/${documento.id}/html`, { responseType: 'text' })
    popup.document.open()
    popup.document.write(response.data)
    popup.document.close()
  } catch (error) {
    popup.close()
    throw error
  }
}

// PDF real (no HTML): se abre en el visor nativo del navegador, que ya trae
// botones de descarga e impresión — no hace falta un boton aparte para cada cosa.
export async function openDtePdf(documento) {
  const popup = window.open('', '_blank')
  if (!popup) throw new Error('Habilita popups para ver el documento.')
  try {
    const response = await api.get(`/facturacion/documentos/${documento.id}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
    popup.location.href = url
  } catch (error) {
    popup.close()
    throw error
  }
}
