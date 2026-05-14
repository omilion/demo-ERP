import { useState, useEffect, useRef } from 'react'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Icon } from '../../components/shared'
import { useProveedores, useProveedor, useCreatePagoProveedor, useUpdatePagoProveedor, useDeletePagoProveedor } from '../../api/proveedores'

const fmt = n => n ? `${n}%` : '—'
const fmtPeso = n => '$' + (n || 0).toLocaleString('es-CL')
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-CL') : '—'

const ESTADO_TONE = { Pagado: 'green', Pendiente: 'amber', Vencido: 'red', 'N/C': 'neutral' }

// ── PagoForm inline ────────────────────────────────────────────────────────────
function PagoForm({ proveedorId, onClose }) {
  const [form, setForm] = useState({ documento: '', nDoc: '', fechaDoc: '', fechaVencimiento: '', fechaPago: '', estado: 'Pendiente', total: '', bodega: '', obs: '' })
  const create = useCreatePagoProveedor()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.total) return
    create.mutate({ proveedorId, ...form }, { onSuccess: onClose })
  }

  return (
    <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 14, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 10 }}>Nuevo pago</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
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
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>Estado</div>
        <select value={form.estado} onChange={e => set('estado', e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', width: '100%' }}>
          {['Pendiente', 'Pagado', 'Vencido', 'N/C'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>Observaciones</div>
        <input value={form.obs} onChange={e => set('obs', e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
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

// ── TabDatos ────────────────────────────────────────────────────────────────────
function TabDatos({ p }) {
  return (
    <>
      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
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
        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{l}</span>
          <span style={{ fontSize: 12 }}>{v}</span>
        </div>
      ))}

      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginTop: 14, marginBottom: 8 }}>Márgenes</div>
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
    </>
  )
}

// ── TabPagos ────────────────────────────────────────────────────────────────────
function TabPagos({ proveedorId, pagos = [] }) {
  const [showForm, setShowForm] = useState(false)
  const deletePago = useDeletePagoProveedor()

  const total = pagos.reduce((s, p) => s + (p.total || 0), 0)
  const pendientes = pagos.filter(p => p.estado === 'Pendiente').length
  const vencidos   = pagos.filter(p => p.estado === 'Vencido').length

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Total', value: fmtPeso(total), tone: null },
          { label: 'Pendientes', value: pendientes, tone: pendientes > 0 ? null : null },
          { label: 'Vencidos', value: vencidos, tone: vencidos > 0 ? 'red' : null },
        ].map(({ label, value, tone }, i) => (
          <div key={i} style={{ background: tone === 'red' ? '#fef2f2' : 'var(--bg)', borderRadius: 8, padding: '10px 12px', border: `1px solid ${tone === 'red' ? 'var(--red)' : 'var(--border)'}`, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: tone === 'red' ? 'var(--red)' : 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>{label}</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 13, color: tone === 'red' ? 'var(--red)' : 'var(--text-1)' }}>{value}</div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setShowForm(s => !s)}
        style={{ width: '100%', padding: '7px 14px', marginBottom: 12, background: showForm ? 'var(--bg)' : 'var(--green-600)', color: showForm ? 'var(--text-2)' : '#fff', border: showForm ? '1px solid var(--border)' : 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <Icon name={showForm ? 'x' : 'plus'} size={14} />
        {showForm ? 'Cancelar' : 'Registrar pago'}
      </button>

      {showForm && <PagoForm proveedorId={proveedorId} onClose={() => setShowForm(false)} />}

      {pagos.length === 0 && !showForm ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Sin pagos registrados</div>
      ) : (
        pagos.map(p => (
          <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px', marginBottom: 8 }}>
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
              <button onClick={() => deletePago.mutate({ proveedorId, pagoId: p.id })} style={{ fontSize: 11, color: 'var(--red)', cursor: 'pointer', background: 'none', border: 'none', padding: '0 2px' }}>Eliminar</button>
            </div>
          </div>
        ))
      )}
    </>
  )
}

// ── ViewProveedorPanel ──────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children, badge }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', fontSize: 13, fontWeight: active ? 700 : 400,
      color: active ? 'var(--green-700)' : 'var(--text-2)',
      borderBottom: active ? '2px solid var(--green-600)' : '2px solid transparent',
      background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {children}
      {badge != null && badge > 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, background: active ? 'var(--green-600)' : 'var(--border)', color: active ? '#fff' : 'var(--text-3)', borderRadius: 99, padding: '1px 6px' }}>{badge}</span>
      )}
    </button>
  )
}

