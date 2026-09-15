import { toast, confirmDialog } from '../../store/notif'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Btn, Icon } from '../shared'
import { ViewPanel, FormDivider } from './index'
import { useVenta, useDeleteVenta, useForzarTaller, useUpdateVenta, useAnularVenta, useActivarVenta, useUpdateItemEntregados, useVentaDespachoHistorial } from '../../api/ventas'
import { useProductos } from '../../api/productos'
import { useDocumentos, useDocumentosReferenciables, useReenviarDocumento } from '../../api/facturacion'
import { EmitirDteModal, NotaDteModal } from '../facturacion/DteModals'
import { GuiaDespachoModal } from '../../pages/despachos/GuiaFormPage'
import { DespachoModal } from '../../pages/despachos/DespachoFormPage'
import { hasActiveSalesDte, TIPOS_DTE } from '../../utils/facturacion'
import { downloadDteXml, openDtePdf } from '../../utils/dteDocuments'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { InternalCreditNoteModal, InternalCreditNotes } from '../facturacion/InternalCreditNotes'
import { activeReferentialDocs, collectibleDocuments, isReferencialPago } from '../../utils/cobranza'

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

function sameDocumento(a, b) {
  return a?.documento && a?.nDoc && a.documento === b?.documento && a.nDoc === b?.nDoc
}

