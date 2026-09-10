import { useEffect, useRef, useState } from 'react'
import { Badge, Btn } from '../shared'
import { useDocumentosReferenciables } from '../../api/facturacion'
import { TIPOS_DTE } from '../../utils/facturacion'
import { NotaDteModal } from './DteModals'

const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('es-CL')
const dateFmt = value => value ? new Date(value).toLocaleDateString('es-CL') : '—'

export function NotaDteFlow({ tipoDte, ordenId = null, preselectedDocumentId = null, onSuccess }) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState(null)
  const appliedPreselection = useRef(null)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])
  const { data, isLoading, isFetching, error } = useDocumentosReferenciables({ tipoNota: tipoDte, search: debounced, ordenId })
  const documentos = data?.documentos || []
  const nombreNota = tipoDte === 61 ? 'Nota de Crédito' : 'Nota de Débito'

  useEffect(() => {
    const marker = `${tipoDte}:${preselectedDocumentId || ''}`
    if (!preselectedDocumentId || appliedPreselection.current === marker) return
    const documento = documentos.find(item => Number(item.id) === Number(preselectedDocumentId))
    if (!documento) return
    appliedPreselection.current = marker
    setSelected(documento)
  }, [documentos, preselectedDocumentId, tipoDte])

  return <section style={cardStyle}>
    <div style={stepTitle}>2. Buscar el documento original</div>
    <div style={{ marginBottom: 6, fontWeight: 700 }}>{nombreNota}: documentos disponibles</div>
    <div style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 14 }}>
      {ordenId
        ? <>Venta #{ordenId} preseleccionada. Sólo se muestran sus documentos emitidos que todavía admiten esta operación.</>
        : <>Busca directamente por RUT, razón social, folio, ID del DTE o N° de venta. Sólo se muestran documentos emitidos que todavía admiten esta operación.</>}
    </div>
    <div style={{ position: 'relative', marginBottom: 14 }}>
      <input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Ej: 76.354.051-0, folio 128 o venta 450" aria-label="Buscar documento por RUT o folio" style={inputStyle} />
      {isFetching && <span style={{ position: 'absolute', right: 12, top: 11, color: 'var(--text-3)', fontSize: 12 }}>Buscando...</span>}
    </div>
    {error && <div style={errorStyle}>{error?.response?.data?.error || error.message || 'No se pudieron buscar documentos.'}</div>}
    {!error && isLoading && <div style={emptyStyle}>Cargando documentos disponibles...</div>}
    {!error && !isLoading && !documentos.length && <div style={emptyStyle}>{debounced ? 'No hay documentos disponibles que coincidan con la búsqueda.' : 'No hay documentos emitidos disponibles para esta nota.'}</div>}
    {!!documentos.length && <div style={{ display: 'grid', gap: 10 }}>
      {documentos.map(documento => <article key={documento.id} style={documentStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong>{TIPOS_DTE[documento.tipoDte] || `DTE ${documento.tipoDte}`} · folio {documento.folio}</strong>
              <Badge tone={documento.estado === 'aceptado' ? 'green' : documento.estado === 'enviado' ? 'amber' : 'blue'}>{documento.estado}</Badge>
            </div>
            <div style={{ marginTop: 5, color: 'var(--text-2)', fontSize: 13 }}>{documento.receptor?.razonSocial || 'Sin razón social'} · {documento.receptor?.rut || 'Sin RUT'}</div>
            <div style={{ marginTop: 3, color: 'var(--text-3)', fontSize: 12 }}>Emitido {dateFmt(documento.fechaEmision)} · DTE #{documento.id}{documento.ordenId ? ` · Venta #${documento.ordenId}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 800, fontSize: 17 }}>{money(documento.totales?.total)}</div>{tipoDte === 61 && documento.saldoDisponible < Number(documento.totales?.total || 0) && <div style={{ color: 'var(--amber)', fontSize: 11 }}>Saldo acreditable {money(documento.saldoDisponible)}</div>}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{documento.motivosPermitidos?.map(motivo => <span key={motivo.codigo} style={reasonStyle}>{motivo.label}</span>)}</div>
          <Btn variant="primary" onClick={() => setSelected(documento)}>Previsualizar y emitir</Btn>
        </div>
      </article>)}
    </div>}
    {selected && <NotaDteModal documento={selected} tipoDte={tipoDte} onClose={() => setSelected(null)} onSuccess={result => { setSelected(null); onSuccess?.(result) }} />}
  </section>
}

const cardStyle = { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, maxWidth: 1120, marginBottom: 16 }
const stepTitle = { fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 10 }
const inputStyle = { width: '100%', padding: '11px 110px 11px 12px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', fontSize: 14 }
const documentStyle = { padding: 14, border: '1px solid var(--border)', borderRadius: 9, background: '#fff' }
const reasonStyle = { padding: '4px 7px', borderRadius: 999, background: 'var(--blue-50)', color: 'var(--blue)', fontSize: 11, fontWeight: 600 }
const emptyStyle = { padding: 22, border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }
const errorStyle = { padding: '10px 12px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13 }
