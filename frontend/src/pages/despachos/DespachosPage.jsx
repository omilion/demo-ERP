import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { FormField, Input, Textarea } from '../../components/forms'
import { useDespachos, useGuias, useCreateDespacho, useUpdateDespacho, useDeleteDespacho, useCreateGuia, useDeleteGuia } from '../../api/despachos'
import { downloadCsv } from '../../utils/csv'

const TABS = [
  { id: 'despachos', label: 'Despachos' },
  { id: 'guias', label: 'Guías' },
]

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

export default function DespachosPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('despachos')
  const [search, setSearch] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [tipo, setTipo] = useState('')
  const [region, setRegion] = useState('')
  const [comuna, setComuna] = useState('')
  const [parcial, setParcial] = useState(false)
  const [tieneMulta, setTieneMulta] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [creatingGuia, setCreatingGuia] = useState(false)

  const params = {}
  if (desde) params.desde = desde
  if (hasta) params.hasta = hasta
  if (search) params.search = search
  if (tipo) params.tipo = tipo
  if (region) params.region = region
  if (comuna) params.comuna = comuna
  if (parcial) params.parcial = 'true'
  if (tieneMulta) params.tieneMulta = 'true'

  const guiaParams = {}
  if (desde) guiaParams.desde = desde
  if (hasta) guiaParams.hasta = hasta
  if (search) guiaParams.nGuia = search

  const despachos = useDespachos(tab === 'despachos' ? params : {})
  const guias = useGuias(tab === 'guias' ? guiaParams : {})

  const clearFilters = () => { setTipo(''); setRegion(''); setComuna(''); setParcial(false); setTieneMulta(false) }
  const hasFilters = tipo || region || comuna || parcial || tieneMulta

  const createMut = useCreateDespacho()
  const updateMut = useUpdateDespacho()
  const delMut = useDeleteDespacho()
  const createGuiaMut = useCreateGuia()
  const delGuiaMut = useDeleteGuia()

  const colsDespacho = [
    { key: 'fechaEntrega', label: 'Fecha entrega',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v ? new Date(v).toLocaleDateString('es-CL') : '—'}</span> },
    { key: 'tipoDespacho', label: 'Tipo',
      render: v => v ? <Badge tone="blue">{v}</Badge> : '—' },
    { key: 'transporte', label: 'Transporte' },
    { key: 'contacto', label: 'Contacto' },
    { key: 'direccion', label: 'Dirección', wrap: true,
      render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'comuna', label: 'Comuna' },
    { key: 'montoEnvio', label: 'Envío', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(v)}</span> },
    { key: 'parcial', label: 'Estado', render: (v, r) => (
      <div style={{ display: 'flex', gap: 4 }}>
        {v && <Badge tone="amber">Parcial</Badge>}
        {r.tieneMulta && <Badge tone="red">Multa</Badge>}
      </div>
    ) },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 8 }}>
        {row.ordenId && (
          <button onClick={(e) => { e.stopPropagation(); navigate('/ventas/' + row.ordenId) }} style={{ background: 'transparent', border: 'none', color: 'var(--blue, #2563eb)', cursor: 'pointer', fontSize: 12 }}>Ver Orden</button>
        )}
        <button onClick={(e) => { e.stopPropagation(); setEditing(row) }} style={{ background: 'transparent', border: 'none', color: 'var(--green-700)', cursor: 'pointer', fontSize: 12 }}>Editar</button>
        <button onClick={(e) => { e.stopPropagation(); if (confirm('¿Eliminar?')) delMut.mutate(row.id) }} style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer', fontSize: 12 }}>Borrar</button>
      </div>
    ) },
  ]

  const colsGuia = [
    { key: 'fechaGuia', label: 'Fecha',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v ? new Date(v).toLocaleDateString('es-CL') : '—'}</span> },
    { key: 'nGuia', label: 'N° Guía',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v}</span> },
    { key: 'nInterno', label: 'N° Interno' },
    { key: 'ordenId', label: 'Orden' },
    { key: 'origen', label: 'Origen' },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 8 }}>
        {row.ordenId && (
          <button onClick={(e) => { e.stopPropagation(); navigate('/ventas/' + row.ordenId) }} style={{ background: 'transparent', border: 'none', color: 'var(--blue, #2563eb)', cursor: 'pointer', fontSize: 12 }}>Ver Orden</button>
        )}
        <button onClick={(e) => { e.stopPropagation(); if (confirm('¿Eliminar guía?')) delGuiaMut.mutate(row.id) }} style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer', fontSize: 12 }}>Borrar</button>
      </div>
    ) },
  ]

  const exportar = () => {
    if (tab === 'despachos') {
      downloadCsv(`despachos_${new Date().toISOString().slice(0,10)}`, despachos.data?.items || [], [
        { key: 'fechaEntrega', label: 'Fecha', fmt: v => v ? new Date(v).toLocaleDateString('es-CL') : '' },
        { key: 'tipoDespacho', label: 'Tipo' },
        { key: 'transporte', label: 'Transporte' },
        { key: 'contacto', label: 'Contacto' },
        { key: 'direccion', label: 'Dirección' },
        { key: 'comuna', label: 'Comuna' },
        { key: 'montoEnvio', label: 'Envío' },
      ])
    } else {
      downloadCsv(`guias_${new Date().toISOString().slice(0,10)}`, guias.data?.items || [], [
        { key: 'fechaGuia', label: 'Fecha', fmt: v => v ? new Date(v).toLocaleDateString('es-CL') : '' },
        { key: 'nGuia', label: 'N° Guía' },
        { key: 'nInterno', label: 'N° Interno' },
        { key: 'ordenId', label: 'Orden' },
        { key: 'origen', label: 'Origen' },
      ])
    }
  }

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Despachos y Guías"
        subtitle="Gestión de envíos"
        breadcrumb={['Inicio', 'Logística', 'Despachos']}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" size="sm" onClick={() => window.print()}>Imprimir</Btn>
            <Btn variant="secondary" size="sm" onClick={exportar}>Exportar CSV</Btn>
            {tab === 'despachos'
              ? <Btn variant="primary" size="sm" onClick={() => setCreating(true)}>+ Nuevo despacho</Btn>
              : <Btn variant="primary" size="sm" onClick={() => setCreatingGuia(true)}>+ Nueva guía</Btn>}
          </div>
        }
      />
      <div className="kpi-strip">
        <KpiCard label="Despachos" value={despachos.data?.total || 0} icon="truck" sublabel="Filtros aplicados" />
        <KpiCard label="Parciales" value={despachos.data?.stats?.parciales || 0} icon="package" tone="amber" sublabel="Entrega parcial" />
        <KpiCard label="Con multa" value={despachos.data?.stats?.multas || 0} icon="alertTriangle" tone="red" sublabel="Multados" />
        <KpiCard label="Guías" value={guias.data?.total || 0} icon="fileText" sublabel="Total guías" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <FormField label="Desde"><Input type="date" value={desde} onChange={setDesde} /></FormField>
          <FormField label="Hasta"><Input type="date" value={hasta} onChange={setHasta} /></FormField>
        </div>
        {tab === 'despachos' && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={tipo} onChange={e => setTipo(e.target.value)} placeholder="Tipo (Retiro/Despacho)" style={inputFilter} />
            <input value={region} onChange={e => setRegion(e.target.value)} placeholder="Región" style={inputFilter} />
            <input value={comuna} onChange={e => setComuna(e.target.value)} placeholder="Comuna" style={inputFilter} />
            <label style={lblCheck}>
              <input type="checkbox" checked={parcial} onChange={e => setParcial(e.target.checked)} /> Solo parciales
            </label>
            <label style={lblCheck}>
              <input type="checkbox" checked={tieneMulta} onChange={e => setTieneMulta(e.target.checked)} /> Solo con multa
            </label>
            {hasFilters && (
              <button onClick={clearFilters} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)' }}>Limpiar filtros</button>
            )}
          </div>
        )}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
          <SearchBar placeholder={tab === 'despachos' ? 'Buscar contacto, dirección, transporte, interno…' : 'Buscar N° guía…'} value={search} onChange={setSearch} style={{ width: 320 }} />
        </div>
        {tab === 'despachos'
          ? (despachos.isLoading
              ? <div style={{ padding: 48, textAlign: 'center' }}>Cargando…</div>
              : <Table columns={colsDespacho} rows={despachos.data?.items || []} emptyMessage="Sin despachos" />)
          : (guias.isLoading
              ? <div style={{ padding: 48, textAlign: 'center' }}>Cargando…</div>
              : <Table columns={colsGuia} rows={guias.data?.items || []} emptyMessage="Sin guías" />)
        }
      </div>

      {(creating || editing) && (
        <DespachoModal
          initial={editing || {}}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSave={(data) => {
            const mut = editing ? updateMut : createMut
            const payload = editing ? { id: editing.id, data } : data
            mut.mutate(payload, { onSuccess: () => { setCreating(false); setEditing(null) } })
          }}
          saving={createMut.isPending || updateMut.isPending}
        />
      )}

      {creatingGuia && (
        <GuiaModal
          onClose={() => setCreatingGuia(false)}
          onSave={(data) => createGuiaMut.mutate(data, { onSuccess: () => setCreatingGuia(false) })}
          saving={createGuiaMut.isPending}
        />
      )}
    </main>
  )
}

