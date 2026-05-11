import { useState } from 'react'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table } from '../../components/shared'

const LICIT_DATA = [
  { id: 'LE15-1', nombre: 'Esp. hospitalarias Van Buren', organismo: 'Serv. Nacional Salud', total: 4979039, estado: 'Adjudicada', plazo: '28-04-2026', tipo: 'Licitación' },
  { id: 'LE02-3', nombre: 'Colchones CESFAM Viña del Mar', organismo: 'Municipalidad Viña del Mar', total: 3456780, estado: 'Adjudicada', plazo: 'Entregada', tipo: 'Licitación' },
  { id: 'LE11-2', nombre: 'Espumas CESFAM Región Metr.', organismo: 'Dir. Salud R. Metropolitana', total: 8920500, estado: 'En proceso', plazo: '14-05-2026', tipo: 'Licitación' },
  { id: 'CM-2026-003', nombre: 'Suministro colchones hospitalarios', organismo: 'Clínica Santa María', total: 2100000, estado: 'En proceso', plazo: '05-05-2026', tipo: 'Convenio Marco' },
  { id: 'LE08-5', nombre: 'Tapizado sillones oficina', organismo: 'Servicio de Impuestos Internos', total: 1234500, estado: 'Cotizada', plazo: '05-05-2026', tipo: 'Licitación' },
  { id: 'LE09-1', nombre: 'Bases cama establecimiento penal', organismo: 'Gendarmería de Chile', total: 6780000, estado: 'Cotizada', plazo: '15-05-2026', tipo: 'Licitación' },
]

export default function LicitacionesPage() {
  const [search, setSearch] = useState('')

  const shown = LICIT_DATA.filter(l => !search || l.nombre.toLowerCase().includes(search.toLowerCase()) || l.organismo.toLowerCase().includes(search.toLowerCase()))
  const fmt = n => '$' + n.toLocaleString('es-CL')
  const tone = { Adjudicada: 'green', 'En proceso': 'blue', Cotizada: 'amber', Perdida: 'red' }

  const cols = [
    { key: 'id', label: 'ID', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{v}</span> },
    { key: 'nombre', label: 'Descripción', wrap: true, render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
    { key: 'organismo', label: 'Organismo', wrap: true },
    { key: 'tipo', label: 'Tipo', render: v => <Badge tone={v === 'Convenio Marco' ? 'neutral' : 'blue'}>{v}</Badge> },
    { key: 'total', label: 'Monto', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{fmt(v)}</span> },
    { key: 'estado', label: 'Estado', render: v => <Badge tone={tone[v] || 'gray'}>{v}</Badge> },
    { key: 'plazo', label: 'Plazo', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-3)' }}>{v}</span> },
    { key: '_acc', label: '', render: () => (
      <button style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}>Ver</button>
    )},
  ]

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <PageHeader title="Licitaciones Cotizadas" subtitle="Mercado Público y Convenio Marco" breadcrumb={['Inicio', 'Ventas', 'Licitaciones']}
        actions={<Btn variant="primary" icon="plusCircle" size="sm">Nueva Cotización</Btn>}
      />
      <div className="kpi-strip">
        <KpiCard label="Total licitaciones" value={LICIT_DATA.length} icon="clipboard" />
        <KpiCard label="Adjudicadas" value={LICIT_DATA.filter(l=>l.estado==='Adjudicada').length} icon="check" tone="neutral" />
        <KpiCard label="En proceso" value={LICIT_DATA.filter(l=>l.estado==='En proceso').length} icon="refreshCw" tone="blue" />
        <KpiCard label="Monto total" value={fmt(LICIT_DATA.reduce((a,l)=>a+l.total,0))} icon="dollarSign" sublabel="Suma todas las licitaciones" />
      </div>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <SearchBar placeholder="Buscar licitación u organismo…" value={search} onChange={setSearch} style={{ width: 280 }} />
        </div>
        <Table columns={cols} rows={shown} />
      </div>
    </main>
  )
}
