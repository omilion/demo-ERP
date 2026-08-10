import { normalizeRut } from './xmlUtil.js'

export const ESTADOS_DTE_REFERENCIABLES = new Set(['emitido', 'enviado', 'aceptado'])

const TIPOS_REFERENCIA_NC = new Set([33, 39, 46, 56])
const TIPOS_REFERENCIA_ND = new Set([33, 39, 46, 61])

const montoDocumento = documento => Math.max(0, Math.round(Number(documento?.totales?.total) || 0))
const referenciaLocal = (referencia, documento) => (
  Number(referencia?.docLocalId) === Number(documento?.id)
  || (
    !referencia?.docLocalId
    && Number(referencia?.tipoDocRef) === Number(documento?.tipoDte)
    && String(referencia?.folioRef || '') === String(documento?.folio || '')
  )
)

export function motivosPermitidosNota(tipoNota, tipoReferencia) {
  const nota = Number(tipoNota)
  const referencia = Number(tipoReferencia)
  if (nota === 61 && TIPOS_REFERENCIA_NC.has(referencia)) {
    return [
      { codigo: 1, label: 'Anula el documento de referencia' },
      ...(referencia === 33 ? [{ codigo: 2, label: 'Corrige texto del documento de referencia' }] : []),
      { codigo: 3, label: 'Corrige montos' },
    ]
  }
  if (nota === 56 && TIPOS_REFERENCIA_ND.has(referencia)) {
    return [
      ...(referencia === 61 ? [{ codigo: 1, label: 'Anula la Nota de Crédito de referencia' }] : []),
      { codigo: 3, label: 'Corrige montos' },
    ]
  }
  return []
}

export function evaluarDocumentoParaNota({ documento, tipoNota, notas = [] }) {
  const motivosBase = motivosPermitidosNota(tipoNota, documento?.tipoDte)
  if (!motivosBase.length || !ESTADOS_DTE_REFERENCIABLES.has(String(documento?.estado)) || !documento?.folio) {
    return { elegible: false, motivosPermitidos: [], saldoDisponible: 0, notasRelacionadas: 0 }
  }

  const relacionadas = notas.filter(nota => (
    Number(nota.tipoDte) === Number(tipoNota)
    && ESTADOS_DTE_REFERENCIABLES.has(String(nota.estado))
    && (nota.referencias || []).some(ref => referenciaLocal(ref, documento))
  ))
  const anulada = relacionadas.some(nota => (nota.referencias || []).some(ref => referenciaLocal(ref, documento) && Number(ref.codRef) === 1))
  const corregidoMonto = relacionadas.reduce((total, nota) => {
    const corrigeMonto = (nota.referencias || []).some(ref => referenciaLocal(ref, documento) && Number(ref.codRef) === 3)
    return total + (corrigeMonto ? montoDocumento(nota) : 0)
  }, 0)
  const original = montoDocumento(documento)
  const saldoDisponible = Number(tipoNota) === 61 ? Math.max(0, original - corregidoMonto) : original

  let motivos = anulada ? [] : motivosBase
  if (Number(tipoNota) === 61 && corregidoMonto > 0) motivos = motivos.filter(motivo => motivo.codigo !== 1)
  if (Number(tipoNota) === 61 && saldoDisponible <= 0) motivos = motivos.filter(motivo => motivo.codigo !== 3)

  return {
    elegible: motivos.length > 0,
    motivosPermitidos: motivos,
    saldoDisponible,
    montoCorregido: corregidoMonto,
    notasRelacionadas: relacionadas.length,
  }
}

export async function assertNotaDteInput({ doc, db }) {
  const tipoNota = Number(doc?.tipoDte)
  if (![56, 61].includes(tipoNota)) return

  const referencias = Array.isArray(doc.referencias) ? doc.referencias : []
  if (referencias.length !== 1 || !referencias[0]?.docLocalId) {
    throw new Error('La Nota de Crédito/Débito requiere un único DTE emitido del sistema como referencia.')
  }
  const referencia = referencias[0]
  const original = await db.documentos.get(referencia.docLocalId)
  if (!original || !original.folio) throw new Error('El documento de referencia no existe o todavía no tiene folio.')
  if (Number(original.id) === Number(doc.id)) throw new Error('Una nota no puede referenciarse a sí misma.')
  if (referencia.tipoDocRef && Number(referencia.tipoDocRef) !== Number(original.tipoDte)) {
    throw new Error('El tipo del documento de referencia no coincide con el DTE seleccionado.')
  }

  const rutNota = normalizeRut(doc?.receptor?.rut)
  const rutOriginal = normalizeRut(original?.receptor?.rut)
  if (!rutNota || !rutOriginal || rutNota !== rutOriginal) {
    throw new Error('La Nota de Crédito/Débito debe pertenecer al mismo RUT receptor del documento original.')
  }

  const todos = await db.documentos.list()
  const evaluacion = evaluarDocumentoParaNota({ documento: original, tipoNota, notas: todos })
  const codRef = Number(referencia.codRef)
  if (!evaluacion.motivosPermitidos.some(motivo => motivo.codigo === codRef)) {
    throw new Error('El documento o el motivo seleccionado ya no está disponible para esta Nota de Crédito/Débito.')
  }
  const razon = String(referencia.razon || '').trim()
  if (!razon) throw new Error('Indica la razón de la Nota de Crédito/Débito.')
  if (razon.length > 90) throw new Error('La razón de referencia admite un máximo de 90 caracteres para el SII.')

  const totalNota = montoDocumento(doc)
  const totalOriginal = montoDocumento(original)
  if (codRef === 1 && totalNota !== totalOriginal) {
    throw new Error(`La anulación debe emitir la nota por el total exacto del documento original ($${totalOriginal.toLocaleString('es-CL')}).`)
  }
  if (codRef === 2 && totalNota !== 0) throw new Error('La corrección de texto no puede modificar montos.')
  if (codRef === 3 && totalNota <= 0) throw new Error('La corrección de montos debe indicar un monto mayor que cero.')
  if (tipoNota === 61 && codRef === 3 && totalNota > evaluacion.saldoDisponible) {
    throw new Error(`El monto de la Nota de Crédito supera el saldo disponible ($${evaluacion.saldoDisponible.toLocaleString('es-CL')}).`)
  }
}
