import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table } from '../../components/shared'
import { DetailRow, FormField, FormPanel, Input, Select, Textarea, ViewPanel } from '../../components/forms'
import { downloadStockIngresosCsv, useAplicarStock, useStockIngresos } from '../../api/stockIngresos'
import { useCreatePagoProveedor, useAnularPagoProveedor } from '../../api/pagosProveedores'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import CodigoProveedorField from '../../components/bodega/CodigoProveedorField'
import ProveedorAutocomplete from '../../components/proveedores/ProveedorAutocomplete'

const BODEGAS = ['Inventario', 'Materias', 'Taller', 'ActivoFijo', 'GMantencion', 'GTransporte', 'GOperacionales', 'GAdministrativos', 'Importacion', 'Equipos']
const STOCK_BODEGAS = new Set(['Inventario', 'Materias', 'Taller'])
const DOCUMENTOS = ['Factura', 'Boleta', 'Nota']
const ESTADOS = ['Pendiente', 'Pagado', 'Vencido']
const DESTINOS = [
  { value: 'producto', label: 'Inventario' },
  { value: 'material', label: 'Material taller' },
  { value: 'tela', label: 'Tela' },
]

const today = () => new Date().toISOString().slice(0, 10)
const fmt = n => '$' + Number(n || 0).toLocaleString('es-CL')
const dateFmt = v => v ? new Date(v).toLocaleDateString('es-CL') : '-'

const isStockBodega = bodega => STOCK_BODEGAS.has(bodega)

const emptyHeader = (canApplyStock = true) => ({
  documento: 'Factura',
  nDoc: '',
  proveedorId: '',
  bodega: 'Inventario',
  estado: 'Pendiente',
  fechaDoc: today(),
  fechaVencimiento: '',
  fechaPago: '',
  obs: '',
  ingresaStock: canApplyStock,
})

const emptyDetail = () => ({
  codigoInterno: '',
  destino: 'producto',
  nombre: '',
  unidadMedida: '',
  cantidad: '1',
  precio: '',
})

