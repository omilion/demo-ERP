import { toast, confirmDialog } from '../../store/notif'
import { useEffect, useRef, useState } from 'react'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { FormField, Input, Select } from '../../components/forms'
import { useBodegaTaller, useCreateBodegaTaller, useDeleteBodegaTaller, useUpdateBodegaTaller } from '../../api/bodegaTaller'
import { useCategoriasBodegaTaller } from '../../api/categoriasBodegaTaller'
import { useProveedores } from '../../api/proveedores'
import { useSucursales } from '../../api/locations'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { downloadFromBackend } from '../../utils/csv'
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
        {canDelete && <button onClick={(e) => { e.stopPropagation(); handleDelete(row) }} style={{ ...actionBtn, color: 'var(--red)' }}>Borrar</button>}
      </div>
    ) },
  ]

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
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)' }}>
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1) }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={categoriaId} onChange={e => { setCategoriaId(e.target.value); setSubcategoriaId(''); setPage(1) }} style={selectStyle}>
              <option value="">Todas las categorías</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select value={subcategoriaId} onChange={e => { setSubcategoriaId(e.target.value); setPage(1) }} disabled={!categoriaId} style={selectStyle}>
              <option value="">Todas las subcategorías</option>
              {subcategorias.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select value={sucursalId} onChange={e => { setSucursalId(e.target.value); setPage(1) }} style={selectStyle}>
              <option value="">Todas las sucursales</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <input value={proveedor} onChange={e => { setProveedor(e.target.value); setPage(1) }} placeholder="Proveedor" style={miniInput} />
            <input value={codigoInterno} onChange={e => { setCodigoInterno(e.target.value); setPage(1) }} placeholder="Cód. interno" style={miniInput} />
            <input value={codigoBarra} onChange={e => { setCodigoBarra(e.target.value); setPage(1) }} placeholder="Cód. barra" style={miniInput} />
            <SearchBar placeholder="Buscar código, nombre o proveedor" value={search} onChange={setSearch} style={{ width: 280 }} />
            <Btn variant="secondary" size="sm" onClick={clearFilters}>Limpiar</Btn>
          </div>
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

const miniInput = { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', width: 128 }
const selectStyle = { ...miniInput, width: 'auto', minWidth: 152, cursor: 'pointer' }
const actionBtn = { padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }
const pagerBtn = disabled => ({ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: disabled ? 'not-allowed' : 'pointer' })