const inputFilter = { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: '#fff', minWidth: 140 }
const lblCheck = { display: 'flex', gap: 5, fontSize: 12, alignItems: 'center', cursor: 'pointer' }

function DespachoModal({ initial, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    ordenId: initial.ordenId || '',
    interno: initial.interno || '',
    fechaEntrega: initial.fechaEntrega ? initial.fechaEntrega.slice(0, 10) : '',
    plazoEntrega: initial.plazoEntrega || '',
    tipoDespacho: initial.tipoDespacho || '',
    transporte: initial.transporte || '',
    montoEnvio: initial.montoEnvio || '',
    direccion: initial.direccion || '',
    contacto: initial.contacto || '',
    region: initial.region || '',
    comuna: initial.comuna || '',
    parcial: !!initial.parcial,
    tieneMulta: !!initial.tieneMulta,
  })
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 640, maxWidth: '92vw', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>{initial.id ? `Editar despacho #${initial.id}` : 'Nuevo despacho'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Orden ID"><Input type="number" value={form.ordenId} onChange={v => setForm(f => ({ ...f, ordenId: v }))} /></FormField>
          <FormField label="N° Interno"><Input value={form.interno} onChange={v => setForm(f => ({ ...f, interno: v }))} /></FormField>
          <FormField label="Fecha entrega"><Input type="date" value={form.fechaEntrega} onChange={v => setForm(f => ({ ...f, fechaEntrega: v }))} /></FormField>
          <FormField label="Plazo entrega"><Input value={form.plazoEntrega} onChange={v => setForm(f => ({ ...f, plazoEntrega: v }))} /></FormField>
          <FormField label="Tipo despacho"><Input value={form.tipoDespacho} onChange={v => setForm(f => ({ ...f, tipoDespacho: v }))} placeholder="Retiro / Despacho" /></FormField>
          <FormField label="Transporte"><Input value={form.transporte} onChange={v => setForm(f => ({ ...f, transporte: v }))} /></FormField>
          <FormField label="Monto envío"><Input type="number" value={form.montoEnvio} onChange={v => setForm(f => ({ ...f, montoEnvio: v }))} /></FormField>
          <FormField label="Contacto"><Input value={form.contacto} onChange={v => setForm(f => ({ ...f, contacto: v }))} /></FormField>
          <FormField label="Región"><Input value={form.region} onChange={v => setForm(f => ({ ...f, region: v }))} /></FormField>
          <FormField label="Comuna"><Input value={form.comuna} onChange={v => setForm(f => ({ ...f, comuna: v }))} /></FormField>
        </div>
        <div style={{ marginTop: 12 }}>
          <FormField label="Dirección"><Textarea value={form.direccion} onChange={v => setForm(f => ({ ...f, direccion: v }))} rows={2} /></FormField>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'flex', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={form.parcial} onChange={e => setForm(f => ({ ...f, parcial: e.target.checked }))} /> Parcial
          </label>
          <label style={{ display: 'flex', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={form.tieneMulta} onChange={e => setForm(f => ({ ...f, tieneMulta: e.target.checked }))} /> Con multa
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancelar</Btn>
          <Btn variant="primary" size="sm" onClick={() => onSave(form)} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Btn>
        </div>
      </div>
    </div>
  )
}

function GuiaModal({ onClose, onSave, saving }) {
  const [form, setForm] = useState({ ordenId: '', nInterno: '', nGuia: '', fechaGuia: new Date().toISOString().slice(0, 10), origen: '' })
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 480 }}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Nueva guía de despacho</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="N° Guía" required><Input value={form.nGuia} onChange={v => setForm(f => ({ ...f, nGuia: v }))} /></FormField>
          <FormField label="Fecha guía"><Input type="date" value={form.fechaGuia} onChange={v => setForm(f => ({ ...f, fechaGuia: v }))} /></FormField>
          <FormField label="Orden ID"><Input type="number" value={form.ordenId} onChange={v => setForm(f => ({ ...f, ordenId: v }))} /></FormField>
          <FormField label="N° Interno"><Input type="number" value={form.nInterno} onChange={v => setForm(f => ({ ...f, nInterno: v }))} /></FormField>
          <FormField label="Origen"><Input value={form.origen} onChange={v => setForm(f => ({ ...f, origen: v }))} /></FormField>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancelar</Btn>
          <Btn variant="primary" size="sm" onClick={() => onSave(form)} disabled={saving || !form.nGuia}>{saving ? 'Guardando…' : 'Guardar'}</Btn>
        </div>
      </div>
    </div>
  )
}
