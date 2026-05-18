import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { useDespachos, useGuias, useCreateDespacho, useUpdateDespacho, useDeleteDespacho, useCreateGuia, useDeleteGuia } from '../../api/despachos'
import { useUpdateVenta } from '../../api/ventas'
import { downloadCsv } from '../../utils/csv'
import { useAuthStore } from '../../store/auth'
import { can, ventaPath } from '../../utils/permissions'

const TABS = [
  { id: 'despachos', label: 'Despachos' },
  { id: 'guias', label: 'Guias' },
]

const emptyDespacho = {
  ordenId: '',
  interno: '',
  fechaEntrega: '',
  tipoDespacho: '',
  transporte: '',
  montoEnvio: '',
  direccion: '',
  contacto: '',
  region: '',
  comuna: '',
  parcial: false,
  tieneMulta: false,
}

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

export default function DespachosPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const ordenIdParam = searchParams.get('ordenId') || ''
  const { user } = useAuthStore()
  const canWriteDespacho = can(user, 'despacho', 'write')
  const canWriteVentas = can(user, 'ventas', 'write')
  const [tab, setTab] = useState('despachos')
  const [search, setSearch] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [creatingGuia, setCreatingGuia] = useState(false)

  const params = {}
  if (desde) params.desde = desde
  if (hasta) params.hasta = hasta
  if (search) params.search = search
  if (ordenIdParam) params.ordenId = ordenIdParam

  const guiaParams = {}
  if (desde) guiaParams.desde = desde
  if (hasta) guiaParams.hasta = hasta
  if (search) guiaParams.nGuia = search
  if (ordenIdParam) guiaParams.ordenId = ordenIdParam

  const despachos = useDespachos(tab === 'despachos' ? params : {})
  const guias = useGuias(tab === 'guias' ? guiaParams : {})
  const createMut = useCreateDespacho()
  const updateMut = useUpdateDespacho()
  const delMut = useDeleteDespacho()
  const createGuiaMut = useCreateGuia()
  const delGuiaMut = useDeleteGuia()
  const updateVentaMut = useUpdateVenta()

  const colsDespacho = [
    { key: 'fechaEntrega', label: 'Fecha entrega', render: v => v ? new Date(v).toLocaleDateString('es-CL') : '-' },
    { key: 'tipoDespacho', label: 'Tipo', render: v => v ? <Badge tone="blue">{v}</Badge> : '-' },
    { key: 'transporte', label: 'Transporte' },
    { key: 'contacto', label: 'Contacto' },
    { key: 'direccion', label: 'Direccion', wrap: true, render: v => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
    { key: 'comuna', label: 'Comuna' },
    { key: 'montoEnvio', label: 'Envio', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(v)}</span> },
    { key: 'parcial', label: 'Estado', render: (v, r) => (
      <div style={{ display: 'flex', gap: 4 }}>
        {v && <Badge tone="amber">Parcial</Badge>}
        {r.tieneMulta && <Badge tone="red">Multa</Badge>}
      </div>
    ) },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 8 }}>
        {row.ordenId && <button onClick={(e) => { e.stopPropagation(); navigate(ventaPath(row.ordenId, user)) }} style={linkButton('var(--blue, #2563eb)')}>Ver Orden</button>}
        {canWriteVentas && row.ordenId && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!confirm(`Marcar orden #${row.ordenId} como entregada?`)) return
              updateVentaMut.mutate({ id: row.ordenId, data: { estadoEntrega: 'Entregada' } }, {
                onError: err => alert(err.response?.data?.error || 'Error'),
              })
            }}
            disabled={updateVentaMut.isPending}
            style={linkButton('var(--green-700)', 600)}
          >Entregado</button>
        )}
        {canWriteDespacho && <button onClick={(e) => { e.stopPropagation(); setEditing(row) }} style={linkButton('var(--green-700)')}>Editar</button>}
        {canWriteDespacho && <button onClick={(e) => { e.stopPropagation(); if (confirm('Eliminar despacho?')) delMut.mutate(row.id) }} style={linkButton('var(--red)')}>Borrar</button>}
      </div>
    ) },
  ]

  const colsGuia = [
    { key: 'fechaGuia', label: 'Fecha', render: v => v ? new Date(v).toLocaleDateString('es-CL') : '-' },
    { key: 'nGuia', label: 'N Guia', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v}</span> },
    { key: 'nInterno', label: 'N Interno' },
    { key: 'ordenId', label: 'Orden' },
    { key: 'origen', label: 'Origen' },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 8 }}>
        {row.ordenId && <button onClick={(e) => { e.stopPropagation(); navigate(ventaPath(row.ordenId, user)) }} style={linkButton('var(--blue, #2563eb)')}>Ver Orden</button>}
        {canWriteDespacho && <button onClick={(e) => { e.stopPropagation(); if (confirm('Eliminar guia?')) delGuiaMut.mutate(row.id) }} style={linkButton('var(--red)')}>Borrar</button>}
      </div>
    ) },
  ]

  const exportar = () => {
    if (tab === 'despachos') {
      downloadCsv(`despachos_${new Date().toISOString().slice(0, 10)}`, despachos.data?.items || [], [
        { key: 'fechaEntrega', label: 'Fecha', fmt: v => v ? new Date(v).toLocaleDateString('es-CL') : '' },
        { key: 'tipoDespacho', label: 'Tipo' },
        { key: 'transporte', label: 'Transporte' },
        { key: 'contacto', label: 'Contacto' },
        { key: 'direccion', label: 'Direccion' },
        { key: 'comuna', label: 'Comuna' },
        { key: 'montoEnvio', label: 'Envio' },
      ])
    } else {
      downloadCsv(`guias_${new Date().toISOString().slice(0, 10)}`, guias.data?.items || [], [
        { key: 'fechaGuia', label: 'Fecha', fmt: v => v ? new Date(v).toLocaleDateString('es-CL') : '' },
        { key: 'nGuia', label: 'N Guia' },
        { key: 'nInterno', label: 'N Interno' },
        { key: 'ordenId', label: 'Orden' },
        { key: 'origen', label: 'Origen' },
      ])
    }
  }

  function clearFilters() {
    setDesde('')
    setHasta('')
    setSearch('')
    if (ordenIdParam) setSearchParams({})
  }

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Despachos y Guias"
        subtitle="Gestion de envios"
        breadcrumb={['Inicio', 'Logistica', 'Despachos']}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" size="sm" onClick={() => window.print()}>Imprimir</Btn>
            <Btn variant="secondary" size="sm" onClick={exportar}>Exportar CSV</Btn>
            {canWriteDespacho && (tab === 'despachos'
              ? <Btn variant="primary" size="sm" onClick={() => setCreating(true)}>Nuevo despacho</Btn>
              : <Btn variant="primary" size="sm" onClick={() => setCreatingGuia(true)}>Nueva guia</Btn>)}
          </div>
        }
      />

      <div className="kpi-strip">
        <KpiCard label="Despachos" value={despachos.data?.total || 0} icon="truck" sublabel="Filtros aplicados" />
        <KpiCard label="Parciales" value={despachos.data?.stats?.parciales || 0} icon="package" tone="amber" sublabel="Entrega parcial" />
        <KpiCard label="Con multa" value={despachos.data?.stats?.multas || 0} icon="alertTriangle" tone="red" sublabel="Multados" />
        <KpiCard label="Guias" value={guias.data?.total || 0} icon="fileText" sublabel="Total guias" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inputFilter} />
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inputFilter} />
          <SearchBar placeholder={tab === 'despachos' ? 'Buscar despacho...' : 'Buscar guia...'} value={search} onChange={setSearch} style={{ width: 260 }} />
          {ordenIdParam && <Badge tone="blue">Orden #{ordenIdParam}</Badge>}
          {(desde || hasta || search || ordenIdParam) && <button onClick={clearFilters} style={smallButton}>Limpiar</button>}
        </div>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)' }}>
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
        </div>
        {tab === 'despachos'
          ? (despachos.isLoading
            ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Cargando despachos...</div>
            : <Table columns={colsDespacho} rows={despachos.data?.items || []} emptyMessage="Sin despachos" />)
          : (guias.isLoading
            ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Cargando guias...</div>
            : <Table columns={colsGuia} rows={guias.data?.items || []} emptyMessage="Sin guias" />)
        }
      </div>

      {creating && (
        <DespachoModal
          title="Nuevo despacho"
          initial={emptyDespacho}
          saving={createMut.isPending}
          onClose={() => setCreating(false)}
          onSave={(data) => createMut.mutate(data, { onSuccess: () => setCreating(false), onError: showError })}
        />
      )}
      {editing && (
        <DespachoModal
          title={`Editar despacho #${editing.id}`}
          initial={editing}
          saving={updateMut.isPending}
          onClose={() => setEditing(null)}
          onSave={(data) => updateMut.mutate({ id: editing.id, data }, { onSuccess: () => setEditing(null), onError: showError })}
        />
      )}
      {creatingGuia && (
        <GuiaModal
          saving={createGuiaMut.isPending}
          onClose={() => setCreatingGuia(false)}
          onSave={(data) => createGuiaMut.mutate(data, { onSuccess: () => setCreatingGuia(false), onError: showError })}
        />
      )}
    </main>
  )
}