function ViewProveedorPanel({ proveedor, onClose }) {
  const [tab, setTab] = useState('datos')
  const { data: full, isLoading } = useProveedor(proveedor.id)
  const p = full || proveedor
  const pagos = full?.pagos ?? []

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 420, height: '100%', background: '#fff', boxShadow: '-8px 0 32px oklch(0 0 0 / 0.12)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{p.nombre}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace", marginTop: 2 }}>{p.rut}</div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-3)', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <TabBtn active={tab === 'datos'}  onClick={() => setTab('datos')}>Datos</TabBtn>
          <TabBtn active={tab === 'pagos'}  onClick={() => setTab('pagos')} badge={pagos.length}>Pagos</TabBtn>
        </div>

        <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>
          {isLoading && !full && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando…</div>
          )}
          {tab === 'datos' && <TabDatos p={p} />}
          {tab === 'pagos' && <TabPagos proveedorId={p.id} pagos={pagos} />}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────────
export default function ProveedoresPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    clearTimeout(ref.current)
    ref.current = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(ref.current)
  }, [search])

  const params = {}
  if (debounced) params.search = debounced

  const { data: result = { items: [], total: 0 }, isLoading } = useProveedores(params)
  const proveedores = result.items ?? []
  const total = result.total ?? 0

  const cols = [
    {
      key: 'codigoProveedor', label: 'Código',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--green-700)', fontWeight: 600 }}>{v}</span> : '—'
    },
    {
      key: 'nombre', label: 'Proveedor', wrap: true,
      render: (v, row) => (
        <div style={{ maxWidth: 220 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{v}</div>
          {row.razonSocial && row.razonSocial !== v && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{row.razonSocial}</div>}
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{row.rut}</div>
        </div>
      )
    },
    { key: 'giro', label: 'Giro', render: v => <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{v || '—'}</span> },
    { key: 'email', label: 'Email', render: v => v ? <a href={`mailto:${v}`} style={{ fontSize: 12, color: 'var(--green-700)' }}>{v}</a> : '—' },
    { key: 'telefono', label: 'Teléfono', render: v => <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace" }}>{v || '—'}</span> },
    {
      key: 'porcVentaSala', label: 'Mg. Sala',
      render: v => <Badge tone={v >= 50 ? 'green' : v >= 30 ? 'amber' : 'gray'}>{fmt(v)}</Badge>
    },
    {
      key: 'porcMarco', label: 'Mg. Marco',
      render: v => <Badge tone={v >= 40 ? 'green' : v >= 20 ? 'amber' : 'gray'}>{fmt(v)}</Badge>
    },
    {
      key: 'porcLicitacion', label: 'Mg. Lic.',
      render: v => <Badge tone={v >= 30 ? 'green' : v >= 15 ? 'amber' : 'gray'}>{fmt(v)}</Badge>
    },
    { key: 'region', label: 'Región', render: v => <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{v || '—'}</span> },
  ]

  const conEmail  = proveedores.filter(p => p.email).length
  const conMargen = proveedores.filter(p => p.porcVentaSala > 0 || p.porcMarco > 0).length
  const avgMgSala = proveedores.length > 0
    ? Math.round(proveedores.reduce((s, p) => s + (p.porcVentaSala || 0), 0) / proveedores.length)
    : 0

  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Proveedores"
        subtitle={`${total.toLocaleString('es-CL')} proveedores registrados`}
        breadcrumb={['Inicio', 'Catálogo', 'Proveedores']}
        actions={<Btn variant="secondary" icon="download" size="sm">Exportar</Btn>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total proveedores"       value={total.toLocaleString('es-CL')} icon="truck"      sublabel="En catálogo" />
        <KpiCard label="Con email"               value={conEmail}                       icon="mail"       sublabel="Contacto disponible" />
        <KpiCard label="Con margen configurado"  value={conMargen}                      icon="percent"    sublabel="Markup definido" />
        <KpiCard label="Mg. promedio sala"       value={avgMgSala + '%'}                icon="trendingUp" tone="neutral" sublabel="Margen venta directa" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            {total.toLocaleString('es-CL')} proveedores
          </span>
          <SearchBar placeholder="Nombre, RUT, razón social..." value={search} onChange={setSearch} style={{ width: 280 }} />
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={proveedores} emptyMessage="Sin proveedores" onRowClick={row => setSelected(row)} />
        }
        {total > (result.limit ?? 100) && (
          <div style={{ padding: '10px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
            Mostrando {result.limit} de {total.toLocaleString('es-CL')}. Usa el buscador para filtrar.
          </div>
        )}
      </div>

      {selected && <ViewProveedorPanel proveedor={selected} onClose={() => setSelected(null)} />}
    </main>
  )
}
