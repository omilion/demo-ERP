import { toast, confirmDialog } from '../../store/notif'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn, Icon } from '../shared'
import { ViewPanel, FormDivider } from './index'
import { useVenta, useDeleteVenta, useForzarTaller, useUpdateVenta, useAnularVenta, useActivarVenta, useUpdateItemEntregados, useVentaDespachoHistorial } from '../../api/ventas'
import { useProductos } from '../../api/productos'
import { useDocumentos, useReenviarDocumento } from '../../api/facturacion'
import { EmitirDteModal, NotaDteModal } from '../facturacion/DteModals'
import { hasActiveSalesDte, TIPOS_DTE } from '../../utils/facturacion'
import { downloadDteXml, openDtePdf } from '../../utils/dteDocuments'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { InternalCreditNoteModal, InternalCreditNotes } from '../facturacion/InternalCreditNotes'

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

const discountAmount = (subtotal, pct) => Math.round(Number(subtotal || 0) * Number(pct || 0) / 100)
const resolvedDiscountAmount = (subtotal, pct, frozenAmount) => {
  const frozen = Number(frozenAmount || 0)
  if (frozen > 0) return Math.min(Math.round(frozen), Math.round(Number(subtotal || 0)))
  return discountAmount(subtotal, pct)
}

function discountLabel(venta, pct) {
  const snapshot = venta.descuentoSnapshot || {}
  const name = snapshot.reglaNombre || snapshot.nombre || null
  const label = name ? `Descuento ${name}` : 'Descuento'
  return Number(pct || 0) > 0 ? `${label} (${pct}%)` : label
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isReferencialPago(pago) {
  return normalizeText(pago?.medioPago) === 'referencial'
}

function sameDocumento(a, b) {
  return a?.documento && a?.nDoc && a.documento === b?.documento && a.nDoc === b?.nDoc
}

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
function TabDetalle({ v, handleForzarTaller, forzarTallerMut, handleCreateDespacho, canEmitirDte, onEmitirDte }) {
  const items = v.items || []
  const total = v.total || 0
  const abono = v.abono || 0
  const saldo = total - abono
  const descuento = Number(v.descuentoSnapshot?.porcentaje ?? v.descuentoPct ?? 0)
  const subtotal = items.reduce((s, i) => s + (i.precioUnitario * i.cantidad), 0)
  const cargosTotal = (v.cargos || []).reduce((s, c) => s + Number(c.valor || 0), 0)
  const totalBase = subtotal + cargosTotal
  const descuentoMonto = resolvedDiscountAmount(totalBase, descuento, v.descuentoMonto)

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
        {items.length > 0 && subtotal !== total && descuentoMonto > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-2)' }}>Subtotal</span>
            <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(subtotal)}</span>
          </div>
        )}
        {cargosTotal > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-2)' }}>Cargos transporte</span>
            <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(cargosTotal)}</span>
          </div>
        )}
        {descuentoMonto > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', color: 'var(--green-600)' }}>
            <span>{discountLabel(v, descuento)}</span>
            <span style={{ fontFamily: "'DM Mono',monospace" }}>-{fmt(descuentoMonto)}</span>
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

      {/* Acciones Rápidas */}
      <FormDivider label="Acciones rápidas" />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <button
          onClick={handleCreateDespacho}
          style={{
            flex: '1 1 140px',
            padding: '10px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            background: 'var(--blue)',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'opacity 0.1s'
          }}
        >
          <Icon name="truck" size={14} />
          Crear Despacho
        </button>

        <button
          onClick={handleForzarTaller}
          disabled={forzarTallerMut.isPending}
          style={{
            flex: '1 1 140px',
            padding: '10px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            background: 'var(--amber)',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: forzarTallerMut.isPending ? 0.7 : 1,
            transition: 'opacity 0.1s'
          }}
        >
          <Icon name="tool" size={14} />
          {forzarTallerMut.isPending ? 'Enviando...' : 'Gatillar Taller / OT'}
        </button>

        {canEmitirDte && (
          <button
            onClick={onEmitirDte}
            style={{
              flex: '1 1 140px', padding: '10px 12px', fontSize: 12, fontWeight: 600,
              color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 8,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Icon name="fileText" size={14} /> Emitir DTE
          </button>
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
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 600, color: 'var(--green-700)' }}>OT #{odt.id}</span>
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
  const totalPagado = pagos
    .filter(p => p.tipo === 'Ingreso' && !isReferencialPago(p))
    .reduce((s, p) => s + Math.abs(p.monto), 0)
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
              {(p.documento || p.nDoc) && <span> · {p.documento || 'Doc'}{p.nDoc ? ` #${p.nDoc}` : ''}</span>}
              {isReferencialPago(p) && <span> · {p.estadoPagoDoc || 'No pagada'}</span>}
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

function DocumentoRow({ label, value, mono }) {
  return value ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: mono ? "'DM Mono',monospace" : 'inherit', color: 'var(--text-1)', fontWeight: mono ? 600 : 400 }}>{value}</span>
    </div>
  ) : null
}