function DespachoModal({ title, initial, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    ...emptyDespacho,
    ...initial,
    fechaEntrega: initial.fechaEntrega ? String(initial.fechaEntrega).slice(0, 10) : '',
  }))
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  return (
    <Modal title={title} onClose={onClose}>
      <div style={grid}>
        <Field label="Orden ID"><input value={form.ordenId || ''} onChange={e => set('ordenId', e.target.value)} style={input} /></Field>
        <Field label="Interno"><input value={form.interno || ''} onChange={e => set('interno', e.target.value)} style={input} /></Field>
        <Field label="Fecha entrega"><input type="date" value={form.fechaEntrega || ''} onChange={e => set('fechaEntrega', e.target.value)} style={input} /></Field>
        <Field label="Tipo"><input value={form.tipoDespacho || ''} onChange={e => set('tipoDespacho', e.target.value)} style={input} /></Field>
        <Field label="Transporte"><input value={form.transporte || ''} onChange={e => set('transporte', e.target.value)} style={input} /></Field>
        <Field label="Monto envio"><input value={form.montoEnvio || ''} onChange={e => set('montoEnvio', e.target.value)} style={input} /></Field>
        <Field label="Contacto"><input value={form.contacto || ''} onChange={e => set('contacto', e.target.value)} style={input} /></Field>
        <Field label="Comuna"><input value={form.comuna || ''} onChange={e => set('comuna', e.target.value)} style={input} /></Field>
      </div>
      <Field label="Direccion"><textarea value={form.direccion || ''} onChange={e => set('direccion', e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} /></Field>
      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
        <label style={checkLabel}><input type="checkbox" checked={!!form.parcial} onChange={e => set('parcial', e.target.checked)} /> Parcial</label>
        <label style={checkLabel}><input type="checkbox" checked={!!form.tieneMulta} onChange={e => set('tieneMulta', e.target.checked)} /> Tiene multa</label>
      </div>
      <Footer saving={saving} onClose={onClose} onSave={() => onSave(form)} />
    </Modal>
  )
}

