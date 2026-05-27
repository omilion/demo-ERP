import { useState } from 'react'
import { Badge, Btn, KpiCard, PageHeader, Table } from '../../components/shared'
import { FormField, Input } from '../../components/forms'
import { useHistorialMateriales, useDeleteHistorialMaterial } from '../../api/historialMateriales'
import { downloadCsv } from '../../utils/csv'

export default function HistorialMaterialesPage() {
  const [operario, setOperario] = useState('')
  const [taller, setTaller] = useState('')
  const [codigo, setCodigo] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [page] = useState(1)

  const params = { page: String(page) }
  if (operario) params.operario = operario
  if (taller) params.taller = taller
  if (codigo) params.codigoInterno = codigo
  if (desde) params.desde = desde
  if (hasta) params.hasta = hasta

  const { data = { items: [], total: 0, totalEgreso: 0, totalIngreso: 0 }, isLoading } = useHistorialMateriales(params)
  const delMut = useDeleteHistorialMaterial()

  const cols = [
    { key: 'fecha', label: 'Fecha',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v ? new Date(v).toLocaleString('es-CL') : '—'}</span> },
    { key: 'codigoInterno', label: 'Código',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--green-700)' }}>{v}</span> },
    { key: 'nombre', label: 'Material', wrap: true,
      render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'taller', label: 'Taller',
      render: v => v ? <Badge tone="blue">{v}</Badge> : '—' },
    { key: 'usuario', label: 'Operario' },
    { key: 'odtId', label: 'ODT',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace" }}>#{v}</span> : '—' },
    { key: 'egreso', label: 'Egreso', align: 'right',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--red-700)', fontWeight: 600 }}>−{v}</span> : '—' },
    { key: 'ingreso', label: 'Ingreso', align: 'right',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--green-700)', fontWeight: 600 }}>+{v}</span> : '—' },
    { key: 'unidad', label: 'Unidad' },
    { key: '_acc', label: '', render: (_, r) => (
      <button onClick={(e) => { e.stopPropagation(); if (confirm('¿Eliminar?')) delMut.mutate(r.id) }} style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer', fontSize: 12 }}>Borrar</button>
    ) },
  ]

  const exportar = () => {
    downloadCsv(`historial_materiales_${new Date().toISOString().slice(0,10)}`, data.items, [
      { key: 'fecha', label: 'Fecha', fmt: v => v ? new Date(v).toLocaleString('es-CL') : '' },
      { key: 'codigoInterno', label: 'Código' },
      { key: 'nombre', label: 'Material' },
      { key: 'taller', label: 'Taller' },
      { key: 'usuario', label: 'Operario' },
      { key: 'odtId', label: 'ODT' },
      { key: 'egreso', label: 'Egreso' },
      { key: 'ingreso', label: 'Ingreso' },
      { key: 'unidad', label: 'Unidad' },
    ])
  }

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Historial de Materiales"
        subtitle="Movimientos en talleres"
        breadcrumb={['Inicio', 'Taller', 'Historial']}
        actions={<Btn variant="secondary" size="sm" onClick={exportar}>Exportar CSV</Btn>}
      />
      <div className="kpi-strip">
        <KpiCard label="Movimientos" value={data.total} icon="repeat" />
        <KpiCard label="Total egreso" value={data.totalEgreso.toFixed(2)} icon="trendingDown" tone="red" />
        <KpiCard label="Total ingreso" value={data.totalIngreso.toFixed(2)} icon="trendingUp" tone="green" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          <FormField label="Desde"><Input type="date" value={desde} onChange={setDesde} /></FormField>
          <FormField label="Hasta"><Input type="date" value={hasta} onChange={setHasta} /></FormField>
          <FormField label="Operario"><Input value={operario} onChange={setOperario} /></FormField>
          <FormField label="Taller"><Input value={taller} onChange={setTaller} /></FormField>
          <FormField label="Código interno"><Input value={codigo} onChange={setCodigo} /></FormField>
        </div>
        {isLoading
          ? <div style={{ padding: 48, textAlign: 'center' }}>Cargando…</div>
          : <Table columns={cols} rows={data.items} emptyMessage="Sin movimientos" />
        }
      </div>
    </main>
  )
}
