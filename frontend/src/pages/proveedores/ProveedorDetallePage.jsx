import { toast, confirmDialog } from '../../store/notif'
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Icon } from '../../components/shared'
import { useProveedor, useProveedorProductos, useCreatePagoProveedor, useDeletePagoProveedor, useDeleteProveedor } from '../../api/proveedores'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import ProveedorFormModal from './ProveedorFormModal'

const fmt = n => n ? `${n}%` : '—'
const fmtPeso = n => '$' + (n || 0).toLocaleString('es-CL')
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-CL') : '—'

const ESTADO_TONE = { Pagado: 'green', Pendiente: 'amber', Vencido: 'red', 'N/C': 'neutral' }
const ESTADO_INV_TONE = { Inventariado: 'green', Transitorio: 'amber', Externo: 'neutral' }

// ── PagoForm inline ────────────────────────────────────────────────────────────
function PagoForm({ proveedorId, onClose, canWrite }) {
  const [form, setForm] = useState({ documento: '', nDoc: '', fechaDoc: '', fechaVencimiento: '', fechaPago: '', estado: 'Pendiente', total: '', bodega: '', obs: '' })
  const create = useCreatePagoProveedor()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!canWrite) return
    if (!form.documento.trim()) return toast.warning('Documento requerido')
    if (!form.nDoc.trim()) return toast.warning('N Doc requerido')
    if (!form.fechaDoc) return toast.warning('Fecha Doc requerida')
    if (!form.total) return toast.warning('Total requerido')
    create.mutate({ proveedorId, ...form }, { onSuccess: onClose })
  }

  return (
    <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 14, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 10 }}>Nuevo pago</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        {[
          ['Documento', 'documento', 'text', 'Factura / Boleta'],
          ['N° Doc',    'nDoc',      'text', '001234'],
          ['Fecha Doc', 'fechaDoc',  'date', ''],
          ['Vencimiento','fechaVencimiento','date',''],
          ['Fecha Pago','fechaPago', 'date', ''],
          ['Total',     'total',     'number','0'],
        ].map(([label, key, type, ph]) => (
          <div key={key}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>{label}</div>
            <input
              type={type}
              value={form[key]}
              onChange={e => set(key, e.target.value)}
              placeholder={ph}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>Estado</div>
          <select value={form.estado} onChange={e => set('estado', e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', width: '100%' }}>
            {['Pendiente', 'Pagado', 'Vencido', 'N/C'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>Observaciones</div>
          <input value={form.obs} onChange={e => set('obs', e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} disabled={create.isPending} style={{ padding: '7px 14px', background: 'var(--green-600)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {create.isPending ? 'Guardando…' : 'Guardar pago'}
        </button>
        <button onClick={onClose} style={{ padding: '7px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: 'var(--text-2)' }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Ficha datos (columna izquierda) ────────────────────────────────────────────
function FichaDatos({ p }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', padding: '16px 18px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 20, color: 'var(--green-700)' }}>{(p.nombre || '?')[0]}</span>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{p.nombre}</div>
          {p.razonSocial && p.razonSocial !== p.nombre && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{p.razonSocial}</div>}
          {p.giro && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{p.giro}</div>}
        </div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 8 }}>Identificación</div>
      {[['RUT', p.rut], ['Código', p.codigoProveedor || '—'], ['Región', p.region || '—'], ['Comuna', p.comuna || '—']].map(([l, v]) => (
        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{l}</span>
          <span style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", fontWeight: 500 }}>{v}</span>
        </div>
      ))}

      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginTop: 14, marginBottom: 8 }}>Contacto</div>
      {[['Email', p.email || '—'], ['Teléfono', p.telefono || '—'], ['Dirección', p.direccion || '—']].map(([l, v]) => (
        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>{l}</span>
          <span style={{ fontSize: 12, overflowWrap: 'anywhere', textAlign: 'right' }}>{v}</span>
        </div>
      ))}

      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginTop: 14, marginBottom: 8 }}>Márgenes por canal</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          ['Mg. Sala',  p.porcVentaSala,  p.porcVentaSala >= 50 ? 'green' : p.porcVentaSala >= 30 ? 'amber' : 'gray'],
          ['Mg. Marco', p.porcMarco,      p.porcMarco >= 40 ? 'green' : p.porcMarco >= 20 ? 'amber' : 'gray'],
          ['Mg. Lic.',  p.porcLicitacion, p.porcLicitacion >= 30 ? 'green' : p.porcLicitacion >= 15 ? 'amber' : 'gray'],
        ].map(([label, val, tone]) => (
          <div key={label} style={{ textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '10px 8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
            <Badge tone={tone}>{fmt(val)}</Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab Productos ───────────────────────────────────────────────────────────────
function TabProductos({ proveedorId }) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const ref = useRef(null)

  useEffect(() => {
    clearTimeout(ref.current)
    ref.current = setTimeout(() => { setDebounced(search); setPage(1) }, 350)
    return () => clearTimeout(ref.current)
  }, [search])

  const params = { page }
  if (debounced) params.search = debounced
  const { data = { items: [], total: 0, limit: 50 }, isLoading, isFetching } = useProveedorProductos(proveedorId, params)
  const items = data.items ?? []
  const total = data.total ?? 0
  const limit = data.limit ?? 50
  const pages = Math.max(Math.ceil(total / limit), 1)

  const cols = [
    {
      key: 'fotoUrl', label: '',
      render: v => v
        ? <img src={v} alt="" loading="lazy" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
        : <div style={{ width: 34, height: 34, borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}><Icon name="box" size={14} /></div>
    },
    {
      key: 'codigoInterno', label: 'Código',
      render: v => <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: 'var(--green-700)', fontWeight: 600 }}>{v}</span>
    },
    { key: 'nombre', label: 'Producto', wrap: true, render: v => <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span> },
    { key: 'categoria', label: 'Categoría', render: v => <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{v || '—'}</span> },
    { key: 'precioLista', label: 'P. Lista', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12 }}>{fmtPeso(v)}</span> },
    { key: 'precioMarco', label: 'P. Marco', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: 'var(--text-3)' }}>{v ? fmtPeso(v) : '—'}</span> },
    {
      key: 'stock', label: 'Stock', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 600, color: v > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>{v}</span>
    },
    { key: 'estadoInventario', label: 'Estado', render: v => v ? <Badge tone={ESTADO_INV_TONE[v] ?? 'gray'}>{v}</Badge> : '—' },
  ]

  return (
    <>
      <Table
        columns={cols}
        rows={isLoading ? [] : items}
        emptyMessage={debounced ? 'Sin resultados para la búsqueda' : 'Este proveedor no tiene productos asociados'}
        ariaLabel="Productos del proveedor"
        getRowKey={row => row.id}
        toolbarExtra={<>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{total.toLocaleString('es-CL')} productos asociados</span>
          <SearchBar placeholder="Nombre o código..." value={search} onChange={setSearch} style={{ width: 260, height: 28 }} />
        </>}
      />
      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, padding: '12px 0 2px' }}>
          <Btn variant="secondary" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage(p => p - 1)}>Anterior</Btn>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Página {page} de {pages}</span>
          <Btn variant="secondary" size="sm" disabled={page >= pages || isFetching} onClick={() => setPage(p => p + 1)}>Siguiente</Btn>
        </div>
      )}
    </>
  )
}

