import { useState } from 'react'
import { Badge, Btn, Icon, PageHeader } from '../../components/shared'
import { useOdtTallerItems, useOdtItemTallerEstado, useOdtOperarios } from '../../api/odts'
import { useAuthStore } from '../../store/auth'

const WORKSHOPS = [
  { id: 'Espumas', label: 'Espuma', icon: 'package', color: 'var(--amber)' },
  { id: 'Confecciones', label: 'Confección', icon: 'scissors', color: 'var(--blue)' },
  { id: 'Madera', label: 'Madera/Externo', icon: 'tool', color: 'var(--green-700)' }
]

const STATE_COLORS = {
  pendiente: { bg: '#fef3c7', text: '#d97706', border: '#fcd34d', label: 'Pendiente' },
  en_proceso: { bg: '#dbeafe', text: '#2563eb', border: '#93c5fd', label: 'En Proceso' },
  pausado: { bg: '#f3f4f6', text: '#4b5563', border: '#d1d5db', label: 'Pausado' },
  listo: { bg: '#d1fae5', text: '#059669', border: '#6ee7b7', label: 'Listo' },
  cancelado: { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5', label: 'Cancelado' }
}

export default function TallerOperarioPage() {
  const { user } = useAuthStore()
  const [activeWorkshop, setActiveWorkshop] = useState('Espumas')
  const [editingObsId, setEditingObsId] = useState(null)
  const [tempObs, setTempObs] = useState('')
  // Por defecto cada uno ve solo lo suyo (cola personal); "Todas" sirve para
  // repartir/supervisar el taller completo, no para el trabajo del dia a dia.
  const [soloMias, setSoloMias] = useState(true)

  const { data: itemsData, isLoading: loadingItems, refetch } = useOdtTallerItems(activeWorkshop, { mine: soloMias })
  const { data: operariosData } = useOdtOperarios()
  const updateEstadoMut = useOdtItemTallerEstado()

  const items = itemsData?.items || []
  const operarios = operariosData?.items || []

  const handleUpdateState = (item, newState) => {
    updateEstadoMut.mutate({
      odtId: item.odtItem.odtId,
      itemId: item.odtItemId,
      tallerItemId: item.id,
      estado: newState
    }, {
      onSuccess: () => refetch()
    })
  }

  const handleAssignOperario = (item, operarioId) => {
    updateEstadoMut.mutate({
      odtId: item.odtItem.odtId,
      itemId: item.odtItemId,
      tallerItemId: item.id,
      operarioResponsableId: operarioId ? parseInt(operarioId, 10) : null
    }, {
      onSuccess: () => refetch()
    })
  }

  const handleSaveObs = (item) => {
    updateEstadoMut.mutate({
      odtId: item.odtItem.odtId,
      itemId: item.odtItemId,
      tallerItemId: item.id,
      obs: tempObs
    }, {
      onSuccess: () => {
        setEditingObsId(null)
        refetch()
      }
    })
  }

  return (
    <main className="page page-wide" style={{ maxWidth: 800, margin: '0 auto', padding: '16px' }}>
      <PageHeader
        title="Panel Móvil de Operarios"
        subtitle="Gestión rápida de tareas de taller y OT"
        breadcrumb={['Inicio', 'Taller', 'Operario']}
      />

      {/* Selector de Taller */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        {WORKSHOPS.map(w => {
          const isActive = activeWorkshop === w.id
          return (
            <button
              key={w.id}
              onClick={() => setActiveWorkshop(w.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 8px',
                borderRadius: 12,
                border: `2px solid ${isActive ? w.color : 'var(--border)'}`,
                background: isActive ? '#fff' : 'var(--bg)',
                color: isActive ? 'var(--text-1)' : 'var(--text-3)',
                cursor: 'pointer',
                fontWeight: isActive ? 700 : 500,
                fontSize: 12,
                boxShadow: isActive ? '0 4px 12px oklch(0 0 0/0.05)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon name={w.icon} size={20} color={isActive ? w.color : 'var(--text-3)'} />
              {w.label}
            </button>
          )
        })}
      </div>

      {/* Mis tareas vs cola completa del taller */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[[true, 'Mis tareas'], [false, 'Todas']].map(([value, label]) => (
          <button
            key={label}
            onClick={() => setSoloMias(value)}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 8,
              border: `1px solid ${soloMias === value ? 'var(--green-700)' : 'var(--border)'}`,
              background: soloMias === value ? 'var(--green-50)' : '#fff',
              color: soloMias === value ? 'var(--green-800)' : 'var(--text-2)',
              fontWeight: soloMias === value ? 700 : 500,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {soloMias && !user?.id && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>No se pudo identificar tu usuario.</div>
      )}

      {/* Listado de items */}
      {loadingItems ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Cargando tareas...</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-3)', background: '#fff', borderRadius: 12, border: '1px solid var(--border)' }}>
          <Icon name="checkCircle" size={36} color="var(--green-600)" />
          <h3 style={{ marginTop: 12, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>¡Todo listo!</h3>
          <p style={{ marginTop: 6, fontSize: 13 }}>
            {soloMias ? 'No tienes tareas asignadas en este taller. ' : 'No hay tareas activas en este taller actualmente.'}
            {soloMias && <button onClick={() => setSoloMias(false)} style={{ background: 'none', border: 'none', color: 'var(--green-700)', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 13 }}>Ver todas →</button>}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map(item => {
            const product = item.odtItem
            const odt = product?.odt
            const sale = odt?.orden
            const state = STATE_COLORS[item.estado] || { bg: '#f3f4f6', text: '#4b5563', border: '#d1d5db', label: item.estado }
            const isEditingObs = editingObsId === item.id

            return (
              <div
                key={item.id}
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-sm)',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
              >
                {/* Cabecera de la Tarea */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>
                    OT #{odt?.id} {sale?.nInterno ? `· Venta #${sale.nInterno}` : ''}
                  </span>
                  <span
                    style={{
                      background: state.bg,
                      color: state.text,
                      border: `1px solid ${state.border}`,
                      borderRadius: 20,
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: 700
                    }}
                  >
                    {state.label}
                  </span>
                </div>

                {/* Cliente y Detalles */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  {/* Foto de Producto Fallback / Miniatura */}
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 8,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <Icon name="package" size={24} color="var(--text-3)" />
                  </div>

                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>
                      {product?.nombre || 'Producto'}
                    </h4>
                    {product?.codigoInterno && (
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>
                        {product.codigoInterno}
                      </span>
                    )}
                    <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-2)' }}>
                      Cantidad: <strong style={{ fontSize: 14, color: 'var(--text-1)' }}>{product?.cantidad || 0}</strong>
                    </div>
                  </div>
                </div>

                {/* Cliente */}
                {sale?.cliente?.nombre && (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <strong>Cliente:</strong> {sale.cliente.nombre}
                  </div>
                )}

                {/* Observaciones de Venta */}
                {sale?.observaciones && (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--bg)', padding: '8px 10px', borderRadius: 6 }}>
                    <strong>Observaciones de venta:</strong> {sale.observaciones}
                  </div>
                )}

                {/* Observaciones de Taller */}
                <div style={{ fontSize: 12, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <strong>Avance / Notas taller:</strong>
                  {isEditingObs ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <input
                        value={tempObs}
                        onChange={e => setTempObs(e.target.value)}
                        placeholder="Ej: Confeccionado 5 de 10"
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          fontSize: 12
                        }}
                      />
                      <Btn variant="primary" size="xs" onClick={() => handleSaveObs(item)}>Guardar</Btn>
                      <Btn variant="ghost" size="xs" onClick={() => setEditingObsId(null)}>Cancelar</Btn>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <span style={{ fontStyle: item.obs ? 'normal' : 'italic', color: item.obs ? 'var(--text-1)' : 'var(--text-3)' }}>
                        {item.obs || 'Sin observaciones registradas'}
                      </span>
                      <button
                        onClick={() => {
                          setEditingObsId(item.id)
                          setTempObs(item.obs || '')
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--green-700)',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Modificar
                      </button>
                    </div>
                  )}
                </div>

                {/* Responsable de Taller */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <strong>Operario:</strong>
                  <select
                    value={item.operarioResponsableId || ''}
                    onChange={e => handleAssignOperario(item, e.target.value)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      fontSize: 12,
                      background: '#fff',
                      flex: 1
                    }}
                  >
                    <option value="">Sin asignar</option>
                    {operarios.map(op => (
                      // La asignacion se guarda por cuenta de login (usuarioId), no
                      // por el id de la ficha RRHH - sin cuenta vinculada no puede
                      // "ser el mismo" que alguien logueado viendo su cola personal.
                      <option key={op.id} value={op.usuarioId || ''} disabled={!op.usuarioId}>
                        {op.nombres} {op.apellidoPaterno}{!op.usuarioId ? ' (sin cuenta vinculada)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Acciones de Flujo */}
                <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                  {item.estado === 'pendiente' && (
                    <button
                      onClick={() => handleUpdateState(item, 'en_proceso')}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: 'var(--blue)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <Icon name="play" size={14} /> Iniciar Tarea
                    </button>
                  )}

                  {item.estado === 'en_proceso' && (
                    <>
                      <button
                        onClick={() => {
                          setEditingObsId(item.id)
                          setTempObs(item.obs || '')
                        }}
                        style={{
                          flex: 1,
                          padding: '10px',
                          background: '#fff',
                          color: 'var(--text-1)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <Icon name="edit" size={14} /> Registrar Avance
                      </button>

                      <button
                        onClick={() => handleUpdateState(item, 'listo')}
                        style={{
                          flex: 1,
                          padding: '10px',
                          background: 'var(--green-700)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <Icon name="check" size={14} /> Finalizar
                      </button>
                    </>
                  )}

                  {item.estado === 'listo' && (
                    <span style={{ fontSize: 12, color: 'var(--green-600)', fontWeight: 600, margin: 'auto' }}>
                      ✓ Tarea Completada
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
