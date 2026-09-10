import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useCrmDetalle } from '../../api/crm'
import plastimarLogo from '../../assets/plastimar-logo.webp'
import { PRODUCT_PLACEHOLDER_IMAGE, useProductPlaceholderOnError } from '../../utils/assets'

const money = value => Number(value || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const date = value => value ? new Date(value).toLocaleDateString('es-CL') : '—'

function quoteFrom(crm) {
  if (crm.cotizacionComercial) {
    return {
      type: crm.cotizacionComercial.tipo || 'Cotización comercial',
      reference: crm.cotizacionComercial.licitacion || crm.ncotizacion || `CRM-${crm.id}`,
      createdAt: crm.cotizacionComercial.createdAt || crm.fechaCotizacion || crm.createdAt,
      validUntil: crm.cotizacionComercial.fechaPlazo,
      deliveryDays: crm.cotizacionComercial.plazoEntregaDias,
      deliveryType: crm.cotizacionComercial.plazoEntregaTipo,
      dispatchAmount: crm.cotizacionComercial.montoDespacho,
      notes: crm.cotizacionComercial.observaciones,
      items: crm.cotizacionComercial.items || [],
    }
  }
  if (crm.cotizacionLicitacion) {
    return {
      type: 'Licitación', reference: crm.cotizacionLicitacion.idLicitacion || crm.ncotizacion || `CRM-${crm.id}`,
      createdAt: crm.cotizacionLicitacion.fecha || crm.fechaCotizacion || crm.createdAt,
      validUntil: crm.cotizacionLicitacion.plazo, notes: crm.cotizacionLicitacion.obs,
      items: crm.cotizacionLicitacion.items || [],
    }
  }
  if (crm.ordenCompraOnline) {
    return {
      type: 'Cotización compra online', reference: crm.ordenCompraOnline.nCompra || crm.ncotizacion || `CRM-${crm.id}`,
      createdAt: crm.ordenCompraOnline.fechaCotizacion || crm.ordenCompraOnline.fechaHora || crm.createdAt,
      notes: crm.ordenCompraOnline.obsCliente, items: crm.ordenCompraOnline.items || [],
    }
  }
  return null
}

function normalizeItem(item) {
  const quantity = Number(item.cantidad || 0)
  const unitPrice = Number(item.precioUnitario ?? item.precio ?? 0)
  return {
    id: item.id,
    code: item.codigoInterno || '—',
    name: item.nombre || 'Producto sin nombre',
    description: item.descripcion || '',
    imageUrl: item.producto?.fotoUrl || item.fotoUrl || null,
    quantity,
    unitPrice,
    total: quantity * unitPrice,
  }
}

export default function CrmCotizacionPrintPage() {
  const { id } = useParams()
  const { data: crm, isLoading } = useCrmDetalle(Number(id))
  const quote = crm ? quoteFrom(crm) : null

  useEffect(() => {
    if (quote && !isLoading) {
      const timer = window.setTimeout(() => window.print(), 300)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [quote, isLoading])

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}>Cargando cotización…</div>
  if (!crm || !quote) return <div style={{ padding: 40, textAlign: 'center' }}>Cotización CRM no encontrada.</div>

  const items = quote.items.map(normalizeItem)
  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const dispatchAmount = Number(quote.dispatchAmount || 0)
  const total = subtotal + dispatchAmount
  const customer = crm.cliente || {}
  const customerName = customer.nombre || crm.rsocial || crm.nombre || '—'
  const customerRut = customer.rut || crm.rut || '—'
  const executive = crm.ejecutivo || (crm.ejecutiva ? { nombre: crm.ejecutiva } : null)

  return <main style={{ maxWidth: 860, margin: '0 auto', padding: 30, background: '#fff', color: '#111', fontFamily: 'Arial, sans-serif' }}>
    <style>{`@media print { @page { size: A4; margin: 12mm } body { -webkit-print-color-adjust: exact; print-color-adjust: exact } .no-print { display: none !important } }`}</style>

    <header style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start', paddingBottom: 18, borderBottom: '3px solid #07552b' }}>
      <div><img src={plastimarLogo} alt="Plastimar" style={{ display: 'block', width: 160, height: 'auto', maxHeight: 54, objectFit: 'contain', objectPosition: 'left center' }} /><div style={{ marginTop: 5, color: '#4b5563', fontSize: 12 }}>Cotización comercial</div></div>
      <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase', fontWeight: 700 }}>Cotización</div><div style={{ fontSize: 20, fontFamily: 'monospace', fontWeight: 800 }}>{crm.ncotizacion || `CRM-${crm.id}`}</div><div style={{ marginTop: 4, fontSize: 12 }}>{date(quote.createdAt)}</div></div>
    </header>

    <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, margin: '22px 0' }}>
      <div><Label>Cliente</Label><strong style={{ fontSize: 14 }}>{customerName}</strong><div style={detail}>{customerRut}</div>{crm.email && <div style={detail}>{crm.email}</div>}{crm.telefono && <div style={detail}>Tel. {crm.telefono}</div>}</div>
      <div><Label>Condiciones</Label><div style={detail}>Tipo: <strong>{quote.type}</strong></div>{quote.reference && <div style={detail}>Referencia: {quote.reference}</div>}{quote.deliveryDays != null && <div style={detail}>Entrega: {quote.deliveryDays} días {quote.deliveryType || 'corridos'}</div>}{quote.validUntil && <div style={detail}>Vigencia: {date(quote.validUntil)}</div>}</div>
      {executive && <div><Label>Ejecutivo comercial</Label><strong style={{ fontSize: 14 }}>{executive.nombre || crm.ejecutiva}</strong>{executive.cargo && <div style={detail}>{executive.cargo}</div>}{executive.email && <div style={detail}>{executive.email}</div>}{executive.codigoVendedor && <div style={detail}>Código: {executive.codigoVendedor}</div>}</div>}
    </section>

    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead><tr style={{ background: '#e8f5ec', color: '#123' }}><th style={th}>Producto</th><th style={th}>Código</th><th style={th}>Descripción</th><th style={{ ...th, textAlign: 'right' }}>Cant.</th><th style={{ ...th, textAlign: 'right' }}>P. unitario</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
      <tbody>{items.map((item, index) => <tr key={item.id || index} style={{ borderBottom: '1px solid #d1d5db' }}><td style={{ ...td, width: 64 }}><img src={item.imageUrl || PRODUCT_PLACEHOLDER_IMAGE} alt="" onError={useProductPlaceholderOnError} style={{ display: 'block', width: 46, height: 46, objectFit: 'cover', border: '1px solid #d1d5db', borderRadius: 5 }} /></td><td style={{ ...td, fontFamily: 'monospace', color: '#4b5563', whiteSpace: 'nowrap' }}>{item.code}</td><td style={td}><strong>{item.name}</strong>{item.description && <div style={{ marginTop: 3, color: '#4b5563', fontSize: 11, whiteSpace: 'pre-wrap' }}>{item.description}</div>}</td><td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{item.quantity}</td><td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{money(item.unitPrice)}</td><td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{money(item.total)}</td></tr>)}</tbody>
    </table>

    <section style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}><table style={{ minWidth: 280, fontSize: 12 }}><tbody><tr><td style={summaryLabel}>Subtotal</td><td style={summaryValue}>{money(subtotal)}</td></tr>{dispatchAmount > 0 && <tr><td style={summaryLabel}>Despacho cotizado</td><td style={summaryValue}>{money(dispatchAmount)}</td></tr>}<tr style={{ borderTop: '2px solid #07552b' }}><td style={{ ...summaryLabel, paddingTop: 9, fontWeight: 800, fontSize: 15 }}>Total cotizado</td><td style={{ ...summaryValue, paddingTop: 9, fontWeight: 800, fontSize: 16 }}>{money(total)}</td></tr></tbody></table></section>

    {quote.notes && <section style={{ marginTop: 28, paddingTop: 14, borderTop: '1px solid #d1d5db' }}><Label>Observaciones</Label><div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.45 }}>{quote.notes}</div></section>}
    <footer style={{ marginTop: 36, paddingTop: 12, borderTop: '1px solid #d1d5db', color: '#6b7280', fontSize: 10 }}>Documento comercial generado desde Plastimar ERP · No constituye documento tributario.</footer>
    <div className="no-print" style={{ marginTop: 24, textAlign: 'center' }}><button type="button" onClick={() => window.print()} style={{ border: 0, borderRadius: 7, background: '#07552b', color: '#fff', padding: '9px 16px', fontWeight: 700, cursor: 'pointer' }}>Guardar como PDF / imprimir</button></div>
  </main>
}

function Label({ children }) {
  return <div style={{ marginBottom: 5, color: '#6b7280', fontSize: 10, fontWeight: 800, letterSpacing: .45, textTransform: 'uppercase' }}>{children}</div>
}

const detail = { marginTop: 4, color: '#374151', fontSize: 12 }
const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #a7cdb1', fontSize: 10, textTransform: 'uppercase' }
const td = { padding: '10px', verticalAlign: 'top' }
const summaryLabel = { padding: '5px 12px', color: '#4b5563' }
const summaryValue = { padding: '5px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 650 }
