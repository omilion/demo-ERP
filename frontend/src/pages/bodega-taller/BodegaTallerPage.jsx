import { toast, confirmDialog } from '../../store/notif'
import { useEffect, useRef, useState } from 'react'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table, Tabs, FilterSelect } from '../../components/shared'
import { FormField, Input, Select } from '../../components/forms'
import { useBodegaTaller, useBodegaTallerLotes, useCreateBodegaTaller, useCreateBodegaTallerLote, useDeleteBodegaTaller, useUpdateBodegaTaller } from '../../api/bodegaTaller'
import { useCategoriasBodegaTaller } from '../../api/categoriasBodegaTaller'
import { useProveedores } from '../../api/proveedores'
import { useSucursales } from '../../api/locations'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import BotonExportar from '../../components/BotonExportar'

const TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'true', label: 'Stock crítico' },
]

const UNIT_OPTIONS = ['Unidad', 'Unidades', 'Mts', 'Mts2', 'Litros', 'Kg', 'Rollos', 'Cajas']

const fmt = n => '$' + Number(n || 0).toLocaleString('es-CL')
const mono = value => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-2)' }}>{value || '-'}</span>

export default function BodegaTallerPage() {
  const user = useAuthStore(s => s.user)
  const canWrite = can(user, 'taller', 'write')
  const canDelete = can(user, 'taller', 'delete')
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [sucursalId, setSucursalId] = useState('')
  const [codigoInterno, setCodigoInterno] = useState('')
  const [codigoBarra, setCodigoBarra] = useState('')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [materialLotes, setMaterialLotes] = useState(null)
  const debounceRef = useRef(null)
  const createMut = useCreateBodegaTaller()
  const updateMut = useUpdateBodegaTaller()
  const deleteMut = useDeleteBodegaTaller()
  const { data: categorias = [] } = useCategoriasBodegaTaller()
  const { data: proveedoresResult = { items: [] } } = useProveedores({ page: '1' })
  const { data: sucursales = [] } = useSucursales()
  const proveedores = proveedoresResult.items || []
  const subcategorias = categorias.find(c => String(c.id) === categoriaId)?.subcategorias ?? []

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const params = { page: String(page) }
  if (debouncedSearch) params.search = debouncedSearch
  if (tab === 'true') params.stockCritico = 'true'
  if (categoriaId) params.categoriaId = categoriaId
  if (subcategoriaId) params.subcategoriaId = subcategoriaId
  if (proveedor) params.proveedor = proveedor
  if (sucursalId) params.sucursalId = sucursalId
  if (codigoInterno) params.codigoInterno = codigoInterno
  if (codigoBarra) params.codigoBarra = codigoBarra

  const { data: result = { items: [], total: 0, limit: 200, pages: 1 }, isLoading } = useBodegaTaller(params)
  const items = result.items ?? []
  const total = result.total ?? 0
  const pages = result.pages ?? Math.max(1, Math.ceil(total / (result.limit || 200)))
  const criticos = items.filter(i => Number(i.stock || 0) <= Number(i.stockCritico || 0)).length

  const clearFilters = () => {
    setSearch('')
    setCategoriaId('')
    setSubcategoriaId('')
    setProveedor('')
    setSucursalId('')
    setCodigoInterno('')
    setCodigoBarra('')
    setTab('all')
    setPage(1)
  }

  const exportParams = { ...params }
  delete exportParams.page

  const handleDelete = async row => {
    if (!await confirmDialog({ title: 'Confirmar', detail: `Eliminar material ${row.codigoInterno || row.nombre}?`, tone: 'danger' })) return
    deleteMut.mutate(row.id, {
      onError: e => toast.error(e.response?.data?.error || 'No se pudo eliminar el material'),
    })
  }

  const cols = [
    { key: 'categoriaNombre', label: 'Categoría', render: v => v ? <Badge tone="gray">{v}</Badge> : '-' },
    { key: 'codigoBarra', label: 'Cod Barra', render: v => mono(v) },
    { key: 'codigoInterno', label: 'Cod Interno', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--green-700)' }}>{v}</span> },
    { key: 'nombre', label: 'Nombre', wrap: true, render: v => <span style={{ fontSize: 13 }}>{v}</span> },
    { key: '_especificacion', label: 'Especificación espuma', render: (_, row) => {
      const parts = [row.densidadKgM3 != null && `D${row.densidadKgM3}`, row.espesorMm != null && `${row.espesorMm} mm`, row.formato].filter(Boolean)
      return parts.length ? <Badge tone="blue">{parts.join(' · ')}</Badge> : '-'
    } },
    { key: 'proveedorNombre', label: 'Proveedor', render: v => v || '-' },
    { key: 'stock', label: 'Stock', align: 'right', render: (v, row) => {
      const tone = Number(v || 0) <= 0 ? 'red' : Number(v || 0) <= Number(row.stockCritico || 0) ? 'amber' : 'green'
      return <Badge tone={tone}><span style={{ fontFamily: "'DM Mono', monospace" }}>{Number(v || 0).toFixed(2)}</span></Badge>
    } },
    { key: 'stockCritico', label: 'Stock crítico', align: 'right', render: v => mono(Number(v || 0).toFixed(2)) },
    { key: 'subcategoriaNombre', label: 'Subcategoría', render: v => v || '-' },
    { key: 'unidadMedida', label: 'Unid. Medida', render: v => v ? <Badge tone="neutral">{v}</Badge> : '-' },
    { key: 'sucursalNombre', label: 'Sucursal', render: v => v || '-' },
    { key: 'precio', label: 'Precio', align: 'right', render: v => mono(fmt(v)) },
    { key: '_edit', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4 }}>
        {canWrite && <button onClick={(e) => { e.stopPropagation(); setEditing(row) }} style={actionBtn}>Editar</button>}
        {canWrite && <button onClick={(e) => { e.stopPropagation(); setMaterialLotes(row) }} style={actionBtn}>Lotes</button>}
      </div>
    ) },
  ]

  const hasActiveFilters = Boolean(search || categoriaId || subcategoriaId || sucursalId || tab !== 'all')

  const resetAllFilters = () => {
    setSearch('')
    setCategoriaId('')
    setSubcategoriaId('')
    setSucursalId('')
    setTab('all')
    setPage(1)
  }

  const categoriaOptions = [
    { value: '', label: 'Todas' },
    ...categorias.map(c => ({ value: String(c.id), label: c.nombre })),
  ]

  const subcategoriaOptions = [
    { value: '', label: 'Todas' },
    ...subcategorias.map(sc => ({ value: String(sc.id), label: sc.nombre })),
  ]

  const sucursalOptions = [
    { value: '', label: 'Todas' },
    ...sucursales.map(s => ({ value: String(s.id), label: s.nombre })),
  ]

  const toolbarExtra = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', width: '100%', padding: '2px 0' }}>
      <FilterSelect
        value={categoriaId}
        onChange={v => { setCategoriaId(v); setSubcategoriaId(''); setPage(1) }}
        options={categoriaOptions}
        placeholder="Categorías"
        active={Boolean(categoriaId)}
        minMenuWidth={220}
      />
      <FilterSelect
        value={subcategoriaId}
        onChange={v => { setSubcategoriaId(v); setPage(1) }}
        options={subcategoriaOptions}
        placeholder="Subcategorías"
        active={Boolean(subcategoriaId)}
        minMenuWidth={220}
      />
      <FilterSelect
        value={sucursalId}
        onChange={v => { setSucursalId(v); setPage(1) }}
        options={sucursalOptions}
        placeholder="Sucursales"
        active={Boolean(sucursalId)}
        minMenuWidth={200}
      />
      {hasActiveFilters && (
        <button
          type="button"
          onClick={resetAllFilters}
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 6,
            border: '1px solid var(--amber-300, #fcd34d)',
            background: 'var(--amber-50, #fffbeb)',
            color: 'var(--amber-900, #78350f)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'background 0.15s',
          }}
        >
          Limpiar filtros
        </button>
      )}
      <div style={{ marginLeft: 'auto' }}>
        <SearchBar
          placeholder="Buscar código, nombre o proveedor..."
          value={search}
          onChange={setSearch}
          style={{ width: 280, height: 28 }}
        />
      </div>
    </div>
  )

  return (
    <main className="page page-wide">
      <PageHeader
        title="Bodega Taller"
        subtitle={`${total.toLocaleString('es-CL')} materiales de taller`}
        breadcrumb={['Inicio', 'Taller', 'Bodega']}
        actions={<>
          <BotonExportar
            url="/reportes/export/bodega-taller"
            nombre={`bodega_taller_${new Date().toISOString().slice(0, 10)}`}
            params={exportParams}
            label="Exportar"
          />
          {canWrite && <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => setCreating(true)}>Nuevo material</Btn>}
        </>}
      />
      <div className="kpi-strip">
        <KpiCard label="Total materiales" value={total} icon="box" sublabel="Catálogo taller" />
        <KpiCard label="En página" value={items.length} icon="list" sublabel={`Página ${page} de ${pages}`} />
        <KpiCard label="Stock crítico" value={criticos} icon="alertTriangle" tone="amber" sublabel="En esta vista" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1) }} />
        </div>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={pagerBtn(page <= 1)}>Anterior</button>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={pagerBtn(page >= pages)}>Siguiente</button>
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
          : <Table
              columns={cols}
              rows={items}
              emptyMessage="Sin materiales"
              onRowDoubleClick={canWrite ? row => setEditing(row) : undefined}
              autoFocus
              ariaLabel="Materiales de bodega taller"
              getRowKey={row => row.id}
              toolbarExtra={toolbarExtra}
            />
        }
      </div>

      {(editing || creating) && (
        <MaterialModal
          title={creating ? 'Nuevo material' : `Editar ${editing.codigoInterno}`}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSave={(data) => {
            const mut = creating ? createMut : updateMut
            const payload = creating ? data : { id: editing.id, data }
            mut.mutate(payload, {
              onSuccess: () => { setEditing(null); setCreating(false) },
              onError: e => toast.error(e.response?.data?.error || 'No se pudo guardar el material'),
            })
          }}
          initial={editing || {}}
          saving={createMut.isPending || updateMut.isPending}
          categorias={categorias}
          proveedores={proveedores}
          sucursales={sucursales}
        />
      )}
      {materialLotes && <LotesModal material={materialLotes} onClose={() => setMaterialLotes(null)} />}
    </main>
  )
}

