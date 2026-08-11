import { useMemo, useState } from 'react'
import { Badge, Btn, Icon } from '../shared'
import { toast, confirmDialog } from '../../store/notif'
import { useAnularNotaInterna, useCrearNotaInterna, useNotasInternas } from '../../api/notasInternas'
import { hasActiveSalesDte } from '../../utils/facturacion'

const money = value => '$' + Math.round(Number(value || 0)).toLocaleString('es-CL')
const input = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, font: 'inherit', fontSize: 12 }

export function InternalCreditNotes({ venta, canWrite, dtes = [] }) {
  const { data: notas = [], isLoading } = useNotasInternas(venta.id)
  const [open, setOpen] = useState(false)
  const anular = useAnularNotaInterna()
  const tieneDteVenta = hasActiveSalesDte(dtes)

  const anularNota = async nota => {
    const accepted = await confirmDialog({ title: `Anular NC interna #${nota.id}`, message: 'Se descontara nuevamente el stock reintegrado y se restaurara el saldo de la venta.', confirmLabel: 'Anular nota', danger: true })
    if (!accepted) return
    const motivo = window.prompt('Motivo de anulacion (minimo 5 caracteres):', '')
    if (!motivo || motivo.trim().length < 5) return
    try {
      await anular.mutateAsync({ id: nota.id, ordenId: venta.id, motivo: motivo.trim() })
      toast.success('Nota interna anulada y stock reversado.')
    } catch (error) {
      toast.error(error?.response?.data?.error || 'No se pudo anular la nota interna.')
    }
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div><div style={{ fontSize: 12, fontWeight: 700 }}>Notas de credito internas</div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>Ajustan saldo y devuelven stock; no se envian al SII.</div></div>
        {canWrite && !tieneDteVenta && <Btn variant="secondary" icon="refreshCw" onClick={() => setOpen(true)}>Crear NC interna</Btn>}
      </div>
      {tieneDteVenta && <div style={{ background: '#fff8e6', border: '1px solid var(--amber)', borderRadius: 7, padding: 9, fontSize: 11, color: 'var(--text-2)' }}>Esta venta ya tiene factura/boleta emitida. Debes usar la nota de credito SII del documento correspondiente.</div>}
      {!tieneDteVenta && !isLoading && notas.length === 0 && <div style={{ color: 'var(--text-3)', fontSize: 12, padding: '8px 0' }}>Sin notas internas.</div>}
      {notas.map(nota => (
        <div key={nota.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><strong style={{ fontSize: 12 }}>NC interna #{nota.id}</strong> <Badge tone={nota.estado === 'activa' ? 'green' : 'red'}>{nota.estado}</Badge></div><strong style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{money(nota.monto)}</strong></div>
          <div style={{ color: 'var(--text-2)', fontSize: 11, marginTop: 5 }}>{nota.motivo}</div>
          <div style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 5 }}>{nota.items.map(item => `${item.producto?.codigoInterno || item.productoId} x ${item.cantidad}`).join(' · ')}</div>
          {canWrite && nota.estado === 'activa' && <button onClick={() => anularNota(nota)} disabled={anular.isPending} style={{ border: 0, background: 'none', color: 'var(--red)', textDecoration: 'underline', cursor: 'pointer', fontSize: 11, marginTop: 6, padding: 0 }}>Anular y reversar stock</button>}
        </div>
      ))}
      {open && <InternalCreditNoteModal venta={venta} onClose={() => setOpen(false)} />}
    </div>
  )
}

