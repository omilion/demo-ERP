import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Icon } from '../shared'
import { ViewPanel, FormDivider } from './index'
import { useVenta, useDeleteVenta } from '../../api/ventas'

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

const ESTADO_TONE = {
  Pagada: 'green', Entregada: 'green', Completada: 'green',
  Parcial: 'amber', 'En despacho': 'amber',
  'No pagada': 'red', 'Pendiente entrega': 'red',
}
function EstadoBadge({ v }) {
  return <Badge tone={ESTADO_TONE[v] ?? 'gray'}>{v || '—'}</Badge>
}

const ODT_TONE = { Prioritaria: 'red', 'En proceso': 'blue', Pendiente: 'amber', Terminada: 'green' }

// ── Tab button ─────────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children, badge }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', fontSize: 13, fontWeight: active ? 700 : 400,
      color: active ? 'var(--green-700)' : 'var(--text-2)',
      borderBottom: active ? '2px solid var(--green-600)' : '2px solid transparent',
      background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
      transition: 'color 0.12s',
    }}>
      {children}
      {badge != null && badge > 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, background: active ? 'var(--green-600)' : 'var(--border)', color: active ? '#fff' : 'var(--text-3)', borderRadius: 99, padding: '1px 6px' }}>
          {badge}
        </span>
      )}
    </button>
  )
}

// ── Tab: Detalle ───────────────────────────────────────────────────────────────
function TabDetalle({ v }) {
  const items = v.items || []
  const total = v.total || 0
  const abono = v.abono || 0
  const saldo = total - abono
  const descuento = v.descuentoPct || 0
  const subtotal = items.reduce((s, i) => s + (i.precioUnitario * i.cantidad), 0)

  return (
    <>
      {/* Cliente */}
      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 8 }}>Cliente</div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{v.cliente?.nombre || '—'}</div>
        {v.cliente?.razonSocial && v.cliente.razonSocial !== v.cliente?.nombre && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 2 }}>{v.cliente.razonSocial}</div>
        )}
        {v.cliente?.rut && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace", marginBottom: 6 }}>{v.cliente.rut}</div>}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
          {v.cliente?.email && (
            <span style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="mail" size={11} color="var(--text-3)" /> {v.cliente.email}
            </span>
          )}
          {v.cliente?.telefono && (
            <span style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="phone" size={11} color="var(--text-3)" /> {v.cliente.telefono}
            </span>
          )}
          {v.cliente?.ciudad && (
            <span style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="mapPin" size={11} color="var(--text-3)" /> {v.cliente.ciudad}
            </span>
          )}
        </div>
      </div>

      {/* Estados */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[['Pago', v.estadoPago], ['Entrega', v.estadoEntrega], ['Estado', v.estado]].map(([label, val], i) => (
          <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', textAlign: 'center', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</div>
            <EstadoBadge v={val} />
          </div>
        ))}
      </div>

      {/* Líneas */}
      {items.length > 0 && (
        <>
          <FormDivider label={`Productos (${items.length})`} />
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Producto', 'Cant.', 'P. Unit.', 'Subtotal'].map((h, i) => (
                    <th key={i} style={{ padding: '7px ' + (i === 0 ? '12px' : '8px'), textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ fontWeight: 500 }}>{item.producto?.nombre || `Producto #${item.productoId}`}</div>
                      {item.producto?.codigoInterno && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>{item.producto.codigoInterno}</div>
                      )}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: 'var(--text-2)' }}>{item.cantidad}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: 'var(--text-2)' }}>{fmt(item.precioUnitario)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(item.precioUnitario * item.cantidad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Resumen financiero */}
      <FormDivider label="Resumen financiero" />
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
        {items.length > 0 && subtotal !== total && descuento > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-2)' }}>Subtotal</span>
            <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(subtotal)}</span>
          </div>
        )}
        {descuento > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', color: 'var(--green-600)' }}>
            <span>Descuento ({descuento}%)</span>
            <span style={{ fontFamily: "'DM Mono',monospace" }}>−{fmt(subtotal * descuento / 100)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', fontSize: 14, fontWeight: 700, borderBottom: abono > 0 ? '1px solid var(--border)' : 'none' }}>
          <span>Total Venta</span>
          <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(total)}</span>
        </div>
        {abono > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', color: 'var(--green-600)' }}>
            <span>Abono recibido</span>
            <span style={{ fontFamily: "'DM Mono',monospace" }}>−{fmt(abono)}</span>
          </div>
        )}
        {(abono > 0 || saldo > 0) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', fontSize: 14, fontWeight: 700, background: saldo > 0 ? '#fef2f2' : 'var(--green-50)' }}>
            <span style={{ color: saldo > 0 ? 'var(--red)' : 'var(--green-700)' }}>Saldo Pendiente</span>
            <span style={{ fontFamily: "'DM Mono',monospace", color: saldo > 0 ? 'var(--red)' : 'var(--green-700)' }}>{fmt(saldo)}</span>
          </div>
        )}
      </div>
    </>
  )
}