const ESTADO_TONE = {
  Pagada: 'green', Entregada: 'green', Completada: 'green',
  Parcial: 'amber', 'En despacho': 'amber',
  'No pagada': 'red', 'Pendiente entrega': 'red',
}
const ESTADO_FLUJO_TONE = {
  CERRADA: 'green',
  ANULADA: 'red',
  EN_DESPACHO: 'blue',
  ENTREGA_PARCIAL: 'amber',
  ENTREGADA_PENDIENTE_PAGO: 'amber',
  PAGO_PARCIAL: 'amber',
  PAGO_WEBPAY_PENDIENTE: 'amber',
  PAGO_WEBPAY_RECHAZADO: 'red',
}
function EstadoBadge({ v }) {
  return <Badge tone={ESTADO_TONE[v] ?? 'gray'}>{v || '—'}</Badge>
}
function EstadoFlujoBadge({ estado }) {
  if (!estado) return <EstadoBadge v="—" />
  return <Badge tone={ESTADO_FLUJO_TONE[estado.codigo] ?? 'gray'}>{estado.label}</Badge>
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
function TabDetalle({ v, handleForzarTaller, forzarTallerMut, handleCreateDespacho, canWriteDespacho, canEmitirDte, onEmitirDte, canRegistrarPago, canCobrar, onCobrar }) {
  const items = v.items || []
  const total = v.total || 0
  const abono = v.abono || 0
  const saldo = total - abono
  const descuento = Number(v.descuentoSnapshot?.porcentaje ?? v.descuentoPct ?? 0)
  const subtotal = items.reduce((s, i) => s + (i.precioUnitario * i.cantidad), 0)
  const cargosTotal = (v.cargos || []).reduce((s, c) => s + Number(c.valor || 0), 0)
  const totalBase = subtotal + cargosTotal
  const descuentoMonto = resolvedDiscountAmount(totalBase, descuento, v.descuentoMonto)
  const tipoNormalizado = normalizeText(v.tipo)
  const detalleComercial = [
    ...(tipoNormalizado === 'marketplace' ? [
      ['Canal Marketplace', v.marketplaceCanal],
      ['Referencia externa', v.marketplaceReferencia],
      ['Comisión', v.marketplaceComisionMonto != null
        ? `${v.marketplaceComisionPct != null ? `${v.marketplaceComisionPct}% · ` : ''}${fmt(v.marketplaceComisionMonto)}`
        : null],
    ] : []),
    ...(['licitacion', 'convenio marco', 'compra agil', 'trato directo'].includes(tipoNormalizado) && v.licitacion
      ? [[tipoNormalizado === 'convenio marco' ? 'Orden de compra' : 'Identificador comercial', v.licitacion]]
      : []),
    ...(v.plazoEntregaDias != null ? [['Plazo comprometido', `${v.plazoEntregaDias} días ${v.plazoEntregaTipo || 'corridos'}`]] : []),
    ...(v.enviosParciales ? [['Despachos', 'Envíos parciales permitidos']] : []),
  ].filter(([, value]) => value !== null && value !== undefined && value !== '')

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
        </div>
      </div>

      {detalleComercial.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <FormDivider label="Condiciones comerciales" />
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, margin: 0 }}>
            {detalleComercial.map(([label, value]) => (
              <div key={label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', minWidth: 0 }}>
                <dt style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{label}</dt>
                <dd style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Estados */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
        {[['Pago', v.estadoPago], ['Entrega', v.estadoEntrega], ['Logística', v.estadoLogistico?.label || '—', v.estadoLogistico?.tone], ['Estado', v.estado], ['Flujo', v.estadoFlujo]].map(([label, val, customTone], i) => (
          <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', textAlign: 'center', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</div>
            {label === 'Flujo' ? <EstadoFlujoBadge estado={val} /> : (label === 'Logística' ? <Badge tone={customTone || 'gray'}>{val}</Badge> : <EstadoBadge v={val} />)}
          </div>
        ))}
      </div>

      {/* Resumen de Preparación Logística */}
      {v.preparacion && (
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, border: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Preparación Bodega:</span>
          {Number(v.preparacion.disponibleInventario || 0) > 0 && (
            <Badge tone="blue">Stock: {v.preparacion.disponibleInventario} u.</Badge>
          )}
          {Number(v.preparacion.disponibleTaller || 0) > 0 && (
            <Badge tone="green">Taller Listo: {v.preparacion.disponibleTaller} u.</Badge>
          )}
          {Number(v.preparacion.pendienteTaller || 0) > 0 && (
            <Badge tone="amber">Taller Pendiente: {v.preparacion.pendienteTaller} u.</Badge>
          )}
        </div>
      )}

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
        {canRegistrarPago && saldo > 0 && !v.eliminada && (
          <div style={{ flex: '1 1 180px', display: 'grid', gap: 4 }} title={canCobrar ? 'Registrar abono' : 'Emite o registra una factura o boleta activa antes de cobrar'}>
            <button
              onClick={onCobrar}
              disabled={!canCobrar}
              style={{
                padding: '10px 12px', fontSize: 12, fontWeight: 600,
                color: canCobrar ? '#fff' : 'var(--text-3)', background: canCobrar ? 'var(--green-700)' : 'var(--bg)', border: canCobrar ? 'none' : '1px solid var(--border)', borderRadius: 8,
                cursor: canCobrar ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Icon name="dollarSign" size={14} />
              Cobrar (saldo {fmt(saldo)})
            </button>
            {!canCobrar && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Primero emite o registra una factura o boleta.</span>}
          </div>
        )}
        {canWriteDespacho && <button
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
          Registrar salida
        </button>}

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

function OperacionesDisponibles({ v, odtsCount, guiasCount, canWriteDespacho, canEmitirDte, onEmitirDte, canEmitirNotaFiscal, onEmitirNotaFiscal, canDelete, canManageInternalCreditNotes, internalCreditNoteBlocked, onCreateInternalCreditNote, canRegistrarPago, canCobrar, saldo, onCobrar, onCreateDespacho, onPrepararGuia }) {
  const navigate = useNavigate()
  const anularVenta = useAnularVenta()
  const activarVenta = useActivarVenta()
  const despachosCount = (v.despachos || []).length

  const abrirNotaVenta = () => {
    const w = window.open(`${window.location.origin}/ventas/${v.id}/imprimir`, '_blank')
    if (!w) toast.warning('Habilita popups para imprimir')
  }

  const abrirHojaBodega = () => {
    const w = window.open(`${window.location.origin}/ventas/${v.id}/bodega`, '_blank')
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
      {canRegistrarPago && saldo > 0 && !v.eliminada && (
        <>
          <button
            onClick={onCobrar}
            disabled={!canCobrar}
            title={canCobrar ? 'Registrar abono' : 'Emite o registra una factura o boleta activa antes de cobrar'}
            style={{ ...opBtnStyle(canCobrar ? 'var(--green-700)' : 'var(--bg)'), color: canCobrar ? '#fff' : 'var(--text-3)', border: canCobrar ? 'none' : '1px solid var(--border)', cursor: canCobrar ? 'pointer' : 'not-allowed' }}
          >
            <Icon name="dollarSign" size={14} /> Cobrar (saldo {fmt(saldo)})
          </button>
          {!canCobrar && <div style={{ margin: '-3px 0 10px', fontSize: 11, color: 'var(--text-3)' }}>Primero emite o registra una factura o boleta.</div>}
        </>
      )}
      {(v.cotizaciones?.length > 0 || v.licitacion) && (
        <button
          onClick={() => {
            const cotId = v.cotizaciones?.[0]?.id
            if (cotId) navigate(`/licitaciones/${cotId}`)
            else navigate(`/licitaciones?search=${encodeURIComponent(v.licitacion || '')}`)
          }}
          style={opBtnStyle('var(--teal, #0d9488)')}
        >
          <Icon name="clipboard" size={14} /> Ver Cotización Licit. {v.cotizaciones?.[0]?.idLicitacion || v.licitacion ? `(${v.cotizaciones?.[0]?.idLicitacion || v.licitacion})` : ''}
        </button>
      )}
      <button onClick={() => navigate(`/taller?search=${v.nInterno || v.id}`)} style={opBtnStyle('var(--blue)')}>
        <Icon name="tool" size={14} /> Órdenes de Trabajo ({odtsCount})
      </button>
      <button onClick={() => navigate(`/despachos?tab=guias&ordenId=${v.id}`)} style={opBtnStyle('var(--green-600)')}>
        <Icon name="truck" size={14} /> Guías Despachos ({guiasCount})
      </button>
      {canWriteDespacho && v.estado === 'Activa' && ['EN_TALLER', 'PICKING_PARCIAL', 'LISTA_PICKING', 'PICKING'].includes(v.estadoLogistico?.codigo) && (
        <button onClick={() => navigate(`/despachos/ordenes/${v.id}/picking`)} style={opBtnStyle('#7c3aed')}>
          <Icon name="tool" size={14} /> Confirmar Picking
        </button>
      )}
      {canWriteDespacho && v.estado === 'Activa' && v.estadoLogistico?.codigo === 'PACKING' && (
        <button onClick={() => navigate(`/despachos/ordenes/${v.id}/packing`)} style={opBtnStyle('#7c3aed')}>
          <Icon name="tool" size={14} /> Armar Packing
        </button>
      )}
      {canWriteDespacho && v.estado === 'Activa' && v.estadoLogistico?.codigo === 'LISTA_DESPACHO' && (
        <button onClick={onPrepararGuia} style={opBtnStyle('#d97706')}>
          <Icon name="fileText" size={14} /> Preparar Guía DTE 52
        </button>
      )}
      {canWriteDespacho && (
        <button onClick={onCreateDespacho} style={opBtnStyle('var(--blue)')}>
          <Icon name="truck" size={14} /> Registrar salida ({despachosCount})
        </button>
      )}
      <button onClick={abrirNotaVenta} style={opBtnStyle('var(--blue)')}>
        <Icon name="printer" size={14} /> Nota de Venta
      </button>
      <button onClick={abrirHojaBodega} style={opBtnStyle('var(--teal, #0d9488)')} title="Imprimir hoja de preparación y despacho para Bodega/Taller (sin montos)">
        <Icon name="package" size={14} /> Hoja de Bodega
      </button>
      {canEmitirNotaFiscal && (
        <button onClick={onEmitirNotaFiscal} style={opBtnStyle('var(--amber)')}>
          <Icon name="fileText" size={14} /> Emitir NC/ND
        </button>
      )}
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
      <button onClick={() => navigate(`/excepciones-taller?ordenId=${v.id}`)} style={opBtnStyle('var(--amber)')}>
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

// ── Card de Venta Pagada y Cerrada (observación 9bb3ac95) ─────────────────────
function VentaCerradaCard({ v, items, odts, saldo, total }) {
  const estaPagada = saldo <= 0 && (total > 0 || (v?.pagos || []).length > 0)
  const todosEntregados = (items || []).length > 0 && items.every(it => Number(it.nEntregados || 0) >= Number(it.cantidad || 0))
  const tallerTerminado = (odts || []).length === 0 || odts.every(odt => (odt.items || []).every(it => it.estado === 'listo'))
  const cerradaYPagada = estaPagada && todosEntregados && tallerTerminado

  if (cerradaYPagada) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
        border: '1px solid #86efac',
        borderRadius: 10,
        padding: '12px 14px',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 2px 6px rgba(22, 163, 74, 0.12)'
      }}>
        <div style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: '#16a34a',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)'
        }}>
          <Icon name="check" size={20} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Venta Pagada y Cerrada</span>
            <span style={{ fontSize: 10, background: '#16a34a', color: '#fff', padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>OK</span>
          </div>
          <div style={{ fontSize: 11, color: '#15803d', marginTop: 2 }}>
            100% Pagada · 100% Entregada · Taller completado
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '10px 12px',
      marginBottom: 14,
      fontSize: 11,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 6 }}>
        Estado Operativo y Cierre
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div style={{
          background: estaPagada ? '#f0fdf4' : '#fff',
          border: `1px solid ${estaPagada ? '#86efac' : 'var(--border)'}`,
          borderRadius: 6,
          padding: '5px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <Icon name={estaPagada ? 'check' : 'clock'} size={12} style={{ color: estaPagada ? '#16a34a' : 'var(--amber)', flexShrink: 0 }} />
          <span style={{ color: estaPagada ? '#166534' : 'var(--text-2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {estaPagada ? '100% Pagada' : 'Pago pendiente'}
          </span>
        </div>

        <div style={{
          background: todosEntregados ? '#f0fdf4' : '#fff',
          border: `1px solid ${todosEntregados ? '#86efac' : 'var(--border)'}`,
          borderRadius: 6,
          padding: '5px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <Icon name={todosEntregados ? 'check' : 'clock'} size={12} style={{ color: todosEntregados ? '#16a34a' : 'var(--amber)', flexShrink: 0 }} />
          <span style={{ color: todosEntregados ? '#166534' : 'var(--text-2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {todosEntregados ? '100% Entregada' : 'Entrega parcial'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Card de Documentos Emitidos (observación 934c4582) ───────────────────────
function DocumentosEmitidosCard({ v, dtes = [], canWriteFacturacion, onNota }) {
  const referenciales = activeReferentialDocs(v)
  const pagosReales = (v?.pagos || []).filter(p => !isReferencialPago(p))
  const saldoVenta = Math.max(0, Number(v?.total || 0) - Number(v?.abono || 0))

  const docs = []
  const vistosDtes = new Set()

  for (const ref of referenciales) {
    const pagado = pagosReales
      .filter(p => sameDocumento(p, ref) && p.tipo === 'Ingreso')
      .reduce((s, p) => s + Math.abs(Number(p.monto || 0)), 0)

    const montoDoc = Math.abs(Number(ref.monto || 0))
    const saldoDoc = Math.max(0, montoDoc - pagado)

    let estadoPago = 'No pagada'
    let estadoTone = 'red'

    const estadoNorm = String(ref.estadoPagoDoc || '').toLowerCase()
    if (estadoNorm === 'pagada' || (montoDoc > 0 && pagado >= montoDoc) || saldoVenta <= 0) {
      estadoPago = 'Pagada'
      estadoTone = 'green'
    } else if (pagado > 0) {
      estadoPago = 'Parcial'
      estadoTone = 'amber'
    } else {
      estadoPago = 'No pagada'
      estadoTone = 'red'
    }

    const dteAsociado = (dtes || []).find(d => String(d.folio) === String(ref.nDoc))
    if (dteAsociado) vistosDtes.add(dteAsociado.id)

    docs.push({
      key: `ref-${ref.id}`,
      id: ref.id,
      tipoLabel: ref.documento || 'Documento',
      nDoc: ref.nDoc,
      monto: montoDoc,
      pagado,
      saldo: saldoDoc,
      estadoPago,
      estadoTone,
      fecha: ref.fecha ? new Date(ref.fecha).toLocaleDateString('es-CL') : null,
      dte: dteAsociado,
    })
  }

  for (const dte of (dtes || [])) {
    if (vistosDtes.has(dte.id)) continue
    const tipoNum = Number(dte.tipoDte)
    const esNC = tipoNum === 61
    const esND = tipoNum === 56
    const esGuia = tipoNum === 52
    const monto = Number(dte.totales?.total || 0)

    let estadoPago = 'No pagada'
    let estadoTone = 'red'

    if (esNC) {
      estadoPago = 'Aplicada'
      estadoTone = 'neutral'
    } else if (esGuia) {
      estadoPago = 'Despacho'
      estadoTone = 'blue'
    } else if (esND) {
      estadoPago = 'Pendiente'
      estadoTone = 'amber'
    } else {
      if (saldoVenta <= 0 && Number(v?.total || 0) > 0) {
        estadoPago = 'Pagada'
        estadoTone = 'green'
      } else if (Number(v?.abono || 0) > 0) {
        estadoPago = 'Parcial'
        estadoTone = 'amber'
      } else {
        estadoPago = 'No pagada'
        estadoTone = 'red'
      }
    }

    docs.push({
      key: `dte-${dte.id}`,
      id: dte.id,
      tipoLabel: TIPOS_DTE[dte.tipoDte] || `DTE ${dte.tipoDte}`,
      nDoc: dte.folio,
      monto,
      pagado: estadoPago === 'Pagada' ? monto : 0,
      saldo: estadoPago === 'Pagada' ? 0 : monto,
      estadoPago,
      estadoTone,
      fecha: dte.fechaEmision ? new Date(dte.fechaEmision).toLocaleDateString('es-CL') : null,
      dte,
    })
  }

  const runDteAction = async (action, doc) => {
    try {
      await action(doc)
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.message || 'No se pudo abrir el documento.')
    }
  }

  return (
    <div style={{
      background: 'var(--surface, #fff)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '12px 14px',
      marginBottom: 14,
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="fileText" size={14} style={{ color: 'var(--blue)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-2)' }}>
            Documentos emitidos
          </span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--bg)', color: 'var(--text-3)', padding: '1px 6px', borderRadius: 99 }}>
          {docs.length}
        </span>
      </div>

      {docs.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '10px 0' }}>
          Sin facturas ni notas de crédito emitidas
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map(doc => {
            const esNC = String(doc.tipoLabel || '').toLowerCase().includes('nc') || String(doc.tipoLabel || '').toLowerCase().includes('crédito')
            return (
              <div key={doc.key} style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 12
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.tipoLabel} {doc.nDoc ? `#${doc.nDoc}` : ''}
                  </span>
                  <Badge tone={doc.estadoTone}>{doc.estadoPago}</Badge>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-3)' }}>
                  <span>{doc.fecha || 'Sin fecha'}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: esNC ? 'var(--amber)' : 'var(--text-1)', fontSize: 12 }}>
                    {esNC ? `−${fmt(doc.monto)}` : fmt(doc.monto)}
                  </span>
                </div>

                {doc.dte?.xml && doc.dte.estado !== 'borrador' && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--border)' }}>
                    <button type="button" onClick={() => runDteAction(openDtePdf, doc.dte)} style={dteLink('var(--blue)')}>Ver PDF</button>
                    <button type="button" onClick={() => runDteAction(downloadDteXml, doc.dte)} style={dteLink('var(--text-2)')}>Descargar XML</button>
                    {canWriteFacturacion && [33, 39].includes(Number(doc.dte.tipoDte)) && ['aceptado', 'enviado'].includes(doc.dte.estado) && onNota && (
                      <button type="button" onClick={() => onNota(doc.dte, 61)} style={dteLink('var(--red)')}>Emitir NC</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Card de Transferencias y Pagos Recibidos (discriminada de documentos) ────
function TransferenciasYPagosCard({ v, pagos = [], saldo }) {
  const pagosReales = (pagos || []).filter(p => !isReferencialPago(p) && !p.eliminado)
  const totalPagado = pagosReales
    .filter(p => p.tipo === 'Ingreso')
    .reduce((s, p) => s + Math.abs(Number(p.monto || 0)), 0)

  if (pagosReales.length === 0 && (!saldo || saldo <= 0)) return null

  return (
    <div style={{
      background: 'var(--surface, #fff)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '12px 14px',
      marginBottom: 14,
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="dollarSign" size={14} style={{ color: 'var(--green-700)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-2)' }}>
            Pagos y Transferencias
          </span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--green-50)', color: 'var(--green-700)', padding: '1px 6px', borderRadius: 99 }}>
          {pagosReales.length} {pagosReales.length === 1 ? 'abono' : 'abonos'}
        </span>
      </div>

      {totalPagado > 0 && (
        <div style={{
          background: 'var(--green-50)',
          borderRadius: 8,
          padding: '8px 10px',
          marginBottom: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12
        }}>
          <span style={{ color: 'var(--green-700)', fontWeight: 600 }}>Total recibido</span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: 'var(--green-700)' }}>{fmt(totalPagado)}</span>
        </div>
      )}

      {pagosReales.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '6px 0' }}>
          Sin transferencias ni pagos registrados
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pagosReales.map(p => {
            const medioLabel = [
              p.medioPago || 'Pago',
              p.origenMedioPago ? `(${p.origenMedioPago})` : null,
              p.referencia && p.referencia !== 'Abono' && p.referencia !== 'Referencial' ? `Ref: ${p.referencia}` : null
            ].filter(Boolean).join(' ')

            const fechaPago = p.fecha ? new Date(p.fecha).toLocaleDateString('es-CL') : null

            return (
              <div key={p.id} style={{
                padding: '6px 0',
                borderBottom: '1px solid var(--border)',
                fontSize: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ minWidth: 0, paddingRight: 8 }}>
                  <div style={{ fontWeight: 500, color: 'var(--text-1)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {medioLabel}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                    {fechaPago || '—'} {p.usuario ? `· por ${p.usuario}` : ''}
                  </div>
                </div>
                <span style={{
                  fontFamily: "'DM Mono',monospace",
                  fontWeight: 600,
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  color: p.tipo === 'Ingreso' ? 'var(--green-600)' : 'var(--red)'
                }}>
                  {p.tipo === 'Ingreso' ? '+' : '−'}{fmt(Math.abs(p.monto))}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DocumentosPagosList({ v, pagos, dtes, canWriteFacturacion, onNota }) {
  return (
    <>
      <DocumentosEmitidosCard v={v} dtes={dtes} canWriteFacturacion={canWriteFacturacion} onNota={onNota} />
      <TransferenciasYPagosCard v={v} pagos={pagos} />
    </>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function ViewVentaPanel({ venta, onClose, onEdit, canWrite = true, canDelete = false, variant = 'drawer' }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [tab, setTab] = useState('detalle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [emitirDte, setEmitirDte] = useState(false)
  const [notaDte, setNotaDte] = useState(null)
  const [notaInterna, setNotaInterna] = useState(false)
  const [showDespachoModal, setShowDespachoModal] = useState(false)
  const [showGuiaDespacho, setShowGuiaDespacho] = useState(false)

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
  const notasCreditoQuery = useDocumentosReferenciables(
    { tipoNota: 61, ordenId: venta.id },
    { enabled: canWriteFacturacion && Boolean(venta?.id) },
  )
  const canWriteDespacho = can(user, 'despacho', 'write')
  const canRegistrarPago = can(user, 'cobranza', 'write') && can(user, 'caja', 'read') && can(user, 'caja', 'write')
  const canCobrar = collectibleDocuments({ pagos }).length > 0
  const ventaYaEmitida = hasActiveSalesDte(dtes)
  // Sólo un DTE tributario vigente (factura/boleta) habilita esta acción. El
  // backend vuelve a evaluar la elegibilidad, incluyendo saldo y NC previas.
  const documentoParaNota = (notasCreditoQuery.data?.documentos || [])
    .find(documento => [33, 39].includes(Number(documento.tipoDte))) || null
  const puedeEmitirNotaFiscal = canWriteFacturacion && !v.eliminada && Boolean(documentoParaNota)
  const canManageInternalCreditNotes = canWrite || canWriteFacturacion
  const onCobrar = () => navigate(`/cobranza?ventaId=${v.id}`)
  const onEmitirNotaFiscal = () => {
    if (!documentoParaNota) return
    const params = new URLSearchParams({
      tipoDte: '61',
      ordenId: String(v.id),
      documentoId: String(documentoParaNota.id),
    })
    navigate(`/facturacion/emitir?${params.toString()}`)
  }
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

  // Abre el registro de despacho como modal sobre la misma pantalla de venta
  // en vez de navegar a /despachos/nuevo (feedback FB #6, 09-11: el flujo
  // legado resolvia esto sin sacar al usuario de la venta).
  const handleCreateDespacho = () => setShowDespachoModal(true)

  function handleDelete() {
    deleteVenta.mutate(venta.id, {
      onSuccess: () => onClose(),
    })
  }

  if (variant === 'page') {
    const pageTitle = <span>Venta <span style={{ fontFamily: "'DM Mono',monospace", color: 'var(--green-700)' }}>#{v.nInterno || v.id}</span></span>
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
    const isMkItem = (item) => {
      const cod = String(item.codigoInterno || item.producto?.codigoInterno || '').toUpperCase()
      const estadoInv = String(item.producto?.estadoInventario || '').toLowerCase()
      const bodega = String(item.producto?.bodega || '').toLowerCase()
      return cod.startsWith('MK') || estadoInv === 'transitorio' || bodega === 'transitorio' || Boolean(item.producto?.tallerId)
    }

    const odtItemsPorProducto = new Map()
    for (const odt of odts) {
      for (const odtItem of odt.items || []) {
        const key = odtItem.productoId
        if (key) {
          if (!odtItemsPorProducto.has(key)) odtItemsPorProducto.set(key, [])
          odtItemsPorProducto.get(key).push({ ...odtItem, odtId: odt.id, odtTipo: odt.tipo, odtEstado: odt.estado })
        }
        if (odtItem.codigoInterno) {
          const codKey = `code:${odtItem.codigoInterno.trim().toUpperCase()}`
          if (!odtItemsPorProducto.has(codKey)) odtItemsPorProducto.set(codKey, [])
          odtItemsPorProducto.get(codKey).push({ ...odtItem, odtId: odt.id, odtTipo: odt.tipo, odtEstado: odt.estado })
        }
      }
    }

    const getOdtsForItem = (item) => {
      const byId = odtItemsPorProducto.get(item.productoId) || []
      if (byId.length > 0) return byId
      const cod = (item.codigoInterno || item.producto?.codigoInterno || '').trim().toUpperCase()
      if (cod) return odtItemsPorProducto.get(`code:${cod}`) || []
      return []
    }
    const dtesValidos = doc => ['emitido', 'enviado', 'aceptado'].includes(doc.estado)
    const totalNC = dtes.filter(d => d.tipoDte === 61 && dtesValidos(d)).reduce((s, d) => s + Number(d.totales?.total || 0), 0)
    const totalND = dtes.filter(d => d.tipoDte === 56 && dtesValidos(d)).reduce((s, d) => s + Number(d.totales?.total || 0), 0)
    const tipoNormalizado = normalizeText(v.tipo)
    const detalleComercial = [
      ...(tipoNormalizado === 'marketplace' ? [
        ['Canal Marketplace', v.marketplaceCanal],
        ['Referencia externa', v.marketplaceReferencia],
        ['Comisión', v.marketplaceComisionMonto != null
          ? `${v.marketplaceComisionPct != null ? `${v.marketplaceComisionPct}% · ` : ''}${fmt(v.marketplaceComisionMonto)}`
          : null],
      ] : []),
      ...(['licitacion', 'convenio marco', 'compra agil', 'trato directo'].includes(tipoNormalizado) && v.licitacion
        ? [[tipoNormalizado === 'convenio marco' ? 'Orden de compra' : 'Identificador comercial', (
            <span key="licit-ref" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>{v.licitacion}</span>
              <button
                type="button"
                onClick={() => {
                  const cotId = v.cotizaciones?.[0]?.id
                  if (cotId) navigate(`/licitaciones/${cotId}`)
                  else navigate(`/licitaciones?search=${encodeURIComponent(v.licitacion || '')}`)
                }}
                style={{
                  fontSize: 11,
                  color: 'var(--blue)',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontWeight: 600,
                }}
              >
                (Ver Cotización Licit.)
              </button>
            </span>
          )]]
        : []),
      ...(v.plazoEntregaDias != null ? [['Plazo comprometido', `${v.plazoEntregaDias} días ${v.plazoEntregaTipo || 'corridos'}`]] : []),
      ...(v.enviosParciales ? [['Despachos', 'Envíos parciales permitidos']] : []),
    ].filter(([, value]) => value !== null && value !== undefined && value !== '')

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
              <VentaCerradaCard v={v} items={items} odts={odts} saldo={saldo} total={total} />
              <AgregarProductoWidget venta={v} items={items} canWrite={canWrite} />
              <OperacionesDisponibles
                v={v}
                odtsCount={odts.length}
                guiasCount={guias.length}
                canWriteDespacho={canWriteDespacho}
                canEmitirDte={canWriteFacturacion && !ventaYaEmitida}
                onEmitirDte={() => setEmitirDte(true)}
                canEmitirNotaFiscal={puedeEmitirNotaFiscal}
                onEmitirNotaFiscal={onEmitirNotaFiscal}
                canDelete={canDelete}
                canManageInternalCreditNotes={canManageInternalCreditNotes}
                internalCreditNoteBlocked={ventaYaEmitida}
                onCreateInternalCreditNote={() => setNotaInterna(true)}
                canRegistrarPago={canRegistrarPago}
                canCobrar={canCobrar}
                saldo={saldo}
                onCobrar={onCobrar}
                onCreateDespacho={() => setShowDespachoModal(true)}
                onPrepararGuia={() => setShowGuiaDespacho(true)}
              />
              <DocumentosEmitidosCard v={v} dtes={dtes} canWriteFacturacion={canWriteFacturacion} onNota={(documento, tipoDte) => setNotaDte({ documento, tipoDte })} />
              <TransferenciasYPagosCard v={v} pagos={pagos} saldo={saldo} />
            </div>

            {/* Columna derecha */}
            <div style={{ padding: 22 }}>
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 10 }}>Cliente</div>
                {(() => {
                  const direccion = v.clienteSucursal?.direccion || v.cliente?.direccion
                  const comuna = v.clienteSucursal?.comuna || v.cliente?.comuna
                  const region = v.clienteSucursal?.region || v.cliente?.region
                  const filas = [
                    ['Nombre', v.cliente?.nombre],
                    ['Razón Social', v.cliente?.razonSocial],
                    ['RUT', v.cliente?.rut],
                    ['Giro', v.cliente?.giro],
                    ['Dirección', direccion],
                    ['Comuna', comuna],
                    ['Región', region],
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

              {detalleComercial.length > 0 && (
                <>
                  <FormDivider label="Condiciones comerciales" />
                  <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, margin: '0 0 14px' }}>
                    {detalleComercial.map(([label, value]) => (
                      <div key={label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', minWidth: 0 }}>
                        <dt style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{label}</dt>
                        <dd style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}

              {items.length > 0 && (
                <>
                  <FormDivider label={`Productos (${items.length})`} />
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', marginBottom: 14 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 960 }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)' }}>
                          {[
                            { label: 'Nº', align: 'center', width: 34 },
                            { label: 'Código', align: 'left' },
                            { label: 'Cant.', align: 'right' },
                            { label: 'Producto', align: 'left' },
                            { label: 'Foto', align: 'center', width: 44 },
                            { label: 'Unit. Neto', align: 'right' },
                            { label: 'Total Neto', align: 'right' },
                            { label: 'Stock', align: 'right' },
                            { label: 'Entregados', align: 'right' },
                            { label: 'Pendiente', align: 'right' },
                            { label: 'Estado Taller', align: 'right' },
                            { label: 'Ubicación', align: 'left' },
                          ].map((col, idx) => (
                            <th
                              key={idx}
                              style={{
                                padding: '7px 8px',
                                textAlign: col.align,
                                width: col.width,
                                fontWeight: 600,
                                color: 'var(--text-3)',
                                fontSize: 10,
                                textTransform: 'uppercase',
                                letterSpacing: 0.4,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, i) => {
                          // item.precioUnitario ya incluye IVA (precio de venta sala), igual que
                          // en el resumen financiero de mas abajo: no volver a sumarle IVA aca.
                          const itemBrutoUnitario = item.precioUnitario
                          const itemBrutoTotal = itemBrutoUnitario * item.cantidad
                          const itemNetoTotal = Math.round(itemBrutoTotal / 1.19)
                          const itemNetoUnitario = Math.round(itemBrutoUnitario / 1.19)
                          const stockVal = item.producto?.stock
                          const ubicacionVal = item.producto?.ubicacion || item.ubicacion

                          return (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            {/* 1. Nº */}
                            <td style={{ padding: '8px 4px', textAlign: 'center', fontFamily: "'DM Mono',monospace", fontSize: 11, color: 'var(--text-3)' }}>
                              {i + 1}
                            </td>

                            {/* 2. Código */}
                            <td style={{ padding: '8px', textAlign: 'left', fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                              {item.producto?.codigoInterno || item.codigoInterno || '—'}
                            </td>

                            {/* 3. Cant. */}
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600, color: 'var(--text-1)' }}>
                              {item.cantidad}
                            </td>

                            {/* 4. Producto */}
                            <td style={{ padding: '8px 12px', textAlign: 'left', minWidth: 200 }}>
                              <div style={{ fontWeight: 500 }}>{item.producto?.nombre || item.nombre || `Producto #${item.productoId}`}</div>
                              {item.descripcion && (
                                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4, background: 'var(--bg)', padding: '3px 7px', borderRadius: 4, border: '1px solid var(--border)', lineHeight: 1.4 }}>
                                  {item.descripcion}
                                </div>
                              )}
                            </td>

                            {/* 5. Foto */}
                            <td style={{ padding: '8px 4px', textAlign: 'center', width: 44 }}>
                              {item.producto?.fotoUrl ? (
                                <img src={item.producto.fotoUrl} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', display: 'inline-block' }} />
                              ) : (
                                <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--bg)', border: '1px solid var(--border)', display: 'inline-block' }} />
                              )}
                            </td>

                            {/* 6. Unit. Neto */}
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: 'var(--text-2)' }}>
                              {fmt(itemNetoUnitario)}
                            </td>

                            {/* 7. Total Neto */}
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 700, color: 'var(--text-1)' }}>
                              {fmt(itemNetoTotal)}
                            </td>

                            {/* 8. Stock */}
                            <td style={{
                              padding: '8px',
                              textAlign: 'right',
                              fontFamily: "'DM Mono',monospace",
                              fontWeight: 600,
                              color: stockVal !== undefined && stockVal !== null ? (stockVal <= 0 ? 'var(--red-600, #dc2626)' : 'var(--text-2)') : 'var(--text-3)'
                            }}>
                              {stockVal !== undefined && stockVal !== null ? stockVal : '—'}
                            </td>

                            {/* 9. Entregados */}
                            <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                              {canWrite ? (
                                <input
                                  type="number" min={0} max={item.cantidad} defaultValue={item.nEntregados ?? 0}
                                  onBlur={e => {
                                    const n = parseInt(e.target.value || '0', 10)
                                    if (n !== (item.nEntregados ?? 0)) updateEntregados.mutate({ itemId: item.id, nEntregados: n }, {
                                      onError: err => toast.error(err.response?.data?.error || 'No se pudo actualizar entregados'),
                                    })
                                  }}
                                  style={{ width: 56, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: 'right' }}
                                />
                              ) : (
                                <span style={{ fontFamily: "'DM Mono',monospace" }}>{item.nEntregados ?? 0}</span>
                              )}
                            </td>

                            {/* 10. Pendiente */}
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600, color: (item.cantidad - (item.nEntregados ?? 0)) > 0 ? 'var(--amber)' : 'var(--green-600)' }}>
                              {item.cantidad - (item.nEntregados ?? 0)}
                            </td>

                            {/* 11. Estado Taller */}
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              {(() => {
                                const odtList = getOdtsForItem(item)
                                const esFabricacion = isMkItem(item)

                                if (odtList.length > 0) {
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                      {odtList.map((oi, idx) => {
                                        const listo = oi.estado === 'Listo' || oi.estado === 'listo'
                                        const talleresList = (oi.talleres || [])
                                          .map(t => t.nombreTaller)
                                          .filter(Boolean)
                                        const tallerText = talleresList.length > 0 ? talleresList.join(', ') : (oi.odtTipo || 'Taller')
                                        return (
                                          <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, background: listo ? 'var(--green-50, #f0fdf4)' : 'var(--amber-50, #fffbeb)', padding: '3px 8px', borderRadius: 6, border: `1px solid ${listo ? 'var(--green-200, #bbf7d0)' : 'var(--amber-200, #fde68a)'}` }}>
                                            <span
                                              onClick={() => navigate(`/taller?search=${oi.odtId}`)}
                                              title={`Ver OT #${oi.odtId} en Taller`}
                                              style={{
                                                fontFamily: "'DM Mono',monospace",
                                                color: 'var(--blue)',
                                                cursor: 'pointer',
                                                fontWeight: 700,
                                                textDecoration: 'underline'
                                              }}
                                            >
                                              OT #{oi.odtId}
                                            </span>
                                            <span style={{ color: 'var(--text-3)' }}>·</span>
                                            <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{tallerText}</span>
                                            <span style={{ color: 'var(--text-3)' }}>·</span>
                                            <span style={{
                                              fontWeight: 600,
                                              color: listo ? 'var(--green-700)' : 'var(--amber-800)',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 3
                                            }}>
                                              {listo && <Icon name="check" size={11} color="var(--green-700)" />}
                                              {listo ? 'Listo' : (oi.estado ? (oi.estado.charAt(0).toUpperCase() + oi.estado.slice(1)) : 'Pendiente')}
                                            </span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )
                                }

                                if (esFabricacion) {
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                                      <span style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: '#b45309',
                                        background: '#fef3c7',
                                        border: '1px solid #fde68a',
                                        padding: '2px 7px',
                                        borderRadius: 6,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4
                                      }}>
                                        ⚠️ Sin notificar a taller
                                      </span>
                                      <button
                                        onClick={() => navigate(`/excepciones-taller?ordenId=${v.id}`)}
                                        style={{
                                          fontSize: 11,
                                          color: 'var(--blue)',
                                          background: 'none',
                                          border: 'none',
                                          padding: 0,
                                          cursor: 'pointer',
                                          textDecoration: 'underline',
                                          fontWeight: 500
                                        }}
                                      >
                                        Notificar ahora →
                                      </button>
                                    </div>
                                  )
                                }

                                return <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
                              })()}
                            </td>

                            {/* 12. Ubicación */}
                            <td style={{ padding: '8px 12px', textAlign: 'left', fontFamily: "'DM Mono',monospace", fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                              {ubicacionVal || '—'}
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

  const title = <span>Venta <span style={{ fontFamily: "'DM Mono',monospace", color: 'var(--green-700)' }}>#{v.nInterno || v.id}</span></span>
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
          canWriteDespacho={canWriteDespacho}
          canEmitirDte={canWriteFacturacion && !ventaYaEmitida}
          onEmitirDte={() => setEmitirDte(true)}
          canRegistrarPago={canRegistrarPago}
          canCobrar={canCobrar}
          onCobrar={onCobrar}
        />
      )}
      {tab === 'taller'     && <TabTaller odts={odts} onGoTaller={() => navigate('/taller')} />}
      {tab === 'pagos'      && <TabPagos pagos={pagos} />}
      {tab === 'documentos' && <TabDocumentos v={v} pagos={pagos} dtes={dtes} canWrite={canWrite} canWriteFacturacion={canWriteFacturacion} onNota={(documento, tipoDte) => setNotaDte({ documento, tipoDte })} />}

      {/* Delete confirmation */}
      {confirmDelete && canDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'oklch(0 0 0/0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', maxWidth: 360, width: '90%', boxShadow: '0 16px 48px oklch(0 0 0/0.2)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: 'var(--text-1)' }}>¿Eliminar Venta #{v.nInterno || v.id}?</div>
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
      {showDespachoModal && (
        <DespachoModal
          ordenId={v.id}
          nInterno={v.nInterno}
          venta={v}
          onClose={() => { setShowDespachoModal(false); qc.invalidateQueries({ queryKey: ['ventas', v.id] }) }}
        />
      )}
      {showGuiaDespacho && (
        <GuiaDespachoModal
          ordenId={v.id}
          nInterno={v.nInterno}
          onClose={() => { setShowGuiaDespacho(false); qc.invalidateQueries({ queryKey: ['ventas', v.id] }) }}
        />
      )}
    </ViewPanel>
  )
}
