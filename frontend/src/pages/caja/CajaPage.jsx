import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, Table, Tabs } from '../../components/shared'

const MOVIMIENTOS = [
  { id: 1, tipo: 'Ingreso', concepto: 'Pago Venta #15031 – Municipalidad Viña del Mar', monto: 3456780, hora: '09:14', forma: 'Transferencia', usuario: 'Amy' },
  { id: 2, tipo: 'Ingreso', concepto: 'Pago Venta #15020 – Hotel Enjoy', monto: 890000, hora: '10:02', forma: 'Cheque', usuario: 'Diego' },
  { id: 3, tipo: 'Egreso', concepto: 'Compra telas proveedor TEXTIL SUR', monto: -245000, hora: '10:45', forma: 'Transferencia', usuario: 'Marcelo' },
  { id: 4, tipo: 'Ingreso', concepto: 'Venta sala mostrador – Colchón Spring', monto: 189900, hora: '11:20', forma: 'Efectivo', usuario: 'Cinthia' },
  { id: 5, tipo: 'Egreso', concepto: 'Pago luz eléctrica sucursal', monto: -89000, hora: '11:55', forma: 'Transferencia', usuario: 'Diego' },
  { id: 6, tipo: 'Ingreso', concepto: 'Abono Venta #15048 – Constructora Santa Elena', monto: 500000, hora: '12:30', forma: 'Transferencia', usuario: 'Marcelo' },
  { id: 7, tipo: 'Egreso', concepto: 'Gastos operacionales taller', monto: -34500, hora: '14:10', forma: 'Efectivo', usuario: 'Pedro M.' },
  { id: 8, tipo: 'Ingreso', concepto: 'Venta sala mostrador – Viscoelástico', monto: 89900, hora: '15:22', forma: 'Débito', usuario: 'Cinthia' },
  { id: 9, tipo: 'Egreso', concepto: 'Reposición materiales madera', monto: -67000, hora: '16:05', forma: 'Cheque', usuario: 'Roberto A.' },
  { id: 10, tipo: 'Ingreso', concepto: 'Pago boleta electrónica #34521', monto: 45000, hora: '16:48', forma: 'Efectivo', usuario: 'Cinthia' },
]

export default function CajaPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('hoy')

  const ingresos = MOVIMIENTOS.filter(m => m.tipo === 'Ingreso').reduce((a, m) => a + m.monto, 0)
  const egresos = Math.abs(MOVIMIENTOS.filter(m => m.tipo === 'Egreso').reduce((a, m) => a + m.monto, 0))
  const saldo = ingresos - egresos
  const fmt = n => '$' + Math.abs(n).toLocaleString('es-CL')

  const cols = [
    { key: 'hora', label: 'Hora', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-3)' }}>{v}</span> },
    { key: 'tipo', label: 'Tipo', render: v => <Badge tone={v === 'Ingreso' ? 'green' : 'red'}>{v}</Badge> },
    { key: 'concepto', label: 'Concepto', wrap: true },
    { key: 'forma', label: 'Forma de pago', render: v => <Badge tone="gray">{v}</Badge> },
    { key: 'monto', label: 'Monto', align: 'right', render: v => (
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: v > 0 ? 'var(--green-600)' : 'var(--red)', fontSize: 13 }}>
        {v > 0 ? '+' : ''}{fmt(v)}
      </span>
    )},
    { key: 'usuario', label: 'Usuario' },
  ]

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Caja"
        subtitle="Movimientos del día · 27 de abril 2026"
        breadcrumb={['Inicio', 'Caja']}
        actions={<>
          <Btn variant="secondary" icon="printer" size="sm">Cierre Caja</Btn>
          <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/caja/nuevo')}>Nuevo Movimiento</Btn>
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Ingresos hoy" value={fmt(ingresos)} icon="trendingUp" tone="neutral" sublabel="Total entradas" />
        <KpiCard label="Egresos hoy" value={fmt(egresos)} icon="trendingDown" tone="amber" sublabel="Total salidas" />
        <KpiCard label="Saldo del día" value={fmt(saldo)} icon="dollarSign" tone={saldo > 0 ? 'neutral' : 'red'} sublabel="Resultado neto" />
        <KpiCard label="Movimientos" value={MOVIMIENTOS.length} icon="refreshCw" sublabel="Transacciones registradas" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs tabs={[{ id: 'hoy', label: 'Hoy', count: MOVIMIENTOS.length }, { id: 'semana', label: 'Esta semana' }, { id: 'mes', label: 'Este mes' }]} active={tab} onChange={setTab} />
          <Btn variant="secondary" icon="download" size="sm">Excel</Btn>
        </div>
        <Table columns={cols} rows={MOVIMIENTOS} />
        <div style={{ padding: '14px 20px', borderTop: '2px solid var(--border)', background: 'oklch(0.985 0.004 155)', display: 'flex', justifyContent: 'flex-end', gap: 32 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Ingresos: <strong style={{ color: 'var(--green-600)', fontFamily: "'DM Mono', monospace" }}>{fmt(ingresos)}</strong></span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Egresos: <strong style={{ color: 'var(--red)', fontFamily: "'DM Mono', monospace" }}>-{fmt(egresos)}</strong></span>
          <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 700 }}>Saldo: <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--green-600)' }}>{fmt(saldo)}</span></span>
        </div>
      </div>
    </main>
  )
}
