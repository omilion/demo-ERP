import { useState } from 'react'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table } from '../../components/shared'
import { FormField, Input, Textarea } from '../../components/forms'
import { useBitacoraTaller, useCreateBitacora, useUpdateBitacora, useDeleteBitacora } from '../../api/bitacoraTaller'
import { downloadCsv } from '../../utils/csv'

export default function BitacoraTallerPage() {
  const [operario, setOperario] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [page, setPage] = useState(1)

  const params = { page: String(page) }
  if (operario) params.operario = operario
  if (desde) params.desde = desde
  if (hasta) params.hasta = hasta

  const { data = { items: [], total: 0 }, isLoading } = useBitacoraTaller(params)
  const createMut = useCreateBitacora()
  const updateMut = useUpdateBitacora()
  const delMut = useDeleteBitacora()

  const cols = [
    { key: 'fecha', label: 'Fecha',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v ? new Date(v).toLocaleString('es-CL') : '—'}</span> },
    { key: 'usuario', label: 'Operario',
      render: v => <Badge tone="blue">{v}</Badge> },
    { key: 'odtId', label: 'ODT',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>#{v}</span> },
    { key: 'texto', label: 'Texto', wrap: true,
      render: v => <span style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{v}</span> },
    { key: 'usuarioReporta', label: 'Reporta',
      render: v => <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{v || '—'}</span> },
    { key: '_acc', label: '', render: (_, r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={(e) => { e.stopPropagation(); setEditing(r) }} style={{ background: 'transparent', border: 'none', color: 'var(--green-700)', cursor: 'pointer', fontSize: 12 }}>Editar</button>
        <button onClick={(e) => { e.stopPropagation(); if (confirm('¿Eliminar?')) delMut.mutate(r.id) }} style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer', fontSize: 12 }}>Borrar</button>
      </div>
    ) },
  ]

  const exportar = () => {
    downloadCsv(`bitacora_${new Date().toISOString().slice(0,10)}`, data.items, [
      { key: 'fecha', label: 'Fecha', fmt: v => v ? new Date(v).toLocaleString('es-CL') : '' },
      { key: 'usuario', label: 'Operario' },
      { key: 'odtId', label: 'ODT' },
      { key: 'texto', label: 'Texto' },
      { key: 'usuarioReporta', label: 'Reporta' },
    ])
  }

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Bitácora Taller"
        subtitle={`${data.total} entradas`}
        breadcrumb={['Inicio', 'Taller', 'Bitácora']}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" size="sm" onClick={exportar}>Exportar CSV</Btn>
            <Btn variant="primary" size="sm" onClick={() => setCreating(true)}>+ Nueva entrada</Btn>
          </div>
        }
      />
      <div className="kpi-strip">
        <KpiCard label="Entradas totales" value={data.total} icon="bookOpen" />
        <KpiCard label="En página" value={data.items.length} icon="list" sublabel={`Página ${page}`} />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
          <FormField label="Desde"><Input type="date" value={desde} onChange={setDesde} /></FormField>
          <FormField label="Hasta"><Input type="date" value={hasta} onChange={setHasta} /></FormField>
          <FormField label="Operario"><Input value={operario} onChange={setOperario} placeholder="Nombre operario…" /></FormField>
        </div>
        {isLoading
          ? <div style={{ padding: 48, textAlign: 'center' }}>Cargando…</div>
          : <Table columns={cols} rows={data.items} emptyMessage="Sin bitácora" />
        }
      </div>

      {(creating || editing) && (
        <BitacoraModal
          initial={editing || {}}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSave={(d) => {
            const mut = editing ? updateMut : createMut
            const payload = editing ? { id: editing.id, data: d } : d
            mut.mutate(payload, { onSuccess: () => { setCreating(false); setEditing(null) } })
          }}
          saving={createMut.isPending || updateMut.isPending}
        />
      )}
    </main>
  )
}

function BitacoraModal({ initial, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    odtId: initial.odtId || '',
    texto: initial.texto || '',
    fecha: initial.fecha ? initial.fecha.slice(0, 16) : new Date().toISOString().slice(0, 16),
    usuarioReporta: initial.usuarioReporta || '',
  })
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 520 }}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>{initial.id ? 'Editar bitácora' : 'Nueva entrada bitácora'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="ODT ID" required><Input type="number" value={form.odtId} onChange={v => setForm(f => ({ ...f, odtId: v }))} disabled={!!initial.id} /></FormField>
          <FormField label="Fecha"><Input type="datetime-local" value={form.fecha} onChange={v => setForm(f => ({ ...f, fecha: v }))} /></FormField>
          <FormField label="Reporta a"><Input value={form.usuarioReporta} onChange={v => setForm(f => ({ ...f, usuarioReporta: v }))} /></FormField>
        </div>
        <div style={{ marginTop: 12 }}>
          <FormField label="Texto" required><Textarea value={form.texto} onChange={v => setForm(f => ({ ...f, texto: v }))} rows={5} /></FormField>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancelar</Btn>
          <Btn variant="primary" size="sm" onClick={() => onSave(form)} disabled={saving || !form.odtId || !form.texto}>{saving ? 'Guardando…' : 'Guardar'}</Btn>
        </div>
      </div>
    </div>
  )
}
