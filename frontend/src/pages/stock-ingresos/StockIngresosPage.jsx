import { useState } from 'react'
import { Badge, Btn, KpiCard, PageHeader, Table } from '../../components/shared'
import { FormField, Input } from '../../components/forms'
import { useStockIngresos, useAplicarStock } from '../../api/stockIngresos'

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

export default function StockIngresosPage() {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [nDoc, setNDoc] = useState('')
  const [page, setPage] = useState(1)

  const params = { page: String(page) }
  if (desde) params.desde = desde
  if (hasta) params.hasta = hasta
  if (nDoc) params.nDoc = nDoc

  const { data = { items: [], total: 0 }, isLoading } = useStockIngresos(params)
  const aplicarMut = useAplicarStock()

  const aplicar = (id) => {
    if (!confirm('¿Aplicar este ingreso al stock? Suma cantidades al inventario.')) return
    aplicarMut.mutate(id, {
      onSuccess: (res) => {
        const ok = res.aplicados?.filter(a => a.ok).length || 0
        const fail = res.aplicados?.filter(a => !a.ok).length || 0
        alert(`Aplicado. ${ok} productos actualizados. ${fail} fallidos.`)
      },
    })
  }
  const resumenDetalle = (r) => {
    const detalles = r.detallesFactura || []
    if (!detalles.length) return 'Sin detalle'
    const counts = detalles.reduce((acc, d) => {
      const key = d.destino || 'producto'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    return Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' / ')
  }

  const cols = [
    { key: 'fechaDoc', label: 'Fecha doc',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v ? new Date(v).toLocaleDateString('es-CL') : '—'}</span> },
    { key: 'documento', label: 'Tipo',
      render: v => v ? <Badge tone="blue">{v}</Badge> : '—' },
    { key: 'nDoc', label: 'N° Doc',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v || '—'}</span> },
    { key: 'estado', label: 'Estado',
      render: v => <Badge tone={v === 'Pagado' ? 'green' : 'amber'}>{v}</Badge> },
    { key: 'total', label: 'Total', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--green-700)', fontWeight: 600 }}>{fmt(v)}</span> },
    { key: 'detallesFactura', label: 'Recepcion',
      render: (_, r) => <span style={{ fontSize: 12 }}>{resumenDetalle(r)}</span> },
    { key: 'stockAplicadoAt', label: 'Stock',
      render: v => v ? <Badge tone="green">Aplicado</Badge> : <Badge tone="amber">Pendiente</Badge> },
    { key: 'usuario', label: 'Usuario' },
    { key: '_acc', label: '', render: (_, r) => (
      <Btn variant="secondary" size="sm" onClick={() => aplicar(r.id)} disabled={aplicarMut.isPending || !!r.stockAplicadoAt}>Aplicar a stock</Btn>
    ) },
  ]

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Ingreso Mercadería"
        subtitle="Facturas / boletas proveedor que ingresan stock"
        breadcrumb={['Inicio', 'Bodega', 'Ingreso']}
      />
      <div className="kpi-strip">
        <KpiCard label="Facturas" value={data.total} icon="fileText" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <FormField label="Desde"><Input type="date" value={desde} onChange={setDesde} /></FormField>
          <FormField label="Hasta"><Input type="date" value={hasta} onChange={setHasta} /></FormField>
          <FormField label="N° Doc"><Input value={nDoc} onChange={setNDoc} /></FormField>
        </div>
        {isLoading
          ? <div style={{ padding: 48, textAlign: 'center' }}>Cargando…</div>
          : <Table columns={cols} rows={data.items} emptyMessage="Sin facturas" />
        }
      </div>
    </main>
  )
}
