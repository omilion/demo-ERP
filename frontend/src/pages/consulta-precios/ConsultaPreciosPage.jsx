import { toast } from '../../store/notif'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn, Icon, KpiCard, PageHeader, Pager, Table } from '../../components/shared'
import { useCategorias } from '../../api/categorias'
import { useProductos, useUpdateProducto } from '../../api/productos'
import { useProveedores } from '../../api/proveedores'
import { PRODUCT_PLACEHOLDER_IMAGE, useProductPlaceholderOnError } from '../../utils/assets'
import { downloadFromBackend } from '../../utils/csv'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import BotonExportar from '../../components/BotonExportar'

const SEARCH_MODES = [
  { id: 'general', label: 'Todos' },
  { id: 'codigoBarra', label: 'Código barra' },
  { id: 'codigoInterno', label: 'Código interno' },
  { id: 'idMarco', label: 'ID Marco' },
  { id: 'nombre', label: 'Nombre producto' },
  { id: 'proveedor', label: 'Proveedor' },
  { id: 'categoria', label: 'Categoría' },
]

const fmt = n => '$' + Number(n || 0).toLocaleString('es-CL')
const pct = n => `${Number(n || 0).toLocaleString('es-CL')}%`

function mono(value, fallback = '-') {
  return <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{value || fallback}</span>
}

function price(value) {
  return mono(fmt(value))
}

