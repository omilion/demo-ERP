import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, Table, Tabs } from '../../components/shared'
import { useIntegridadDetalle, useSaneamientoLegacyDryRun } from '../../api/admin'

const CATEGORIES = [
  {
    id: 'orden-items-huerfanos',
    key: 'orden_items_huerfanos',
    label: 'Items venta huerfanos',
    risk: 'alto',
    owner: 'Ventas',
    impact: 'Ordenes con lineas que apuntan a productos inexistentes.',
    sampleCols: ['id', 'orden_id', 'producto_id', 'nombre', 'cantidad', 'precio_unitario'],
  },
  {
    id: 'odt-items-huerfanos',
    key: 'odt_items_huerfanos',
    label: 'Items OT huerfanos',
    risk: 'alto',
    owner: 'Taller',
    impact: 'OT con consumo o trabajo asociado a productos inexistentes.',
    sampleCols: ['id', 'odt_id', 'producto_id', 'nombre', 'cantidad'],
  },
  {
    id: 'productos-stock-negativo',
    key: 'productos_stock_negativo',
    label: 'Stock negativo',
    risk: 'alto',
    owner: 'Bodega',
    impact: 'Inventario bajo cero que puede distorsionar compras, ventas y valorizacion.',
    sampleCols: ['id', 'codigo_interno', 'nombre', 'stock', 'stock_critico', 'bodega'],
  },
  {
    id: 'productos-sin-precio',
    key: 'productos_sin_precio',
    label: 'Productos sin precio',
    risk: 'medio',
    owner: 'Catalogo',
    impact: 'Productos activos sin precio util para cotizacion o venta.',
    sampleCols: ['id', 'codigo_interno', 'nombre', 'stock', 'bodega', 'categoria'],
  },
  {
    id: 'productos-codigo-duplicado',
    key: 'productos_codigo_duplicado',
    label: 'Codigos producto duplicados',
    risk: 'alto',
    owner: 'Catalogo',
    impact: 'Codigos internos reutilizados que pueden afectar ventas, stock y trazabilidad.',
    sampleCols: ['id', 'codigo_interno', 'nombre', 'activo', 'stock', 'precio_lista'],
  },
  {
    id: 'clientes-rut-duplicados',
    key: 'clientes_rut_duplicados',
    label: 'Clientes RUT duplicado',
    risk: 'alto',
    owner: 'Clientes',
    impact: 'Clientes repetidos por RUT que requieren canonico antes de consolidar historial.',
    sampleCols: ['id', 'rut', 'nombre', 'razon_social', 'activo'],
  },
  {
    id: 'proveedores-rut-duplicados',
    key: 'proveedores_rut_duplicados',
    label: 'Proveedores RUT duplicado',
    risk: 'medio',
    owner: 'Compras',
    impact: 'Proveedores repetidos por RUT que pueden distorsionar compras y reportes.',
    sampleCols: ['id', 'rut', 'nombre', 'razon_social', 'codigo_proveedor', 'activo'],
  },
  {
    id: 'orden-items-precio-negativo',
    key: 'orden_items_precio_negativo',
    label: 'Precios negativos',
    risk: 'alto',
    owner: 'Ventas',
    impact: 'Lineas de venta con precio negativo que deben revisarse con respaldo comercial.',
    sampleCols: ['id', 'orden_id', 'producto_id', 'codigo_interno', 'nombre', 'cantidad', 'precio_unitario'],
  },
  {
    id: 'ordenes-cliente-rut-mismatch',
    key: 'ordenes_cliente_rut_mismatch',
    label: 'Orden cliente/RUT mismatch',
    risk: 'alto',
    owner: 'Ventas',
    impact: 'Ventas donde el cliente asociado no coincide con el RUT registrado en la orden.',
    sampleCols: ['id', 'n_interno', 'cliente_id', 'cliente_actual', 'rut_actual', 'rut_cliente', 'target_matches', 'target_cliente_id', 'target_cliente', 'target_rut'],
  },
  {
    id: 'productos-mojibake',
    key: 'productos_mojibake',
    label: 'Texto corrupto producto',
    risk: 'medio',
    owner: 'Catalogo',
    impact: 'Nombres con caracteres migrados de forma defectuosa.',
    sampleCols: ['id', 'codigo_interno', 'nombre', 'categoria'],
  },
  {
    id: 'odt-mojibake',
    key: 'odt_mojibake',
    label: 'Texto corrupto OT',
    risk: 'medio',
    owner: 'Taller',
    impact: 'Descripciones de trabajo con texto ilegible o contaminado.',
    sampleCols: ['id', 'descripcion', 'cliente_nombre', 'tipo', 'estado'],
  },
  {
    id: 'crm-sin-contacto',
    key: 'crm_sin_contacto',
    label: 'CRM sin contacto',
    risk: 'bajo',
    owner: 'Ventas',
    impact: 'Prospectos o clientes sin telefono ni email registrado.',
    sampleCols: ['id', 'nombre_cliente', 'empresa', 'estado', 'prioridad'],
  },
  {
    id: 'codigo-barra-basura',
    key: 'codigo_barra_basura',
    label: 'Codigos barra invalidos',
    risk: 'medio',
    owner: 'Bodega',
    impact: 'Codigos cortos o basura que pueden provocar lecturas ambiguas.',
    sampleCols: ['id', 'codigo_interno', 'codigo_barra', 'nombre', 'stock'],
  },
  {
    id: 'odts-sin-cliente',
    key: 'odts_sin_cliente',
    label: 'OT sin cliente',
    risk: 'alto',
    owner: 'Taller',
    impact: 'Ordenes de trabajo sin cliente visible para trazabilidad operacional.',
    sampleCols: ['id', 'cliente_orden', 'orden_id', 'descripcion', 'estado'],
  },
  {
    id: 'resumen-sin-codigo-barra',
    key: 'sin_codigo_barra',
    label: 'Sin codigo barra',
    risk: 'bajo',
    owner: 'Bodega',
    impact: 'Productos activos sin identificador de lectura.',
  },
  {
    id: 'resumen-sin-codigo-interno',
    key: 'sin_codigo_interno',
    label: 'Sin codigo interno',
    risk: 'medio',
    owner: 'Catalogo',
    impact: 'Productos activos sin identificador interno consistente.',
  },
  {
    id: 'resumen-sin-categoria',
    key: 'sin_categoria',
    label: 'Sin categoria',
    risk: 'bajo',
    owner: 'Catalogo',
    impact: 'Productos activos sin agrupacion para filtros y reportes.',
  },
  {
    id: 'resumen-sin-proveedor',
    key: 'sin_proveedor',
    label: 'Sin proveedor',
    risk: 'bajo',
    owner: 'Compras',
    impact: 'Productos activos sin proveedor principal asignado.',
  },
  {
    id: 'resumen-bitacora-sin-fecha',
    key: 'bitacora_sin_fecha',
    label: 'Bitacora sin fecha',
    risk: 'medio',
    owner: 'Taller',
    impact: 'Eventos de taller sin fecha para auditoria cronologica.',
  },
]

