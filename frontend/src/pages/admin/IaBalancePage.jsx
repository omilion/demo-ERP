import { useState, useMemo } from 'react'
import { PageHeader, Badge, KpiCard, SectionCard, Btn, SearchBar, Table, Icon } from '../../components/shared'
import { useAiBalance } from '../../api/admin'

export default function IaBalancePage() {
  const [preset, setPreset] = useState('30d')
  const [dates, setDates] = useState(() => getDatesForPreset('30d'))
  const [userEmail, setUserEmail] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [chartMetric, setChartMetric] = useState('queries') // 'queries' | 'cost'
  const [selectedLog, setSelectedLog] = useState(null)
  
  const limit = 50

  const selectPreset = (nextPreset) => {
    setPreset(nextPreset)
    if (nextPreset !== 'custom') {
      setDates(getDatesForPreset(nextPreset))
      setPage(0)
    }
  }

  // Fetch data
  const params = useMemo(() => ({
    startDate: dates.startDate || undefined,
    endDate: dates.endDate || undefined,
    userEmail: userEmail || undefined,
    q: searchQuery || undefined,
    limit,
    offset: page * limit,
  }), [dates, userEmail, searchQuery, page])

  const { data, isLoading } = useAiBalance(params)

  const summary = data?.summary || {
    totalQueries: 0,
    totalDocumentos: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
    avgLatency: 0,
    successCount: 0,
    errorCount: 0,
    successRate: 100,
  }

  const charts = data?.charts || {
    byDay: [],
    byUser: [],
    byModel: [],
    byTool: [],
  }

  const logs = data?.logs || {
    items: [],
    total: 0,
  }

  const pages = Math.max(1, Math.ceil(logs.total / limit))

  // Utility to format date strings for display
  const fmtDate = (d) => {
    if (!d) return '-'
    return new Date(d).toLocaleString('es-CL', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Calculate highest value in day series to normalize bar chart heights
  const maxChartValue = useMemo(() => {
    if (!charts.byDay.length) return 1
    return Math.max(...charts.byDay.map(d => chartMetric === 'queries' ? d.queries : d.cost), 0.0001)
  }, [charts.byDay, chartMetric])

  // Columns for the audit log table
  const tableColumns = [
    { key: 'createdAt', label: 'Fecha', render: v => fmtDate(v) },
    { key: 'userNombre', label: 'Usuario', render: (v, row) => (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 600 }}>{v || 'Sistema'}</span>
        <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{row.userEmail || '-'}</span>
      </div>
    )},
    { key: 'question', label: 'Pregunta', wrap: true, render: v => (
      <span style={{ fontSize: 12, display: 'inline-block', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {v || '(vacío)'}
      </span>
    )},
    { key: 'model', label: 'Modelo', render: v => (
      <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: 'var(--text-2)' }}>{v || '-'}</span>
    )},
    { key: 'tokenUsage', label: 'Tokens', render: v => v ? (
      <span style={{ fontFamily: "'DM Mono', monospace', fontSize: 11" }}>
        {(v.input_tokens + v.output_tokens).toLocaleString('es-CL')}
      </span>
    ) : '-' },
    { key: 'estimatedCost', label: 'Costo', render: v => (
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--blue)' }}>
        {v != null ? `US$ ${v.toFixed(4)}` : '-'}
      </span>
    )},
    { key: 'latencyMs', label: 'Latencia', render: v => (
      <span style={{ fontFamily: "'DM Mono', monospace" }}>
        {v != null ? `${(v / 1000).toFixed(1)}s` : '-'}
      </span>
    )},
    { key: 'status', label: 'Estado', render: v => (
      <Badge tone={v === 'ok' ? 'green' : 'red'}>{v === 'ok' ? 'OK' : 'ERROR'}</Badge>
    )},
    { key: '_acc', label: '', render: (_, row) => (
      <button 
        onClick={(e) => { e.stopPropagation(); setSelectedLog(row) }} 
        style={actionBtnStyle}
      >
        Detalles
      </button>
    )},
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="IA Balance (Consumo & Auditoría)"
        subtitle="Métricas detalladas de consumo, estimación de costos y registro histórico de consultas al Asistente IA."
        breadcrumb={['Inicio', 'Admin', 'IA Balance']}
      />

      {/* Filter panel */}
      <div style={filterPanelStyle}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            ['7d', '7 días'],
            ['30d', '30 días'],
            ['mes', 'Este mes'],
            ['todo', 'Todo el tiempo'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => selectPreset(id)}
              style={presetTabStyle(preset === id)}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => selectPreset('custom')}
            style={presetTabStyle(preset === 'custom')}
          >
            Personalizado
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {preset === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={labelStyle}>Desde:</span>
              <input
                type="date"
                value={dates.startDate}
                onChange={e => {
                  setDates(d => ({ ...d, startDate: e.target.value }))
                  setPage(0)
                }}
                style={inputStyle}
              />
              <span style={labelStyle}>Hasta:</span>
              <input
                type="date"
                value={dates.endDate}
                onChange={e => {
                  setDates(d => ({ ...d, endDate: e.target.value }))
                  setPage(0)
                }}
                style={inputStyle}
              />
            </div>
          )}
          
          <input
            placeholder="Filtrar por email de usuario..."
            value={userEmail}
            onChange={e => { setUserEmail(e.target.value); setPage(0) }}
            style={searchEmailStyle}
          />

          <SearchBar
            placeholder="Buscar en preguntas..."
            value={searchQuery}
            onChange={v => { setSearchQuery(v); setPage(0) }}
            style={{ width: 260 }}
          />
        </div>
      </div>

      {/* KPI Stats */}
      <div className="kpi-strip" style={{ marginBottom: 20 }}>
        <KpiCard
          label="Consultas Procesadas"
          value={isLoading ? '...' : summary.totalQueries}
          icon="messageSquare"
          tone="neutral"
        />
        <KpiCard
          label="Documentos Generados"
          value={isLoading ? '...' : (summary.totalDocumentos ?? 0)}
          icon="fileText"
          tone="green"
          sublabel="Excel / PowerPoint"
        />
        <KpiCard
          label="Costo Estimado (USD)"
          value={isLoading ? '...' : `US$ ${summary.totalCost.toFixed(2)}`}
          icon="dollarSign"
          tone="blue"
        />
        <KpiCard
          label="Tokens Consumidos"
          value={isLoading ? '...' : summary.totalTokens.toLocaleString('es-CL')}
          icon="zap"
          tone="amber"
          sublabel={!isLoading ? `${summary.inputTokens.toLocaleString('es-CL')} in / ${summary.outputTokens.toLocaleString('es-CL')} out` : ''}
        />
        <KpiCard
          label="Tasa de Éxito"
          value={isLoading ? '...' : `${summary.successRate.toFixed(1)}%`}
          icon="checkCircle"
          tone={summary.errorCount > 0 ? 'red' : 'neutral'}
          sublabel={!isLoading ? `${summary.errorCount} fallidas` : ''}
        />
        <KpiCard
          label="Latencia Promedio"
          value={isLoading ? '...' : `${(summary.avgLatency / 1000).toFixed(1)}s`}
          icon="clock"
          tone="neutral"
        />
      </div>

      {/* Charts Grid */}
      <div style={chartsGridStyle}>
        {/* Dynamic Usage Chart */}
        <SectionCard 
          title={`Evolución Diaria (${chartMetric === 'queries' ? 'Consultas' : 'Costo USD'})`} 
          icon="trendingUp"
          action={
            <div style={{ display: 'flex', gap: 4 }}>
              <button 
                onClick={() => setChartMetric('queries')} 
                style={metricToggleStyle(chartMetric === 'queries')}
              >
                Consultas
              </button>
              <button 
                onClick={() => setChartMetric('cost')} 
                style={metricToggleStyle(chartMetric === 'cost')}
              >
                Costo
              </button>
            </div>
          }
        >
          <div style={{ padding: '16px 20px' }}>
            {isLoading ? (
              <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                Cargando datos históricos...
              </div>
            ) : charts.byDay.length === 0 ? (
              <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                Sin datos en este rango.
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-end', height: 180, gap: 6, paddingBottom: 24, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
                  {charts.byDay.map(day => {
                    const activeVal = chartMetric === 'queries' ? day.queries : day.cost
                    const pct = Math.max(8, Math.round((activeVal / maxChartValue) * 100))
                    const barColor = chartMetric === 'queries' ? 'var(--green-600)' : 'var(--blue)'
                    const hoverColor = chartMetric === 'queries' ? 'var(--green-700)' : 'var(--blue-bg)'
                    
                    return (
                      <div key={day.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 26 }}>
                        {/* Bar */}
                        <div
                          title={`${day.date}\nConsultas: ${day.queries}\nCosto: US$ ${day.cost.toFixed(4)}\nTokens: ${day.tokens.toLocaleString('es-CL')}`}
                          style={{
                            width: '100%',
                            height: `${pct}%`,
                            background: barColor,
                            borderRadius: '4px 4px 0 0',
                            transition: 'height 0.3s ease, background 0.1s',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = hoverColor}
                          onMouseLeave={e => e.currentTarget.style.background = barColor}
                        />
                        {/* Label */}
                        <span style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 6, transform: 'rotate(-45deg)', transformOrigin: 'top left', whiteSpace: 'nowrap', width: 0, height: 0 }}>
                          {day.date.slice(5)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ height: 14 }} />
              </div>
            )}
          </div>
        </SectionCard>

        {/* User Breakdown */}
        <SectionCard title="Consumo por Usuario" icon="users">
          <div style={{ maxHeight: 250, overflowY: 'auto', padding: '6px 14px' }}>
            {isLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
            ) : charts.byUser.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>Sin actividad</div>
            ) : (
              <table style={miniTableStyle}>
                <thead>
                  <tr>
                    <th style={miniThStyle}>Nombre</th>
                    <th style={miniThStyle}>Email</th>
                    <th style={{ ...miniThStyle, textAlign: 'right' }}>Consultas</th>
                    <th style={{ ...miniThStyle, textAlign: 'right' }}>Costo (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {charts.byUser.map(u => (
                    <tr key={u.email} style={miniTrStyle}>
                      <td style={miniTdStyle}>{u.nombre}</td>
                      <td style={{ ...miniTdStyle, fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{u.email}</td>
                      <td style={{ ...miniTdStyle, textAlign: 'right', fontWeight: 600 }}>{u.queries.toLocaleString('es-CL')}</td>
                      <td style={{ ...miniTdStyle, textAlign: 'right', fontFamily: "'DM Mono', monospace", color: 'var(--blue)' }}>US$ {u.cost.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </SectionCard>

        {/* Model Breakdown */}
        <SectionCard title="Consumo por Modelo" icon="layers">
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '6px 14px' }}>
            {isLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
            ) : charts.byModel.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>Sin actividad</div>
            ) : (
              <table style={miniTableStyle}>
                <thead>
                  <tr>
                    <th style={miniThStyle}>Modelo</th>
                    <th style={{ ...miniThStyle, textAlign: 'right' }}>Consultas</th>
                    <th style={{ ...miniThStyle, textAlign: 'right' }}>Costo (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {charts.byModel.map(m => (
                    <tr key={m.model} style={miniTrStyle}>
                      <td style={{ ...miniTdStyle, fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{m.model}</td>
                      <td style={{ ...miniTdStyle, textAlign: 'right', fontWeight: 600 }}>{m.queries.toLocaleString('es-CL')}</td>
                      <td style={{ ...miniTdStyle, textAlign: 'right', fontFamily: "'DM Mono', monospace", color: 'var(--blue)' }}>US$ {m.cost.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </SectionCard>

        {/* Tools breakdown */}
        <SectionCard title="Herramientas Utilizadas" icon="wrench">
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '6px 14px' }}>
            {isLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
            ) : charts.byTool.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>Sin herramientas usadas</div>
            ) : (
              <table style={miniTableStyle}>
                <thead>
                  <tr>
                    <th style={miniThStyle}>Herramienta (Tool)</th>
                    <th style={{ ...miniThStyle, textAlign: 'right' }}>Invocaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {charts.byTool.map(t => (
                    <tr key={t.name} style={miniTrStyle}>
                      <td style={{ ...miniTdStyle, fontWeight: 500, color: 'var(--green-700)' }}>{t.name}</td>
                      <td style={{ ...miniTdStyle, textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{t.count.toLocaleString('es-CL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Recent logs section */}
      <SectionCard title="Registro Completo de Auditoría IA" icon="fileText">
        {isLoading ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando logs...</div>
        ) : (
          <Table
            columns={tableColumns}
            rows={logs.items}
            emptyMessage="No se encontraron consultas registradas en este período."
            keyboard
            onRowDoubleClick={row => setSelectedLog(row)}
            ariaLabel="Logs Auditoría IA"
            getRowKey={row => row.id}
            pager={{
              page: page + 1,
              pages,
              total: logs.total,
              limit,
              shown: logs.items.length,
              onChange: (p) => setPage(p - 1),
            }}
          />
        )}
      </SectionCard>

      {/* Log Detail Modal */}
      {selectedLog && (
        <DetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </main>
  )
}

function DetailModal({ log, onClose }) {
  const cost = log.estimatedCost != null ? log.estimatedCost : 0
  const totalTokens = log.tokenUsage ? (log.tokenUsage.input_tokens + log.tokenUsage.output_tokens) : 0
  const usedToolsList = Array.isArray(log.usedTools) ? log.usedTools : []

  return (
    <div onClick={onClose} style={modalOverlayStyle}>
      <div onClick={e => e.stopPropagation()} style={modalPanelStyle}>
        <div style={modalHeaderStyle}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Detalle de Consulta IA</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>ID de Request: {log.requestId || 'N/A'}</div>
          </div>
          <button onClick={onClose} style={modalCloseBtnStyle}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={modalBodyStyle}>
          {/* Metadata Grid */}
          <div style={metadataGridStyle}>
            <div style={metaCardStyle}>
              <span style={metaLabelStyle}>Usuario</span>
              <span style={metaValueStyle}>{log.userNombre || 'Sistema'}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{log.userEmail || '-'}</span>
            </div>
            <div style={metaCardStyle}>
              <span style={metaLabelStyle}>Modelo</span>
              <span style={{ ...metaValueStyle, fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{log.model || '-'}</span>
            </div>
            <div style={metaCardStyle}>
              <span style={metaLabelStyle}>Consumo</span>
              <span style={metaValueStyle}>{totalTokens.toLocaleString('es-CL')} tokens</span>
              {log.tokenUsage && (
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  In: {log.tokenUsage.input_tokens.toLocaleString('es-CL')} / Out: {log.tokenUsage.output_tokens.toLocaleString('es-CL')}
                </span>
              )}
            </div>
            <div style={metaCardStyle}>
              <span style={metaLabelStyle}>Costo Estimado</span>
              <span style={{ ...metaValueStyle, color: 'var(--blue)', fontFamily: "'DM Mono', monospace" }}>
                US$ {cost.toFixed(4)}
              </span>
            </div>
            <div style={metaCardStyle}>
              <span style={metaLabelStyle}>Latencia</span>
              <span style={metaValueStyle}>{(log.latencyMs / 1000).toFixed(2)}s</span>
            </div>
            <div style={metaCardStyle}>
              <span style={metaLabelStyle}>Fecha</span>
              <span style={metaValueStyle}>
                {new Date(log.createdAt).toLocaleString('es-CL')}
              </span>
            </div>
          </div>

          {/* Badges / Extras */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Estado:</span>
              <Badge tone={log.status === 'ok' ? 'green' : 'red'}>{log.status === 'ok' ? 'Operación exitosa' : 'Operación fallida'}</Badge>
            </div>
            {log.ip && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>IP:</span>
                <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-3)' }}>{log.ip}</span>
              </div>
            )}
            {log.role && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>Rol:</span>
                <Badge tone="gray">{log.role}</Badge>
              </div>
            )}
          </div>

          {/* Warning / Error box if failed */}
          {log.status !== 'ok' && log.error && (
            <div style={errorBoxStyle}>
              <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="alertTriangle" size={14} color="var(--red)" />
                Detalle del Error:
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{log.error}</pre>
            </div>
          )}

          {/* Tool Calls */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>Herramientas Ejecutadas (Tools):</div>
            {usedToolsList.length === 0 ? (
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Ninguna (conversación puramente textual)</span>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {usedToolsList.map((t, idx) => (
                  <Badge key={idx} tone="neutral">{t}</Badge>
                ))}
              </div>
            )}
          </div>

          {/* Question / Prompt */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>Pregunta del Usuario:</div>
            <div style={promptBoxStyle}>{log.question}</div>
          </div>

          {/* LLM Output Preview */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>Respuesta del Asistente (Vista previa):</div>
            <div style={responseBoxStyle}>{log.answerPreview || '(sin respuesta)'}</div>
          </div>
        </div>

        <div style={modalFooterStyle}>
          <Btn variant="secondary" size="sm" onClick={onClose}>Cerrar</Btn>
        </div>
      </div>
    </div>
  )
}

// Preset generator utility
function getDatesForPreset(p) {
  const today = new Date()
  let start = new Date()
  
  if (p === '7d') {
    start.setDate(today.getDate() - 7)
  } else if (p === '30d') {
    start.setDate(today.getDate() - 30)
  } else if (p === 'mes') {
    start = new Date(today.getFullYear(), today.getMonth(), 1)
  } else if (p === 'todo') {
    return { startDate: '', endDate: '' }
  }
  
  const format = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  
  return {
    startDate: format(start),
    endDate: format(today)
  }
}

// Styles
const filterPanelStyle = {
  background: '#fff',
  borderRadius: 12,
  padding: '12px 18px',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-sm)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  marginBottom: 20
}

const presetTabStyle = (active) => ({
  padding: '6px 12px',
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: active ? 'var(--green-900)' : '#fff',
  color: active ? '#fff' : 'var(--text-2)',
  cursor: 'pointer',
  transition: 'all 0.15s'
})

const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }
const inputStyle = { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12.5, background: '#fff' }
const searchEmailStyle = { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12.5, width: 220 }

const chartsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
  gap: 20,
  marginBottom: 20
}

const metricToggleStyle = (active) => ({
  padding: '3px 8px',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 5,
  border: '1px solid var(--border)',
  background: active ? 'var(--green-900)' : '#fff',
  color: active ? '#fff' : 'var(--text-2)',
  cursor: 'pointer',
  transition: 'all 0.12s'
})

const actionBtnStyle = {
  padding: '3px 8px',
  fontSize: 11,
  borderRadius: 5,
  border: '1px solid var(--border)',
  background: '#fff',
  cursor: 'pointer',
  color: 'var(--green-700)',
  fontWeight: 500
}

const miniTableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
const miniThStyle = { padding: '6px 8px', textAlign: 'left', color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', borderBottom: '2px solid var(--border)' }
const miniTrStyle = { borderBottom: '1px solid var(--border)' }
const miniTdStyle = { padding: '8px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }

// Modal Styles
const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.45)',
  backdropFilter: 'blur(2px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
}

const modalPanelStyle = {
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 20px 48px rgba(0,0,0,0.22)',
  width: 720,
  maxWidth: '92vw',
  maxHeight: '88vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  animation: 'fadeIn 0.18s ease-out',
}

const modalHeaderStyle = {
  padding: '16px 20px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: 'oklch(0.985 0.004 155)',
}

const modalCloseBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--text-3)',
  cursor: 'pointer',
  padding: 4,
  display: 'inline-flex',
  alignItems: 'center',
}

const modalBodyStyle = {
  padding: '20px',
  overflowY: 'auto',
  flex: 1,
}

const metadataGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
  marginBottom: 16
}

const metaCardStyle = {
  background: 'oklch(0.99 0.002 220)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
}

const metaLabelStyle = { fontSize: 10.5, color: 'var(--text-3)', fontWeight: 500, textTransform: 'uppercase', marginBottom: 3 }
const metaValueStyle = { fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }

const promptBoxStyle = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '12px 14px',
  fontSize: 12.5,
  color: 'var(--text-1)',
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
}

const responseBoxStyle = {
  background: 'oklch(0.995 0.002 155)',
  border: '1px solid var(--green-100)',
  borderRadius: 8,
  padding: '12px 14px',
  fontSize: 12.5,
  color: 'var(--text-1)',
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  maxHeight: 250,
  overflowY: 'auto',
}

const errorBoxStyle = {
  background: 'var(--red-bg)',
  border: '1px solid oklch(0.92 0.04 25)',
  borderRadius: 8,
  padding: '12px 14px',
  color: 'var(--red)',
  marginBottom: 16,
}

const modalFooterStyle = {
  padding: '12px 20px',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'flex-end',
  background: 'oklch(0.99 0.002 220)',
}
