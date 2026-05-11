import { useState } from 'react'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Tabs, StatusDot } from '../../components/shared'

const COBRANZA_DATA = [
  { id: 1, venta: 15070, cliente: 'Servicio Nac. de Salud', monto: 4979039, vencimiento: '13-05-2026', dias: 0, estado: 'Al día', contacto: 'finanzas@sns.cl', notas: 'Licitación – plazo 30 días' },
  { id: 2, venta: 15055, cliente: 'Inst. Humanidades Luis Campino', monto: 768990, vencimiento: '26-04-2026', dias: 1, estado: 'Vencida', contacto: 'admin@campino.cl', notas: 'Llamado pendiente' },
  { id: 3, venta: 15048, cliente: 'Constructora Santa Elena', monto: 730500, vencimiento: '22-04-2026', dias: 5, estado: 'Vencida', contacto: 'compras@santaelena.cl', notas: 'Abono parcial recibido' },
  { id: 4, venta: 15015, cliente: 'Clínica Santa María', monto: 2100000, vencimiento: '05-05-2026', dias: 0, estado: 'Al día', contacto: 'adqui@santamaria.cl', notas: 'Convenio marco 30 días' },
  { id: 5, venta: 15008, cliente: 'Distribuidora Los Andes', monto: 256780, vencimiento: '28-03-2026', dias: 30, estado: 'Vencida', contacto: 'ventas@losandes.cl', notas: 'Retraso recurrente. 3er aviso.' },
  { id: 6, venta: 14985, cliente: 'Dir. Salud Reg. Metropolitana', monto: 8920500, vencimiento: '14-05-2026', dias: 0, estado: 'Al día', contacto: 'dsalud@gob.cl', notas: 'Licitación mayor – 60 días plazo' },
  { id: 7, venta: 14970, cliente: 'Ferretería El Perno Ltda.', monto: 89000, vencimiento: '15-04-2026', dias: 12, estado: 'Vencida', contacto: 'info@elperno.cl', notas: '' },
]

export default function CobranzaPage() {
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')

  const shown = COBRANZA_DATA
    .filter(c => tab === 'all' || (tab === 'vencida' && c.estado === 'Vencida') || (tab === 'aldia' && c.estado === 'Al día'))
    .filter(c => !search || c.cliente.toLowerCase().includes(search.toLowerCase()))

  const totalVencido = COBRANZA_DATA.filter(c => c.estado === 'Vencida').reduce((a, c) => a + c.monto, 0)
  const totalPendiente = COBRANZA_DATA.reduce((a, c) => a + c.monto, 0)
  const fmt = n => '$' + n.toLocaleString('es-CL')

  const cols = [
    { key: 'venta', label: 'Venta #', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v}</span> },
    { key: 'cliente', label: 'Cliente', wrap: true, render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
    { key: 'monto', label: 'Monto', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13 }}>{fmt(v)}</span> },
    { key: 'vencimiento', label: 'Vencimiento', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{v}</span> },
    { key: 'dias', label: 'Días vencido', align: 'right', render: v => v > 0 ? <Badge tone={v > 15 ? 'red' : 'amber'}>{v} días</Badge> : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span> },
    { key: 'estado', label: 'Estado', render: v => <StatusDot status={v} /> },
    { key: 'notas', label: 'Notas', wrap: true, render: v => <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{v || '—'}</span> },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}>Contactar</button>
        {row.estado === 'Vencida' && <button style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--red-bg)', background: 'var(--red-bg)', cursor: 'pointer', color: 'var(--red)', fontWeight: 500 }}>Multa</button>}
      </div>
    )},
  ]

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <PageHeader title="Cobranza" subtitle="Gestión de documentos por cobrar" breadcrumb={['Inicio', 'Cobranza']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm">Exportar</Btn>
          <Btn variant="primary" icon="send" size="sm">Enviar Recordatorios</Btn>
        </>}
      />
      <div className="kpi-strip">
        <KpiCard label="Total por cobrar" value={fmt(totalPendiente)} icon="dollarSign" sublabel="Suma de saldos pendientes" />
        <KpiCard label="Vencido" value={fmt(totalVencido)} icon="alertTriangle" tone="red" sublabel="Urgente gestionar" />
        <KpiCard label="Documentos vencidos" value={COBRANZA_DATA.filter(c=>c.estado==='Vencida').length} icon="clock" tone="amber" sublabel="Clientes en mora" />
        <KpiCard label="Al día" value={COBRANZA_DATA.filter(c=>c.estado==='Al día').length} icon="check" sublabel="Sin problemas" />
      </div>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs tabs={[
            { id: 'all', label: 'Todos', count: COBRANZA_DATA.length },
            { id: 'vencida', label: 'Vencidos', count: COBRANZA_DATA.filter(c=>c.estado==='Vencida').length },
            { id: 'aldia', label: 'Al día' },
          ]} active={tab} onChange={t => setTab(t)} />
          <SearchBar placeholder="Buscar cliente…" value={search} onChange={setSearch} style={{ width: 240, marginBottom: 10 }} />
        </div>
        <Table columns={cols} rows={shown} />
      </div>
    </main>
  )
}
