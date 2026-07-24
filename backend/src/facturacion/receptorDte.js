import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { downloadGmailAttachment, listGmailXmlAttachments } from './gmailReceptor.js'

const elementChildren = node => Array.from(node?.childNodes || []).filter(child => child.nodeType === 1)
const child = (node, name) => elementChildren(node).find(item => item.localName === name || item.nodeName === name) || null
const text = (node, name) => (child(node, name)?.textContent || '').trim()
const number = (node, name) => { const value = text(node, name); return value === '' ? null : Number(value) }
const descendants = (node, name) => {
  const results = []
  const visit = current => { for (const item of elementChildren(current)) { if (item.localName === name || item.nodeName === name) results.push(item); visit(item) } }
  visit(node)
  return results
}
const directMany = (node, name) => elementChildren(node).filter(item => item.localName === name || item.nodeName === name)

// Los DTE del SII pueden declarar ISO-8859-1; convertirlos siempre como UTF-8
// altera RznSoc/Glosa y por tanto también la representación impresa.
export const decodeDteXml = (buffer) => {
  const declaration = Buffer.from(buffer).subarray(0, 250).toString('ascii')
  return Buffer.from(buffer).toString(/encoding\s*=\s*["'](?:ISO-8859-1|latin1)["']/i.test(declaration) ? 'latin1' : 'utf8')
}

export const parseRecibidoDte = (xml) => {
  if (!String(xml || '').trim()) throw new Error('El adjunto XML está vacío.')
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('El XML recibido contiene una declaración no permitida.')
  const document = new DOMParser().parseFromString(String(xml), 'text/xml')
  if (descendants(document, 'parsererror').length) throw new Error('No se pudo interpretar el XML recibido.')
  const wrapper = ['Documento', 'Liquidacion', 'Exportaciones'].map(name => descendants(document, name)[0]).find(Boolean)
  if (!wrapper) throw new Error('El XML no contiene Documento, Liquidacion ni Exportaciones.')
  const encabezado = child(wrapper, 'Encabezado')
  const idDoc = child(encabezado, 'IdDoc')
  const emisorNode = child(encabezado, 'Emisor')
  const receptorNode = child(encabezado, 'Receptor')
  const totalesNode = child(encabezado, 'Totales')
  const tipoDte = number(idDoc, 'TipoDTE')
  if (!Number.isInteger(tipoDte)) throw new Error('El DTE recibido no contiene TipoDTE válido.')
  const emisor = { rut: text(emisorNode, 'RUTEmisor'), razonSocial: text(emisorNode, 'RznSoc'), giro: text(emisorNode, 'GiroEmis'), direccion: text(emisorNode, 'DirOrigen'), comuna: text(emisorNode, 'CmnaOrigen'), ciudad: text(emisorNode, 'CiudadOrigen') }
  const receptor = { rut: text(receptorNode, 'RUTRecep'), razonSocial: text(receptorNode, 'RznSocRecep'), giro: text(receptorNode, 'GiroRecep'), contacto: text(receptorNode, 'Contacto'), email: text(receptorNode, 'CorreoRecep'), direccion: text(receptorNode, 'DirRecep'), comuna: text(receptorNode, 'CmnaRecep'), ciudad: text(receptorNode, 'CiudadRecep'), nacionalidad: text(child(receptorNode, 'Extranjero'), 'Nacionalidad') }
  const details = directMany(wrapper, 'Detalle').map(row => ({ nombre: text(row, 'NmbItem'), descripcion: text(row, 'DscItem') || null, cantidad: number(row, 'QtyItem') ?? 1, unidad: text(row, 'UnmdItem') || null, precio: number(row, 'PrcItem') ?? 0, descuentoMonto: number(row, 'DescuentoMonto') ?? 0, monto: number(row, 'MontoItem') ?? 0, exento: text(row, 'IndExe') === '1' }))
  const liquidaciones = directMany(wrapper, 'Detalle').map(row => ({ tpoDocLiq: text(row, 'TpoDocLiq'), codigo: text(row, 'CdgItem') || null, nombre: text(row, 'NmbItem'), descripcion: text(row, 'DscItem') || null, cantidad: number(row, 'QtyItem'), unidad: text(row, 'UnmdItem') || null, precio: number(row, 'PrcItem'), monto: number(row, 'MontoItem') ?? 0, exento: text(row, 'IndExe') === '1' }))
  const referencias = directMany(wrapper, 'Referencia').map(row => ({ tipoDocRef: number(row, 'TpoDocRef'), folioRef: text(row, 'FolioRef'), fechaRef: text(row, 'FchRef'), codRef: number(row, 'CodRef'), razon: text(row, 'RazonRef') || null }))
  const ted = descendants(wrapper, 'TED')[0]
  return {
    wrapper: wrapper.localName || wrapper.nodeName, tipoDte, folio: number(idDoc, 'Folio'), fechaEmision: text(idDoc, 'FchEmis') || null,
    emisor, receptor, items: wrapper.localName === 'Liquidacion' ? [] : details, detalles: wrapper.localName === 'Liquidacion' ? liquidaciones : [], referencias,
    totales: { neto: number(totalesNode, 'MntNeto'), exento: number(totalesNode, 'MntExe'), iva: number(totalesNode, 'IVA'), tasaIva: number(totalesNode, 'TasaIVA'), total: number(totalesNode, 'MntTotal') ?? 0 },
    tedXml: ted ? new XMLSerializer().serializeToString(ted) : null,
  }
}

export const syncGmailReceptor = async ({ prisma, env = process.env, maxResults = 100 }) => {
  const { messages, nextPageToken, accessToken } = await listGmailXmlAttachments({ maxResults }, env)
  let created = 0; let skipped = 0; const errors = []
  for (const message of messages) for (const attachment of message.attachments) {
    const attachmentId = attachment.id
    const exists = await prisma.factDocumentoRecibido.findUnique({ where: { gmailMessageId_gmailAttachmentId: { gmailMessageId: message.id, gmailAttachmentId: attachmentId } } })
    if (exists) { skipped++; continue }
    try {
      const buffer = await downloadGmailAttachment({ messageId: message.id, attachmentId: attachment.id, inlineData: attachment.inlineData, accessToken })
      const xml = decodeDteXml(buffer)
      const parsed = parseRecibidoDte(xml)
      await prisma.factDocumentoRecibido.create({ data: { gmailMessageId: message.id, gmailAttachmentId: attachmentId, gmailThreadId: message.threadId || null, archivoNombre: attachment.filename, recibidoEn: message.internalDate, remitente: message.from || null, asunto: message.subject || null, xml, tipoDte: parsed.tipoDte, folio: parsed.folio, fechaEmision: parsed.fechaEmision, rutEmisor: parsed.emisor.rut || null, razonSocialEmisor: parsed.emisor.razonSocial || null, receptor: parsed.receptor, items: parsed.items, detalles: parsed.detalles, referencias: parsed.referencias, totales: parsed.totales } })
      created++
    } catch (error) { errors.push({ messageId: message.id, attachment: attachment.filename, error: error.message }) }
  }
  return { created, skipped, errors, nextPageToken }
}
