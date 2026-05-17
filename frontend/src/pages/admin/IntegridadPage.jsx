import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, KpiCard, Badge, Btn } from '../../components/shared'
import { useIntegridadResumen, useIntegridadDetalle } from '../../api/admin'

const TIPOS = [
  { id: 'orden-items-huerfanos',     label: 'Orden items huérfanos',   key: 'orden_items_huerfanos',   cols: ['id', 'orden_id', 'producto_id', 'nombre', 'cantidad', 'precio_unitario'] },
  { id: 'odt-items-huerfanos',       label: 'ODT items huérfanos',     key: 'odt_items_huerfanos',     cols: ['id', 'odt_id', 'producto_id', 'nombre', 'cantidad'] },
  { id: 'productos-stock-negativo',  label: 'Productos stock negativo', key: 'productos_stock_negativo', cols: ['id', 'codigo_interno', 'nombre', 'stock', 'stock_critico', 'bodega'] },
  { id: 'productos-sin-precio',      label: 'Productos sin precio',    key: 'productos_sin_precio',    cols: ['id', 'codigo_interno', 'nombre', 'stock', 'bodega', 'categoria'] },
  { id: 'productos-mojibake',        label: 'Productos texto corrupto', key: 'productos_mojibake',     cols: ['id', 'codigo_interno', 'nombre', 'categoria'] },
  { id: 'odt-mojibake',              label: 'ODT texto corrupto',      key: 'odt_mojibake',            cols: ['id', 'descripcion', 'cliente_nombre', 'tipo', 'estado'] },
  { id: 'crm-sin-contacto',          label: 'CRM sin teléfono/email',  key: 'crm_sin_contacto',        cols: ['id', 'nombre_cliente', 'empresa', 'estado', 'prioridad'] },
  { id: 'codigo-barra-basura',       label: 'Códigos barra inválidos', key: 'codigo_barra_basura',     cols: ['id', 'codigo_interno', 'codigo_barra', 'nombre', 'stock'] },
]

const PRODUCT_TIPOS = new Set(['productos-stock-negativo', 'productos-sin-precio', 'productos-mojibake', 'codigo-barra-basura'])

export default function IntegridadPage() {
  const navigate = useNavigate()
  const [tipo, setTipo] = useState(TIPOS[0].id)
  const { data: resumen, isLoading: lr } = useIntegridadResumen()
  const { data: rows = [], isLoading: ld } = useIntegridadDetalle(tipo)
  const def = TIPOS.find(t => t.id === tipo)

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: 'clamp(12px, 2vw, 24px)' }}>
      <PageHeader
        title="Integridad de Datos"
        subtitle="Revisar y corregir registros con problemas. Solo administradores."
        breadcrumb={['Inicio', 'Admin', 'Integridad']}
      />

      <div className="kpi-strip">
        {TIPOS.map(t => (
          <KpiCard
            key={t.id}
            label={t.label}
            value={lr ? '…' : (resumen?.[t.key] ?? 0).toLocaleString('es-CL')}
            icon="alertTriangle"
            tone={resumen?.[t.key] > 0 ? 'amber' : 'neutral'}
            onClick={() => setTipo(t.id)}
          />
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden', marginTop: 14 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <strong style={{ fontSize: 14 }}>{def?.label}</strong>
            <Badge tone="neutral">{rows.length} de {resumen?.[def?.key] ?? 0}</Badge>
          </div>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}>
            {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {def?.cols.map(c => (
                  <th key={c} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--border)' }}>{c}</th>
                ))}
                <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--border)', width: 100 }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {ld && (
                <tr><td colSpan={def?.cols.length + 1} style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</td></tr>
              )}
              {!ld && rows.length === 0 && (
                <tr><td colSpan={def?.cols.length + 1} style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)' }}>Sin registros</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  {def?.cols.map(c => (
                    <td key={c} style={{ padding: '7px 12px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fmtCell(r[c])}
                    </td>
                  ))}
                  <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                    {PRODUCT_TIPOS.has(tipo) && r.id && (
                      <Btn size="xs" variant="secondary" onClick={() => navigate(`/bodega/${r.id}/editar`)}>Editar</Btn>
                    )}
                    {tipo === 'orden-items-huerfanos' && r.orden_id && (
                      <Btn size="xs" variant="secondary" onClick={() => navigate(`/ventas/${r.orden_id}/editar`)}>Ver venta</Btn>
                    )}
                    {tipo === 'odt-items-huerfanos' && r.odt_id && (
                      <Btn size="xs" variant="secondary" onClick={() => navigate(`/taller/${r.odt_id}`)}>Ver ODT</Btn>
                    )}
                    {tipo === 'odt-mojibake' && r.id && (
                      <Btn size="xs" variant="secondary" onClick={() => navigate(`/taller/${r.id}`)}>Editar</Btn>
                    )}
                    {tipo === 'crm-sin-contacto' && r.id && (
                      <Btn size="xs" variant="secondary" onClick={() => navigate(`/crm/${r.id}`)}>Editar</Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}

function fmtCell(v) {
  if (v == null || v === '') return <span style={{ color: 'var(--text-3)' }}>—</span>
  if (typeof v === 'number') return <span style={{ fontFamily: "'DM Mono', monospace" }}>{v.toLocaleString('es-CL')}</span>
  if (v instanceof Date || (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}T/))) return new Date(v).toLocaleString('es-CL')
  return String(v)
}