// ── Tab: Taller ────────────────────────────────────────────────────────────────
function TabTaller({ odts, onGoTaller }) {
  if (!odts || odts.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
        <Icon name="tool" size={28} color="var(--border)" />
        <p style={{ marginTop: 12, fontSize: 13 }}>Sin órdenes de trabajo vinculadas</p>
        <button onClick={onGoTaller} style={{ marginTop: 10, fontSize: 12, color: 'var(--green-600)', background: 'none', border: '1px solid var(--green-600)', borderRadius: 7, padding: '6px 14px', cursor: 'pointer' }}>
          Ir al Taller →
        </button>
      </div>
    )
  }
  return (
    <div>
      {odts.map(odt => (
        <div key={odt.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 600, color: 'var(--green-700)' }}>ODT #{odt.id}</span>
            <div style={{ display: 'flex', gap: 5 }}>
              {odt.prioridad && odt.prioridad !== 'normal' && (
                <Badge tone={odt.prioridad === 'urgente' ? 'red' : 'amber'} style={{ fontSize: 10 }}>{odt.prioridad}</Badge>
              )}
              <Badge tone={ODT_TONE[odt.estado] ?? 'gray'}>{odt.estado}</Badge>
            </div>
          </div>
          {odt.tipo && <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{odt.tipo}</div>}
          {odt.descripcion && <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{odt.descripcion}</div>}
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
            <span><Icon name="calendar" size={11} /> {new Date(odt.createdAt).toLocaleDateString('es-CL')}</span>
            {odt.plazo && <span><Icon name="clock" size={11} /> Plazo: {new Date(odt.plazo).toLocaleDateString('es-CL')}</span>}
          </div>
        </div>
      ))}
      <button onClick={onGoTaller} style={{ fontSize: 12, color: 'var(--green-600)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
        Ver todas en Taller →
      </button>
    </div>
  )
}

