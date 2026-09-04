import { useState, useMemo } from 'react'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Tabs, Icon } from '../../components/shared'
import {
  useOrdenesCompraProveedores,
  useAprobarOCProveedor,
  useRechazarOCProveedor,
  useEnviarOCProveedor,
  useRecepcionarOCProveedor,
  useCreateOCProveedor,
  useTiemposBodega,
} from '../../api/ordenesCompraProveedores'
import { useProveedores } from '../../api/proveedores'
import { useProductos } from '../../api/productos'
import { toast, confirmDialog } from '../../store/notif'
import { useAuthStore } from '../../store/auth'
import { can, hasRole } from '../../utils/permissions'
import BotonExportar from '../../components/BotonExportar'
import SugerenciaOCSection from './SugerenciaOCSection'

function money(value) {
  return '$' + Number(value || 0).toLocaleString('es-CL')
}

function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('es-CL')
}

function formatDays(value) {
  return value == null ? '—' : `${Number(value).toLocaleString('es-CL', { maximumFractionDigits: 1 })} días`
}

function estadoBadgeTone(estado) {
  if (estado === 'Aprobada por Gerencia') return 'green'
  if (estado === 'Completada') return 'green'
  if (estado === 'Enviada a Proveedor') return 'blue'
  if (estado === 'Pendiente Aprobación') return 'amber'
  if (estado === 'Recepcionada Parcial') return 'amber'
  if (estado === 'Rechazada' || estado === 'Cancelada') return 'red'
  return 'gray'
}

