import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Tabs } from '../../components/shared'
import { useProductos } from '../../api/productos'
import { downloadFromBackend, parseCsv } from '../../utils/csv'
import api from '../../api/client'
import { useQueryClient } from '@tanstack/react-query'

export default function BodegaPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState('inventario')
  const [importing, setImporting] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [proveedor, setProveedor] = useState('')
  const [categoria, setCategoria] = useState('')
  const [ubicacion, setUbicacion] = useState('')
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
  if (proveedor) queryParams.proveedor = proveedor
  if (categoria) queryParams.categoria = categoria
  if (ubicacion) queryParams.ubicacion = ubicacion
  if (idMarco) queryParams.idMarco = idMarco
  if (filter === 'critico') queryParams.estado = 'critico'
  else if (filter === 'sin-stock') queryParams.estado = 'sin-stock'

  const { data: result = { items: [], total: 0, limit: 500 }, isLoading } = useProductos(queryParams)

  const productos = result.items ?? []
  const totalEnBodega = result.total ?? 0
  const LIMIT = result.limit ?? 500

  const displayed = productos

  const valorInventario = productos.reduce((sum, p) => sum + p.precioLista * p.stock, 0)

  const cols = [
    { key: 'fotoUrl', label: '', render: v => v
      ? <img src={v} alt="" loading="lazy" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} onError={e => { e.currentTarget.style.display = 'none' }} />
      : <div style={{ width: 36, height: 36, borderRadius: 4, background: 'var(--border)' }} /> },
    { key: 'codigoInterno', label: 'Código', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v}</span> },
    { key: 'nombre', label: 'Producto', wrap: true },
    { key: 'categoria', label: 'Categoría', render: v => v ? <Badge tone="gray">{v}</Badge> : null },
    { key: 'stock', label: 'Stock / Mínimo', render: (v, row) => {
      const min = row.stockCritico || 0
      const color = v === 0 ? 'var(--red)' : v < min ? 'var(--amber)' : 'var(--green-600)'
      const pct = min > 0 ? Math.min(100, Math.round((v / min) * 100)) : (v > 0 ? 100 : 0)
      return (
        <div style={{ minWidth: 110 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 12, color }}>{v}</span>
            {min > 0 && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>/ {min}</span>}
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 99 }}>
            <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
        </div>
      )
    }},
    { key: 'estado', label: 'Estado', render: v => (
      <Badge tone={v === 'Sin stock' ? 'red' : v === 'Crítico' ? 'amber' : 'green'}>{v}</Badge>
    )},
    { key: 'precioLista', label: 'Precio', align: 'right', render: v => (
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600 }}>${Number(v).toLocaleString('es-CL')}</span>
    )},
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={e => { e.stopPropagation(); navigate('/bodega/' + row.id + '/editar') }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}>Editar</button>
        <button onClick={e => { e.stopPropagation(); navigate('/bodega/' + row.id + '/editar#movimientos') }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--blue, #2563eb)', fontWeight: 500 }} title="Ver movimientos de stock">Movs</button>
      </div>
    )},
  ]

  const criticos = productos.filter(p => p.estado === 'Crítico').length
  const sinStock = productos.filter(p => p.estado === 'Sin stock').length

  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Bodega"
        subtitle="Control de stock e inventario"
        breadcrumb={['Inicio', 'Bodega']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm"
            onClick={() => downloadFromBackend('/reportes/export/productos', `productos_${new Date().toISOString().slice(0, 10)}.csv`)}
          >Exportar CSV</Btn>
          <Btn variant="secondary" icon="upload" size="sm" onClick={() => setImporting(true)}>Importar</Btn>
          <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/bodega/nuevo')}>Ingreso Mercadería</Btn>
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total productos" value={totalEnBodega} icon="package" sublabel="En ambas bodegas" />
        <KpiCard label="Stock Crítico" value={criticos} icon="alertTriangle" tone="amber" sublabel="Bajo mínimo" />
        <KpiCard label="Sin Stock" value={sinStock} icon="x" tone="red" sublabel="Requiere reposición urgente" />
        <KpiCard label="Valor Inventario" value={'$' + Math.round(valorInventario / 1_000_000 * 10) / 10 + 'M'} icon="dollarSign" sublabel="Aprox. valorizado" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
            <Tabs tabs={[
              { id: 'inventario', label: 'Bodega Inventario' },
              { id: 'taller', label: 'Bodega Taller' },
            ]} active={tab} onChange={t => { setTab(t); setSearch('') }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', background: '#fff', cursor: 'pointer' }}>
                <option value="all">Todos los estados</option>
                <option value="critico">Solo críticos</option>
                <option value="sin-stock">Sin stock</option>
              </select>
              <input value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Proveedor" style={miniInput} />
              <input value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Categoría" style={miniInput} />
              <input value={ubicacion} onChange={e => setUbicacion(e.target.value)} placeholder="Ubicación" style={miniInput} />
              <input value={idMarco} onChange={e => setIdMarco(e.target.value)} placeholder="ID Marco" style={miniInput} />
              <SearchBar placeholder="Buscar código o producto…" value={search} onChange={setSearch} style={{ width: 240 }} />
            </div>
          </div>
        </div>
        {totalEnBodega > LIMIT && !debouncedSearch && (
          <div style={{ padding: '8px 16px', background: 'var(--amber-bg, #fffbeb)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)' }}>
            Mostrando los primeros {LIMIT.toLocaleString('es-CL')} de {totalEnBodega.toLocaleString('es-CL')} productos. Use el buscador para filtrar.
          </div>
        )}
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando productos…</div>
          : <Table columns={cols} rows={displayed} emptyMessage="No hay productos con ese criterio" />
        }
      </div>

      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => qc.invalidateQueries({ queryKey: ['productos'] })} />}
    </main>
  )
}