const DETAIL_CATEGORIES = CATEGORIES.filter(c => c.sampleCols)
const riskTone = { alto: 'red', medio: 'amber', bajo: 'blue' }
const riskWeight = { alto: 3, medio: 2, bajo: 1 }

export default function SaneamientoLegacyPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('resumen')
  const [categoryId, setCategoryId] = useState(DETAIL_CATEGORIES[0].id)
  const { data: resumen = {}, isLoading, isError, error, refetch } = useSaneamientoLegacyDryRun()
  const activeCategory = DETAIL_CATEGORIES.find(c => c.id === categoryId) || DETAIL_CATEGORIES[0]
  const detailEnabled = tab === 'muestras' && !!activeCategory?.id
  const { data: sampleRows = [], isLoading: sampleLoading, isError: sampleError } = useIntegridadDetalle(activeCategory?.id, detailEnabled)

  const enriched = useMemo(() => CATEGORIES
    .map(c => ({ ...c, count: Number(resumen?.[c.key] ?? 0) }))
    .sort((a, b) => (riskWeight[b.risk] - riskWeight[a.risk]) || (b.count - a.count)), [resumen])

  const totalFindings = enriched.reduce((sum, c) => sum + c.count, 0)
  const highRisk = enriched.filter(c => c.risk === 'alto').reduce((sum, c) => sum + c.count, 0)
  const categoriesWithFindings = enriched.filter(c => c.count > 0).length
  const readOnlyStatus = 'Dry-run'

  const summaryCols = [
    { key: 'label', label: 'Categoria', render: (v, row) => (
      <div>
        <strong>{v}</strong>
        <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 2 }}>{row.impact}</div>
      </div>
    ), wrap: true },
    { key: 'owner', label: 'Area', render: v => <Badge tone="gray">{v}</Badge> },
    { key: 'risk', label: 'Riesgo', render: v => <Badge tone={riskTone[v]}>{v}</Badge> },
    { key: 'count', label: 'Hallazgos', align: 'right', render: v => <span style={monoStrong}>{v.toLocaleString('es-CL')}</span> },
    { key: 'id', label: 'Muestras', align: 'right', render: (_, row) => row.sampleCols
      ? <Btn size="xs" variant="secondary" onClick={() => { setCategoryId(row.id); setTab('muestras') }}>Ver</Btn>
      : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Solo conteo</span> },
  ]

  const sampleCols = (activeCategory?.sampleCols || []).map(key => ({
    key,
    label: key.replaceAll('_', ' '),
    render: value => fmtCell(value),
    wrap: key === 'nombre' || key === 'descripcion',
  }))

  const tabs = [
    { id: 'resumen', label: 'Dry-run', count: totalFindings },
    { id: 'muestras', label: 'Muestras', count: sampleRows.length },
    { id: 'controles', label: 'Controles' },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Saneamiento legacy controlado"
        subtitle="Vista de revision segura: conteos, muestras y riesgos sin ejecutar correcciones masivas."
        breadcrumb={['Inicio', 'Admin', 'Saneamiento legacy']}
        actions={<Btn variant="secondary" icon="refreshCw" onClick={() => refetch()} disabled={isLoading}>Actualizar dry-run</Btn>}
      />

      <div className="kpi-strip">
        <KpiCard label="Hallazgos dry-run" value={isLoading ? '...' : totalFindings} icon="clipboard" tone={totalFindings > 0 ? 'amber' : 'neutral'} />
        <KpiCard label="Riesgo alto" value={isLoading ? '...' : highRisk} icon="alertTriangle" tone={highRisk > 0 ? 'red' : 'neutral'} />
        <KpiCard label="Categorias afectadas" value={isLoading ? '...' : categoriesWithFindings} icon="layers" tone={categoriesWithFindings > 0 ? 'blue' : 'neutral'} />
        <KpiCard label="Modo ejecucion" value={readOnlyStatus} icon="lock" tone="neutral" sublabel="Sin apply masivo en esta pantalla" />
      </div>

      <section style={panelStyle}>
        <div style={{ padding: '14px 16px 0' }}>
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
        </div>

        {isError && (
          <StateBox
            tone="red"
            title="No se pudo cargar el dry-run"
            detail={error?.response?.data?.error || error?.message || 'Error consultando admin/integridad/resumen'}
            action={<Btn size="sm" variant="secondary" onClick={() => refetch()}>Reintentar</Btn>}
          />
        )}

        {!isError && tab === 'resumen' && (
          isLoading
            ? <StateBox title="Cargando dry-run" detail="Calculando conteos de integridad legacy..." />
            : <Table columns={summaryCols} rows={enriched} emptyMessage="Sin categorias configuradas" keyboard ariaLabel="Resumen de saneamiento legacy" getRowKey={row => row.key} />
        )}

        {!isError && tab === 'muestras' && (
          <div>
            <div style={{ padding: '0 16px 14px' }}>
              <strong style={{ fontSize: 14 }}>{activeCategory.label}</strong>
              <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 2 }}>
                Muestra limitada de lectura. Total dry-run: {(resumen?.[activeCategory.key] ?? 0).toLocaleString('es-CL')}
              </div>
            </div>
            {sampleError && <StateBox tone="red" title="No se pudo cargar la muestra" detail="La categoria seleccionada no respondio correctamente." />}
            {!sampleError && sampleLoading && <StateBox title="Cargando muestra" detail="Consultando registros representativos..." />}
            {!sampleError && !sampleLoading && (
              <Table
                columns={sampleCols}
                rows={sampleRows}
                emptyMessage="Sin hallazgos para esta categoria"
                keyboard
                ariaLabel="Muestra de hallazgos legacy"
                getRowKey={(row, index) => row.id || index}
                toolbarExtra={
                  <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={selectStyle}>
                    {DETAIL_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                }
              />
            )}
          </div>
        )}

        {!isError && tab === 'controles' && (
          <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(260px, 1fr)', gap: 14 }}>
            <ControlPanel
              title="Correccion manual controlada"
              badge="Separado"
              detail="Las correcciones existentes viven en Integridad y requieren seleccion explicita por registro o confirmacion puntual."
              action={<Btn variant="secondary" icon="wrench" onClick={() => navigate('/admin/integridad')}>Abrir Integridad</Btn>}
            />
            <ControlPanel
              title="Apply masivo destructivo"
              badge="Bloqueado"
              tone="red"
              detail="Esta pantalla no expone apply masivo. Si se habilita uno en otra iteracion, debe quedar separado del dry-run y pedir confirmacion explicita."
              action={<Btn variant="danger" icon="lock" disabled>Apply masivo no disponible</Btn>}
            />
          </div>
        )}
      </section>
    </main>
  )
}

