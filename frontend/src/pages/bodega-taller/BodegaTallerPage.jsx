import { useState, useEffect, useRef } from 'react'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { FormField, Input, Select } from '../../components/forms'
import { useBodegaTaller, useCreateBodegaTaller, useUpdateBodegaTaller } from '../../api/bodegaTaller'
import { useCategoriasBodegaTaller } from '../../api/categoriasBodegaTaller'

const TABS = [
  { id: 'all',          label: 'Todos' },
  { id: 'true',         label: 'Stock crítico' },
]

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

export default function BodegaTallerPage() {
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [editing, setEditing] = useState(null) // row being edited
  const [creating, setCreating] = useState(false)
  const debounceRef = useRef(null)
  const createMut = useCreateBodegaTaller()
  const updateMut = useUpdateBodegaTaller()
  const { data: categorias = [] } = useCategoriasBodegaTaller()
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

  const { data: result = { items: [], total: 0, limit: 200 }, isLoading } = useBodegaTaller(params)
  const items = result.items ?? []
  const total = result.total ?? 0
  const limit = result.limit ?? 200
  const pages = Math.max(1, Math.ceil(total / limit))

  const criticos = items.filter(i => i.stock <= i.stockCritico).length

  const cols = [
    { key: 'codigoInterno', label: 'Código',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--green-700)' }}>{v}</span> },
    { key: 'nombre', label: 'Nombre', wrap: true,
      render: v => <span style={{ fontSize: 13 }}>{v}</span> },
    { key: 'unidadMedida', label: 'Unidad',
      render: v => v ? <Badge tone="neutral">{v}</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'stock', label: 'Stock', align: 'right',
      render: (v, row) => {
        const tone = v <= 0 ? 'red' : v <= row.stockCritico ? 'amber' : 'green'
        return <Badge tone={tone}><span style={{ fontFamily: "'DM Mono', monospace" }}>{(v || 0).toFixed(2)}</span></Badge>
      } },
    { key: 'stockCritico', label: 'Crítico', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{(v || 0).toFixed(2)}</span> },
    { key: 'precio', label: 'Precio', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(v)}</span> },
    { key: 'codigoBarra', label: 'Cód. barra',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-3)' }}>{v}</span> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: '_edit', label: '',
      render: (_, row) => (
        <button onClick={(e) => { e.stopPropagation(); setEditing(row) }} style={{ background: 'transparent', border: 'none', color: 'var(--green-700)', cursor: 'pointer', fontSize: 12 }}>Editar</button>
      ) },
  ]

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Bodega Taller"
        subtitle={`${total.toLocaleString('es-CL')} materiales de taller`}
        breadcrumb={['Inicio', 'Taller', 'Bodega']}
        actions={<Btn variant="primary" size="sm" onClick={() => setCreating(true)}>+ Nuevo material</Btn>}
      />
      <div className="kpi-strip">
        <KpiCard label="Total materiales" value={total} icon="box" sublabel="En catálogo" />
        <KpiCard label="En página" value={items.length} icon="list" sublabel={`Página ${page} de ${pages}`} />
        <KpiCard label="Stock crítico" value={criticos} icon="alertTriangle" tone="amber" sublabel="Bajo umbral" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1) }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <select value={categoriaId} onChange={e => { setCategoriaId(e.target.value); setSubcategoriaId(''); setPage(1) }}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}>
              <option value="">Todas las categorías</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select value={subcategoriaId} onChange={e => { setSubcategoriaId(e.target.value); setPage(1) }}
              disabled={!categoriaId}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}>
              <option value="">Todas las subcategorías</option>
              {subcategorias.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <SearchBar placeholder="Buscar código, nombre…" value={search} onChange={setSearch} style={{ width: 280 }} />
          </div>
        </div>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>‹ Anterior</button>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page >= pages ? 'not-allowed' : 'pointer' }}>Siguiente ›</button>
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={items} emptyMessage="Sin materiales" />
        }
      </div>

      {(editing || creating) && (
        <Modal
          title={creating ? 'Nuevo material' : `Editar ${editing.codigoInterno}`}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSave={(data) => {
            const mut = creating ? createMut : updateMut
            const payload = creating ? data : { id: editing.id, data }
            mut.mutate(payload, { onSuccess: () => { setEditing(null); setCreating(false) } })
          }}
          initial={editing || {}}
          allowCodigo={creating}
          saving={createMut.isPending || updateMut.isPending}
          categorias={categorias}
        />
      )}
    </main>
  )
}

function Modal({ title, onClose, onSave, initial, allowCodigo, saving, categorias = [] }) {
  const [form, setForm] = useState({
    codigoInterno: initial.codigoInterno || '',
    codigoBarra: initial.codigoBarra || '',
    nombre: initial.nombre || '',
    unidadMedida: initial.unidadMedida || '',
    categoriaId: initial.categoriaId != null ? String(initial.categoriaId) : '',
    subcategoriaId: initial.subcategoriaId != null ? String(initial.subcategoriaId) : '',
    stock: initial.stock ?? 0,
    stockCritico: initial.stockCritico ?? 0,
    precio: initial.precio ?? 0,
  })
  const subcategorias = categorias.find(c => String(c.id) === String(form.categoriaId))?.subcategorias ?? []
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 520, maxWidth: '90vw' }}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>{title}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Código interno" required={allowCodigo}>
            <Input value={form.codigoInterno} onChange={v => setForm(f => ({ ...f, codigoInterno: v }))} disabled={!allowCodigo} />
          </FormField>
          <FormField label="Código barra">
            <Input value={form.codigoBarra} onChange={v => setForm(f => ({ ...f, codigoBarra: v }))} />
          </FormField>
          <FormField label="Nombre" required>
            <Input value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} />
          </FormField>
          <FormField label="Unidad">
            <Input value={form.unidadMedida} onChange={v => setForm(f => ({ ...f, unidadMedida: v }))} />
          </FormField>
          <FormField label="Categoria">
            <Select
              value={form.categoriaId}
              onChange={v => setForm(f => ({ ...f, categoriaId: v, subcategoriaId: '' }))}
              options={[{ value: '', label: 'Sin categoria' }, ...categorias.map(c => ({ value: String(c.id), label: c.nombre }))]}
            />
          </FormField>
          <FormField label="Subcategoria">
            <Select
              value={form.subcategoriaId}
              onChange={v => setForm(f => ({ ...f, subcategoriaId: v }))}
              disabled={!form.categoriaId || !subcategorias.length}
              options={[{ value: '', label: 'Sin subcategoria' }, ...subcategorias.map(s => ({ value: String(s.id), label: s.nombre }))]}
            />
          </FormField>
          <FormField label="Stock">
            <Input type="number" value={form.stock} onChange={v => setForm(f => ({ ...f, stock: v }))} />
          </FormField>
          <FormField label="Stock crítico">
            <Input type="number" value={form.stockCritico} onChange={v => setForm(f => ({ ...f, stockCritico: v }))} />
          </FormField>
          <FormField label="Precio">
            <Input type="number" value={form.precio} onChange={v => setForm(f => ({ ...f, precio: v }))} />
          </FormField>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancelar</Btn>
          <Btn variant="primary" size="sm" onClick={() => onSave(form)} disabled={saving || !form.nombre || (allowCodigo && !form.codigoInterno)}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