export default function OrdenesCompraProveedoresPage({ embedded = false }) {
  const { user } = useAuthStore()
  const isAdminOrGerencia = hasRole(user, ['admin']) || user?.role === 'admin'
  const canWriteBodega = can(user, 'bodega', 'write')

  const [activeTab, setActiveTab] = useState('ordenes') // 'ordenes' | 'sugerencias'
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState('all')
  const [proveedorId, setProveedorId] = useState('')
  const [selectedOC, setSelectedOC] = useState(null)
  const [receptionOC, setReceptionOC] = useState(null)
  const [rejectModalOC, setRejectModalOC] = useState(null)
  const [manualModalOpen, setManualModalOpen] = useState(false)

  const queryParams = useMemo(() => {
    const q = {}
    if (search) q.search = search
    if (estado !== 'all') q.estado = estado
    if (proveedorId) q.proveedorId = proveedorId
    return q
  }, [search, estado, proveedorId])

  const { data = { items: [], total: 0, kpis: {} } } = useOrdenesCompraProveedores(queryParams)
  const { data: tiemposBodega = {} } = useTiemposBodega()
  const { data: proveedoresData = { items: [] } } = useProveedores()
  const proveedoresList = proveedoresData.items || []

  const aprobarMutation = useAprobarOCProveedor()
  const enviarMutation = useEnviarOCProveedor()

  const handleAprobar = async (oc) => {
    if (!(await confirmDialog({
      title: 'Aprobar Orden de Compra (Gerencia)',
      detail: `¿Aprobar formalmente la orden de compra ${oc.numeroOc} por ${money(oc.total)} a ${oc.proveedorNombre}?`,
      tone: 'primary',
    }))) return

    aprobarMutation.mutate(oc.id, {
      onSuccess: (res) => toast.success(res.message || 'Orden de compra aprobada exitosamente por Gerencia'),
      onError: (err) => toast.error(err.response?.data?.error || 'Error al aprobar orden de compra'),
    })
  }

  const handleEnviar = async (oc) => {
    if (!(await confirmDialog({
      title: 'Enviar a Proveedor',
      detail: `¿Marcar la orden ${oc.numeroOc} como enviada a ${oc.proveedorNombre}?`,
      tone: 'primary',
    }))) return

    enviarMutation.mutate(oc.id, {
      onSuccess: (res) => toast.success(res.message || 'Orden marcada como enviada al proveedor'),
      onError: (err) => toast.error(err.response?.data?.error || 'Error al actualizar orden'),
    })
  }

  const columns = [
    {
      key: 'numeroOc',
      header: 'N° Orden de Compra',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>{row.numeroOc}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Emisión: {formatDate(row.fechaEmision)}</div>
        </div>
      ),
    },
    {
      key: 'proveedor',
      header: 'Proveedor',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{row.proveedorNombre || row.proveedor?.nombre}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>RUT: {row.proveedorRut || row.proveedor?.rut || '-'}</div>
        </div>
      ),
    },
    {
      key: 'fechaRequerida',
      header: 'Fecha Requerida',
      render: (row) => (
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{formatDate(row.fechaRequerida)}</span>
      ),
    },
    {
      key: 'items',
      header: 'Ítems / Unidades',
      render: (row) => {
        const totalQty = (row.items || []).reduce((acc, it) => acc + (it.cantidadPedida || 0), 0)
        const count = row.items?.length || 0
        return (
          <div>
            <span style={{ fontWeight: 600 }}>{totalQty.toLocaleString('es-CL')} un.</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>({count} {count === 1 ? 'ítem' : 'ítems'})</span>
          </div>
        )
      },
    },
    {
      key: 'total',
      header: 'Monto Total (c/IVA)',
      align: 'right',
      render: (row) => (
        <div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 12.5, color: 'var(--text-1)' }}>
            {money(row.total)}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>
            Neto: {money(row.subtotalNeto)}
          </div>
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (row) => (
        <div>
          <Badge tone={estadoBadgeTone(row.estado)} size="sm">
            {row.estado}
          </Badge>
          {row.aprobadorNombre && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
              Aprobó: {row.aprobadorNombre}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          {/* Botón Aprobar Gerencia */}
          {['Borrador', 'Pendiente Aprobación'].includes(row.estado) && isAdminOrGerencia && (
            <button
              onClick={(e) => { e.stopPropagation(); handleAprobar(row) }}
              title="Aprobar Orden de Compra (Gerencia)"
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                background: '#15803d',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Icon name="check" size={12} />
              Aprobar
            </button>
          )}

          {/* Botón Rechazar */}
          {['Borrador', 'Pendiente Aprobación'].includes(row.estado) && isAdminOrGerencia && (
            <button
              onClick={(e) => { e.stopPropagation(); setRejectModalOC(row) }}
              title="Rechazar"
              style={{
                padding: '4px 6px',
                borderRadius: 6,
                background: '#fff',
                border: '1px solid var(--border)',
                color: 'var(--red)',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              <Icon name="x" size={12} />
            </button>
          )}

          {/* Botón Enviar a Proveedor */}
          {row.estado === 'Aprobada por Gerencia' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleEnviar(row) }}
              title="Marcar como Enviada al Proveedor"
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                background: '#0284c7',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Icon name="send" size={12} />
              Enviar
            </button>
          )}

          {/* Botón Recepcionar en Bodega */}
          {['Aprobada por Gerencia', 'Enviada a Proveedor', 'Recepcionada Parcial'].includes(row.estado) && canWriteBodega && (
            <button
              onClick={(e) => { e.stopPropagation(); setReceptionOC(row) }}
              title="Recepcionar en Bodega"
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Icon name="package" size={12} />
              Recepcionar
            </button>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); setSelectedOC(row) }}
            title="Ver Detalle"
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              background: '#f8fafc',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              color: 'var(--text-2)',
            }}
          >
            <Icon name="eye" size={13} />
          </button>
        </div>
      ),
    },
  ]

  const kpis = data.kpis || {}

  const tabs = [
    { id: 'ordenes', label: 'Bandeja de Órdenes de Compra' },
    { id: 'sugerencias', label: 'Generador de Sugerencias de OC (Ventas vs Stock)' },
  ]

  return (
    <main style={{ padding: embedded ? '0' : '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {!embedded && (
        <PageHeader
          title="Órdenes de Compra a Proveedores"
          subtitle="Generación automática por ventas, cotización de reposición y aprobación de Gerencia"
          breadcrumb={['Inicio', 'Bodega', 'Órdenes de Compra Proveedores']}
          actions={
            <>
              <BotonExportar
                url="/ordenes-compra-proveedores/export"
                nombre={`ordenes_compra_${new Date().toISOString().slice(0, 10)}`}
              />
              {canWriteBodega && (
                <Btn
                  variant="primary"
                  icon="plusCircle"
                  size="sm"
                  onClick={() => setManualModalOpen(true)}
                >
                  Nueva OC Manual
                </Btn>
              )}
            </>
          }
        />
      )}

      {/* Sub-navegación interna */}
      <div style={{ marginBottom: 16 }}>
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'sugerencias' ? (
        <SugerenciaOCSection onCreatedOC={() => { setActiveTab('ordenes') }} />
      ) : (
        <>
          {/* KPI Strip */}
          <div className="kpi-strip" style={{ marginBottom: 16 }}>
            <KpiCard
              label="Borradores / En Edición"
              value={kpis.totalBorradores ?? 0}
              icon="edit"
              sublabel="Generadas por bodega"
              onClick={() => setEstado('Borrador')}
            />
            <KpiCard
              label="Pendientes Aprobación"
              value={kpis.totalPendientes ?? 0}
              icon="clock"
              tone="amber"
              sublabel="Esperando a Gerencia"
              onClick={() => setEstado('Pendiente Aprobación')}
            />
            <KpiCard
              label="Aprobadas por Gerencia"
              value={kpis.totalAprobadas ?? 0}
              icon="checkCircle"
              tone="green"
              sublabel={`Monto: ${money(kpis.montoTotalAprobado ?? 0)}`}
              onClick={() => setEstado('Aprobada por Gerencia')}
            />
            <KpiCard
              label="Enviadas / En Tránsito"
              value={kpis.totalEnviadas ?? 0}
              icon="truck"
              tone="blue"
              sublabel="En despacho de proveedor"
              onClick={() => setEstado('Enviada a Proveedor')}
            />
          </div>

          <div className="kpi-strip" style={{ marginBottom: 8 }}>
            <KpiCard
              label="OC → recepción"
              value={formatDays(tiemposBodega.ocARecepcion?.promedioDias)}
              icon="clock"
              tone="blue"
              sublabel={`${tiemposBodega.ocARecepcion?.muestras ?? 0} OCs con ambas fechas`}
            />
            <KpiCard
              label="Interno → despacho entregado"
              value={formatDays(tiemposBodega.internoADespacho?.promedioDias)}
              icon="truck"
              tone="green"
              sublabel={`${tiemposBodega.internoADespacho?.muestras ?? 0} despachos con ambas fechas`}
            />
          </div>
          <p style={{ margin: '0 0 16px', color: 'var(--text-3)', fontSize: 12 }}>
            El tiempo completo OC → recepción → interno → despacho se habilitará cuando exista una relación explícita entre la compra al proveedor y la venta despachada.
          </p>

          {/* Tabla de Órdenes */}
          <div style={{
            background: '#fff',
            borderRadius: 12,
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            <Table
              columns={columns}
              rows={data.items || []}
              emptyMessage="No se encontraron órdenes de compra con esos criterios"
              onRowDoubleClick={(row) => setSelectedOC(row)}
              getRowKey={(row) => row.id}
              stickyHeader
              toolbarExtra={
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <SearchBar
                    value={search}
                    onChange={setSearch}
                    placeholder="Buscar por N° OC, proveedor, RUT, producto..."
                    style={{ width: 260, height: 28 }}
                  />

                  <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                    style={{ height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: '#fff', cursor: 'pointer' }}
                  >
                    <option value="all">Todos los estados</option>
                    <option value="Borrador">Borrador</option>
                    <option value="Pendiente Aprobación">Pendiente Aprobación</option>
                    <option value="Aprobada por Gerencia">Aprobada por Gerencia</option>
                    <option value="Enviada a Proveedor">Enviada a Proveedor</option>
                    <option value="Recepcionada Parcial">Recepcionada Parcial</option>
                    <option value="Completada">Completada</option>
                    <option value="Rechazada">Rechazada</option>
                  </select>

                  <select
                    value={proveedorId}
                    onChange={(e) => setProveedorId(e.target.value)}
                    style={{ height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: '#fff', cursor: 'pointer', maxWidth: 200 }}
                  >
                    <option value="">Todos los proveedores</option>
                    {proveedoresList.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>

                  {embedded && canWriteBodega && (
                    <Btn
                      variant="primary"
                      icon="plusCircle"
                      size="xs"
                      onClick={() => setManualModalOpen(true)}
                    >
                      Nueva OC Manual
                    </Btn>
                  )}
                </div>
              }
            />
          </div>
        </>
      )}

      {/* Modal Detalle de OC */}
      {selectedOC && (
        <OCDetalleModal
          oc={selectedOC}
          isAdminOrGerencia={isAdminOrGerencia}
          canWriteBodega={canWriteBodega}
          onAprobar={() => { handleAprobar(selectedOC); setSelectedOC(null) }}
          onEnviar={() => { handleEnviar(selectedOC); setSelectedOC(null) }}
          onRecepcionar={() => { setReceptionOC(selectedOC); setSelectedOC(null) }}
          onClose={() => setSelectedOC(null)}
        />
      )}

      {/* Modal Recepción en Bodega */}
      {receptionOC && (
        <OCRecepcionModal
          oc={receptionOC}
          onClose={() => setReceptionOC(null)}
        />
      )}

      {/* Modal Rechazar OC */}
      {rejectModalOC && (
        <OCRechazarModal
          oc={rejectModalOC}
          onClose={() => setRejectModalOC(null)}
        />
      )}

      {/* Modal Crear OC Manual */}
      {manualModalOpen && (
        <OCManualModal
          proveedores={proveedoresList}
          onClose={() => setManualModalOpen(false)}
        />
      )}
    </main>
  )
}

// ── MODAL DETALLE DE ORDEN DE COMPRA ─────────────────────────────────────────
function OCDetalleModal({ oc, isAdminOrGerencia, canWriteBodega, onAprobar, onEnviar, onRecepcionar, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 800, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'DM Mono', monospace" }}>{oc.numeroOc}</h2>
              <Badge tone={estadoBadgeTone(oc.estado)}>{oc.estado}</Badge>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Emisión: {formatDate(oc.fechaEmision)} {oc.creadorNombre ? `· Creada por: ${oc.creadorNombre}` : ''}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Resumen Cabecera */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18, background: '#f8fafc', padding: 14, borderRadius: 10 }}>
          <div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>Proveedor</span>
            <strong style={{ fontSize: 13 }}>{oc.proveedorNombre || oc.proveedor?.nombre}</strong>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>RUT: {oc.proveedorRut || oc.proveedor?.rut || '-'}</div>
          </div>

          <div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>Condición de Pago</span>
            <span style={{ fontSize: 12 }}>{oc.condicionPago || 'Contado / 30 días'}</span>
          </div>

          <div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>Fecha Requerida Entrega</span>
            <strong style={{ fontSize: 13, color: 'var(--blue)' }}>{formatDate(oc.fechaRequerida)}</strong>
          </div>

          <div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>Total Orden (c/IVA)</span>
            <strong style={{ fontSize: 14, color: 'var(--green-700)', fontFamily: "'DM Mono', monospace" }}>{money(oc.total)}</strong>
          </div>
        </div>

        {oc.aprobadorNombre && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#166534', marginBottom: 16 }}>
            ✓ Aprobada por Gerencia: <strong>{oc.aprobadorNombre}</strong> el {formatDate(oc.fechaAprobacion)}
          </div>
        )}

        {oc.motivoRechazo && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#991b1b', marginBottom: 16 }}>
            ✕ Motivo de Rechazo: {oc.motivoRechazo}
          </div>
        )}

        {/* Tabla de Productos */}
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Productos Solicitados</h4>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px' }}>Código</th>
                  <th style={{ padding: '8px 10px' }}>Producto</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Cant. Pedida</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Cant. Recibida</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Costo Unit. Net</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(oc.items || []).map((it) => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{it.codigoInterno || '-'}</td>
                    <td style={{ padding: '8px 10px' }}>{it.nombre}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{it.cantidadPedida.toLocaleString('es-CL')}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: it.cantidadRecepcionada >= it.cantidadPedida ? 'var(--green-700)' : 'var(--text-3)' }}>
                      {it.cantidadRecepcionada.toLocaleString('es-CL')}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace" }}>{money(it.costoUnitario)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                      {money(it.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, marginBottom: 18, fontSize: 13 }}>
          <span>Subtotal Neto: <strong style={{ fontFamily: "'DM Mono', monospace" }}>{money(oc.subtotalNeto)}</strong></span>
          <span>IVA (19%): <strong style={{ fontFamily: "'DM Mono', monospace" }}>{money(oc.iva)}</strong></span>
          <span>Total: <strong style={{ color: 'var(--green-700)', fontFamily: "'DM Mono', monospace" }}>{money(oc.total)}</strong></span>
        </div>

        {oc.observaciones && (
          <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 18 }}>
            <strong>Notas:</strong> {oc.observaciones}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => window.print()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 12 }}
          >
            <Icon name="printer" size={14} />
            Imprimir Formato OC
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="secondary" onClick={onClose}>Cerrar</Btn>

            {['Borrador', 'Pendiente Aprobación'].includes(oc.estado) && isAdminOrGerencia && (
              <Btn variant="primary" icon="check" onClick={onAprobar}>
                Aprobar por Gerencia
              </Btn>
            )}

            {oc.estado === 'Aprobada por Gerencia' && (
              <Btn variant="primary" icon="send" onClick={onEnviar}>
                Marcar Enviada a Proveedor
              </Btn>
            )}

            {['Aprobada por Gerencia', 'Enviada a Proveedor', 'Recepcionada Parcial'].includes(oc.estado) && canWriteBodega && (
              <Btn variant="primary" icon="package" onClick={onRecepcionar}>
                Recepcionar Mercadería
              </Btn>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MODAL RECEPCIÓN EN BODEGA ───────────────────────────────────────────────
function OCRecepcionModal({ oc, onClose }) {
  const recepcionarMutation = useRecepcionarOCProveedor()
  const [cantidades, setCantidades] = useState(
    (oc.items || []).reduce((acc, it) => {
      acc[it.id] = Math.max(0, it.cantidadPedida - it.cantidadRecepcionada)
      return acc
    }, {})
  )
  const [codigosBarrasLeidos, setCodigosBarrasLeidos] = useState({})

  const handleQtyChange = (itemId, val) => {
    setCantidades((prev) => ({
      ...prev,
      [itemId]: Math.max(0, Number(val) || 0),
    }))
  }

  const handleConfirm = () => {
    recepcionarMutation.mutate(
      { id: oc.id, cantidadesRecibidas: cantidades, codigosBarrasLeidos },
      {
        onSuccess: (data) => {
          toast.success(data.message || 'Mercadería ingresada al inventario de bodega')
          onClose()
        },
        onError: (err) => {
          toast.error(err.response?.data?.error || 'Error al recepcionar orden de compra')
        },
      }
    )
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 680, maxWidth: '95vw', padding: 24, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="package" size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Recepción de Orden de Compra: {oc.numeroOc}</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              Proveedor: <strong>{oc.proveedorNombre}</strong> · Ingreso directo al stock físico de bodega
            </p>
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Código</th>
                <th style={{ padding: '8px 10px' }}>Producto</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Pedido</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Ya Recibido</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Cantidad a Ingresar</th>
                <th style={{ padding: '8px 10px' }}>Código escaneado</th>
              </tr>
            </thead>
            <tbody>
              {(oc.items || []).map((it) => (
                <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 10px', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{it.codigoInterno || '-'}</td>
                  <td style={{ padding: '8px 10px' }}>{it.nombre}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{it.cantidadPedida.toLocaleString('es-CL')}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-3)' }}>{it.cantidadRecepcionada.toLocaleString('es-CL')}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                    <input
                      type="number"
                      min="0"
                      value={cantidades[it.id] ?? Math.max(0, it.cantidadPedida - it.cantidadRecepcionada)}
                      onChange={(e) => handleQtyChange(it.id, e.target.value)}
                      style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', textAlign: 'right', fontWeight: 600, fontSize: 12 }}
                    />
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <input
                      value={codigosBarrasLeidos[it.id] || ''}
                      onChange={(e) => setCodigosBarrasLeidos(prev => ({ ...prev, [it.id]: e.target.value }))}
                      placeholder="Escanear"
                      style={{ width: 120, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: "'DM Mono', monospace", fontSize: 12 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" icon="check" loading={recepcionarMutation.isPending} onClick={handleConfirm}>
            Confirmar e Ingresar al Stock
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ── MODAL RECHAZAR OC ───────────────────────────────────────────────────────
function OCRechazarModal({ oc, onClose }) {
  const rechazarMutation = useRechazarOCProveedor()
  const [motivo, setMotivo] = useState('')

  const handleConfirm = () => {
    rechazarMutation.mutate(
      { id: oc.id, motivoRechazo: motivo },
      {
        onSuccess: (data) => {
          toast.success(data.message || 'Orden de compra rechazada')
          onClose()
        },
        onError: (err) => {
          toast.error(err.response?.data?.error || 'Error al rechazar orden')
        },
      }
    )
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 500, maxWidth: '92vw', padding: 24, boxShadow: 'var(--shadow-lg)' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--red)' }}>Rechazar Orden de Compra {oc.numeroOc}</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-2)' }}>
          Indique el motivo por el cual Gerencia no aprueba esta orden de compra:
        </p>

        <textarea
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej: Precios desactualizados, exceso de stock temporal, etc."
          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, marginBottom: 16 }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" style={{ background: 'var(--red)' }} loading={rechazarMutation.isPending} onClick={handleConfirm}>
            Rechazar Orden
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ── MODAL NUEVA OC MANUAL ───────────────────────────────────────────────────
function OCManualModal({ proveedores = [], onClose }) {
  const createMutation = useCreateOCProveedor()
  const [proveedorId, setProveedorId] = useState('')
  const [fechaRequerida, setFechaRequerida] = useState('')
  const [condicionPago, setCondicionPago] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [items, setItems] = useState([{ productoId: null, codigoInterno: '', nombre: '', cantidadPedida: 10, costoUnitario: 0 }])

  const [productSearch, setProductSearch] = useState('')
  const { data: searchResult = { items: [] } } = useProductos({ search: productSearch, limit: 10 })
  const searchSuggestions = searchResult.items || []

  const handleAddItem = () => {
    setItems((prev) => [...prev, { productoId: null, codigoInterno: '', nombre: '', cantidadPedida: 10, costoUnitario: 0 }])
  }

  const handleRemoveItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleItemChange = (idx, field, val) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: val }
      return next
    })
  }

  const handleSelectProduct = (idx, prod) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = {
        ...next[idx],
        productoId: prod.id,
        codigoInterno: prod.codigoInterno,
        nombre: prod.nombre,
        costoUnitario: prod.precioLista || 0,
      }
      return next
    })
  }

  const subtotalNeto = items.reduce((acc, it) => acc + (Number(it.cantidadPedida || 0) * Number(it.costoUnitario || 0)), 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!proveedorId) {
      toast.error('Seleccione un proveedor')
      return
    }
    if (items.length === 0 || !items.some((i) => i.nombre.trim() || i.codigoInterno.trim())) {
      toast.error('Agregue al menos un producto')
      return
    }

    const selectedProv = proveedores.find((p) => String(p.id) === String(proveedorId))

    const payload = {
      proveedorId: Number(proveedorId),
      proveedorNombre: selectedProv?.nombre,
      proveedorRut: selectedProv?.rut,
      fechaRequerida: fechaRequerida || null,
      condicionPago: condicionPago || selectedProv?.pagoFactura || null,
      observaciones: observaciones || null,
      estado: 'Borrador',
      items: items.map((it) => ({
        productoId: it.productoId,
        codigoInterno: it.codigoInterno,
        nombre: it.nombre,
        cantidadPedida: Number(it.cantidadPedida || 1),
        costoUnitario: Number(it.costoUnitario || 0),
      })),
    }

    createMutation.mutate(payload, {
      onSuccess: (created) => {
        toast.success(`Orden de compra ${created.numeroOc} creada exitosamente`)
        onClose()
      },
      onError: (err) => {
        toast.error(err.response?.data?.error || 'Error al crear orden de compra')
      },
    })
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 780, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 16px', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
          Nueva Orden de Compra a Proveedor
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Proveedor *</label>
              <select
                required
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }}
              >
                <option value="">Seleccione proveedor...</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Fecha Requerida de Entrega</label>
              <input
                type="date"
                value={fechaRequerida}
                onChange={(e) => setFechaRequerida(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Condición de Pago</label>
              <input
                type="text"
                placeholder="Ej: Contado, 30 días, 60 días"
                value={condicionPago}
                onChange={(e) => setCondicionPago(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>
          </div>

          {/* Tabla de Productos */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Líneas de Producto</span>
              <Btn type="button" variant="secondary" size="sm" icon="plus" onClick={handleAddItem}>
                Agregar Ítem
              </Btn>
            </div>

            {items.map((it, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 110px 110px 32px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input
                  type="text"
                  placeholder="Código"
                  value={it.codigoInterno}
                  onChange={(e) => { handleItemChange(idx, 'codigoInterno', e.target.value); setProductSearch(e.target.value) }}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                />

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Nombre producto"
                    value={it.nombre}
                    onChange={(e) => { handleItemChange(idx, 'nombre', e.target.value); setProductSearch(e.target.value) }}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                  />
                  {productSearch && searchSuggestions.length > 0 && it.codigoInterno.toLowerCase() === productSearch.toLowerCase() && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                      background: '#fff', borderRadius: 6, boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)',
                      maxHeight: 140, overflowY: 'auto',
                    }}>
                      {searchSuggestions.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => { handleSelectProduct(idx, s); setProductSearch('') }}
                          style={{ padding: '6px 10px', fontSize: 11.5, cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                          onMouseLeave={(e) => e.target.style.background = '#fff'}
                        >
                          <strong>{s.codigoInterno}</strong> - {s.nombre}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <input
                  type="number"
                  min="1"
                  placeholder="Cantidad"
                  value={it.cantidadPedida}
                  onChange={(e) => handleItemChange(idx, 'cantidadPedida', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, textAlign: 'right' }}
                />

                <input
                  type="number"
                  min="0"
                  placeholder="Costo Neto"
                  value={it.costoUnitario}
                  onChange={(e) => handleItemChange(idx, 'costoUnitario', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, textAlign: 'right' }}
                />

                <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", textAlign: 'right', fontWeight: 600 }}>
                  {money((Number(it.cantidadPedida) || 0) * (Number(it.costoUnitario) || 0))}
                </div>

                {items.length > 1 && (
                  <button type="button" onClick={() => handleRemoveItem(idx)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4 }}>
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, marginBottom: 18, fontSize: 13 }}>
            <span>Subtotal Neto: <strong>{money(subtotalNeto)}</strong></span>
            <span>Total c/IVA: <strong style={{ color: 'var(--green-700)' }}>{money(Math.round(subtotalNeto * 1.19))}</strong></span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Observaciones</label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Instrucciones de entrega, despachos parciales permitidos, etc."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <Btn type="button" variant="secondary" onClick={onClose}>Cancelar</Btn>
            <Btn type="submit" variant="primary" loading={createMutation.isPending}>
              Crear Orden de Compra
            </Btn>
          </div>
        </form>
      </div>
    </div>
  )
}