export function InternalCreditNoteModal({ venta, onClose }) {
  const [quantities, setQuantities] = useState({})
  const [motivo, setMotivo] = useState('')
  const [customAmount, setCustomAmount] = useState('')
  const crear = useCrearNotaInterna()
  const selected = useMemo(() => (venta.items || []).map(item => ({ item, cantidad: Number(quantities[item.id] || 0) })).filter(row => row.cantidad > 0), [quantities, venta.items])
  const calculated = selected.reduce((sum, row) => sum + row.cantidad * Number(row.item.precioUnitario || 0), 0)
  const finalAmount = customAmount === '' ? calculated : Number(customAmount)

  const submit = async () => {
    if (!selected.length) return toast.error('Selecciona al menos una cantidad a devolver.')
    if (selected.some(row => !Number.isInteger(row.cantidad) || row.cantidad > Number(row.item.cantidad))) return toast.error('Revisa las cantidades a devolver.')
    if (motivo.trim().length < 5) return toast.error('Describe el motivo de la nota interna.')
    if (!(finalAmount > 0)) return toast.error('El monto debe ser mayor a cero.')
    try {
      await crear.mutateAsync({ ordenId: venta.id, motivo: motivo.trim(), monto: finalAmount, items: selected.map(row => ({ ordenItemId: row.item.id, cantidad: row.cantidad })) })
      toast.success('NC interna creada. Saldo y stock fueron actualizados.')
      onClose()
    } catch (error) {
      toast.error(error?.response?.data?.error || 'No se pudo crear la nota interna.')
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 800, background: 'oklch(0 0 0 / .45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={event => event.stopPropagation()} style={{ background: '#fff', width: 700, maxWidth: '100%', maxHeight: '92vh', overflow: 'auto', borderRadius: 12, boxShadow: '0 16px 48px oklch(0 0 0 / .2)' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}><strong>Previsualizar NC interna · Venta #{venta.nInterno || venta.id}</strong><button onClick={onClose} style={{ border: 0, background: 'none' }}><Icon name="x" size={18} /></button></div>
        <div style={{ padding: 18 }}>
          <div style={{ background: 'var(--bg)', padding: 10, borderRadius: 8, fontSize: 11, marginBottom: 12 }}><strong>No tributaria:</strong> no genera folio, XML ni envio al SII. Al confirmar, reintegra al inventario las cantidades seleccionadas y rebaja el saldo.</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {(venta.items || []).map(item => <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px', alignItems: 'center', gap: 8, padding: 9, borderBottom: '1px solid var(--border)', fontSize: 12 }}><div><strong>{item.codigoInterno || item.producto?.codigoInterno || `#${item.productoId}`}</strong><span style={{ display: 'block', color: 'var(--text-3)' }}>{item.nombre || item.producto?.nombre}</span></div><input type="number" min="0" max={item.cantidad} step="1" value={quantities[item.id] || ''} onChange={event => setQuantities(prev => ({ ...prev, [item.id]: event.target.value }))} placeholder={`0/${item.cantidad}`} style={input} /><span style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace" }}>{money(Number(quantities[item.id] || 0) * Number(item.precioUnitario || 0))}</span></div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 12, marginTop: 14 }}><label style={{ fontSize: 11, fontWeight: 600 }}>Motivo *<textarea value={motivo} onChange={event => setMotivo(event.target.value)} rows={3} style={{ ...input, display: 'block', marginTop: 5, resize: 'vertical' }} /></label><label style={{ fontSize: 11, fontWeight: 600 }}>Monto a ajustar *<input type="number" min="1" value={customAmount} onChange={event => setCustomAmount(event.target.value)} placeholder={String(calculated || 0)} style={{ ...input, display: 'block', marginTop: 5 }} /><span style={{ display: 'block', color: 'var(--text-3)', fontWeight: 400, marginTop: 4 }}>Calculado: {money(calculated)}. Se permite ajuste manual (ej. $1).</span></label></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, paddingTop: 12, borderTop: '1px solid var(--border)' }}><div><span style={{ fontSize: 11, color: 'var(--text-3)' }}>Resultado a aplicar</span><strong style={{ display: 'block', fontSize: 18 }}>{money(finalAmount)}</strong></div><div style={{ display: 'flex', gap: 8 }}><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={submit} disabled={crear.isPending}>{crear.isPending ? 'Aplicando...' : 'Confirmar devolucion y NC'}</Btn></div></div>
        </div>
      </div>
    </div>
  )
}