function MaterialModal({ title, onClose, onSave, initial, saving, categorias = [], proveedores = [], sucursales = [] }) {
  const [form, setForm] = useState({
    codigoInterno: initial.codigoInterno || '',
    codigoBarra: initial.codigoBarra || '',
    nombre: initial.nombre || '',
    unidadMedida: initial.unidadMedida || 'Unidad',
    categoriaId: initial.categoriaId != null ? String(initial.categoriaId) : '',
    subcategoriaId: initial.subcategoriaId != null ? String(initial.subcategoriaId) : '',
    proveedorId: initial.proveedorId != null ? String(initial.proveedorId) : '',
    sucursalId: initial.sucursalId != null ? String(initial.sucursalId) : '',
    stock: initial.stock ?? 0,
    stockCritico: initial.stockCritico ?? 0,
    precio: initial.precio ?? 0,
    densidadKgM3: initial.densidadKgM3 ?? '',
    espesorMm: initial.espesorMm ?? '',
    formato: initial.formato || '',
  })
  const subcategorias = categorias.find(c => String(c.id) === String(form.categoriaId))?.subcategorias ?? []
  const unitOptions = [...new Set([...UNIT_OPTIONS, form.unidadMedida].filter(Boolean))]
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 680, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>{title}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Código interno" required><Input value={form.codigoInterno} onChange={v => setForm(f => ({ ...f, codigoInterno: v }))} /></FormField>
          <FormField label="Código barra"><Input value={form.codigoBarra} onChange={v => setForm(f => ({ ...f, codigoBarra: v }))} /></FormField>
          <FormField label="Nombre" required><Input value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} /></FormField>
          <FormField label="Unidad medida">
            <Select value={form.unidadMedida} onChange={v => setForm(f => ({ ...f, unidadMedida: v }))} options={unitOptions.map(u => ({ value: u, label: u }))} />
          </FormField>
          <FormField label="Categoría">
            <Select value={form.categoriaId} onChange={v => setForm(f => ({ ...f, categoriaId: v, subcategoriaId: '' }))} options={[{ value: '', label: 'Sin categoría' }, ...categorias.map(c => ({ value: String(c.id), label: c.nombre }))]} />
          </FormField>
          <FormField label="Subcategoría">
            <Select value={form.subcategoriaId} onChange={v => setForm(f => ({ ...f, subcategoriaId: v }))} disabled={!form.categoriaId || !subcategorias.length} options={[{ value: '', label: 'Sin subcategoría' }, ...subcategorias.map(s => ({ value: String(s.id), label: s.nombre }))]} />
          </FormField>
          <FormField label="Proveedor">
            <Select value={form.proveedorId} onChange={v => setForm(f => ({ ...f, proveedorId: v }))} options={[{ value: '', label: 'Sin proveedor' }, ...proveedores.map(p => ({ value: String(p.id), label: p.nombre || p.razonSocial || `Proveedor #${p.id}` }))]} />
          </FormField>
          <FormField label="Sucursal">
            <Select value={form.sucursalId} onChange={v => setForm(f => ({ ...f, sucursalId: v }))} options={[{ value: '', label: 'Sin sucursal' }, ...sucursales.map(s => ({ value: String(s.id), label: s.nombre }))]} />
          </FormField>
          <FormField label="Stock"><Input type="number" value={form.stock} onChange={v => setForm(f => ({ ...f, stock: v }))} /></FormField>
          <FormField label="Stock crítico"><Input type="number" value={form.stockCritico} onChange={v => setForm(f => ({ ...f, stockCritico: v }))} /></FormField>
          <FormField label="Precio"><Input type="number" value={form.precio} onChange={v => setForm(f => ({ ...f, precio: v }))} /></FormField>
        </div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Especificación técnica de espuma</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <FormField label="Densidad (kg/mÂ³)"><Input type="number" min="0" value={form.densidadKgM3} onChange={v => setForm(f => ({ ...f, densidadKgM3: v }))} /></FormField>
            <FormField label="Espesor (mm)"><Input type="number" min="0" value={form.espesorMm} onChange={v => setForm(f => ({ ...f, espesorMm: v }))} /></FormField>
            <FormField label="Formato"><Input placeholder="Ej. plancha 2 x 1 m" value={form.formato} onChange={v => setForm(f => ({ ...f, formato: v }))} /></FormField>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Al registrar densidad, la espuma se consumirá por lote aprobado en las órdenes de taller.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancelar</Btn>
          <Btn variant="primary" size="sm" onClick={() => onSave(form)} disabled={saving || !form.nombre || !form.codigoInterno}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