function StateBox({ title, detail, action, tone = 'neutral' }) {
  return (
    <div style={{ padding: 36, textAlign: 'center', color: tone === 'red' ? 'var(--red)' : 'var(--text-3)' }}>
      <div style={{ fontWeight: 700, color: tone === 'red' ? 'var(--red)' : 'var(--text-2)' }}>{title}</div>
      {detail && <p style={{ marginTop: 6, fontSize: 13 }}>{detail}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

function ControlPanel({ title, detail, action, badge, tone = 'neutral' }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <strong>{title}</strong>
        <Badge tone={tone === 'red' ? 'red' : 'gray'}>{badge}</Badge>
      </div>
      <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '10px 0 14px', lineHeight: 1.45 }}>{detail}</p>
      {action}
    </div>
  )
}

function fmtCell(value) {
  if (value == null || value === '') return <span style={{ color: 'var(--text-3)' }}>-</span>
  if (typeof value === 'number') return <span style={mono}>{value.toLocaleString('es-CL')}</span>
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) return new Date(value).toLocaleString('es-CL')
  return String(value)
}

const mono = { fontFamily: "'DM Mono', monospace" }
const monoStrong = { ...mono, fontWeight: 700 }
const panelStyle = {
  background: '#fff',
  border: '1px solid var(--border)',
  borderRadius: 10,
  overflow: 'hidden',
  marginTop: 14,
}
const selectStyle = {
  padding: '7px 10px',
  borderRadius: 7,
  border: '1px solid var(--border)',
  fontSize: 13,
  minWidth: 260,
}
