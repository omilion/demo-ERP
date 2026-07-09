import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { useMemo, useState } from 'react'
import { Badge, Btn, KpiCard, PageHeader, Pager, Table } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import {
  useBitacoraOperarios,
  useBitacoraTaller,
  useCreateBitacora,
  useDeleteBitacora,
  useUpdateBitacora,
} from '../../api/bitacoraTaller'
import { downloadFromBackend } from '../../utils/csv'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const getErrorMessage = err => err?.response?.data?.error || err?.message || 'No se pudo completar la accion'

function todayInputDate() {
  const date = new Date()
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('es-CL')
}

function dateInputValue(value) {
  if (!value) return todayInputDate()
  return String(value).slice(0, 10)
}

function withCurrentOption(options, value) {
  if (!value || options.some(option => option.value === value)) return options
  return [...options, { value, label: value }]
}

export default function BitacoraTallerPage() {
  const user = useAuthStore(s => s.user)
  const canWriteTaller = can(user, 'taller', 'write')
  const canDeleteTaller = can(user, 'taller', 'delete')
  const [operario, setOperario] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [page, setPage] = useState(1)

  const params = useMemo(() => {
    const next = { page: String(page), limit: '20' }
    if (operario) next.operario = operario
    if (desde) next.desde = desde
    if (hasta) next.hasta = hasta
    if (search) next.search = search
    return next
  }, [page, operario, desde, hasta, search])

  const { data = { items: [], total: 0, limit: 20, page: 1, pages: 1 }, isLoading, isError, error } = useBitacoraTaller(params)
  const { data: operarios = { items: [] } } = useBitacoraOperarios()
  const createMut = useCreateBitacora()
  const updateMut = useUpdateBitacora()
  const delMut = useDeleteBitacora()

  const operarioOptions = useMemo(() => withCurrentOption([
    { value: '', label: 'Todos' },
    ...(operarios.items || []).map(item => ({ value: item.value, label: item.label || item.value })),
  ], operario), [operarios.items, operario])

  const modalOperarioOptions = useMemo(() => withCurrentOption([
    { value: '', label: 'Selecciona operario...' },
    ...(operarios.items || []).map(item => ({ value: item.value, label: item.label || item.value })),
  ], editing?.usuario), [operarios.items, editing])

  const setFilter = setter => value => {
    setter(value)
    setPage(1)
  }

  const cols = [
    {
      key: 'fechaReporte',
      label: 'Fecha reporte',
      render: (v, r) => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{formatDate(v || r.fecha || r.createdAt)}</span>,
    },
    { key: 'usuarioLabel', label: 'Operario', render: (v, r) => <Badge tone="blue">{v || r.usuario || '-'}</Badge> },
    { key: 'texto', label: 'Detalle actividades', wrap: true, render: v => <span style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{v}</span> },
    { key: 'usuarioReporta', label: 'Reporta encargado', render: v => <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{v || '-'}</span> },
    { key: 'sucursalNombre', label: 'Sucursal', render: v => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
    {
      key: 'odtId',
      label: 'ODT',
      render: v => v
        ? <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>#{v}</span>
        : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Sin ODT</span>,
    },
  ]

  if (canWriteTaller || canDeleteTaller) {
    cols.push({
      key: '_acc',
      label: '',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {canWriteTaller && (
            <button onClick={(e) => { e.stopPropagation(); setEditing(r) }} style={{ background: 'transparent', border: 'none', color: 'var(--green-700)', cursor: 'pointer', fontSize: 12 }}>Editar</button>
          )}
          {canDeleteTaller && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                if (await confirmDialog({ title: 'Confirmar', detail: 'Confirmar eliminacion permanente?' })) {
                  delMut.mutate(r.id, { onError: err => toast.error(getErrorMessage(err)) })
                }
              }}
              style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer', fontSize: 12 }}
            >Borrar</button>
          )}
        </div>
      ),
    })
  }

  const exportar = () => {
    const exportParams = { ...params }
    delete exportParams.page
    delete exportParams.limit
    downloadFromBackend('/bitacora-taller/export', `bitacora_actividades_${todayInputDate()}.csv`, exportParams)
      .catch(err => toast.error(getErrorMessage(err)))
  }

  const saveModal = (form) => {
    const payload = {
      usuario: form.usuario,
      fecha: form.fecha,
      texto: form.texto,
      odtId: form.odtId ? Number(form.odtId) : undefined,
    }
    const mut = editing ? updateMut : createMut
    const dataPayload = editing ? { id: editing.id, data: payload } : payload
    mut.mutate(dataPayload, {
      onSuccess: () => { setCreating(false); setEditing(null) },
      onError: err => toast.error(getErrorMessage(err)),
    })
  }

  return (
    <main className="page page-wide">
      <PageHeader
        title="Bitacora Taller"
        subtitle={`${data.total} entradas`}
        breadcrumb={['Inicio', 'Taller', 'Bitacora']}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" size="sm" icon="download" onClick={exportar}>Exportar CSV</Btn>
            {canWriteTaller && <Btn variant="primary" size="sm" icon="plus" onClick={() => setCreating(true)}>Nueva entrada</Btn>}
          </div>
        }
      />
      <div className="kpi-strip">
        <KpiCard label="Entradas totales" value={data.total} icon="book" />
        <KpiCard label="En pagina" value={data.items.length} icon="list" sublabel={`Pagina ${data.page || page}`} />
      </div>

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          <FormField label="Desde"><Input type="date" value={desde} onChange={setFilter(setDesde)} /></FormField>
          <FormField label="Hasta"><Input type="date" value={hasta} onChange={setFilter(setHasta)} /></FormField>
          <FormField label="Operario"><Select value={operario} onChange={setFilter(setOperario)} options={operarioOptions} /></FormField>
          <FormField label="Buscar"><Input value={search} onChange={setFilter(setSearch)} placeholder="Texto, operario o reporta" /></FormField>
        </div>
        {isError && <div style={{ padding: 12, color: 'var(--red)', fontSize: 12 }}>{getErrorMessage(error)}</div>}
        {isLoading
          ? <div style={{ padding: 48, textAlign: 'center' }}>Cargando...</div>
          : <Table columns={cols} rows={data.items} emptyMessage="Sin bitacora" keyboard ariaLabel="Bitacora de taller" getRowKey={row => row.id} />
        }
        <Pager
          page={data.page || page}
          pages={data.pages || Math.max(1, Math.ceil((data.total || 0) / (data.limit || 20)))}
          total={data.total || 0}
          limit={data.limit || 20}
          shown={data.items.length}
          onChange={setPage}
          disabled={isLoading}
        />
      </div>

      {(creating || editing) && (
        <BitacoraModal
          initial={editing || {}}
          operarioOptions={modalOperarioOptions}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSave={saveModal}
          saving={createMut.isPending || updateMut.isPending}
        />
      )}
    </main>
  )
}

function BitacoraModal({ initial, operarioOptions, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    odtId: initial.odtId || '',
    usuario: initial.usuario || '',
    texto: initial.texto || '',
    fecha: dateInputValue(initial.fechaReporte || initial.fecha),
  })
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, padding: 20, width: 'min(560px, 100%)' }}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>{initial.id ? 'Editar bitacora' : 'Nueva entrada bitacora'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <FormField label="Operario" required>
            <Select value={form.usuario} onChange={v => set('usuario', v)} options={withCurrentOption(operarioOptions, form.usuario)} />
          </FormField>
          <FormField label="Fecha" required>
            <Input type="date" value={form.fecha} onChange={v => set('fecha', v)} />
          </FormField>
          <FormField label="ODT ID" hint="Opcional para bitacora diaria libre">
            <Input type="number" value={form.odtId} onChange={v => set('odtId', v)} disabled={!!initial.id} />
          </FormField>
        </div>
        <FormField label="Describa actividades realizadas" required>
          <Textarea value={form.texto} onChange={v => set('texto', v)} rows={6} />
        </FormField>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancelar</Btn>
          <Btn variant="primary" size="sm" onClick={() => onSave(form)} disabled={saving || !form.usuario || !form.fecha || !form.texto}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