function LotesModal({ material, onClose }) {
  const { data = { items: [] }, isLoading } = useBodegaTallerLotes(material.id)
  const createLote = useCreateBodegaTallerLote()
  const lotes = data.items || []
  const puedeRegularizar = !isLoading && lotes.length === 0 && Number(material.stock || 0) > 0
  const [form, setForm] = useState({ codigo: '', cantidad: '', estadoCalidad: 'aprobado', observacion: '', regularizarExistente: false })
  const save = () => {
    createLote.mutate({ id: material.id, data: { ...form, regularizarExistente: form.regularizarExistente && puedeRegularizar, cantidad: Number(form.cantidad) } }, {
      onSuccess: () => setForm({ codigo: '', cantidad: '', estadoCalidad: 'aprobado', observacion: '', regularizarExistente: false }),
      onError: e => toast.error(e.response?.data?.error || 'No se pudo registrar el lote'),
    })
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 760, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{material.nombre}</div>
        <div style={{ color: 'var(--text-2)', fontSize: 12, margin: '4px 0 16px' }}>Lotes y control de calidad · Stock total: {Number(material.stock || 0).toFixed(2)}</div>
        {isLoading ? <div style={{ padding: 16, color: 'var(--text-3)' }}>Cargando lotes...</div> : (
          <Table columns={[
            { key: 'codigo', label: 'Lote' },
            { key: 'cantidadInicial', label: 'Ingreso', align: 'right', render: v => Number(v || 0).toFixed(2) },
            { key: 'cantidadDisponible', label: 'Disponible', align: 'right', render: v => Number(v || 0).toFixed(2) },
            { key: 'estadoCalidad', label: 'Calidad', render: v => <Badge tone={v === 'aprobado' ? 'green' : v === 'observado' ? 'amber' : 'red'}>{v}</Badge> },
            { key: 'observacion', label: 'Observación', render: v => v || '-' },
          ]} rows={lotes} emptyMessage="Sin lotes registrados" getRowKey={row => row.id} ariaLabel="Lotes de material" />
        )}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Registrar lote</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .8fr 1fr', gap: 12 }}>
            <FormField label="Código de lote" required><Input value={form.codigo} onChange={v => setForm(f => ({ ...f, codigo: v }))} /></FormField>
            <FormField label="Cantidad" required><Input type="number" min="0" value={form.cantidad} onChange={v => setForm(f => ({ ...f, cantidad: v, regularizarExistente: false }))} /></FormField>
            <FormField label="Estado de calidad"><Select value={form.estadoCalidad} onChange={v => setForm(f => ({ ...f, estadoCalidad: v, regularizarExistente: v === 'aprobado' && f.regularizarExistente }))} options={[{ value: 'aprobado', label: 'Aprobado' }, { value: 'observado', label: 'Observado' }, { value: 'rechazado', label: 'Rechazado' }]} /></FormField>
          </div>
          <FormField label="Observación"><Input value={form.observacion} onChange={v => setForm(f => ({ ...f, observacion: v }))} /></FormField>
          {puedeRegularizar && (
            <label style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 10, fontSize: 12, color: 'var(--text-2)' }}>
              <input type="checkbox" checked={form.regularizarExistente} onChange={e => setForm(f => ({ ...f, regularizarExistente: e.target.checked, cantidad: e.target.checked ? String(material.stock) : f.cantidad }))} />
              Este lote corresponde al stock histórico ya registrado ({Number(material.stock).toFixed(2)}); no sumar nuevamente.
            </label>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Btn variant="secondary" size="sm" onClick={onClose}>Cerrar</Btn>
            <Btn variant="primary" size="sm" onClick={save} disabled={createLote.isPending || !form.codigo || Number(form.cantidad) <= 0}>{createLote.isPending ? 'Guardando...' : 'Registrar lote'}</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

const miniInput = { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', width: 128 }
const selectStyle = { ...miniInput, width: 'auto', minWidth: 152, cursor: 'pointer' }
const actionBtn = { padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }
const pagerBtn = disabled => ({ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: disabled ? 'not-allowed' : 'pointer' })
