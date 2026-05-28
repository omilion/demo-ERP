import { useMemo, useState } from 'react'
import { Badge, Btn, KpiCard, PageHeader, Table } from '../../components/shared'
import { FormField, FormPanel, Input, Select, Textarea } from '../../components/forms'
import { downloadStockIngresosCsv, useAplicarStock, useStockIngresos } from '../../api/stockIngresos'
import { useCreatePagoProveedor, useAnularPagoProveedor } from '../../api/pagosProveedores'
import { useProveedores } from '../../api/proveedores'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const BODEGAS = ['Inventario', 'Materias', 'ActivoFijo', 'GMantencion', 'GTransporte', 'GOperacionales', 'GAdministrativos', 'Importacion', 'Equipos']
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
  const { user } = useAuthStore()
  const canWriteBodega = can(user, 'bodega', 'write')
  const canWriteProveedores = can(user, 'proveedores', 'write')
  const canReverse = can(user, 'proveedores', 'delete')
  const [filters, setFilters] = useState({ desde: '', hasta: '', nDoc: '', documento: '', estado: '', bodega: '', proveedor: '' })
  const [proveedorSearch, setProveedorSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [header, setHeader] = useState(() => emptyHeader(canWriteBodega))
  const [details, setDetails] = useState([emptyDetail()])

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

  const { data = { items: [], total: 0 }, isLoading } = useStockIngresos(queryParams)
  const { data: proveedores = { items: [] } } = useProveedores(proveedorSearch ? { search: proveedorSearch } : {})
  const aplicarMut = useAplicarStock()
  const createMut = useCreatePagoProveedor()
  const anularMut = useAnularPagoProveedor()
  const limit = data.limit || 100
  const totalPages = Math.max(1, Math.ceil((data.total || 0) / limit))

  const setFilter = (key, value) => {
    setFilters(f => ({ ...f, [key]: value }))
    setPage(1)
  }
  const resetForm = () => {
    setHeader(emptyHeader(canWriteBodega))
    setDetails([emptyDetail()])
    setProveedorSearch('')
    setShowForm(false)
  }
  const setDetail = (idx, key, value) => {
    setDetails(rows => rows.map((row, i) => i === idx ? { ...row, [key]: value } : row))
  }
  const addDetail = () => setDetails(rows => [...rows, emptyDetail()])
  const removeDetail = idx => setDetails(rows => rows.length === 1 ? rows : rows.filter((_, i) => i !== idx))

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

  const applyStock = (row) => {
    if (!canWriteBodega) return
    const action = row.documento === 'Nota' ? 'descontara stock' : 'sumara stock'
    if (!confirm(`Aplicar documento ${row.nDoc || row.id}: ${action}.`)) return
    aplicarMut.mutate(row.id, {
      onSuccess: (res) => {
        const ok = res.aplicados?.filter(a => a.ok).length || 0
        alert(res.idempotent ? 'El stock ya estaba aplicado.' : `Stock aplicado en ${ok} lineas.`)
      },
      onError: err => alert(err.response?.data?.error || 'No se pudo aplicar stock'),
    })
  }

  const saveFactura = () => {
    if (!header.proveedorId) return alert('Proveedor requerido')
    if (!header.nDoc.trim()) return alert('N Doc requerido')
    if (!validDetails.length) return alert('Agrega al menos una linea de detalle')
    const invalid = validDetails.find(d => !Number.isFinite(d.cantidad) || d.cantidad <= 0 || !Number.isFinite(d.precio) || d.precio < 0)
    if (invalid) return alert(`Cantidad o precio invalido en ${invalid.codigoInterno}`)
    const invalidProductQty = validDetails.find(d => d.destino === 'producto' && !Number.isInteger(d.cantidad))
    if (invalidProductQty) return alert(`Cantidad de inventario debe ser entera en ${invalidProductQty.codigoInterno}`)
    createMut.mutate({
      ...header,
      proveedorId: Number(header.proveedorId),
      total: totalForm,
      nc: header.documento === 'Nota',
      ingresaStock: canWriteBodega && isStockBodega(header.bodega) && header.ingresaStock,
      detalles: validDetails.map(d => ({ ...d, codigoInterno: d.codigoInterno.trim() })),
    }, {
      onSuccess: () => resetForm(),
      onError: err => alert(err.response?.data?.error || 'No se pudo crear el documento'),
    })
  }

  const anular = (row) => {
    if (!canReverse) return
    const motivo = prompt(`Motivo de anulacion para ${row.nDoc || row.id}`)
    if (motivo === null) return
    if (!motivo.trim()) return alert('Motivo requerido')
    anularMut.mutate({ id: row.id, motivo: motivo.trim() }, {
      onError: err => alert(err.response?.data?.error || 'No se pudo anular'),
    })
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
        {canWriteBodega && isStockBodega(r.bodega) && !r.stockAplicadoAt && <Btn variant="secondary" size="xs" icon="check" onClick={() => applyStock(r)} disabled={aplicarMut.isPending}>Aplicar</Btn>}
        {canReverse && <Btn variant="ghost" size="xs" icon="trash" onClick={() => anular(r)} disabled={anularMut.isPending}>Anular</Btn>}
      </div>
    ) },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Ingreso Mercaderia"
        subtitle="Facturas, boletas y notas que afectan stock de bodega"
        breadcrumb={['Inicio', 'Bodega', 'Ingreso']}
        actions={
          <>
            <Btn variant="secondary" icon="download" size="sm" onClick={() => downloadStockIngresosCsv(exportParams, 'facturas_bodega_resumen.csv')}>CSV resumen</Btn>
            <Btn variant="secondary" icon="download" size="sm" onClick={() => downloadStockIngresosCsv({ ...exportParams, detalle: '1' }, 'facturas_bodega_detalle.csv')}>CSV detalle</Btn>
            {canWriteProveedores && <Btn variant="primary" icon="plus" size="sm" onClick={() => setShowForm(true)}>Nuevo doc</Btn>}
          </>
        }
      />
      <div className="kpi-strip">
        <KpiCard label="Documentos" value={data.total || 0} icon="fileText" />
        <KpiCard label="Pendientes stock" value={(data.items || []).filter(i => !i.stockAplicadoAt).length} icon="clock" tone="amber" sublabel="Pagina actual" />
        <KpiCard label="Monto pagina" value={fmt((data.items || []).reduce((s, p) => s + Number(p.total || 0), 0))} icon="dollarSign" tone="blue" />
      </div>

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <FormField label="Desde"><Input type="date" value={filters.desde} onChange={v => setFilter('desde', v)} /></FormField>
          <FormField label="Hasta"><Input type="date" value={filters.hasta} onChange={v => setFilter('hasta', v)} /></FormField>
          <FormField label="N Doc"><Input value={filters.nDoc} onChange={v => setFilter('nDoc', v)} /></FormField>
          <FormField label="Documento"><Select value={filters.documento} onChange={v => setFilter('documento', v)} options={[{ value: '', label: 'Todos' }, ...DOCUMENTOS]} /></FormField>
          <FormField label="Estado pago"><Select value={filters.estado} onChange={v => setFilter('estado', v)} options={[{ value: '', label: 'Todos' }, ...ESTADOS]} /></FormField>
          <FormField label="Bodega"><Select value={filters.bodega} onChange={v => setFilter('bodega', v)} options={[{ value: '', label: 'Todas' }, ...BODEGAS]} /></FormField>
          <FormField label="Proveedor"><Input value={filters.proveedor} onChange={v => setFilter('proveedor', v)} placeholder="Nombre, RUT o codigo" /></FormField>
        </div>
        {isLoading
          ? <div style={{ padding: 48, textAlign: 'center' }}>Cargando...</div>
          : <Table columns={cols} rows={data.items || []} emptyMessage="Sin documentos de bodega" keyboard ariaLabel="Documentos de ingreso de mercaderia" getRowKey={row => row.id} />
        }
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Pagina {page} de {totalPages} - {data.total || 0} registros</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || isLoading}>Anterior</Btn>
            <Btn variant="secondary" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isLoading}>Siguiente</Btn>
          </div>
        </div>
      </div>

      {showForm && (
        <FormPanel title="Nuevo documento bodega" subtitle="Cabecera y detalle con ingreso de stock" width={900} onClose={resetForm} onSave={saveFactura} saving={createMut.isPending}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <FormField label="Documento" required><Select value={header.documento} onChange={v => setHeader(h => ({ ...h, documento: v }))} options={DOCUMENTOS} /></FormField>
            <FormField label="N Doc" required><Input value={header.nDoc} onChange={v => setHeader(h => ({ ...h, nDoc: v }))} /></FormField>
            <FormField label="Buscar proveedor"><Input value={proveedorSearch} onChange={setProveedorSearch} placeholder="Nombre, RUT o codigo" /></FormField>
            <FormField label="Proveedor" required>
              <Select value={header.proveedorId} onChange={v => setHeader(h => ({ ...h, proveedorId: v }))} options={[{ value: '', label: 'Seleccionar' }, ...(proveedores.items || []).map(p => ({ value: String(p.id), label: `${p.nombre} ${p.rut ? `(${p.rut})` : ''}` }))]} />
            </FormField>
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
              <strong style={{ fontSize: 13 }}>Detalle</strong>
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
                      <td style={{ padding: 8, minWidth: 130 }}><Input value={d.codigoInterno} onChange={v => setDetail(idx, 'codigoInterno', v)} /></td>
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
              Total {fmt(totalForm)}
            </div>
          </div>
        </FormPanel>
      )}
    </main>
  )
}