function GuiaModal({ saving, onClose, onSave }) {
  const [form, setForm] = useState({ ordenId: '', nInterno: '', nGuia: '', fechaGuia: '', origen: '' })
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  return (
    <Modal title="Nueva guia" onClose={onClose}>
      <div style={grid}>
        <Field label="N guia"><input value={form.nGuia} onChange={e => set('nGuia', e.target.value)} style={input} /></Field>
        <Field label="Orden ID"><input value={form.ordenId} onChange={e => set('ordenId', e.target.value)} style={input} /></Field>
        <Field label="N interno"><input value={form.nInterno} onChange={e => set('nInterno', e.target.value)} style={input} /></Field>
        <Field label="Fecha"><input type="date" value={form.fechaGuia} onChange={e => set('fechaGuia', e.target.value)} style={input} /></Field>
      </div>
      <Field label="Origen"><input value={form.origen} onChange={e => set('origen', e.target.value)} style={input} /></Field>
      <Footer saving={saving} onClose={onClose} onSave={() => onSave(form)} />
    </Modal>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 720, maxWidth: '95vw', boxShadow: '0 16px 48px oklch(0 0 0 / 0.20)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={linkButton('var(--text-3)')}>Cerrar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}><span style={{ display: 'block', marginBottom: 5 }}>{label}</span>{children}</label>
}

function Footer({ saving, onClose, onSave }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
      <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
      <Btn variant="primary" icon="check" onClick={onSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Btn>
    </div>
  )
}

function showError(error) {
  alert(error.response?.data?.error || 'Error')
}

function linkButton(color, fontWeight = 500) {
  return { background: 'transparent', border: 'none', color, cursor: 'pointer', fontSize: 12, fontWeight }
}

const inputFilter = { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff' }
const smallButton = { padding: '6px 10px', fontSize: 12, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)' }
const input = { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }
const checkLabel = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }
