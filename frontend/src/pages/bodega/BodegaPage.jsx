import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Tabs } from '../../components/shared'
import { useDeleteProducto, useProductos } from '../../api/productos'
import { useCategorias } from '../../api/categorias'
import { useProveedores } from '../../api/proveedores'
import { useUbicaciones } from '../../api/ubicaciones'
import { downloadFromBackend, parseTabularFile } from '../../utils/csv'
import { PRODUCT_PLACEHOLDER_IMAGE, useProductPlaceholderOnError } from '../../utils/assets'
import api from '../../api/client'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const estadoInventarioOptions = ['', 'Inventariado', 'Externo', 'Transitorio']
const estadoOperativoOptions = ['', 'Disponible', 'Stock crítico', 'Sin stock', 'Incompleto', 'Descontinuado', 'Transitorio', 'En transito', 'Reserva']

function money(value) {
  return '$' + Number(value || 0).toLocaleString('es-CL')
}

function mono(value, fallback = '-') {
  return <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{value || fallback}</span>
}

function estadoTone(value) {
  const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (normalized.includes('sin stock') || normalized.includes('descontinu')) return 'red'
  if (normalized.includes('critico') || normalized.includes('incompleto') || normalized.includes('transito') || normalized.includes('reserva')) return 'amber'
  if (normalized.includes('disponible') || normalized.includes('normal') || normalized.includes('activo')) return 'green'
  return 'gray'
}

