import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '../../store/notif'
import { Btn, Icon } from '../shared'
import { useRegistrarPagoCobranza, useTurnoActivo } from '../../api/caja'
import { collectibleDocuments, docSaldo } from '../../utils/cobranza'

const MEDIOS_PAGO = [
  'Efectivo',
  'Transferencia',
  'Debito',
  'Credito',
  'Webpay',
  'Transbank',
  'Cheque dia',
  'Cheque fecha',
]

const fmt = (n) => '$' + Math.abs(Number(n || 0)).toLocaleString('es-CL')

export function RegistrarPagoModal({ venta, onClose, onSuccess }) {
  const qc = useQueryClient()
  const { data: turno, isLoading: turnoLoading } = useTurnoActivo()
  const registrarPagoMut = useRegistrarPagoCobranza()
  const modalRef = useRef(null)

  const docs = collectibleDocuments(venta)
  const totalVenta = Number(venta?.total || 0)
  const abonoVenta = Number(venta?.abono || 0)
  const saldoVenta = Math.max(0, totalVenta - abonoVenta)

  const [selectedDocKey, setSelectedDocKey] = useState(
    docs[0] ? `${docs[0].documento}|||${docs[0].nDoc}` : ''
  )
  const selectedDoc = docs.find((d) => `${d.documento}|||${d.nDoc}` === selectedDocKey) || docs[0] || null
  const saldoDoc = selectedDoc ? docSaldo(venta, selectedDoc) : saldoVenta
  const montoMax = Math.min(saldoVenta, saldoDoc > 0 ? saldoDoc : saldoVenta)

  const [monto, setMonto] = useState(String(montoMax || ''))
  const [medioPago, setMedioPago] = useState('Efectivo')
  const [cuotas, setCuotas] = useState('')
  const [referencia, setReferencia] = useState(
    venta?.nInterno ? `Pago venta N interno ${venta.nInterno}` : `Pago venta #${venta?.id}`
  )

  useEffect(() => {
    if (selectedDoc) {
      const maximo = Math.min(saldoVenta, docSaldo(venta, selectedDoc))
      setMonto(String(maximo > 0 ? maximo : ''))
    }
  }, [selectedDocKey])

  const esCredito = ['Credito', 'Crédito'].includes(medioPago)
  const numMonto = Number(monto)
  const montoValido = Number.isFinite(numMonto) && numMonto > 0 && numMonto <= montoMax

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (!turno) {
      toast.warning('No hay un turno de caja abierto en tu sucursal. Abre un turno en Caja antes de registrar pagos.')
      return
    }
    if (!selectedDoc) {
      toast.warning('Esta venta no tiene un documento referencial activo (factura o boleta) para imputar el pago.')
      return
    }
    if (!montoValido) {
      toast.warning(`El monto debe estar entre $1 y ${fmt(montoMax)}.`)
      return
    }

    const payload = {
      monto: numMonto,
      medioPago,
      documento: selectedDoc.documento,
      nDoc: selectedDoc.nDoc,
      tipoDocumento: selectedDoc.tipoDocumento || selectedDoc.documento,
      referencia: referencia.trim() || undefined,
      cuotas: esCredito && cuotas ? Number(cuotas) : undefined,
    }

    registrarPagoMut.mutate(
      { ordenId: venta.id, data: payload },
      {
        onSuccess: () => {
          toast.success(`Pago de ${fmt(numMonto)} registrado exitosamente.`)
          qc.invalidateQueries({ queryKey: ['ventas', venta.id] })
          qc.invalidateQueries({ queryKey: ['ventas'] })
          qc.invalidateQueries({ queryKey: ['caja'] })
          if (onSuccess) onSuccess()
          onClose()
        },
        onError: (err) => {
          toast.error(err?.response?.data?.error || 'Error al registrar el pago')
        },
      }
    )
  }

  const saldoRestante = Math.max(0, saldoVenta - (numMonto || 0))

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 750,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(2px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="registrar-pago-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg)',
          }}
        >
          <div>
            <h2
              id="registrar-pago-title"
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--text-1)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: 'var(--green-50)',
                  color: 'var(--green-700)',
                }}
              >
                <Icon name="dollarSign" size={16} />
              </span>
              Registrar Pago · Venta #{venta?.nInterno || venta?.id}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
              Saldo pendiente total de la venta:{' '}
              <strong style={{ color: 'var(--red)', fontFamily: "'DM Mono',monospace" }}>{fmt(saldoVenta)}</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-3)',
              fontSize: 18,
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} style={{ padding: 20, overflowY: 'auto', display: 'grid', gap: 14 }}>
          {/* Advertencia si no hay turno de caja */}
          {!turnoLoading && !turno && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: '#fffbeb',
                border: '1px solid #fef3c7',
                color: '#b45309',
                fontSize: 12,
                lineHeight: 1.4,
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <Icon name="alertCircle" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Atención:</strong> No hay un turno de caja abierto en tu sucursal. Debes abrir un turno en el
                módulo de Caja antes de poder registrar cobros.
              </div>
            </div>
          )}

          {/* Documento Asociado */}
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
              Documento tributario a imputar
            </label>
            {docs.length === 0 ? (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#fef2f2',
                  border: '1px solid #fee2e2',
                  color: 'var(--red)',
                  fontSize: 12,
                }}
              >
                No hay facturas o boletas activas para esta venta. Emite o registra una boleta o factura antes de cobrar.
              </div>
            ) : docs.length === 1 ? (
              <div
                style={{
                  padding: '10px 14px',
                  background: 'var(--bg)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                  {docs[0].documento} #{docs[0].nDoc}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Saldo doc:{' '}
                  <strong style={{ color: 'var(--text-1)', fontFamily: "'DM Mono',monospace" }}>
                    {fmt(docSaldo(venta, docs[0]))}
                  </strong>
                </span>
              </div>
            ) : (
              <select
                value={selectedDocKey}
                onChange={(e) => setSelectedDocKey(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-1)',
                }}
              >
                {docs.map((doc) => (
                  <option key={doc.id} value={`${doc.documento}|||${doc.nDoc}`}>
                    {doc.documento} #{doc.nDoc} · Saldo {fmt(docSaldo(venta, doc))}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Grilla: Monto y Medio de pago */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Monto */}
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
                Monto a cobrar
              </label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-3)',
                    fontWeight: 700,
                  }}
                >
                  $
                </span>
                <input
                  type="number"
                  min="1"
                  max={montoMax}
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0"
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 24px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: "'DM Mono',monospace",
                    background: '#fff',
                    color: 'var(--text-1)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Máximo cobrable:{' '}
                <button
                  type="button"
                  onClick={() => setMonto(String(montoMax))}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--blue)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontWeight: 600,
                  }}
                >
                  {fmt(montoMax)}
                </button>
              </span>
            </div>

            {/* Medio de pago */}
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
                Medio de pago
              </label>
              <select
                value={medioPago}
                onChange={(e) => setMedioPago(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-1)',
                  boxSizing: 'border-box',
                }}
              >
                {MEDIOS_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cuotas: SOLO VISIBLE SI ES CREDITO */}
          {esCredito && (
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
                N° de cuotas (Crédito)
              </label>
              <input
                type="number"
                min="1"
                max="48"
                placeholder="Ej: 3, 6, 12"
                value={cuotas}
                onChange={(e) => setCuotas(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  background: '#fff',
                  color: 'var(--text-1)',
                }}
              />
            </div>
          )}

          {/* Referencia / Comprobante */}
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
              Referencia / Comprobante (opcional)
            </label>
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder={
                medioPago === 'Transferencia'
                  ? 'Ej: N° comprobante o código de transferencia'
                  : 'Observaciones o detalle del pago'
              }
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 13,
                background: '#fff',
                color: 'var(--text-1)',
              }}
            />
          </div>

          {/* Resumen de Saldo */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
            }}
          >
            <span style={{ color: 'var(--text-2)' }}>Saldo restante tras este cobro:</span>
            <span
              style={{
                fontWeight: 700,
                fontFamily: "'DM Mono',monospace",
                color: saldoRestante === 0 ? 'var(--green-700)' : 'var(--red)',
              }}
            >
              {saldoRestante === 0 ? 'Totalmente saldada ($0)' : fmt(saldoRestante)}
            </span>
          </div>

          {/* Botones */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              paddingTop: 10,
              borderTop: '1px solid var(--border)',
              marginTop: 4,
            }}
          >
            <Btn variant="secondary" type="button" onClick={onClose} disabled={registrarPagoMut.isPending}>
              Cancelar
            </Btn>
            <button
              type="submit"
              disabled={registrarPagoMut.isPending || !montoValido || !selectedDoc || !turno}
              style={{
                padding: '9px 18px',
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 8,
                border: 'none',
                background:
                  registrarPagoMut.isPending || !montoValido || !selectedDoc || !turno
                    ? 'var(--bg)'
                    : 'var(--green-700)',
                color:
                  registrarPagoMut.isPending || !montoValido || !selectedDoc || !turno
                    ? 'var(--text-3)'
                    : '#fff',
                cursor:
                  registrarPagoMut.isPending || !montoValido || !selectedDoc || !turno
                    ? 'not-allowed'
                    : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              <Icon name="check" size={14} />
              {registrarPagoMut.isPending ? 'Registrando...' : `Confirmar pago ${numMonto > 0 ? fmt(numMonto) : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RegistrarPagoModal