export default function StockIngresosPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canWriteBodega = can(user, 'bodega', 'write')
  const canWriteProveedores = can(user, 'proveedores', 'write')
  const canReadProveedores = can(user, 'proveedores', 'read')
  const canReverse = can(user, 'proveedores', 'delete')
  const [filters, setFilters] = useState({ search: '', desde: '', hasta: '', nDoc: '', documento: '', estado: '', bodega: '', proveedorId: '' })
  const [filterProveedor, setFilterProveedor] = useState(null)
  const [formProveedor, setFormProveedor] = useState(null)
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [header, setHeader] = useState(() => emptyHeader(canWriteBodega))
  const [details, setDetails] = useState([emptyDetail()])
  const [documentoRecibidoId, setDocumentoRecibidoId] = useState(null)
  const [totalXmlReferencia, setTotalXmlReferencia] = useState(0)
  const [rutProveedorRecibido, setRutProveedorRecibido] = useState('')
  const [nombreProveedorRecibido, setNombreProveedorRecibido] = useState('')
  const [selectedRow, setSelectedRow] = useState(null)

  const queryParams = useMemo(() => {
    const params = { page: String(page) }
    for (const [key, value] of Object.entries(filters)) {
      if (value) params[key] = value
    }
    return params
  }, [filters, page])
  const exportParams = useMemo(() => {
    const params = {}
    for (const [key, value] of Object.entries(filters)) {
      if (value) params[key] = value
    }
    return params
  }, [filters])

  const { data = { items: [], total: 0, stats: {} }, isLoading, isError, error, refetch } = useStockIngresos(queryParams)
  const aplicarMut = useAplicarStock()
  const createMut = useCreatePagoProveedor()
  const anularMut = useAnularPagoProveedor()
  const limit = data.limit || 100
  const totalPages = Math.max(1, Math.ceil((data.total || 0) / limit))

  useEffect(() => {
    const prefill = location.state?.prefill
    if (!prefill) return
    // Navigation state intentionally hydrates this multi-field form once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeader({ ...emptyHeader(canWriteBodega), documento: prefill.documento, nDoc: prefill.nDoc, fechaDoc: prefill.fechaDoc || today() })
    setDetails(prefill.details?.length ? prefill.details : [emptyDetail()])
    setDocumentoRecibidoId(prefill.documentoRecibidoId || null)
    setTotalXmlReferencia(Number(prefill.totalReferencia || 0))
    setRutProveedorRecibido(prefill.proveedorRut || '')
    setNombreProveedorRecibido(prefill.proveedorNombre || '')
    setShowForm(true)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate, canWriteBodega])

  const setFilter = (key, value) => {
    setFilters(f => ({ ...f, [key]: value }))
    setPage(1)
  }
  const resetForm = () => {
    setHeader(emptyHeader(canWriteBodega))
    setDetails([emptyDetail()])
    setFormProveedor(null)
    setDocumentoRecibidoId(null)
    setTotalXmlReferencia(0)
    setRutProveedorRecibido('')
    setNombreProveedorRecibido('')
    setShowForm(false)
  }
  const setDetail = (idx, key, value) => {
    setDetails(rows => rows.map((row, i) => i === idx ? { ...row, [key]: value } : row))
  }
  const addDetail = () => setDetails(rows => [...rows, emptyDetail()])
  const removeDetail = idx => setDetails(rows => rows.length === 1 ? rows : rows.filter((_, i) => i !== idx))
  const clearFilters = () => {
    setFilters({ search: '', desde: '', hasta: '', nDoc: '', documento: '', estado: '', bodega: '', proveedorId: '' })
    setFilterProveedor(null)
    setPage(1)
  }

  const totalForm = details.reduce((sum, d) => sum + Number(d.cantidad || 0) * Number(d.precio || 0), 0)
  const validDetails = details
    .map(d => ({
      ...d,
      cantidad: Number(d.cantidad),
      precio: Number(d.precio),
      nombre: d.nombre.trim() || null,
      unidadMedida: d.unidadMedida.trim() || null,
    }))
    .filter(d => d.codigoInterno.trim())

  const applyStock = async (row) => {
    if (!canWriteBodega) return
    const action = row.documento === 'Nota' ? 'descontara stock' : 'sumara stock'
    if (!await confirmDialog({ title: 'Confirmar', detail: `Aplicar documento ${row.nDoc || row.id}: ${action}.` })) return
    aplicarMut.mutate(row.id, {
      onSuccess: (res) => {
        const ok = res.aplicados?.filter(a => a.ok).length || 0
        toast.success(res.idempotent ? 'El stock ya estaba aplicado.' : `Stock aplicado en ${ok} lineas.`)
      },
      onError: err => toast.error(err.response?.data?.error || 'No se pudo aplicar stock'),
    })
  }

  const saveFactura = () => {
    if (!header.proveedorId) return toast.warning('Proveedor requerido')
    if (!header.nDoc.trim()) return toast.warning('N Doc requerido')
    if (!validDetails.length) return toast.warning('Agrega al menos una linea de detalle')
    const invalid = validDetails.find(d => !Number.isFinite(d.cantidad) || d.cantidad <= 0 || !Number.isFinite(d.precio) || d.precio < 0)
    if (invalid) return toast.warning(`Cantidad o precio invalido en ${invalid.codigoInterno}`)
    const invalidProductQty = validDetails.find(d => d.destino === 'producto' && !Number.isInteger(d.cantidad))
    if (invalidProductQty) return toast.warning(`Cantidad de inventario debe ser entera en ${invalidProductQty.codigoInterno}`)
    createMut.mutate({
      ...header,
      documentoRecibidoId,
      proveedorId: Number(header.proveedorId),
      total: totalForm,
      nc: header.documento === 'Nota',
      ingresaStock: canWriteBodega && isStockBodega(header.bodega) && header.ingresaStock,
      detalles: validDetails.map(d => ({ ...d, codigoInterno: d.codigoInterno.trim() })),
    }, {
      onSuccess: result => {
        toast.success(result.idempotent ? 'El documento ya estaba ingresado.' : header.ingresaStock ? 'Documento guardado y stock aplicado.' : 'Documento guardado. El stock quedó pendiente de aplicación.')
        resetForm()
      },
      onError: err => toast.error(err.response?.data?.error || 'No se pudo crear el documento'),
    })
  }

  const anular = async (row) => {
    if (!canReverse) return
    const motivo = await promptDialog({ title: `Motivo de anulacion para ${row.nDoc || row.id}` })
    if (motivo === null) return
    if (!motivo.trim()) return toast.warning('Motivo requerido')
    anularMut.mutate({ id: row.id, motivo: motivo.trim() }, {
      onError: err => toast.error(err.response?.data?.error || 'No se pudo anular'),
    })
  }

  const handleExport = async (detalle = false) => {
    try {
      await downloadStockIngresosCsv(detalle ? { ...exportParams, detalle: '1' } : exportParams, detalle ? 'facturas_bodega_detalle.csv' : 'facturas_bodega_resumen.csv')
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo descargar el CSV. Verifique sus permisos.')
    }
  }

  const resumenDetalle = (r) => {
    const detalles = r.detallesFactura || []
    if (!detalles.length) return 'Sin detalle'
    return detalles.map(d => `${d.codigoInterno} x ${d.cantidad}`).slice(0, 3).join(' / ') + (detalles.length > 3 ? ` / +${detalles.length - 3}` : '')
  }

  const cols = [
    { key: 'fechaDoc', label: 'Fecha doc', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{dateFmt(v)}</span> },
    { key: 'documento', label: 'Tipo', render: v => <Badge tone={v === 'Nota' ? 'red' : 'blue'}>{v || '-'}</Badge> },
    { key: 'nDoc', label: 'N Doc', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v || '-'}</span> },
    { key: 'proveedor', label: 'Proveedor', wrap: true, render: v => v ? <div><div style={{ fontWeight: 600 }}>{v.nombre}</div><div style={{ color: 'var(--text-3)', fontSize: 11 }}>{v.rut || '-'}</div></div> : '-' },
    { key: 'bodega', label: 'Bodega', render: v => <Badge tone="neutral">{v || '-'}</Badge> },
    { key: 'estado', label: 'Pago', render: v => <Badge tone={v === 'Pagado' ? 'green' : v === 'Vencido' ? 'red' : 'amber'}>{v}</Badge> },
    { key: 'total', label: 'Total', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmt(v)}</span> },
    { key: 'detallesFactura', label: 'Detalle', wrap: true, render: (_, r) => <span style={{ fontSize: 12 }}>{resumenDetalle(r)}</span> },
    { key: 'stockAplicadoAt', label: 'Stock', render: (v, r) => v ? <Badge tone={r.stockReversadoAt ? 'gray' : 'green'}>{r.stockReversadoAt ? 'Reversado' : 'Aplicado'}</Badge> : <Badge tone="amber">Pendiente</Badge> },
    { key: '_acc', label: '', render: (_, r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Btn variant="ghost" size="xs" icon="eye" onClick={() => setSelectedRow(r)}>Ver</Btn>
        {canWriteBodega && isStockBodega(r.bodega) && !r.stockAplicadoAt && (r.detallesFactura?.length > 0) && <Btn variant="secondary" size="xs" icon="check" onClick={() => applyStock(r)} disabled={aplicarMut.isPending}>Aplicar</Btn>}
        {canReverse && <Btn variant="ghost" size="xs" icon="trash" onClick={() => anular(r)} disabled={anularMut.isPending}>Anular</Btn>}
      </div>
    ) },
  ]

  const toolbarExtra = (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1.5fr) repeat(5, minmax(130px, 1fr))', gap: 10, width: '100%', alignItems: 'start' }}>
      <SearchBar placeholder="Buscar N° doc, proveedor, RUT, código o producto…" value={filters.search} onChange={value => setFilter('search', value)} style={{ minWidth: 0, width: '100%' }} />
      <FormField label="Desde"><Input type="date" value={filters.desde} onChange={v => setFilter('desde', v)} /></FormField>
      <FormField label="Hasta"><Input type="date" value={filters.hasta} onChange={v => setFilter('hasta', v)} /></FormField>
      <FormField label="N° documento"><Input value={filters.nDoc} onChange={v => setFilter('nDoc', v)} /></FormField>
      <FormField label="Documento"><Select value={filters.documento} onChange={v => setFilter('documento', v)} options={[{ value: '', label: 'Todos' }, ...DOCUMENTOS]} /></FormField>
      <FormField label="Estado pago"><Select value={filters.estado} onChange={v => setFilter('estado', v)} options={[{ value: '', label: 'Todos' }, ...ESTADOS]} /></FormField>
      <FormField label="Bodega"><Select value={filters.bodega} onChange={v => setFilter('bodega', v)} options={[{ value: '', label: 'Todas' }, ...BODEGAS]} /></FormField>
      <ProveedorAutocomplete
        label="Proveedor"
        placeholder="Buscar proveedor…"
        selected={filterProveedor}
        onSelect={provider => { setFilterProveedor(provider); setFilter('proveedorId', String(provider.id)) }}
        onClear={() => { setFilterProveedor(null); setFilter('proveedorId', '') }}
      />
      {(Object.values(filters).some(Boolean) || filterProveedor) && <Btn variant="ghost" size="sm" onClick={clearFilters} style={{ alignSelf: 'center', justifySelf: 'start' }}>Limpiar filtros</Btn>}
    </div>
  )

  return (
    <main className="page page-wide">
      <PageHeader
        title="Ingreso Mercaderia"
        subtitle="Facturas, boletas y notas que afectan stock de bodega"
        breadcrumb={['Inicio', 'Bodega', 'Ingreso']}
        actions={
          <>
            {canReadProveedores && <Btn variant="secondary" icon="download" size="sm" onClick={() => handleExport(false)}>CSV resumen</Btn>}
            {canReadProveedores && <Btn variant="secondary" icon="download" size="sm" onClick={() => handleExport(true)}>CSV detalle</Btn>}
            {canWriteProveedores && <Btn variant="primary" icon="plus" size="sm" onClick={() => setShowForm(true)}>Nuevo doc</Btn>}
          </>
        }
      />
      <div className="kpi-strip">
        <KpiCard label="Documentos" value={data.total || 0} icon="fileText" />
        <KpiCard label="Pendientes stock" value={data.stats?.pendientesStock || 0} icon="clock" tone="amber" sublabel="Total filtrado" />
        <KpiCard label="Monto documentos" value={fmt(data.stats?.montoTotal || 0)} icon="dollarSign" tone="blue" sublabel="Total filtrado" />
      </div>

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {isLoading
          ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Cargando documentos de ingreso…</div>
          : isError
            ? <div style={{ padding: 48, textAlign: 'center' }}><strong>No se pudieron cargar los documentos.</strong><div style={{ margin: '8px 0 14px', color: 'var(--text-3)', fontSize: 13 }}>{error?.response?.data?.error || 'Revise la conexión e intente nuevamente.'}</div><Btn variant="secondary" icon="refreshCw" size="sm" onClick={() => refetch()}>Reintentar</Btn></div>
            : <Table columns={cols} rows={data.items || []} onRowClick={setSelectedRow} emptyMessage="Sin documentos para los filtros seleccionados" keyboard ariaLabel="Documentos de ingreso de mercadería" getRowKey={row => row.id} columnPrefsKey="stock-ingresos" toolbarExtra={toolbarExtra} pager={{ page, pages: totalPages, total: data.total || 0, limit, shown: (data.items || []).length, onChange: setPage, disabled: isLoading }} />
        }
      </div>

      {showForm && (
        <FormPanel title="Nuevo documento bodega" subtitle="Cabecera y detalle con ingreso de stock" width={900} onClose={resetForm} onSave={saveFactura} saving={createMut.isPending}>
          {documentoRecibidoId && <div style={{ padding: '10px 12px', marginBottom: 14, borderRadius: 8, background: 'var(--bg)', color: 'var(--text-2)', fontSize: 13 }}><strong>Precargado desde DTE recibido.</strong> Emisor: {nombreProveedorRecibido || 'sin razón social'} ({rutProveedorRecibido || 'sin RUT'}). El total XML es {fmt(totalXmlReferencia)}; revisa códigos internos, destino y categoría antes de guardar.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <FormField label="Documento" required><Select value={header.documento} onChange={v => setHeader(h => ({ ...h, documento: v }))} options={DOCUMENTOS} /></FormField>
            <FormField label="N Doc" required><Input value={header.nDoc} onChange={v => setHeader(h => ({ ...h, nDoc: v }))} /></FormField>
            <ProveedorAutocomplete
              label="Proveedor"
              required
              selected={formProveedor}
              initialQuery={rutProveedorRecibido || nombreProveedorRecibido}
              autoSelectRut={rutProveedorRecibido}
              onSelect={provider => { setFormProveedor(provider); setHeader(h => ({ ...h, proveedorId: String(provider.id) })) }}
              onClear={() => { setFormProveedor(null); setHeader(h => ({ ...h, proveedorId: '' })) }}
            />
            <FormField label="Bodega">
              <Select
                value={header.bodega}
                onChange={v => setHeader(h => ({ ...h, bodega: v, ingresaStock: canWriteBodega && isStockBodega(v) ? h.ingresaStock : false }))}
                options={BODEGAS}
              />
            </FormField>
            <FormField label="Estado"><Select value={header.estado} onChange={v => setHeader(h => ({ ...h, estado: v }))} options={ESTADOS} /></FormField>
            <FormField label="Fecha doc"><Input type="date" value={header.fechaDoc} onChange={v => setHeader(h => ({ ...h, fechaDoc: v }))} /></FormField>
            <FormField label="Vencimiento"><Input type="date" value={header.fechaVencimiento} onChange={v => setHeader(h => ({ ...h, fechaVencimiento: v }))} /></FormField>
            <FormField label="Fecha pago"><Input type="date" value={header.fechaPago} onChange={v => setHeader(h => ({ ...h, fechaPago: v }))} /></FormField>
          </div>
          <FormField label="Observaciones"><Textarea value={header.obs} onChange={v => setHeader(h => ({ ...h, obs: v }))} rows={2} /></FormField>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 16px', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={canWriteBodega && isStockBodega(header.bodega) && header.ingresaStock}
              disabled={!canWriteBodega || !isStockBodega(header.bodega)}
              onChange={e => setHeader(h => ({ ...h, ingresaStock: e.target.checked }))}
            />
            Aplicar stock al guardar
          </label>

          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13 }}>Detalle {documentoRecibidoId ? '— código interno obligatorio para cada línea precargada' : ''}</strong>
              <Btn variant="secondary" size="xs" icon="plus" onClick={addDetail}>Linea</Btn>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'oklch(0.985 0.004 155)' }}>
                    {['Codigo', 'Destino', 'Nombre si no existe', 'Unidad', 'Cantidad', 'Costo', ''].map(h => <th key={h} style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {details.map((d, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: 8, minWidth: 150 }}>
                        <CodigoProveedorField
                          value={d.codigoInterno}
                          onChange={v => setDetail(idx, 'codigoInterno', v)}
                          proveedorId={header.proveedorId ? Number(header.proveedorId) : null}
                          nombre={d.nombre}
                          onResolved={({ codigoInterno, nombre, unidadMedida, precio }) => setDetails(rows => rows.map((row, i) => i === idx
                            ? { ...row, codigoInterno, destino: 'producto', nombre: row.nombre || nombre, unidadMedida: row.unidadMedida || unidadMedida || '', precio: row.precio || String(precio || '') }
                            : row))}
                        />
                      </td>
                      <td style={{ padding: 8, minWidth: 140 }}><Select value={d.destino} onChange={v => setDetail(idx, 'destino', v)} options={DESTINOS} /></td>
                      <td style={{ padding: 8, minWidth: 180 }}><Input value={d.nombre} onChange={v => setDetail(idx, 'nombre', v)} /></td>
                      <td style={{ padding: 8, minWidth: 100 }}><Input value={d.unidadMedida} onChange={v => setDetail(idx, 'unidadMedida', v)} /></td>
                      <td style={{ padding: 8, minWidth: 90 }}><Input type="number" value={d.cantidad} onChange={v => setDetail(idx, 'cantidad', v)} /></td>
                      <td style={{ padding: 8, minWidth: 110 }}><Input type="number" value={d.precio} onChange={v => setDetail(idx, 'precio', v)} prefix="$" /></td>
                      <td style={{ padding: 8 }}><Btn variant="ghost" size="xs" icon="trash" onClick={() => removeDetail(idx)} disabled={details.length === 1}>Quitar</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: 12, borderTop: '1px solid var(--border)', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
              Total detalle {fmt(totalForm)}{documentoRecibidoId ? <span style={{ marginLeft: 12, color: totalForm === totalXmlReferencia ? 'var(--green-700)' : 'var(--amber)' }}>XML {fmt(totalXmlReferencia)}</span> : ''}
            </div>
          </div>
        </FormPanel>
      )}
      {selectedRow && (
        <ViewPanel title={`${selectedRow.documento || 'Documento'} ${selectedRow.nDoc || `#${selectedRow.id}`}`} subtitle="Detalle y trazabilidad del ingreso" onClose={() => setSelectedRow(null)}>
          <DetailRow label="Proveedor" value={selectedRow.proveedor?.nombre || 'Sin proveedor vinculado'} />
          <DetailRow label="RUT" value={selectedRow.proveedor?.rut || '—'} mono />
          <DetailRow label="Bodega" value={selectedRow.bodega || '—'} />
          <DetailRow label="Estado pago" value={selectedRow.estado || 'Pendiente'} />
          <DetailRow label="Estado stock" value={selectedRow.stockReversadoAt ? 'Reversado' : selectedRow.stockAplicadoAt ? 'Aplicado' : 'Pendiente'} />
          <DetailRow label="Fecha documento" value={dateFmt(selectedRow.fechaDoc)} />
          <DetailRow label="Vencimiento" value={dateFmt(selectedRow.fechaVencimiento)} />
          <DetailRow label="Fecha pago" value={dateFmt(selectedRow.fechaPago)} />
          <DetailRow label="Creado por" value={selectedRow.usuario || '—'} />
          <DetailRow label="Total" value={fmt(selectedRow.total)} mono />
          {selectedRow.obs && <DetailRow label="Observaciones" value={selectedRow.obs} />}
          <h3 style={{ margin: '22px 0 10px', fontSize: 14 }}>Líneas del documento</h3>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--bg)' }}>{['Código', 'Destino', 'Cantidad', 'Costo'].map(label => <th key={label} style={{ padding: 8, textAlign: label === 'Cantidad' || label === 'Costo' ? 'right' : 'left' }}>{label}</th>)}</tr></thead>
              <tbody>{(selectedRow.detallesFactura || []).map(detail => <tr key={detail.id || `${detail.codigoInterno}-${detail.destino}`} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: 8 }}>{detail.codigoInterno}</td><td style={{ padding: 8 }}>{detail.destino}</td><td style={{ padding: 8, textAlign: 'right' }}>{detail.cantidad}</td><td style={{ padding: 8, textAlign: 'right' }}>{fmt(detail.precio)}</td></tr>)}</tbody>
            </table>
          </div>
        </ViewPanel>
      )}
    </main>
  )
}