export default function BodegaPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const canWriteCatalogo = can(user, 'catalogo', 'write')
  const canDeleteCatalogo = can(user, 'catalogo', 'delete')
  const canWriteBodega = can(user, 'bodega', 'write')
  const qc = useQueryClient()
  const deleteProducto = useDeleteProducto()
  const { data: categoriasApi = [] } = useCategorias()
  const { data: proveedoresResult = { items: [] } } = useProveedores()
  const { data: ubicacionesResult = { items: [] } } = useUbicaciones()
  const [tab, setTab] = useState(searchParams.get('tab') === 'taller' ? 'taller' : 'inventario')
  const [importing, setImporting] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState(searchParams.get('filtro') === 'critico' ? 'critico' : searchParams.get('filtro') === 'sin-stock' ? 'sin-stock' : 'all')
  const [proveedorId, setProveedorId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [visibleWeb, setVisibleWeb] = useState('all')
  const [estadoInventario, setEstadoInventario] = useState('')
  const [estadoOperativo, setEstadoOperativo] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')
  const [idMarco, setIdMarco] = useState('')
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const bodegaParam = tab === 'taller' ? 'Taller' : 'Inventario'
  const queryParams = { bodega: bodegaParam }
  if (debouncedSearch) queryParams.search = debouncedSearch
  if (proveedorId) queryParams.proveedorId = proveedorId
  if (categoriaId) queryParams.categoriaId = categoriaId
  if (subcategoriaId) queryParams.subcategoriaId = subcategoriaId
  if (visibleWeb !== 'all') queryParams.visibleWeb = visibleWeb
  if (estadoInventario) queryParams.estadoInventario = estadoInventario
  if (ubicacionId) queryParams.ubicacionId = ubicacionId
  if (idMarco) queryParams.idMarco = idMarco
  if (filter === 'critico') queryParams.estado = 'critico'
  else if (filter === 'sin-stock') queryParams.estado = 'sin-stock'

  const { data: result = { items: [], total: 0, limit: 500 }, isLoading } = useProductos(queryParams)

  const productos = estadoOperativo
    ? (result.items ?? []).filter(p => p.estadoOperacional === estadoOperativo)
    : (result.items ?? [])
  const totalEnBodega = result.total ?? 0
  const kpiStats = result.stats ?? { total: totalEnBodega, critico: 0, sinStock: 0, valorInventario: 0 }
  const LIMIT = result.limit ?? 500
  const selectedCategoria = categoriasApi.find(c => String(c.id) === String(categoriaId))
  const subcategorias = selectedCategoria?.subcategorias || []
  const valorInventario = kpiStats.valorInventario == null ? null : Number(kpiStats.valorInventario || 0)

  const handleDelete = (row) => {
    if (!window.confirm(`Eliminar producto ${row.codigoInterno}?`)) return
    deleteProducto.mutate(row.id, {
      onError: e => alert(e.response?.data?.error || 'No se pudo eliminar el producto'),
    })
  }

  const cols = [
    { key: 'fotoUrl', label: 'Foto', render: v => v
      ? <img src={v} alt="" loading="lazy" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} onError={useProductPlaceholderOnError} />
      : <img src={PRODUCT_PLACEHOLDER_IMAGE} alt="" loading="lazy" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} onError={useProductPlaceholderOnError} /> },
    { key: 'codigoInterno', label: 'Cod.', render: v => mono(v) },
    { key: 'idMarco', label: 'ID Marco', render: v => mono(v) },
    { key: 'codigoBarra', label: 'Cod. Barra', render: v => mono(v) },
    { key: 'visibleWeb', label: 'Web', render: v => <Badge tone={v ? 'green' : 'gray'}>{v ? 'Si' : 'No'}</Badge> },
    { key: 'nombre', label: 'Nombre', wrap: true },
    { key: 'categoria', label: 'Categoría', render: v => v ? <Badge tone="gray">{v}</Badge> : '-' },
    { key: 'subcategoria', label: 'Subcategoría', render: (_, row) => row.subcategoria?.nombre || '-' },
    { key: 'porcDesc', label: 'Desc.', align: 'right', render: v => `${Number(v || 0).toLocaleString('es-CL')}%` },
    { key: 'precioLista', label: 'P. costo/lista', align: 'right', render: v => mono(money(v)) },
    { key: 'precioWeb', label: 'P. venta/web', align: 'right', render: (v, row) => mono(money(v ?? row.precioLista)) },
    { key: 'precioMarco', label: 'P. licitación', align: 'right', render: (v, row) => mono(money(row.consultaPrecios?.precioLicitacion ?? v)) },
    { key: 'stockCritico', label: 'Stock crit.', align: 'right', render: v => mono(Number(v || 0).toLocaleString('es-CL')) },
    { key: 'stock', label: 'Stock', align: 'right', render: v => mono(Number(v || 0).toLocaleString('es-CL')) },
    { key: 'proveedor', label: 'Proveedor', render: v => v || '-' },
    { key: 'estadoInventario', label: 'Estado inventario', required: true, render: v => v || '-' },
    { key: 'estadoOperacional', label: 'Estado operativo', required: true, render: v => <Badge tone={estadoTone(v)}>{v === 'Reserva' ? 'Reservado' : (v || 'Sin evaluar')}</Badge> },
    { key: 'estado', label: 'Estado', render: v => (
      <Badge tone={estadoTone(v)}>{v === 'Reserva' ? 'Reservado' : v}</Badge>
    )},
    { key: '_acc', label: '', required: true, render: (_, row) => (
      <div style={{ display: 'flex', gap: 4 }}>
        {canWriteCatalogo && <button onClick={e => { e.stopPropagation(); navigate('/bodega/' + row.id + '/editar') }} style={actionBtn}>Editar</button>}
        {canWriteBodega && <button onClick={e => { e.stopPropagation(); navigate('/bodega/' + row.id + '/editar#movimientos') }} style={{ ...actionBtn, color: 'var(--blue, #2563eb)' }} title="Ver movimientos de stock">Movs</button>}
        {canDeleteCatalogo && <button onClick={e => { e.stopPropagation(); handleDelete(row) }} style={{ ...actionBtn, color: 'var(--red)' }}>Borrar</button>}
      </div>
    )},
  ]

  const resetEstadoFilters = () => {
    setFilter('all')
    setEstadoOperativo('')
  }

  const criticos = kpiStats.critico ?? 0
  const sinStock = kpiStats.sinStock ?? 0
  const valorInventarioLabel = valorInventario == null
    ? 'Sin acceso'
    : '$' + Math.round(valorInventario / 1_000_000 * 10) / 10 + 'M'

  return (
    <main className="page page-wide">
      <PageHeader
        title="Bodega"
        subtitle="Control de stock e inventario"
        breadcrumb={['Inicio', 'Bodega']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm"
            onClick={() => downloadFromBackend('/reportes/export/productos', `productos_${new Date().toISOString().slice(0, 10)}.csv`, queryParams)}
          >Exportar Excel</Btn>
          {canWriteBodega && <Btn variant="secondary" icon="upload" size="sm" onClick={() => setImporting(true)}>Importar</Btn>}
          {canWriteCatalogo && <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/bodega/nuevo')}>Crear nuevo</Btn>}
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total productos" value={kpiStats.total ?? totalEnBodega} icon="package" sublabel={`${bodegaParam} · limpiar filtro estado`} onClick={resetEstadoFilters} />
        <KpiCard label="Stock crítico" value={criticos} icon="alertTriangle" tone="amber" sublabel="Stock bajo mínimo" onClick={() => { setFilter('critico'); setEstadoOperativo('') }} />
        <KpiCard label="Sin stock" value={sinStock} icon="x" tone="red" sublabel="Requiere reposición" onClick={() => { setFilter('sin-stock'); setEstadoOperativo('') }} />
        <KpiCard label="Valor inventario" value={valorInventarioLabel} icon="dollarSign" sublabel="Costo/lista valorizado" onClick={resetEstadoFilters} />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)' }}>
          <Tabs tabs={[
            { id: 'inventario', label: 'Bodega Inventario' },
            { id: 'taller', label: 'Bodega Taller' },
          ]} active={tab} onChange={t => { setTab(t); setSearch('') }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={filter} onChange={e => setFilter(e.target.value)} style={selectStyle}>
              <option value="all">Todos los estados</option>
              <option value="critico">Solo críticos</option>
              <option value="sin-stock">Sin stock</option>
            </select>
            <select value={visibleWeb} onChange={e => setVisibleWeb(e.target.value)} style={selectStyle}>
              <option value="all">Web: todos</option>
              <option value="true">Web: si</option>
              <option value="false">Web: no</option>
            </select>
            <select value={categoriaId} onChange={e => { setCategoriaId(e.target.value); setSubcategoriaId('') }} style={selectStyle}>
              <option value="">Todas las categorías</option>
              {categoriasApi.map(c => <option key={c.id || c.nombre} value={c.id}>{c.nombre}</option>)}
            </select>
            <select value={subcategoriaId} onChange={e => setSubcategoriaId(e.target.value)} style={selectStyle} disabled={!subcategorias.length}>
              <option value="">Todas las subcategorías</option>
              {subcategorias.map(sc => <option key={sc.id} value={sc.id}>{sc.nombre}</option>)}
            </select>
            <select value={estadoInventario} onChange={e => setEstadoInventario(e.target.value)} style={selectStyle}>
              <option value="">Estado inventario</option>
              {estadoInventarioOptions.filter(Boolean).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={estadoOperativo} onChange={e => setEstadoOperativo(e.target.value)} style={selectStyle}>
              <option value="">Estado operativo</option>
              {estadoOperativoOptions.filter(Boolean).map(v => <option key={v} value={v}>{v === 'Reserva' ? 'Reservado' : v}</option>)}
            </select>
            <select value={proveedorId} onChange={e => setProveedorId(e.target.value)} style={{ ...selectStyle, minWidth: 180 }}>
              <option value="">Todos los proveedores</option>
              {(proveedoresResult.items || []).map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <select value={ubicacionId} onChange={e => setUbicacionId(e.target.value)} style={{ ...selectStyle, minWidth: 170 }}>
              <option value="">Todas las ubicaciones</option>
              {(ubicacionesResult.items || []).map(u => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
            <input value={idMarco} onChange={e => setIdMarco(e.target.value)} placeholder="ID Marco" style={miniInput} />
            <SearchBar placeholder="Buscar código, barra o producto..." value={search} onChange={setSearch} style={{ width: 260 }} />
          </div>
        </div>
        {totalEnBodega > LIMIT && !debouncedSearch && (
          <div style={{ padding: '8px 16px', background: 'var(--amber-bg, #fffbeb)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)' }}>
            Mostrando los primeros {LIMIT.toLocaleString('es-CL')} de {totalEnBodega.toLocaleString('es-CL')} productos. Use filtros para acotar.
          </div>
        )}
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando productos...</div>
          : <Table
              key={tab}
              columns={cols}
              rows={productos}
              emptyMessage="No hay productos con ese criterio"
              onRowDoubleClick={canWriteCatalogo ? row => navigate('/bodega/' + row.id + '/editar') : undefined}
              keyboard
              autoFocus
              stickyHeader
              ariaLabel="Productos de bodega"
              getRowKey={row => row.id}
              columnPrefsKey={`bodega-${tab}`}
            />
        }
      </div>

      {importing && <ImportModal canWriteBodega={canWriteBodega} onClose={() => setImporting(false)} onDone={() => qc.invalidateQueries({ queryKey: ['productos'] })} />}
    </main>
  )
}

const miniInput = { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', width: 120 }
const selectStyle = { ...miniInput, width: 'auto', minWidth: 138, cursor: 'pointer' }
const actionBtn = { padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }

function ImportModal({ canWriteBodega, onClose, onDone }) {
  const importOptions = canWriteBodega ? [
    ['precios', 'Actualizar precios'],
    ['stock', 'Actualizar stock'],
    ['web', 'Actualizar web'],
    ['nuevo', 'Crear nuevos productos'],
  ] : []
  const [tipo, setTipo] = useState(importOptions[0]?.[0] || '')
  const [rows, setRows] = useState([])
  const [filename, setFilename] = useState('')
  const [motivo, setMotivo] = useState('Importacion masiva validada')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const parsed = await parseTabularFile(file)
      setRows(parsed.rows)
      setFilename(`${file.name} (${parsed.format}, ${parsed.rows.length} filas, columnas: ${parsed.headers.join(', ')})`)
      setResult(null)
    } catch (err) {
      setRows([])
      setFilename(file.name)
      setResult({ error: err.message || 'No se pudo leer el archivo' })
    }
  }

  const preview = async () => {
    if (!rows.length || !tipo) return
    setLoading(true)
    try {
      const { data } = await api.post(`/productos/importar/${tipo}`, { rows, dryRun: true })
      setResult(data)
    } catch (e) {
      setResult({ error: e.response?.data?.error || e.message, errores: e.response?.data?.errores || [] })
    } finally { setLoading(false) }
  }

  const submit = async () => {
    if (!rows.length || !tipo) return
    if (!result?.aplicable) { await preview(); return }
    setLoading(true)
    try {
      const payload = { rows, confirm: true }
      if (tipo === 'stock') payload.motivo = motivo
      const { data } = await api.post(`/productos/importar/${tipo}`, payload)
      setResult(data)
      onDone()
    } catch (e) {
      setResult({ error: e.response?.data?.error || e.message, errores: e.response?.data?.errores || [] })
    } finally { setLoading(false) }
  }

  const cols = tipo === 'precios' ? 'codigo, precioLista|precio costo, precioMarco, precioWeb, descuento'
    : tipo === 'stock' ? 'codigo, stock, stockCritico'
    : tipo === 'web' ? 'codigo, visibleWeb|mostrarWeb|web'
    : 'codigo, nombre, unidadMedida, categoria, proveedor, precioLista, stock, stockCritico, codigoBarra, bodega, visibleWeb, descripcionLicitacion, linkCompra, edad, materialidad, ubicacion'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 680, maxWidth: '92vw' }}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Importar productos (CSV o Excel XLSX)</div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Tipo de importacion</label>
          <select value={tipo} onChange={e => { setTipo(e.target.value); setResult(null) }} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, width: '100%' }}>
            {importOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Columnas esperadas: {cols}</div>
        </div>
        {tipo === 'stock' && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Motivo obligatorio</label>
            <input value={motivo} onChange={e => setMotivo(e.target.value)} style={{ ...miniInput, width: '100%' }} />
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <input type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFile} style={{ fontSize: 12 }} />
          {filename && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{filename}</div>}
        </div>
        {result && (
          <div style={{ background: result.error ? 'var(--red-bg)' : result.aplicable === false ? 'var(--amber-bg)' : 'var(--green-50)', padding: 10, borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
            {result.error
              ? <span style={{ color: 'var(--red)' }}>{result.error}</span>
              : <span>
                  {result.aplicable != null && <>Prevalidacion: <b>{result.aplicable ? 'apta' : 'con errores'}</b> / </>}
                  {result.actualizables != null && <>Actualizables: <b>{result.actualizables}</b> / </>}
                  {result.actualizados != null && <>Actualizados: <b>{result.actualizados}</b> / </>}
                  {result.creables != null && <>Creables: <b>{result.creables}</b> / </>}
                  {result.creados != null && <>Creados: <b>{result.creados}</b> / Ignorados: <b>{result.ignorados}</b> / </>}
                  Total: <b>{result.total ?? rows.length}</b>
                </span>}
            {result.errores?.length > 0 && (
              <div style={{ color: result.error ? 'var(--red)' : 'var(--text-2)', marginTop: 6 }}>
                Errores: {result.errores.slice(0, 5).map(e => e.codigo || `fila ${e.fila || '?'}`).join(', ')}
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="secondary" size="sm" onClick={onClose} disabled={loading}>Cerrar</Btn>
          <Btn variant="secondary" size="sm" onClick={preview} disabled={loading || !rows.length || !tipo}>Prevalidar</Btn>
          <Btn variant="primary" size="sm" onClick={submit} disabled={loading || !rows.length || !tipo || (tipo === 'stock' && !motivo.trim())}>
            {loading ? 'Procesando...' : result?.aplicable ? `Confirmar ${rows.length} filas` : 'Validar antes de importar'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