// ── Tab: Pagos ─────────────────────────────────────────────────────────────────
function TabPagos({ pagos }) {
  if (!pagos?.length) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)' }}>
        <Icon name="creditCard" size={26} color="var(--border)" />
        <p style={{ marginTop: 12, fontSize: 13 }}>Sin movimientos de caja vinculados</p>
      </div>
    )
  }
  const totalPagado = pagos.filter(p => p.tipo === 'Ingreso').reduce((s, p) => s + Math.abs(p.monto), 0)
  return (
    <div>
      <div style={{ background: 'var(--green-50)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--green-700)', fontWeight: 600 }}>Total recibido en caja</span>
        <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: 'var(--green-700)', fontSize: 14 }}>${totalPagado.toLocaleString('es-CL')}</span>
      </div>
      {pagos.map(p => (
        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>{p.medioPago}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {p.fecha ? new Date(p.fecha).toLocaleDateString('es-CL') : new Date(p.createdAt).toLocaleDateString('es-CL')}
              {p.referencia && <span> · {p.referencia}</span>}
              {p.usuario && <span> · {p.usuario}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 13, color: p.tipo === 'Ingreso' ? 'var(--green-600)' : 'var(--red)' }}>
              {p.tipo === 'Ingreso' ? '+' : '−'}${Math.abs(p.monto).toLocaleString('es-CL')}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{p.tipo}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tab: Documentos ────────────────────────────────────────────────────────────
function TabDocumentos({ v }) {
  const Row = ({ label, value, mono }) => value ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: mono ? "'DM Mono',monospace" : 'inherit', color: 'var(--text-1)', fontWeight: mono ? 600 : 400 }}>{value}</span>
    </div>
  ) : null

  const hasContent = v.licitacion || v.guias || v.facturado > 0 || v.observaciones

  return (
    <div>
      {/* Tipo y N° interno */}
      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 14, display: 'flex', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 5 }}>Tipo de venta</div>
          <Badge tone={v.tipo === 'Licitación' ? 'blue' : v.tipo === 'Convenio Marco' ? 'neutral' : 'gray'}>{v.tipo}</Badge>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 5 }}>Vendedor</div>
          <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{v.creadorNombre || '—'}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 5 }}>Fecha creación</div>
          <div style={{ fontSize: 13, fontFamily: "'DM Mono',monospace", color: 'var(--text-2)' }}>
            {v.createdAt ? new Date(v.createdAt).toLocaleDateString('es-CL') : '—'}
          </div>
        </div>
      </div>

      <FormDivider label="Referencias y documentos" />
      <div style={{ marginBottom: 14 }}>
        <Row label="ID Licitación / OC" value={v.licitacion} mono />
        <Row label="N° Guía de despacho" value={v.guias ? `#${v.guias}` : null} mono />
        <Row label="Monto facturado" value={v.facturado > 0 ? fmt(v.facturado) : null} mono />
        {!hasContent && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Sin documentos adicionales registrados
          </div>
        )}
      </div>

      {v.observaciones && (
        <>
          <FormDivider label="Observaciones / Notas" />
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {v.observaciones}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function ViewVentaPanel({ venta, onClose, onEdit, canWrite = true }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('detalle')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: full, isLoading } = useVenta(venta.id)
  const deleteVenta = useDeleteVenta()

  const v = full || venta
  const odts  = full?.odts  ?? []
  const pagos = full?.pagos ?? []
  const fecha = v.createdAt
    ? new Date(v.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  function handleDelete() {
    deleteVenta.mutate(venta.id, {
      onSuccess: () => onClose(),
    })
  }

  return (
    <ViewPanel
      title={<span>Venta <span style={{ fontFamily: "'DM Mono',monospace", color: 'var(--green-700)' }}>#{v.id}</span></span>}
      subtitle={`${fecha} · ${v.creadorNombre || 'Sin vendedor'}`}
      onClose={onClose}
      onEdit={canWrite ? onEdit : undefined}
      onDelete={canWrite ? () => setConfirmDelete(true) : undefined}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 16, marginTop: -6 }}>
        <TabBtn active={tab === 'detalle'}    onClick={() => setTab('detalle')}>Detalle</TabBtn>
        <TabBtn active={tab === 'taller'}     onClick={() => setTab('taller')}  badge={odts.length}>Taller</TabBtn>
        <TabBtn active={tab === 'pagos'}      onClick={() => setTab('pagos')}   badge={pagos.length}>Pagos</TabBtn>
        <TabBtn active={tab === 'documentos'} onClick={() => setTab('documentos')}>Documentos</TabBtn>
      </div>

      {isLoading && !full && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando detalles…</div>
      )}

      {tab === 'detalle'    && <TabDetalle v={v} />}
      {tab === 'taller'     && <TabTaller odts={odts} onGoTaller={() => navigate('/taller')} />}
      {tab === 'pagos'      && <TabPagos pagos={pagos} />}
      {tab === 'documentos' && <TabDocumentos v={v} />}

      {/* Delete confirmation */}
      {confirmDelete && canWrite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'oklch(0 0 0/0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', maxWidth: 360, width: '90%', boxShadow: '0 16px 48px oklch(0 0 0/0.2)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: 'var(--text-1)' }}>¿Eliminar Venta #{v.id}?</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 20 }}>
              Esta acción eliminará la venta y todos sus ítems asociados. No se puede deshacer.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: '8px 16px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 500 }}>
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteVenta.isPending}
                style={{ padding: '8px 16px', fontSize: 13, borderRadius: 8, border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontWeight: 700, opacity: deleteVenta.isPending ? 0.6 : 1 }}
              >
                {deleteVenta.isPending ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ViewPanel>
  )
}