// ── Tab: Documentos ────────────────────────────────────────────────────────────
const DTE_TONE = { borrador: 'gray', emitido: 'blue', enviado: 'amber', aceptado: 'green', rechazado: 'red', error: 'red' }

function TabDocumentos({ v, pagos, dtes, canWrite, canWriteFacturacion, onNota }) {
  const referenciales = (pagos || []).filter(isReferencialPago)
  const pagosReales = (pagos || []).filter(p => !isReferencialPago(p))
  const hasContent = v.licitacion || v.guias || v.facturado > 0 || v.observaciones || referenciales.length > 0
  const [ajustarPresupuesto, setAjustarPresupuesto] = useState(false)
  const saldoDespacho = Number(v.montoDespacho || 0) - Number(v.montoDespachoReal || 0)
  const reenviar = useReenviarDocumento()
  const runDteAction = async (action, documento) => {
    try {
      await action(documento)
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.message || 'No se pudo abrir el documento.')
    }
  }
  const reenviarDoc = async documento => {
    const to = window.prompt('Reenviar documento a este correo:', documento.receptor?.email || '')
    if (!to || !to.trim()) return
    try {
      const result = await reenviar.mutateAsync({ id: documento.id, to: to.trim() })
      toast.success(`Documento reenviado a ${result.to?.join(', ') || to.trim()}.`)
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.message || 'No se pudo reenviar el documento.')
    }
  }

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
        <DocumentoRow label="ID Licitación / OC" value={v.licitacion} mono />
        <DocumentoRow label="Monto facturado" value={v.facturado > 0 ? fmt(v.facturado) : null} mono />
        <DocumentoRow label="Presupuesto de despacho" value={v.montoDespacho > 0 ? fmt(v.montoDespacho) : null} mono />
        {v.montoDespacho > 0 && (
          <>
            <DocumentoRow label="Real despachado" value={fmt(v.montoDespachoReal || 0)} mono />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>Saldo</span>
              <Badge tone={saldoDespacho >= 0 ? 'green' : 'red'}>{fmt(saldoDespacho)}</Badge>
            </div>
          </>
        )}
        {canWrite && (
          <div style={{ padding: '10px 0' }}>
            <button onClick={() => setAjustarPresupuesto(true)} style={dteLink('var(--blue)')}>Ajustar presupuesto de despacho</button>
          </div>
        )}
        <DespachoAjusteHistorialTable ventaId={v.id} />
        {referenciales.length > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Documento', 'N doc', 'Monto', 'Pagado', 'Estado'].map((h, i) => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: i >= 2 ? 'right' : 'left', fontWeight: 600, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {referenciales.map(doc => {
                  const pagado = pagosReales
                    .filter(p => sameDocumento(p, doc) && p.tipo === 'Ingreso')
                    .reduce((s, p) => s + Math.abs(Number(p.monto || 0)), 0)
                  return (
                    <tr key={doc.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px' }}>{doc.documento || 'Documento'}</td>
                      <td style={{ padding: '8px 10px', fontFamily: "'DM Mono',monospace" }}>{doc.nDoc || '---'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(Math.abs(Number(doc.monto || 0)))}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" }}>{fmt(pagado)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}><EstadoBadge v={doc.estadoPagoDoc || 'No pagada'} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!hasContent && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Sin documentos adicionales registrados
          </div>
        )}
      </div>

      <FormDivider label="Documentos tributarios electrónicos" />
      <InternalCreditNotes venta={v} canWrite={canWrite} dtes={dtes} />
      {dtes.length === 0 ? (
        <div style={{ padding: '10px 0 18px', color: 'var(--text-3)', fontSize: 13 }}>No hay DTEs asociados a esta venta.</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: 'var(--bg)' }}>
              {['Tipo', 'Folio', 'Total', 'Estado', 'Acciones'].map(label => <th key={label} style={{ padding: '7px 10px', textAlign: label === 'Total' ? 'right' : 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</th>)}
            </tr></thead>
            <tbody>{dtes.map(doc => (
              <tr key={doc.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 10px' }}>{TIPOS_DTE[doc.tipoDte] || `DTE ${doc.tipoDte}`}</td>
                <td style={{ padding: '8px 10px', fontFamily: "'DM Mono',monospace" }}>{doc.folio || '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" }}>{fmt(doc.totales?.total)}</td>
                <td style={{ padding: '8px 10px' }}><Badge tone={DTE_TONE[doc.estado] || 'gray'}>{doc.estado}</Badge></td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  {doc.xml && doc.estado !== 'borrador' && <>
                    <button onClick={() => runDteAction(openDtePdf, doc)} style={dteLink('var(--blue)')}>Ver PDF</button>
                    <button onClick={() => runDteAction(downloadDteXml, doc)} style={dteLink('var(--text-2)')}>Descargar XML</button>
                    {canWriteFacturacion && <button onClick={() => reenviarDoc(doc)} disabled={reenviar.isPending} style={dteLink('var(--text-2)')}>Reenviar</button>}
                  </>}
                  {canWriteFacturacion && [33, 39].includes(Number(doc.tipoDte)) && ['aceptado', 'enviado'].includes(doc.estado) && <>
                    <button onClick={() => onNota(doc, 61)} style={dteLink('var(--red)')}>Anular con NC</button>
                    <button onClick={() => onNota(doc, 56)} style={dteLink('var(--blue)')}>Corregir con ND</button>
                  </>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {v.observaciones && (
        <>
          <FormDivider label="Observaciones / Notas" />
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {v.observaciones}
          </div>
        </>
      )}
      {ajustarPresupuesto && <AjustarPresupuestoModal venta={v} onClose={() => setAjustarPresupuesto(false)} />}
    </div>
  )
}

const dteLink = color => ({ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '2px 4px', textDecoration: 'underline' })

function DespachoAjusteHistorialTable({ ventaId }) {
  const { data: historial = [] } = useVentaDespachoHistorial(ventaId)
  if (!historial.length) return null
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginTop: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {['Fecha', 'Monto anterior', 'Monto nuevo', 'Motivo', 'Usuario'].map((h, i) => (
              <th key={h} style={{ padding: '7px 10px', textAlign: i === 1 || i === 2 ? 'right' : 'left', fontWeight: 600, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {historial.map(h => (
            <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 10px', fontFamily: "'DM Mono',monospace" }}>{new Date(h.createdAt).toLocaleDateString('es-CL')}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" }}>{fmt(h.montoAnterior)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(h.montoNuevo)}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-2)' }}>{h.motivo || '—'}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-2)' }}>{h.usuarioNombre || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AjustarPresupuestoModal({ venta, onClose }) {
  const [monto, setMonto] = useState(String(venta.montoDespacho || 0))
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const updateVenta = useUpdateVenta()

  const guardar = () => {
    const montoDespacho = Number(monto)
    if (!Number.isFinite(montoDespacho) || montoDespacho < 0) {
      setError('Ingresa un monto válido.')
      return
    }
    setError('')
    updateVenta.mutate({ id: venta.id, data: { montoDespacho, motivoAjusteDespacho: motivo.trim() || undefined } }, {
      onSuccess: () => { onClose(); toast.success('Presupuesto de despacho actualizado.') },
      onError: err => setError(err.response?.data?.error || err.message || 'No se pudo actualizar el presupuesto.'),
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'oklch(0 0 0/0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', width: 420, maxWidth: '100%', borderRadius: 12, boxShadow: '0 16px 48px oklch(0 0 0/0.2)', padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Ajustar presupuesto de despacho</div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Nuevo monto</label>
        <input type="number" min="0" value={monto} onChange={e => setMonto(e.target.value)} style={{ width: '100%', padding: 9, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', marginBottom: 12, boxSizing: 'border-box' }} />
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Motivo (opcional)</label>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} style={{ width: '100%', padding: 9, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} placeholder="Ej: ajuste para cuadrar despacho real" />
        {error && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 500 }}>Cancelar</button>
          <button onClick={guardar} disabled={updateVenta.isPending} style={{ padding: '8px 16px', fontSize: 13, borderRadius: 8, border: 'none', background: 'var(--green-600)', color: '#fff', cursor: 'pointer', fontWeight: 700, opacity: updateVenta.isPending ? 0.6 : 1 }}>
            {updateVenta.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Widget: Agregar producto por código ─────────────────────────────────────────
function isConvenioMarco(tipo) {
  return normalizeText(tipo) === 'convenio marco'
}

function defaultPrecioUnitario(producto, tipoVenta) {
  if (!isConvenioMarco(tipoVenta)) return Number(producto.consultaPrecios?.precioNormalSalaVentaIva ?? producto.precioLista ?? 0)
  const precioMarco = Number(producto.consultaPrecios?.precioConvMarco ?? producto.precioMarco ?? producto.precioLista ?? 0)
  return precioMarco > 0 ? Math.round(precioMarco * 1.19) : 0
}

function AgregarProductoWidget({ venta, items, canWrite }) {
  const [codigoBarra, setCodigoBarra] = useState('')
  const [codigoInterno, setCodigoInterno] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const updateVenta = useUpdateVenta()
  const barraRef = useRef(null)

  const puedeAgregar = canWrite && venta.estadoPago === 'No pagada' && venta.estado === 'Activa'

  const { data: porBarra } = useProductos(codigoBarra.length >= 3 ? { codigoBarra } : {})
  const { data: porInterno } = useProductos(codigoInterno.length >= 2 ? { codigoInterno } : {})

  if (!puedeAgregar) return null

  const agregarProducto = (producto) => {
    if (!producto) return
    const cant = Math.max(1, Number(cantidad) || 1)
    const existente = items.find(i => i.productoId === producto.id)
    const nuevosItems = existente
      ? items.map(i => i.productoId === producto.id ? { ...i, cantidad: i.cantidad + cant } : i)
      : [...items, {
          productoId: producto.id,
          cantidad: cant,
          precioUnitario: defaultPrecioUnitario(producto, venta.tipo),
          nombre: producto.nombre,
          codigoInterno: producto.codigoInterno || '',
        }]
    updateVenta.mutate(
      { id: venta.id, data: { items: nuevosItems.map(({ productoId, cantidad, precioUnitario, nombre, descripcion, codigoInterno }) => ({ productoId, cantidad, precioUnitario, nombre: nombre || undefined, descripcion: descripcion || undefined, codigoInterno: codigoInterno || undefined })) } },
      {
        onSuccess: () => {
          toast.success(`${producto.nombre} agregado (x${cant}).`)
          setCodigoBarra('')
          setCodigoInterno('')
          setCantidad(1)
          barraRef.current?.focus()
        },
        onError: err => toast.error(err?.response?.data?.error || 'No se pudo agregar el producto.'),
      }
    )
  }

  const matchBarra = codigoBarra.length >= 3 ? (porBarra?.items || [])[0] : null
  const matchInterno = codigoInterno.length >= 2 ? (porInterno?.items || []) : []

  return (
    <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
      <FormDivider label="Agregar producto" />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input
          type="number" min="1" value={cantidad}
          onChange={e => setCantidad(e.target.value)}
          style={{ width: 60, padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
        />
        <input
          ref={barraRef}
          type="text" value={codigoBarra}
          onChange={e => setCodigoBarra(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && matchBarra) agregarProducto(matchBarra) }}
          placeholder="Código de barra..."
          autoFocus
          style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
        />
      </div>
      {codigoBarra.length >= 3 && !matchBarra && (
        <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>Código de barra no encontrado.</div>
      )}
      <input
        type="text" value={codigoInterno}
        onChange={e => setCodigoInterno(e.target.value)}
        placeholder="...o código interno / nombre"
        style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, marginBottom: 8 }}
      />
      {matchInterno.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 160, overflowY: 'auto' }}>
          {matchInterno.slice(0, 6).map(p => (
            <button
              key={p.id}
              onClick={() => agregarProducto(p)}
              disabled={updateVenta.isPending}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', background: '#fff', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, textAlign: 'left' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {p.fotoUrl ? (
                  <img src={p.fotoUrl} alt="" style={{ width: 26, height: 26, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 26, height: 26, borderRadius: 4, background: 'var(--bg)', border: '1px solid var(--border)', flexShrink: 0, display: 'inline-block' }} />
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre} <span style={{ color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>({p.codigoInterno})</span></span>
              </span>
              <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 600, flexShrink: 0 }}>{fmt(defaultPrecioUnitario(p, venta.tipo))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Total grande ──────────────────────────────────────────────────────────────
function TotalBadge({ total }) {
  return (
    <div style={{
      background: 'var(--green-900)', color: '#fff', borderRadius: 10,
      padding: '10px 20px', fontSize: 26, fontWeight: 800,
      fontFamily: "'DM Mono',monospace", letterSpacing: -0.5,
      boxShadow: '0 4px 14px oklch(0 0 0 / .18)',
    }}>
      TOTAL {fmt(total)}
    </div>
  )
}

// ── Operaciones disponibles ──────────────────────────────────────────────────
function opBtnStyle(color) {
  return {
    width: '100%', padding: '11px 14px', fontSize: 13, fontWeight: 600,
    color: '#fff', background: color, border: 'none', borderRadius: 8,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
    marginBottom: 8, transition: 'opacity 0.1s',
  }
}

function OperacionesDisponibles({ v, odtsCount, guiasCount, canEmitirDte, onEmitirDte, canDelete, canManageInternalCreditNotes, internalCreditNoteBlocked, onCreateInternalCreditNote }) {
  const navigate = useNavigate()
  const anularVenta = useAnularVenta()
  const activarVenta = useActivarVenta()
  const despachosCount = (v.despachos || []).length

  const handleCreateDespacho = () => {
    const params = new URLSearchParams({
      ordenId: String(v.id),
      nInterno: String(v.nInterno || ''),
      direccion: v.direccionDespacho || '',
      region: v.regionDespacho || '',
      comuna: v.comunaDespacho || ''
    })
    navigate(`/despachos/nuevo?${params.toString()}`)
  }

  const abrirNotaVenta = () => {
    const w = window.open(`${window.location.origin}/ventas/${v.id}/imprimir`, '_blank')
    if (!w) toast.warning('Habilita popups para imprimir')
  }

  const anular = async () => {
    if (!await confirmDialog({ title: 'Anular venta', detail: `¿Anular la venta #${v.id}? Esta acción revierte el stock y bloquea nuevas acciones sobre la venta. No se puede deshacer directo (hay que Revertir a Activa).`, tone: 'danger' })) return
    anularVenta.mutate(v.id, {
      onSuccess: () => toast.success('Venta anulada.'),
      onError: err => toast.error(err?.response?.data?.error || 'No se pudo anular la venta.'),
    })
  }

  const revertir = () => {
    activarVenta.mutate(v.id, {
      onSuccess: () => toast.success('Venta reactivada.'),
      onError: err => toast.error(err?.response?.data?.error || 'No se pudo reactivar la venta.'),
    })
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <FormDivider label="Operaciones disponibles" />
      <button onClick={() => navigate(`/taller?search=${v.nInterno || v.id}`)} style={opBtnStyle('var(--blue)')}>
        <Icon name="tool" size={14} /> Órdenes de Trabajo ({odtsCount})
      </button>
      <button onClick={() => navigate(`/despachos?tab=guias&ordenId=${v.id}`)} style={opBtnStyle('var(--green-600)')}>
        <Icon name="truck" size={14} /> Guías Despachos ({guiasCount})
      </button>
      <button onClick={handleCreateDespacho} style={opBtnStyle('var(--blue)')}>
        <Icon name="truck" size={14} /> Crear Despacho ({despachosCount})
      </button>
      <button onClick={abrirNotaVenta} style={opBtnStyle('var(--blue)')}>
        <Icon name="printer" size={14} /> Nota de Venta
      </button>
      {canManageInternalCreditNotes && (
        <button
          onClick={onCreateInternalCreditNote}
          disabled={internalCreditNoteBlocked || v.eliminada}
          title={internalCreditNoteBlocked ? 'La venta ya tiene factura o boleta. Corresponde emitir una nota de crédito SII.' : v.eliminada ? 'La venta está anulada.' : 'Crear una nota de crédito no tributaria para ajustar saldo y stock.'}
          style={{ ...opBtnStyle('var(--green-600)'), opacity: internalCreditNoteBlocked || v.eliminada ? 0.55 : 1, cursor: internalCreditNoteBlocked || v.eliminada ? 'not-allowed' : 'pointer' }}
        >
          <Icon name="refreshCw" size={14} /> Nota de Crédito Interna
        </button>
      )}
      <button onClick={() => navigate(`/pasar-taller?ordenId=${v.id}`)} style={opBtnStyle('var(--amber)')}>
        <Icon name="tool" size={14} /> Notificar a Taller
      </button>
      {canEmitirDte && (
        <button onClick={onEmitirDte} style={opBtnStyle('var(--blue)')}>
          <Icon name="fileText" size={14} /> Emitir DTE
        </button>
      )}
      {!v.eliminada && canDelete && (
        <button onClick={anular} disabled={anularVenta.isPending} style={{ ...opBtnStyle('var(--red)'), opacity: anularVenta.isPending ? 0.7 : 1 }}>
          <Icon name="xCircle" size={14} /> {anularVenta.isPending ? 'Anulando...' : 'Anular Venta'}
        </button>
      )}
      {v.eliminada && canDelete && (
        <button onClick={revertir} disabled={activarVenta.isPending} style={{ ...opBtnStyle('var(--green-600)'), opacity: activarVenta.isPending ? 0.7 : 1 }}>
          <Icon name="refreshCw" size={14} /> {activarVenta.isPending ? 'Reactivando...' : 'Revertir a Activa'}
        </button>
      )}
    </div>
  )
}

// ── Documentos + Pagos (columna izquierda) ───────────────────────────────────
function DocumentosPagosList({ pagos, dtes }) {
  const pagosReales = (pagos || []).filter(p => !isReferencialPago(p))
  const totalPagado = pagosReales
    .filter(p => p.tipo === 'Ingreso')
    .reduce((s, p) => s + Math.abs(p.monto), 0)

  if (pagosReales.length === 0 && (dtes || []).length === 0) return null

  return (
    <div>
      <FormDivider label="Documentos emitidos" />
      {totalPagado > 0 && (
        <div style={{ background: 'var(--green-50)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--green-700)', fontWeight: 600 }}>Total recibido</span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: 'var(--green-700)' }}>{fmt(totalPagado)}</span>
        </div>
      )}
      {(dtes || []).map(doc => {
        const runDteAction = async (action) => {
          try {
            await action(doc)
          } catch (error) {
            toast.error(error?.response?.data?.error || error?.message || 'No se pudo abrir el documento.')
          }
        }
        return (
          <div key={doc.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{TIPOS_DTE[doc.tipoDte] || `DTE ${doc.tipoDte}`} {doc.folio ? `#${doc.folio}` : ''}</span>
              <Badge tone={DTE_TONE[doc.estado] || 'gray'}>{doc.estado}</Badge>
            </div>
            {doc.xml && doc.estado !== 'borrador' && (
              <div style={{ marginTop: 2 }}>
                <button onClick={() => runDteAction(openDtePdf)} style={dteLink('var(--blue)')}>Ver PDF</button>
                <button onClick={() => runDteAction(downloadDteXml)} style={dteLink('var(--text-2)')}>Descargar XML</button>
              </div>
            )}
          </div>
        )
      })}
      {pagosReales.map(p => (
        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          <span>{p.medioPago}</span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 600, color: p.tipo === 'Ingreso' ? 'var(--green-600)' : 'var(--red)' }}>
            {p.tipo === 'Ingreso' ? '+' : '−'}{fmt(Math.abs(p.monto))}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function ViewVentaPanel({ venta, onClose, onEdit, canWrite = true, canDelete = false, variant = 'drawer' }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [tab, setTab] = useState('detalle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [emitirDte, setEmitirDte] = useState(false)
  const [notaDte, setNotaDte] = useState(null)
  const [notaInterna, setNotaInterna] = useState(false)

  const { data: full, isLoading } = useVenta(venta.id)
  const deleteVenta = useDeleteVenta()
  const forzarTallerMut = useForzarTaller()
  const updateEntregados = useUpdateItemEntregados()
  const documentosDteQuery = useDocumentos({ ordenId: venta.id })

  const v = full || venta
  const odts  = full?.odts  ?? []
  const pagos = full?.pagos ?? []
  const guias = full?.guias ?? []
  const documentosCount = pagos.filter(isReferencialPago).length
  const dtes = documentosDteQuery.data?.documentos || []
  const canWriteFacturacion = can(user, 'facturacion', 'write')
  const ventaYaEmitida = hasActiveSalesDte(dtes)
  const canManageInternalCreditNotes = canWrite || canWriteFacturacion
  const fecha = v.createdAt
    ? new Date(v.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  const handleForzarTaller = () => {
    forzarTallerMut.mutate(v.id, {
      onSuccess: () => {
        toast.warning('Orden de Trabajo procesada correctamente.')
      },
      onError: (err) => {
        toast.error('Error al forzar taller: ' + (err.response?.data?.error || err.message))
      }
    })
  }

  const handleCreateDespacho = () => {
    const params = new URLSearchParams({
      ordenId: String(v.id),
      nInterno: String(v.nInterno || ''),
      direccion: v.direccionDespacho || '',
      region: v.regionDespacho || '',
      comuna: v.comunaDespacho || ''
    })
    navigate(`/despachos/nuevo?${params.toString()}`)
  }

  function handleDelete() {
    deleteVenta.mutate(venta.id, {
      onSuccess: () => onClose(),
    })
  }

  if (variant === 'page') {
    const pageTitle = <span>Venta <span style={{ fontFamily: "'DM Mono',monospace", color: 'var(--green-700)' }}>#{v.id}</span></span>
    const items = v.items || []
    const total = v.total || 0
    const abono = v.abono || 0
    const saldo = total - abono
    const descuento = Number(v.descuentoSnapshot?.porcentaje ?? v.descuentoPct ?? 0)
    const subtotal = items.reduce((s, i) => s + (i.precioUnitario * i.cantidad), 0)
    const cargosTotal = (v.cargos || []).reduce((s, c) => s + Number(c.valor || 0), 0)
    const totalBase = subtotal + cargosTotal
    const descuentoMonto = resolvedDiscountAmount(totalBase, descuento, v.descuentoMonto)
    // precioUnitario ya incluye IVA (precio de venta sala) — se desglosa desde el total, no se suma aparte.
    const netoVenta = Math.round(total / 1.19)
    const ivaVenta = total - netoVenta
    // odts ya viene ordenado por createdAt desc: el primer match por productoId es el mas reciente.
    const estadoTallerPorProducto = new Map()
    for (const odt of odts) {
      for (const odtItem of odt.items || []) {
        if (!estadoTallerPorProducto.has(odtItem.productoId)) estadoTallerPorProducto.set(odtItem.productoId, odtItem)
      }
    }
    const dtesValidos = doc => ['emitido', 'enviado', 'aceptado'].includes(doc.estado)
    const totalNC = dtes.filter(d => d.tipoDte === 61 && dtesValidos(d)).reduce((s, d) => s + Number(d.totales?.total || 0), 0)
    const totalND = dtes.filter(d => d.tipoDte === 56 && dtesValidos(d)).reduce((s, d) => s + Number(d.totales?.total || 0), 0)

    return (
      <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-1)', letterSpacing: -0.3 }}>{pageTitle}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{v.tipo || 'Venta'}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <TotalBadge total={total} />
            {canWrite && onEdit && <Btn variant="primary" icon="edit" onClick={onEdit}>Editar</Btn>}
            {canDelete && <Btn variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)} style={{ color: 'var(--red)' }}>Eliminar</Btn>}
          </div>
        </div>

        {isLoading && !full && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando detalles...</div>
        )}

        {(!isLoading || full) && (
          <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 0 }}>
            {/* Columna izquierda */}
            <div style={{ padding: '18px 16px', borderRight: '1px solid var(--border)' }}>
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 13 }}>
                <div><strong>Ejecutivo(a):</strong> {v.creadorNombre || 'Sin vendedor'}</div>
                <div style={{ marginTop: 4 }}><strong>Fecha:</strong> {fecha}</div>
              </div>
              <AgregarProductoWidget venta={v} items={items} canWrite={canWrite} />
              <OperacionesDisponibles
                v={v}
                odtsCount={odts.length}
                guiasCount={guias.length}
                canEmitirDte={canWriteFacturacion && !ventaYaEmitida}
                onEmitirDte={() => setEmitirDte(true)}
                canDelete={canDelete}
                canManageInternalCreditNotes={canManageInternalCreditNotes}
                internalCreditNoteBlocked={ventaYaEmitida}
                onCreateInternalCreditNote={() => setNotaInterna(true)}
              />
              <DocumentosPagosList pagos={pagos} dtes={dtes} />
            </div>

            {/* Columna derecha */}
            <div style={{ padding: 22 }}>
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 10 }}>Cliente</div>
                {(() => {
                  const direccion = v.clienteSucursal?.direccion || v.cliente?.direccion
                  const comuna = v.clienteSucursal?.comuna || v.cliente?.comuna
                  const region = v.clienteSucursal?.region || v.cliente?.region
                  const ciudad = v.clienteSucursal?.ciudad || v.cliente?.ciudad
                  const filas = [
                    ['Nombre', v.cliente?.nombre],
                    ['Razón Social', v.cliente?.razonSocial],
                    ['RUT', v.cliente?.rut],
                    ['Giro', v.cliente?.giro],
                    ['Dirección', direccion],
                    ['Comuna', comuna],
                    ['Región', region],
                    ['Ciudad', ciudad],
                    ['Teléfono', v.cliente?.telefono],
                    ['Email', v.cliente?.email],
                  ].filter(([, valor]) => valor)
                  if (!filas.length) return <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Sin cliente asociado</div>
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 20, rowGap: 4 }}>
                      {filas.map(([label, valor]) => (
                        <div key={label} style={{ display: 'flex', gap: 8, fontSize: 12, minWidth: 0 }}>
                          <span style={{ color: 'var(--text-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
                          <span style={{ color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{valor}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {items.length > 0 && (
                <>
                  <FormDivider label={`Productos (${items.length})`} />
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', marginBottom: 14 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 820 }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)' }}>
                          {['', 'Producto', 'Cant.', 'P. Unit. (Neto)', 'P. Unit. (c/IVA)', 'IVA (19%)', 'Subtotal (c/IVA)', 'Entregados', 'Pendiente', 'Estado Taller'].map((h, i) => (
                            <th key={i} style={{ padding: i === 0 ? '7px 4px' : '7px ' + (i === 1 ? '12px' : '8px'), textAlign: i <= 1 ? 'left' : 'right', fontWeight: 600, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, i) => {
                          const itemNetoUnitario = item.precioUnitario
                          const itemNetoTotal = itemNetoUnitario * item.cantidad
                          const itemIvaTotal = Math.round(itemNetoTotal * 0.19)
                          const itemBrutoUnitario = Math.round(itemNetoUnitario * 1.19)
                          const itemSubtotalConIva = itemNetoTotal + itemIvaTotal
                          return (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 4px 8px 12px', width: 40 }}>
                              {item.producto?.fotoUrl ? (
                                <img src={item.producto.fotoUrl} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />
                              ) : (
                                <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--bg)', border: '1px solid var(--border)' }} />
                              )}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ fontWeight: 500 }}>{item.producto?.nombre || item.nombre || `Producto #${item.productoId}`}</div>
                              {(item.producto?.codigoInterno || item.codigoInterno) && (
                                <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>{item.producto?.codigoInterno || item.codigoInterno}</div>
                              )}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: 'var(--text-2)' }}>{item.cantidad}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: 'var(--text-2)' }}>{fmt(itemNetoUnitario)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: 'var(--text-2)' }}>{fmt(itemBrutoUnitario)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: 'var(--green-700)', fontWeight: 600 }}>{fmt(itemIvaTotal)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 700, color: 'var(--text-1)' }}>{fmt(itemSubtotalConIva)}</td>
                            <td style={{ padding: '4px 12px', textAlign: 'right' }}>
                              {canWrite ? (
                                <input
                                  type="number" min={0} max={item.cantidad} defaultValue={item.nEntregados ?? 0}
                                  onBlur={e => {
                                    const n = parseInt(e.target.value || '0', 10)
                                    if (n !== (item.nEntregados ?? 0)) updateEntregados.mutate({ itemId: item.id, nEntregados: n }, {
                                      onError: err => toast.error(err.response?.data?.error || 'No se pudo actualizar entregados'),
                                    })
                                  }}
                                  style={{ width: 60, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: 'right' }}
                                />
                              ) : (
                                <span style={{ fontFamily: "'DM Mono',monospace" }}>{item.nEntregados ?? 0}</span>
                              )}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600, color: (item.cantidad - (item.nEntregados ?? 0)) > 0 ? 'var(--amber)' : 'var(--green-600)' }}>
                              {item.cantidad - (item.nEntregados ?? 0)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              {(() => {
                                const odtItem = estadoTallerPorProducto.get(item.productoId)
                                if (!odtItem) return <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
                                const listo = odtItem.estado === 'Listo' || odtItem.estado === 'listo'
                                return (
                                  <span style={{ fontSize: 11, fontWeight: 600, color: listo ? 'var(--green-600)' : 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    {listo && <Icon name="check" size={11} color="var(--green-600)" />}
                                    {odtItem.estado}
                                  </span>
                                )
                              })()}
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <FormDivider label="Resumen financiero" />
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
                {items.length > 0 && subtotal !== total && descuentoMonto > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-2)' }}>Subtotal</span>
                    <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(subtotal)}</span>
                  </div>
                )}
                {cargosTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-2)' }}>Cargos transporte</span>
                    <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(cargosTotal)}</span>
                  </div>
                )}
                {descuentoMonto > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', color: 'var(--green-600)' }}>
                    <span>{discountLabel(v, descuento)}</span>
                    <span style={{ fontFamily: "'DM Mono',monospace" }}>-{fmt(descuentoMonto)}</span>
                  </div>
                )}
                {total > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-2)' }}>Neto</span>
                      <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(netoVenta)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-2)' }}>IVA (19%)</span>
                      <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(ivaVenta)}</span>
                    </div>
                  </>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-2)' }}>NC Totales</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", color: totalNC > 0 ? 'var(--red)' : 'var(--text-3)' }}>{totalNC > 0 ? `−${fmt(totalNC)}` : fmt(0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-2)' }}>ND Totales</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", color: totalND > 0 ? 'var(--amber)' : 'var(--text-3)' }}>{totalND > 0 ? `+${fmt(totalND)}` : fmt(0)}</span>
                </div>
                {(abono > 0 || saldo > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', fontSize: 14, fontWeight: 700, background: saldo > 0 ? '#fef2f2' : 'var(--green-50)' }}>
                    <span style={{ color: saldo > 0 ? 'var(--red)' : 'var(--green-700)' }}>Saldo Pendiente</span>
                    <span style={{ fontFamily: "'DM Mono',monospace", color: saldo > 0 ? 'var(--red)' : 'var(--green-700)' }}>{fmt(saldo)}</span>
                  </div>
                )}
              </div>

              {v.observaciones && (
                <>
                  <FormDivider label="Observaciones" />
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 14 }}>
                    {v.observaciones}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {confirmDelete && canDelete && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'oklch(0 0 0/0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', maxWidth: 360, width: '90%', boxShadow: '0 16px 48px oklch(0 0 0/0.2)' }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: 'var(--text-1)' }}>Eliminar Venta #{v.id}?</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 20 }}>
                Esta accion eliminara la venta y todos sus items asociados. No se puede deshacer.
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
                  {deleteVenta.isPending ? 'Eliminando...' : 'Eliminar definitivamente'}
                </button>
              </div>
            </div>
          </div>
        )}
        {emitirDte && <EmitirDteModal venta={v} onClose={() => setEmitirDte(false)} onSuccess={({ emitido, documento }) => { setEmitirDte(false); toast.success(`DTE emitido${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`) }} />}
        {notaDte && <NotaDteModal documento={notaDte.documento} tipoDte={notaDte.tipoDte} onClose={() => setNotaDte(null)} onSuccess={({ emitido, documento }) => { setNotaDte(null); toast.success(`DTE emitido${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`) }} />}
        {notaInterna && <InternalCreditNoteModal venta={v} onClose={() => setNotaInterna(false)} />}
      </section>
    )
  }

  const title = <span>Venta <span style={{ fontFamily: "'DM Mono',monospace", color: 'var(--green-700)' }}>#{v.id}</span></span>
  const subtitle = `${fecha} Â· ${v.creadorNombre || 'Sin vendedor'}`

  return (
    <ViewPanel
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      onEdit={canWrite ? onEdit : undefined}
      onDelete={canDelete ? () => setConfirmDelete(true) : undefined}
      onPrint={() => {
        const w = window.open(`${window.location.origin}/ventas/${v.id}/imprimir`, '_blank')
        if (!w) toast.warning('Habilita popups para imprimir')
      }}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 16, marginTop: -6 }}>
        <TabBtn active={tab === 'detalle'}    onClick={() => setTab('detalle')}>Detalle</TabBtn>
        <TabBtn active={tab === 'taller'}     onClick={() => setTab('taller')}  badge={odts.length}>Taller</TabBtn>
        <TabBtn active={tab === 'pagos'}      onClick={() => setTab('pagos')}   badge={pagos.length}>Pagos</TabBtn>
        <TabBtn active={tab === 'documentos'} onClick={() => setTab('documentos')} badge={documentosCount}>Documentos</TabBtn>
      </div>

      {isLoading && !full && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando detalles…</div>
      )}

      {tab === 'detalle'    && (
        <TabDetalle
          v={v}
          handleForzarTaller={handleForzarTaller}
          forzarTallerMut={forzarTallerMut}
          handleCreateDespacho={handleCreateDespacho}
          canEmitirDte={canWriteFacturacion && !ventaYaEmitida}
          onEmitirDte={() => setEmitirDte(true)}
        />
      )}
      {tab === 'taller'     && <TabTaller odts={odts} onGoTaller={() => navigate('/taller')} />}
      {tab === 'pagos'      && <TabPagos pagos={pagos} />}
      {tab === 'documentos' && <TabDocumentos v={v} pagos={pagos} dtes={dtes} canWrite={canWrite} canWriteFacturacion={canWriteFacturacion} onNota={(documento, tipoDte) => setNotaDte({ documento, tipoDte })} />}

      {/* Delete confirmation */}
      {confirmDelete && canDelete && (
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
      {emitirDte && <EmitirDteModal venta={v} onClose={() => setEmitirDte(false)} onSuccess={({ emitido, documento }) => { setEmitirDte(false); toast.success(`DTE emitido${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`) }} />}
      {notaDte && <NotaDteModal documento={notaDte.documento} tipoDte={notaDte.tipoDte} onClose={() => setNotaDte(null)} onSuccess={({ emitido, documento }) => { setNotaDte(null); toast.success(`DTE emitido${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`) }} />}
    </ViewPanel>
  )
}