const miniInput = { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', width: 120 }

function ImportModal({ onClose, onDone }) {
  const [tipo, setTipo] = useState('precios')
  const [rows, setRows] = useState([])
  const [filename, setFilename] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const { headers, rows } = parseCsv(text)
    setRows(rows)
    setFilename(`${file.name} (${rows.length} filas, columnas: ${headers.join(', ')})`)
    setResult(null)
  }

  const submit = async () => {
    if (!rows.length) return
    setLoading(true)
    try {
      const { data } = await api.post(`/productos/importar/${tipo}`, { rows })
      setResult(data)
      onDone()
    } catch (e) {
      setResult({ error: e.response?.data?.error || e.message })
    } finally { setLoading(false) }
  }

  const cols = tipo === 'precios' ? 'codigo, precioLista, precioOferta, precioWeb'
    : tipo === 'stock' ? 'codigo, stock, stockCritico'
    : 'codigo, nombre, unidadMedida, precioLista, stock, stockCritico, codigoBarra, descripcion'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 600, maxWidth: '90vw' }}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Importar productos (CSV)</div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Tipo de importación</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, width: '100%' }}>
            <option value="precios">Actualizar precios</option>
            <option value="stock">Actualizar stock</option>
            <option value="nuevo">Crear nuevos productos</option>
          </select>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Columnas esperadas: {cols}</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ fontSize: 12 }} />
          {filename && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{filename}</div>}
        </div>
        {result && (
          <div style={{ background: result.error ? 'var(--red-bg)' : 'var(--green-50)', padding: 10, borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
            {result.error
              ? <span style={{ color: 'var(--red)' }}>{result.error}</span>
              : <span>
                  {result.actualizados != null && <>Actualizados: <b>{result.actualizados}</b> / </>}
                  {result.creados != null && <>Creados: <b>{result.creados}</b> / Ignorados: <b>{result.ignorados}</b> / </>}
                  Total: <b>{result.total}</b>
                  {result.errores?.length > 0 && <><br />Errores: {result.errores.length} ({result.errores.slice(0, 3).map(e => e.codigo || 'fila').join(', ')}…)</>}
                </span>}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="secondary" size="sm" onClick={onClose} disabled={loading}>Cerrar</Btn>
          <Btn variant="primary" size="sm" onClick={submit} disabled={loading || !rows.length}>
            {loading ? 'Importando…' : `Importar ${rows.length} filas`}
          </Btn>
        </div>
      </div>
    </div>
  )
}