export default function ConsultaPreciosPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [mode, setMode] = useState('general')
  const [term, setTerm] = useState('')
  const [debouncedTerm, setDebouncedTerm] = useState('')
  const [bodega, setBodega] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [page, setPage] = useState(1)
  const [precioDrafts, setPrecioDrafts] = useState({})
  const { data: categorias = [] } = useCategorias()
  const { data: proveedores = { items: [] } } = useProveedores()
  const updateProducto = useUpdateProducto()
  const canReadCosto = can(user, 'bodega', 'read')
  const canEditPrecio = can(user, 'catalogo', 'write') && can(user, 'bodega', 'write')

  useEffect(() => {
    const id = setTimeout(() => setDebouncedTerm(term.trim()), 300)
    return () => clearTimeout(id)
  }, [term])

  const selectedCategoria = categorias.find(c => String(c.id) === String(categoriaId))
  const subcategorias = selectedCategoria?.subcategorias ?? []

  const params = useMemo(() => {
    const next = { sort: 'nombre', page }
    if (bodega) next.bodega = bodega
    if (proveedorId) next.proveedorId = proveedorId
    if (categoriaId) next.categoriaId = categoriaId
    if (subcategoriaId) next.subcategoriaId = subcategoriaId
    if (debouncedTerm) {
      next[mode === 'general' ? 'search' : mode] = debouncedTerm
    }
    return next
  }, [bodega, categoriaId, debouncedTerm, mode, page, proveedorId, subcategoriaId])

  const { data = { items: [], total: 0, limit: 500 }, isLoading } = useProductos(params)
  const exportParams = useMemo(() => {
    const next = { ...params }
    delete next.page
    return next
  }, [params])
  const items = data.items ?? []
  const total = data.total ?? 0
  const totalStock = items.reduce((sum, p) => sum + Number(p.stock || 0), 0)
  const conDescuento = items.filter(p => {
    const c = p.consultaPrecios || {}
    return Number(c.porcDescCategoria || 0) + Number(c.porcDescProducto || 0) > 0
  }).length
  const sinStock = items.filter(p => Number(p.stock || 0) <= 0).length

  function changeMode(nextMode) {
    setMode(nextMode)
    setTerm('')
    setPage(1)
  }

  function clearFilters() {
    setTerm('')
    setDebouncedTerm('')
    setBodega('')
    setProveedorId('')
    setCategoriaId('')
    setSubcategoriaId('')
    setPage(1)
  }

  function exportarPrecios(archivo) {
    downloadFromBackend('/reportes/export/productos', `precios_${new Date().toISOString().slice(0, 10)}.${archivo}`, { ...exportParams, archivo })
      .catch(err => toast.error(err?.response?.data?.error || 'No se pudo exportar precios'))
  }

  function setPrecioDraft(productoId, value) {
    setPrecioDrafts(current => ({ ...current, [productoId]: value }))
  }

  function savePrecio(row) {
    const raw = precioDrafts[row.id] ?? row.precioLista
    const precioLista = Number(raw)
    if (!Number.isFinite(precioLista) || precioLista < 0) {
      toast.warning('Precio costo inválido')
      return
    }
    updateProducto.mutate(
      { id: row.id, data: { precioLista } },
      {
        onSuccess: () => {
          setPrecioDrafts(current => {
            const next = { ...current }
            delete next[row.id]
            return next
          })
        },
        onError: err => toast.error(err?.response?.data?.error || 'No se pudo actualizar el precio'),
      },
    )
  }

  const cols = [
    { key: 'fotoUrl', label: 'Foto', render: v => v
      ? <img src={v} alt="" loading="lazy" style={imgStyle} onError={useProductPlaceholderOnError} />
      : <img src={PRODUCT_PLACEHOLDER_IMAGE} alt="" loading="lazy" style={imgStyle} onError={useProductPlaceholderOnError} /> },
    { key: 'codigoInterno', label: 'Cod interno', render: v => mono(v) },
    { key: 'idMarco', label: 'ID Marco', render: v => mono(v) },
    { key: 'codigoBarra', label: 'Cod barra', render: v => mono(v) },
    { key: 'visibleWeb', label: 'Web', render: v => <Badge tone={v ? 'green' : 'gray'}>{v ? 'Si' : 'No'}</Badge> },
    { key: 'nombre', label: 'Nombre', wrap: true },
    { key: 'categoriaPrecio', label: 'Categoría', render: (_, row) => row.consultaPrecios?.categoriaNombre ? <Badge tone="gray">{row.consultaPrecios.categoriaNombre}</Badge> : '-' },
    { key: 'subcategoriaPrecio', label: 'Subcategoría', render: (_, row) => row.consultaPrecios?.subcategoriaNombre || '-' },
    { key: 'proveedorPrecio', label: 'Proveedor', render: (_, row) => row.consultaPrecios?.proveedorNombre || '-' },
    ...(canReadCosto ? [{ key: 'precioLista', label: 'Precio Costo', align: 'right', render: (v, row) => canEditPrecio
      ? (
        <div style={priceEditStyle} onClick={e => e.stopPropagation()}>
          <input
            type="number"
            min="0"
            value={precioDrafts[row.id] ?? v ?? 0}
            onChange={e => setPrecioDraft(row.id, e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') savePrecio(row) }}
            style={priceInputStyle}
            aria-label={`Precio costo ${row.codigoInterno || row.nombre}`}
          />
          <button
            type="button"
            onClick={() => savePrecio(row)}
            disabled={updateProducto.isPending}
            title="Guardar precio costo"
            style={savePriceButtonStyle}
          >
            <Icon name="check" size={13} />
          </button>
        </div>
      )
      : price(v) }] : []),
    { key: 'descCategoria', label: 'Desc cat.', align: 'right', render: (_, row) => mono(pct(row.consultaPrecios?.porcDescCategoria)) },
    { key: 'descProducto', label: 'Desc prod.', align: 'right', render: (_, row) => mono(pct(row.consultaPrecios?.porcDescProducto)) },
    { key: 'precioNormalSalaIva', label: 'Normal sala + IVA', align: 'right', render: (_, row) => price(row.consultaPrecios?.precioNormalSalaVentaIva) },
    { key: 'precioConDescuento', label: 'Con descuento', align: 'right', render: (_, row) => price(row.consultaPrecios?.precioConDescuento) },
    { key: 'precioConvenioMarco', label: 'Conv. Marco', align: 'right', render: (_, row) => price(row.consultaPrecios?.precioConvMarco) },
    { key: 'precioLicitacion', label: 'Licitación', align: 'right', render: (_, row) => price(row.consultaPrecios?.precioLicitacion) },
    { key: 'stock', label: 'Stock', align: 'right', render: v => mono(Number(v || 0).toLocaleString('es-CL')) },
  ]
  return (
    <main className="page page-wide">
      <PageHeader
        title="Consulta Precios"
        subtitle="Vista operativa de precios y stock"
        breadcrumb={['Inicio', 'Bodega', 'Consulta Precios']}
        actions={<>
          <BotonExportar onExportar={exportarPrecios} />
          <Btn variant="secondary" icon="printer" size="sm" onClick={() => window.print()}>PDF/Imprimir</Btn>
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Resultados" value={total} icon="tag" sublabel={`${items.length.toLocaleString('es-CL')} visibles`} />
        <KpiCard label="Stock visible" value={totalStock} icon="package" sublabel={bodega || 'Todas las bodegas'} />
        <KpiCard label="Con descuento" value={conDescuento} icon="dollarSign" tone="blue" sublabel="Categoría o producto" />
        <KpiCard label="Sin stock" value={sinStock} icon="alertTriangle" tone={sinStock > 0 ? 'amber' : 'neutral'} sublabel="En resultados visibles" />
      </div>

      <section style={panelStyle}>
        <div style={toolbarStyle}>
          <div style={modeBarStyle}>
            {SEARCH_MODES.map(item => (
              <button key={item.id} onClick={() => changeMode(item.id)} style={modeButtonStyle(mode === item.id)}>
                {item.label}
              </button>
            ))}
          </div>

          <div style={filtersStyle}>
            <select value={bodega} onChange={e => { setBodega(e.target.value); setPage(1) }} style={selectStyle}>
              <option value="">Todas las bodegas</option>
              <option value="Inventario">Inventario</option>
              <option value="Taller">Taller</option>
            </select>

            {mode !== 'proveedor' && (
              <select value={proveedorId} onChange={e => { setProveedorId(e.target.value); setPage(1) }} style={{ ...selectStyle, minWidth: 240 }}>
                <option value="">Todos los proveedores</option>
                {(proveedores.items || []).map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.rut ? ` (${p.rut})` : ''}</option>
                ))}
              </select>
            )}

            {mode !== 'categoria' && (
              <>
                <select value={categoriaId} onChange={e => { setCategoriaId(e.target.value); setSubcategoriaId(''); setPage(1) }} style={{ ...selectStyle, minWidth: 200 }}>
                  <option value="">Todas las categorias</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <select value={subcategoriaId} onChange={e => { setSubcategoriaId(e.target.value); setPage(1) }} style={{ ...selectStyle, minWidth: 200 }} disabled={!subcategorias.length}>
                  <option value="">Todas las subcategorias</option>
                  {subcategorias.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </>
            )}

            {mode === 'proveedor' ? (
              <select value={proveedorId} onChange={e => { setProveedorId(e.target.value); setPage(1) }} style={{ ...selectStyle, minWidth: 260 }}>
                <option value="">Proveedor</option>
                {(proveedores.items || []).map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.rut ? ` (${p.rut})` : ''}</option>
                ))}
              </select>
            ) : mode === 'categoria' ? (
              <>
                <select value={categoriaId} onChange={e => { setCategoriaId(e.target.value); setSubcategoriaId(''); setPage(1) }} style={{ ...selectStyle, minWidth: 220 }}>
                  <option value="">Categoría</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <select value={subcategoriaId} onChange={e => { setSubcategoriaId(e.target.value); setPage(1) }} style={{ ...selectStyle, minWidth: 220 }} disabled={!subcategorias.length}>
                  <option value="">Subcategoría</option>
                  {subcategorias.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </>
            ) : (
              <input
                autoFocus
                value={term}
                onChange={e => { setTerm(e.target.value); setPage(1) }}
                placeholder={mode === 'general' ? 'Buscar producto...' : SEARCH_MODES.find(m => m.id === mode)?.label}
                style={inputStyle}
              />
            )}

            <Btn variant="ghost" icon="x" size="sm" onClick={clearFilters}>Limpiar</Btn>
          </div>
        </div>

        {total > (data.limit ?? 500) && (
          <div style={noticeStyle}>
            Mostrando {items.length.toLocaleString('es-CL')} de {total.toLocaleString('es-CL')}. Ajuste los filtros para acotar.
          </div>
        )}

        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando productos...</div>
          : <Table
              columns={cols}
              rows={items}
              emptyMessage="No hay productos con ese criterio"
              onRowDoubleClick={canEditPrecio ? row => navigate('/bodega/' + row.id + '/editar') : undefined}
              autoFocus
              ariaLabel="Consulta de precios de productos"
              getRowKey={row => row.id}
              columnPrefsKey="consulta-precios"
            />
        }
        <Pager
          page={data.page ?? page}
          pages={data.pages ?? 1}
          total={total}
          limit={data.limit ?? 500}
          shown={items.length}
          onChange={setPage}
          disabled={isLoading}
        />
      </section>
    </main>
  )
}

const imgStyle = { width: 42, height: 42, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }
const panelStyle = { background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }
const toolbarStyle = { padding: '14px 16px', borderBottom: '1px solid var(--border)' }
const modeBarStyle = { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }
const filtersStyle = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }
const inputStyle = { width: 320, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontFamily: 'inherit', fontSize: 13, color: 'var(--text-1)', outline: 'none' }
const selectStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontFamily: 'inherit', fontSize: 13, color: 'var(--text-1)', cursor: 'pointer' }
const noticeStyle = { padding: '8px 16px', background: 'var(--amber-bg, #fffbeb)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)' }
const priceEditStyle = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, minWidth: 132 }
const priceInputStyle = { width: 94, padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: "'DM Mono', monospace", fontSize: 12, textAlign: 'right' }
const savePriceButtonStyle = { width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--green-700)', cursor: 'pointer' }

function modeButtonStyle(active) {
  return {
    padding: '7px 11px',
    borderRadius: 7,
    border: active ? '1px solid var(--green-600)' : '1px solid var(--border)',
    background: active ? 'var(--green-50)' : '#fff',
    color: active ? 'var(--green-700)' : 'var(--text-2)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}