// ── Tab Pagos ───────────────────────────────────────────────────────────────────
function TabPagos({ proveedorId, pagos = [], canWrite, canDelete }) {
  const [showForm, setShowForm] = useState(false)
  const deletePago = useDeletePagoProveedor()
  const confirmDeletePago = async (p) => {
    const doc = `${p.documento || 'Documento'} ${p.nDoc ? `#${p.nDoc}` : ''}`.trim()
    if (!await confirmDialog({ title: 'Confirmar', detail: `Eliminar/anular pago ${doc} por ${fmtPeso(p.total)}?`, tone: 'danger' })) return
    deletePago.mutate({ proveedorId, pagoId: p.id })
  }

  return (
    <>
      {canWrite && (
        <button
          onClick={() => setShowForm(s => !s)}
          style={{ padding: '7px 14px', marginBottom: 12, background: showForm ? 'var(--bg)' : 'var(--green-600)', color: showForm ? 'var(--text-2)' : '#fff', border: showForm ? '1px solid var(--border)' : 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name={showForm ? 'x' : 'plus'} size={14} />
          {showForm ? 'Cancelar' : 'Registrar pago'}
        </button>
      )}

      {showForm && canWrite && <PagoForm proveedorId={proveedorId} onClose={() => setShowForm(false)} canWrite={canWrite} />}

      {pagos.length === 0 && !showForm ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Sin pagos registrados</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
          {pagos.map(p => (
            <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                <div>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 700, color: 'var(--green-700)' }}>
                    {p.documento || 'Sin tipo'} {p.nDoc ? `#${p.nDoc}` : ''}
                  </span>
                  {p.bodega && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>{p.bodega}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 13 }}>{fmtPeso(p.total)}</span>
                  <Badge tone={ESTADO_TONE[p.estado] ?? 'gray'} style={{ fontSize: 10 }}>{p.estado}</Badge>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
                {p.fechaDoc && <span>Doc: {fmtDate(p.fechaDoc)}</span>}
                {p.fechaVencimiento && <span>Vence: {fmtDate(p.fechaVencimiento)}</span>}
                {p.fechaPago && <span>Pago: {fmtDate(p.fechaPago)}</span>}
              </div>
              {p.obs && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>{p.obs}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, color: 'var(--text-3)' }}>
                <span>{p.usuario || '—'}</span>
                {canDelete && <button onClick={() => confirmDeletePago(p)} style={{ fontSize: 11, color: 'var(--red)', cursor: 'pointer', background: 'none', border: 'none', padding: '0 2px' }}>Eliminar</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── TabBtn ──────────────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children, badge }) {
  return (
    <button onClick={onClick} style={{
      padding: '9px 16px', fontSize: 13, fontWeight: active ? 700 : 400,
      color: active ? 'var(--green-700)' : 'var(--text-2)',
      borderBottom: active ? '2px solid var(--green-600)' : '2px solid transparent',
      background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {children}
      {badge != null && badge > 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, background: active ? 'var(--green-600)' : 'var(--border)', color: active ? '#fff' : 'var(--text-3)', borderRadius: 99, padding: '1px 6px' }}>{badge.toLocaleString('es-CL')}</span>
      )}
    </button>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────────
export default function ProveedorDetallePage() {
  const { id } = useParams()
  const proveedorId = parseInt(id, 10)
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const canWrite = can(user, 'proveedores', 'write')
  const canDelete = can(user, 'proveedores', 'delete')
  const [tab, setTab] = useState('productos')
  const [editing, setEditing] = useState(false)

  const { data: p, isLoading } = useProveedor(proveedorId)
  const { data: prodData } = useProveedorProductos(proveedorId, { page: 1 })
  const deleteProv = useDeleteProveedor()

  if (isLoading) return <main className="page page-wide" style={{ padding: 24 }}>Cargando…</main>
  if (!p) return <main className="page page-wide" style={{ padding: 24 }}>Proveedor no encontrado</main>

  const pagos = p.pagos ?? []
  const totalProductos = prodData?.total ?? 0
  const totalPagos = pagos.reduce((s, x) => s + (x.total || 0), 0)
  const pendientes = pagos.filter(x => x.estado === 'Pendiente').length
  const vencidos = pagos.filter(x => x.estado === 'Vencido').length

  const handleDelete = async () => {
    if (!canDelete) return
    if (!await confirmDialog({ title: 'Confirmar', detail: `¿Eliminar proveedor "${p.nombre}"? (soft delete)`, tone: 'danger' })) return
    deleteProv.mutate(p.id, { onSuccess: () => navigate('/proveedores') })
  }

  return (
    <main className="page page-wide">
      <PageHeader
        title={p.nombre}
        subtitle={`${p.rut}${p.codigoProveedor ? ` · Código ${p.codigoProveedor}` : ''}`}
        breadcrumb={['Inicio', 'Catálogo', 'Proveedores', p.nombre]}
        actions={<div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" size="sm" icon="chevronLeft" onClick={() => navigate('/proveedores')}>Volver</Btn>
          {canWrite && <Btn variant="secondary" size="sm" icon="edit" onClick={() => setEditing(true)}>Editar</Btn>}
          {canDelete && <Btn variant="danger" size="sm" icon="trash" onClick={handleDelete} disabled={deleteProv.isPending}>Eliminar</Btn>}
        </div>}
      />

      <div className="kpi-strip">
        <KpiCard label="Productos asociados" value={totalProductos.toLocaleString('es-CL')} icon="package" sublabel="En catálogo" />
        <KpiCard label="Total pagos" value={fmtPeso(totalPagos)} icon="dollarSign" sublabel={`${pagos.length} documentos`} />
        <KpiCard label="Pendientes" value={pendientes} icon="clock" tone={pendientes > 0 ? 'amber' : 'neutral'} sublabel="Por pagar" />
        <KpiCard label="Vencidos" value={vencidos} icon="alertTriangle" tone={vencidos > 0 ? 'red' : 'neutral'} sublabel="Requieren gestión" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 340px) 1fr', gap: 16, alignItems: 'start' }}>
        <FichaDatos p={p} />

        <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            <TabBtn active={tab === 'productos'} onClick={() => setTab('productos')} badge={totalProductos}>Productos</TabBtn>
            <TabBtn active={tab === 'pagos'} onClick={() => setTab('pagos')} badge={pagos.length}>Pagos</TabBtn>
          </div>
          <div style={{ padding: '14px 16px' }}>
            {tab === 'productos' && <TabProductos proveedorId={proveedorId} />}
            {tab === 'pagos' && <TabPagos proveedorId={proveedorId} pagos={pagos} canWrite={canWrite} canDelete={canDelete} />}
          </div>
        </div>
      </div>

      {editing && <ProveedorFormModal proveedor={p} onClose={() => setEditing(false)} />}
    </main>
  )
}
