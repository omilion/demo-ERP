import { useNavigate } from 'react-router-dom'
import { useAiInsights } from '../../api/ai'
import { Badge, Icon, PageHeader, SectionCard } from '../../components/shared'

const TONES = { critica: 'red', alta: 'red', media: 'amber', informativa: 'blue' }

export default function AiInsightsPage() {
  const navigate = useNavigate()
  const { data, isLoading, error, refetch, isFetching } = useAiInsights()
  const alerts = data?.alerts || []

  return (
    <main className="page-shell">
      <PageHeader
        title="Bandeja de atención IA"
        subtitle="Alertas operativas calculadas en vivo y limitadas por tus permisos."
        breadcrumb={['Inicio', 'Ayuda', 'Copiloto IA', 'Alertas']}
        action={<button className="btn btn-secondary" onClick={() => refetch()} disabled={isFetching}><Icon name="refreshCw" size={14} /> Actualizar</button>}
      />

      <SectionCard title={data?.headline || 'Revisando la operación'} icon="alertTriangle">
        {isLoading && <p style={{ color: 'var(--text-3)' }}>Calculando alertas…</p>}
        {error && <p style={{ color: 'var(--red)' }}>No fue posible calcular la bandeja. Intenta nuevamente.</p>}
        {!isLoading && !error && alerts.length === 0 && <p style={{ color: 'var(--text-3)' }}>No hay alertas disponibles para tus módulos.</p>}
        <div style={{ display: 'grid', gap: 10 }}>
          {alerts.map(alert => (
            <button key={alert.id} onClick={() => navigate(alert.route)} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: '#fff', textAlign: 'left', cursor: 'pointer' }}>
              <Badge tone={TONES[alert.priority] || 'gray'}>{alert.priority}</Badge>
              <span>
                <strong style={{ display: 'block', color: 'var(--text-1)', marginBottom: 3 }}>{alert.title}</strong>
                <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{alert.module} · {alert.detail}</span>
              </span>
              <Icon name="chevronRight" size={16} color="var(--text-3)" />
            </button>
          ))}
        </div>
      </SectionCard>

      {data?.coverage?.length > 0 && (
        <SectionCard title="Cobertura del análisis" icon="shield">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.coverage.map(item => <Badge key={item.module} tone={item.ok ? 'green' : 'amber'}>{item.module}: {item.ok ? 'incluido' : 'no disponible'}</Badge>)}
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 10 }}>{data.disclaimer}</p>
        </SectionCard>
      )}
    </main>
  )
}
